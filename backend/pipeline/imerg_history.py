"""Resumable IMERG Final half-hourly subsets, persisted in existing Supabase tables.

Network downloads are concurrent; netCDF parsing is serial because netCDF4/HDF5
is not thread safe. Only native footprints intersecting the stored BBMP boundary
are retained. Rates, QC and random error are preserved; this is not 1 km rainfall.
"""
from __future__ import annotations

import hashlib
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx
import netCDF4
import numpy as np
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from shapely.geometry import box, shape

from pipeline.hourly_ingestion import ObservationWriter, digest

PIPELINE = 'bbmp-imerg-final-halfhour-v1'
CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json'


def subset_indices(boundary):
    west, south, east, north = boundary.bounds
    return (math.floor((west + 180) * 10), math.ceil((east + 180) * 10) - 1,
            math.floor((south + 90) * 10), math.ceil((north + 90) * 10) - 1)


def get_retry(client, url, **kwargs):
    for attempt in range(5):
        try:
            response = client.get(url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
        except httpx.RequestError:
            if attempt == 4:
                raise
        time.sleep(min(2 ** attempt, 16))
    raise RuntimeError('NASA request retries exhausted')


def discover(client, day):
    response = get_retry(client, CMR, params={'short_name': 'GPM_3IMERGHH', 'version': '07',
        'temporal': f'{day}T00:00:00Z,{day}T23:59:59.999Z', 'page_size': 2000,
        'sort_key[]': 'start_date'})
    entries = response.json()['feed']['entry']
    # CMR can include a granule ending exactly at a query boundary. Use start time.
    entries = [e for e in entries if datetime.fromisoformat(e['time_start'].replace('Z', '+00:00')).date() == day]
    expected = {datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(minutes=30*i) for i in range(48)}
    times = [datetime.fromisoformat(e['time_start'].replace('Z', '+00:00')) for e in entries]
    if len(times) != 48 or set(times) != expected:
        raise ValueError('CMR does not provide 48 distinct half-hourly granules for requested day')
    for entry in entries:
        urls = [x['href'] for x in entry.get('links', []) if not x.get('inherited') and
                urlsplit(x.get('href', '')).hostname == 'opendap.earthdata.nasa.gov']
        if len(urls) != 1:
            raise ValueError('Expected one NASA OPeNDAP granule URL')
        entry['subset_url'] = urls[0]
    return entries


def download(client, entry, indices, token, cache):
    x0, x1, y0, y1 = indices
    constraint = ','.join(f'/Grid/{v}[0:1:0][{x0}:1:{x1}][{y0}:1:{y1}]'
                          for v in ('precipitation', 'precipitationQualityIndex', 'randomError'))
    url = entry['subset_url'] + '.nc4?' + quote(constraint, safe='')
    path = cache / (hashlib.sha256(url.encode()).hexdigest() + '.nc')
    if not path.exists():
        response = get_retry(client, url, headers={'Authorization': 'Bearer ' + token})
        if response.content[:4] not in (b'\x89HDF', b'CDF\x01', b'CDF\x02'):
            raise ValueError('NASA did not return a NetCDF subset')
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.partial')
        temporary.write_bytes(response.content)
        temporary.replace(path)
    return path


def parse_subset(path, entry, boundary):
    expected = datetime.fromisoformat(entry['time_start'].replace('Z', '+00:00'))
    records = []
    with netCDF4.Dataset(path) as data:
        rate = data.variables['precipitation']
        quality = data.variables['precipitationQualityIndex']
        error = data.variables['randomError']
        if rate.units not in ('mm/hr', 'mm/h') or error.units not in ('mm/hr', 'mm/h'):
            raise ValueError('Unexpected IMERG rainfall units')
        if rate.dimensions != ('time', 'lon', 'lat') or rate.shape[0] != 1:
            raise ValueError('Unexpected IMERG dimensions')
        tv = data.variables['time']
        target = netCDF4.num2date(tv[0], tv.units, getattr(tv, 'calendar', 'standard'), only_use_cftime_datetimes=False)
        target = datetime(target.year, target.month, target.day, target.hour, target.minute, target.second, tzinfo=timezone.utc)
        if target != expected:
            raise ValueError('CMR and NetCDF times disagree')
        rates, scores, errors = rate[:], quality[:], error[:]
        for x, lon0 in enumerate(data.variables['lon'][:]):
            lon = round(float(lon0), 2)
            for y, lat0 in enumerate(data.variables['lat'][:]):
                lat = round(float(lat0), 2)
                if boundary.intersection(box(lon-.05, lat-.05, lon+.05, lat+.05)).area <= 0:
                    continue
                def value(array):
                    v = array[0, x, y]
                    return None if np.ma.is_masked(v) or not np.isfinite(v) else float(v)
                v, qc, err = value(rates), value(scores), value(errors)
                if v is not None and v < 0:
                    raise ValueError('Negative precipitation is not valid')
                if qc is not None and not 0 <= qc <= 1:
                    raise ValueError('IMERG quality index outside [0,1]')
                if err is not None and err < 0:
                    raise ValueError('Negative random error is not valid')
                records.append({'latitude': lat, 'longitude': lon, 'value': v, 'quality_index': qc, 'random_error_mm_h': err})
    return {'timestamp': expected.isoformat(), 'interval_end': (expected + timedelta(minutes=30)).isoformat(),
            'granule_id': entry['id'], 'granule_title': entry['title'], 'source_url': entry['subset_url'],
            'subset_file_sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'unit': 'mm/h', 'cells': records}


def persist_day(writer, day, subsets, job_id):
    dataset_id = writer.datasets['gpm_imerg_v07_half_hourly']
    subsets = sorted(subsets, key=lambda x: x['timestamp'])
    fingerprint = digest(subsets)
    expected = sum(len(s['cells']) for s in subsets)
    accepted = sum(c['value'] is not None for s in subsets for c in s['cells'])
    if len(subsets) != 48 or len({s['timestamp'] for s in subsets}) != 48 or not expected:
        raise ValueError('Incomplete daily temporal/spatial subset')
    if len({tuple((c['latitude'], c['longitude']) for c in s['cells']) for s in subsets}) != 1:
        raise ValueError('Spatial subset changed during day')
    version = f'{PIPELINE}:{day}:{fingerprint[:16]}'
    metadata = {'pipeline': PIPELINE, 'start': str(day), 'end': str(day), 'grid_id': 'bbmp_native_imerg',
                'ingestion_complete': accepted == expected, 'source_payload_sha256': fingerprint, 'raw_subsets': subsets,
                'time_standard': 'UTC', 'interval_seconds': 1800, 'imerg_run': 'Final',
                'quality': {'expected': expected, 'accepted': accepted, 'missing': expected-accepted},
                'release_vintage_verified': False, 'native_resolution_degrees': .1}
    with writer.connection.transaction(), writer.connection.cursor() as q:
        q.execute('SET LOCAL statement_timeout=120000')
        writer.check_capacity(q, accepted, len(json.dumps(metadata).encode()))
        q.execute("""INSERT INTO public.dataset_versions(dataset_id,version_label,checksum,metadata)
            VALUES (%s,%s,%s,%s) ON CONFLICT(dataset_id,version_label) DO NOTHING RETURNING dataset_version_id""",
            (dataset_id, version, fingerprint, Jsonb(metadata)))
        found = q.fetchone()
        if found is None:
            q.execute('SELECT dataset_version_id FROM public.dataset_versions WHERE dataset_id=%s AND version_label=%s', (dataset_id, version))
            found = q.fetchone()
        version_id = found['dataset_version_id']
        rows = []
        for subset in subsets:
            for cell in subset['cells']:
                if cell['value'] is None:
                    continue
                lat, lon = cell['latitude'], cell['longitude']
                grid_id = f'imerg_native_{lat:.2f}_{lon:.2f}'
                rows.append({'observed_at': subset['timestamp'], 'lat': lat, 'lon': lon, 'grid_id': grid_id,
                    'value_numeric': cell['value'], 'quality_score': cell['quality_index'],
                    'source_record_id': f"{PIPELINE}:{grid_id}:{subset['timestamp']}:{fingerprint[:16]}",
                    'metadata': {'record_kind': 'observation', 'quantity_type': 'Satellite observation',
                        'pipeline': PIPELINE, 'source_parameter': 'precipitation', 'native_unit': 'mm/hr', 'normalized_unit': 'MM_H',
                        'temporal': 'half_hourly', 'interval_seconds': 1800, 'interval_start': subset['timestamp'],
                        'interval_end': subset['interval_end'], 'original_value': cell['value'],
                        'random_error_mm_h': cell['random_error_mm_h'], 'quality_index': cell['quality_index'],
                        'granule_id': subset['granule_id'], 'granule_title': subset['granule_title'], 'imerg_run': 'Final',
                        'availability_timestamp': None, 'release_vintage_verified': False,
                        'source_payload_sha256': fingerprint, 'subset_file_sha256': subset['subset_file_sha256']}})
        q.execute("""INSERT INTO public.environmental_observations(variable_id,dataset_id,dataset_version_id,region_id,
            observed_at,value_numeric,unit_id,location,grid_id,spatial_resolution_m,quality_flag,quality_score,source_record_id,metadata)
            SELECT %s,%s,%s,%s,x.observed_at,x.value_numeric,%s,
             extensions.ST_SetSRID(extensions.ST_MakePoint(x.lon,x.lat),4326)::extensions.geography,
             x.grid_id,11000,'satellite',x.quality_score,x.source_record_id,x.metadata
            FROM jsonb_to_recordset(%s) AS x(observed_at timestamptz,value_numeric double precision,lat double precision,
             lon double precision,grid_id text,quality_score numeric,source_record_id text,metadata jsonb)
            ON CONFLICT(dataset_id,source_record_id) WHERE source_record_id IS NOT NULL DO NOTHING""",
            (writer.variables['precipitation_water_rainfall_intensity'], dataset_id, version_id, writer.region['region_id'], writer.units['MM_H'], Jsonb(rows)))
        inserted = q.rowcount
        q.execute("""SELECT count(*) AS n FROM public.environmental_observations
            WHERE dataset_version_id=%s AND variable_id=%s AND observed_at >= %s AND observed_at < %s""",
            (version_id, writer.variables['precipitation_water_rainfall_intensity'], day, day + timedelta(days=1)))
        if q.fetchone()['n'] != accepted:
            raise ValueError('Stored IMERG count differs from source subset')
        status = 'pass' if accepted == expected else 'warning' if accepted else 'fail'
        q.execute("""INSERT INTO public.quality_reports(dataset_id,dataset_version_id,job_id,variable_id,
            overall_status,completeness_pct,valid_pct,findings,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (dataset_id, version_id, job_id, writer.variables['precipitation_water_rainfall_intensity'], status,
             100*accepted/expected, 100. if accepted else 0., Jsonb(metadata['quality']),
             'Source quality index and randomError preserved; only missing/invalid samples excluded. Rate mm/h, 1800-second support.'))
        q.execute("""UPDATE public.processing_jobs SET status='succeeded',completed_at=now(),dataset_version_id=%s,
            records_processed=%s,output_metadata=%s WHERE job_id=%s""",
            (version_id, inserted, Jsonb({'stored': accepted, 'expected': expected, 'quality': status}), job_id))
        return {'day': str(day), 'version_id': version_id, 'inserted': inserted, 'stored': accepted,
                'expected': expected, 'grid_cells': expected//48, 'quality': status}


def ingest_imerg(dsn, token, start: date, end: date, cache: Path, workers=4):
    with psycopg.connect(dsn, sslmode='require', connect_timeout=15, autocommit=True, row_factory=dict_row) as conn:
        writer = ObservationWriter(conn)
        boundary = shape(json.loads(writer.region['geometry']))
        indices = subset_indices(boundary)
        dataset_id = writer.datasets['gpm_imerg_v07_half_hourly']
        with httpx.Client(timeout=120, follow_redirects=True) as client, ThreadPoolExecutor(max_workers=workers) as pool:
            day = start
            while day <= end:
                prior = writer.completed(dataset_id, PIPELINE, day, day, 'bbmp_native_imerg')
                if prior:
                    yield {'day': str(day), 'status': 'already_stored', **prior}
                    day += timedelta(days=1)
                    continue
                job_id = writer.start_job(dataset_id, {'pipeline': PIPELINE, 'day': str(day), 'region': 'BBMP', 'imerg_run': 'Final'})
                try:
                    entries = discover(client, day)
                    futures = {pool.submit(download, client, e, indices, token, cache): e for e in entries}
                    subsets = []
                    for future in as_completed(futures):
                        subsets.append(parse_subset(future.result(), futures[future], boundary))
                    result = persist_day(writer, day, subsets, job_id)
                    yield result
                    if result['quality'] != 'pass':
                        raise ValueError('Expansion stopped for IMERG missingness review')
                except Exception as exc:
                    writer.fail_job(job_id, exc)
                    raise
                day += timedelta(days=1)
