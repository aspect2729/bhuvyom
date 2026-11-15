"""NASA hourly observations into the existing Supabase schema.

The raw POWER JSON is persisted in dataset_versions.metadata, not solely in a
local cache. Original values/units also accompany every normalized observation.
No schema changes, model training, or synthetic observations are performed.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from shapely.geometry import box, shape

POWER_URL = 'https://power.larc.nasa.gov/api/temporal/hourly/point'
PIPELINE = 'bbmp-power-hourly-utc-v1'
PARAMETERS = {
    'T2M': ('temperature_air_temperature', 'C', 'C', 1., (-90., 65.)),
    'RH2M': ('atmospheric_activity_humidity', 'PERCENT', '%', 1., (0., 100.)),
    'PS': ('atmospheric_activity_atmospheric_pressure', 'PA', 'kPa', 1000., (30000., 110000.)),
    'WS2M': ('atmospheric_activity_wind_speed', 'M_S', 'm/s', 1., (0., 150.)),
}


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def require_capacity(current_bytes, budget_bytes, rows=0, payload_bytes=0):
    # Conservative estimate, not a provider quota guarantee. Other applications
    # can consume storage independently; retain headroom for their writes.
    reserve = 64 * 1024 * 1024 + rows * 8192 + payload_bytes * 2
    if budget_bytes <= 0 or current_bytes + reserve >= budget_bytes:
        raise RuntimeError('Storage budget missing or insufficient; confirm Supabase capacity before ingestion')


def power_cells(geometry):
    boundary = shape(geometry)
    west, south, east, north = boundary.bounds
    return [(iy * .5, ix * .625)
            for iy in range(math.floor((south - .25) / .5), math.ceil((north + .25) / .5) + 1)
            for ix in range(math.floor((west - .3125) / .625), math.ceil((east + .3125) / .625) + 1)
            if boundary.intersection(box(ix * .625 - .3125, iy * .5 - .25, ix * .625 + .3125, iy * .5 + .25)).area > 0]


def parse_power(payload, start: date, end: date, lat: float, lon: float):
    header = payload.get('header', {})
    if header.get('time_standard') != 'UTC':
        raise ValueError('NASA response must explicitly use UTC')
    returned = payload['geometry']['coordinates']
    if abs(returned[0] - lon) > 1e-5 or abs(returned[1] - lat) > 1e-5:
        raise ValueError('Returned NASA point differs from requested native-cell centre')
    source = payload['properties']['parameter']
    first = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
    hours = ((end - start).days + 1) * 24
    keys = [(first + timedelta(hours=i)).strftime('%Y%m%d%H') for i in range(hours)]
    expected_keys = set(keys)
    observations, quality = [], {}
    for parameter, (variable, unit, source_unit, factor, bounds) in PARAMETERS.items():
        if payload['parameters'][parameter]['units'] != source_unit:
            raise ValueError('Unexpected NASA parameter unit: ' + parameter)
        values = source[parameter]
        if set(values) - expected_keys:
            raise ValueError('NASA response has timestamps outside requested window')
        missing = invalid = 0
        for key in keys:
            raw = values.get(key)
            if raw is None or raw == header.get('fill_value', -999.):
                missing += 1
                continue
            if not isinstance(raw, (int, float)) or not math.isfinite(raw):
                invalid += 1
                continue
            value = float(raw) * factor
            if not bounds[0] <= value <= bounds[1]:
                invalid += 1
                continue
            observed = datetime.strptime(key, '%Y%m%d%H').replace(tzinfo=timezone.utc).isoformat()
            observations.append({'parameter': parameter, 'variable_code': variable, 'unit_code': unit,
                                 'observed_at': observed, 'value_numeric': value,
                                 'original_value': raw, 'original_unit': source_unit})
        quality[parameter] = {'expected': hours, 'accepted': hours - missing - invalid, 'missing': missing, 'invalid': invalid}
    return observations, quality


class ObservationWriter:
    """Scoped operations over existing tables, using a supplied PostgreSQL connection."""
    def __init__(self, connection):
        self.connection = connection
        self.budget_bytes = int(os.environ.get('PREDICTION_DB_BUDGET_BYTES', '0'))
        with connection.transaction(), connection.cursor() as q:
            self.check_capacity(q)
            q.execute("SELECT region_id, extensions.ST_AsGeoJSON(boundary) AS geometry FROM public.geo_regions WHERE region_code='IN-KA-BLR-BBMP'")
            self.region = q.fetchone()
            if not self.region:
                raise ValueError('Existing BBMP region is required')
            q.execute('SELECT dataset_id,dataset_code FROM public.datasets')
            self.datasets = {r['dataset_code']: r['dataset_id'] for r in q.fetchall()}
            q.execute('SELECT variable_id,variable_code FROM public.ref_environmental_variables')
            self.variables = {r['variable_code']: r['variable_id'] for r in q.fetchall()}
            q.execute('SELECT unit_id,unit_code FROM public.ref_units')
            self.units = {r['unit_code']: r['unit_id'] for r in q.fetchall()}

    def check_capacity(self, cursor, rows=0, payload_bytes=0):
        # Serialize these ingestion writers through each batch commit.
        cursor.execute('SELECT pg_advisory_xact_lock(21473001)')
        cursor.execute('SELECT pg_database_size(current_database()) AS bytes')
        require_capacity(cursor.fetchone()['bytes'], self.budget_bytes, rows, payload_bytes)

    def completed(self, dataset_id, pipeline, start, end, grid_id):
        with self.connection.transaction(), self.connection.cursor() as q:
            q.execute("""SELECT dataset_version_id FROM public.dataset_versions
                WHERE dataset_id=%s AND metadata->>'pipeline'=%s AND metadata->>'start'=%s
                AND metadata->>'end'=%s AND metadata->>'grid_id'=%s AND metadata->>'ingestion_complete'='true'
                ORDER BY dataset_version_id DESC LIMIT 1""", (dataset_id, pipeline, str(start), str(end), grid_id))
            completed = q.fetchone()
            if completed:
                return completed
            q.execute("""SELECT dataset_version_id FROM public.dataset_versions
                WHERE dataset_id=%s AND metadata->>'pipeline'=%s AND metadata->>'grid_id'=%s
                AND metadata->>'ingestion_complete'='true'
                AND metadata->>'start' <= %s AND metadata->>'end' >= %s LIMIT 1""",
                (dataset_id, pipeline, grid_id, str(end), str(start)))
            if q.fetchone():
                raise ValueError('Requested range overlaps an already ingested batch; use disjoint dates')
            return None

    def start_job(self, dataset_id, parameters):
        job_id = str(uuid.uuid4())
        with self.connection.transaction(), self.connection.cursor() as q:
            q.execute("""INSERT INTO public.processing_jobs(job_id,dataset_id,job_type,status,started_at,parameters)
                VALUES (%s,%s,'download','running',now(),%s)""", (job_id, dataset_id, Jsonb(parameters)))
        return job_id

    def fail_job(self, job_id, error):
        with self.connection.transaction(), self.connection.cursor() as q:
            q.execute("UPDATE public.processing_jobs SET status='failed',completed_at=now(),error_message=%s WHERE job_id=%s", (type(error).__name__, job_id))

    def persist(self, dataset_id, pipeline, start, end, grid_id, lat, lon, payload, parsed, quality, job_id, source_url):
        fingerprint = digest(payload)
        version = f'{pipeline}:{start}:{end}:{grid_id}:{fingerprint[:16]}'
        metadata = {'pipeline': pipeline, 'start': str(start), 'end': str(end), 'grid_id': grid_id,
                    'source_url': source_url, 'source_payload_sha256': fingerprint,
                    'raw_source_response': payload, 'time_standard': 'UTC', 'quality': quality,
                    'native_resolution': '0.5 deg latitude x 0.625 deg longitude',
                    'release_vintage_verified': False,
                    'ingestion_complete': all(v['accepted'] == v['expected'] for v in quality.values())}
        with self.connection.transaction(), self.connection.cursor() as q:
            q.execute('SET LOCAL statement_timeout=120000')
            self.check_capacity(q, len(parsed), len(json.dumps(metadata).encode()))
            q.execute("""INSERT INTO public.dataset_versions(dataset_id,version_label,checksum,metadata)
                VALUES (%s,%s,%s,%s) ON CONFLICT (dataset_id,version_label) DO NOTHING RETURNING dataset_version_id""",
                (dataset_id, version, fingerprint, Jsonb(metadata)))
            r = q.fetchone()
            if r is None:
                q.execute('SELECT dataset_version_id FROM public.dataset_versions WHERE dataset_id=%s AND version_label=%s', (dataset_id, version))
                r = q.fetchone()
            version_id = r['dataset_version_id']
            rows = []
            for item in parsed:
                row = {'variable_id': self.variables[item['variable_code']], 'unit_id': self.units[item['unit_code']],
                       'observed_at': item['observed_at'], 'value_numeric': item['value_numeric'],
                       'source_record_id': f"{pipeline}:{grid_id}:{item['parameter']}:{item['observed_at']}:{fingerprint[:16]}",
                       'metadata': {'record_kind': 'observation', 'quantity_type': 'Model-derived', 'source': 'nasa_power',
                           'source_parameter': item['parameter'], 'temporal': 'hourly', 'time_standard': 'UTC',
                           'native_unit': item['original_unit'], 'original_value': item['original_value'],
                           'normalized_unit': item['unit_code'], 'source_payload_sha256': fingerprint,
                           'source_header': payload['header'], 'pipeline': pipeline, 'sample_interval_seconds': 3600,
                           'availability_timestamp': None, 'release_vintage_verified': False,
                           'measurement_validation': 'not_independent_ground_truth'}}
                rows.append(row)
            inserted = 0
            for index in range(0, len(rows), 2000):
                q.execute("""INSERT INTO public.environmental_observations
                    (variable_id,dataset_id,dataset_version_id,region_id,observed_at,value_numeric,unit_id,location,grid_id,
                     spatial_resolution_m,quality_flag,source_record_id,metadata)
                    SELECT x.variable_id,%s,%s,%s,x.observed_at,x.value_numeric,x.unit_id,
                     extensions.ST_SetSRID(extensions.ST_MakePoint(%s,%s),4326)::extensions.geography,%s,
                     55000,'reanalysis',x.source_record_id,x.metadata
                    FROM jsonb_to_recordset(%s) AS x(variable_id bigint,observed_at timestamptz,value_numeric double precision,
                     unit_id bigint,source_record_id text,metadata jsonb)
                    ON CONFLICT (dataset_id,source_record_id) WHERE source_record_id IS NOT NULL DO NOTHING""",
                    (dataset_id, version_id, self.region['region_id'], lon, lat, grid_id, Jsonb(rows[index:index + 2000])))
                inserted += q.rowcount
            q.execute("""SELECT count(*) AS n FROM public.environmental_observations
                WHERE dataset_version_id=%s AND grid_id=%s AND observed_at >= %s AND observed_at < %s""",
                (version_id, grid_id, start, end + timedelta(days=1)))
            stored = q.fetchone()['n']
            if stored != len(rows):
                raise ValueError('Persisted observation count differs from accepted payload')
            expected = sum(v['expected'] for v in quality.values())
            invalid = sum(v['invalid'] for v in quality.values())
            present = expected - sum(v['missing'] for v in quality.values())
            completeness = 100 * stored / expected
            status = 'pass' if stored == expected and not invalid else 'warning' if stored else 'fail'
            q.execute("""INSERT INTO public.quality_reports(dataset_id,dataset_version_id,job_id,overall_status,
                completeness_pct,valid_pct,findings,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (dataset_id, version_id, job_id, status, completeness, 100 * (present-invalid)/present if present else 0.,
                 Jsonb({'parameters': quality, 'stored_records': stored, 'source_payload_sha256': fingerprint}),
                 'Range/unit/calendar/coverage checks only; not independent measurement validation.'))
            q.execute("""UPDATE public.processing_jobs SET status='succeeded',dataset_version_id=%s,completed_at=now(),
                records_processed=%s,output_metadata=%s WHERE job_id=%s""",
                (version_id, inserted, Jsonb({'stored': stored, 'expected': expected, 'quality': status}), job_id))
            return {'version_id': version_id, 'inserted': inserted, 'stored': stored, 'expected': expected,
                    'completeness_pct': completeness, 'quality': status}


def fetch_power(client, params, cache_path):
    # A cache is only transport assistance. All accepted observations and the raw
    # response are committed to Supabase before the ingestion is considered done.
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding='utf-8'))
    for attempt in range(4):
        try:
            response = client.get(POWER_URL, params=params)
            response.raise_for_status()
            payload = response.json()
            if payload.get('messages') and 'properties' not in payload:
                raise ValueError('NASA POWER returned no observation payload')
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache_path.with_suffix('.partial')
            temporary.write_text(json.dumps(payload), encoding='utf-8')
            temporary.replace(cache_path)
            return payload
        except httpx.HTTPError:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError('NASA request retries exhausted')


def ingest_power(dsn, start: date, end: date, cache: Path):
    if start > end or start.year != end.year:
        raise ValueError('Each ingestion batch must be within one calendar year')
    results = []
    with psycopg.connect(dsn, sslmode='require', connect_timeout=15, autocommit=True, row_factory=dict_row) as connection:
        writer = ObservationWriter(connection)
        dataset_id = writer.datasets['nasa_power']
        cells = power_cells(json.loads(writer.region['geometry']))
        for lat, lon in cells:
            grid_id = f'power_native_{lat:.3f}_{lon:.3f}'
            prior = writer.completed(dataset_id, PIPELINE, start, end, grid_id)
            if prior:
                results.append({'status': 'already_stored', **prior})
                continue
            params = {'parameters': ','.join(PARAMETERS), 'community': 'RE', 'latitude': lat, 'longitude': lon,
                      'start': start.strftime('%Y%m%d'), 'end': end.strftime('%Y%m%d'), 'format': 'JSON', 'time-standard': 'UTC'}
            job_id = writer.start_job(dataset_id, {'pipeline': PIPELINE, 'request': params, 'region': 'BBMP'})
            try:
                with httpx.Client(timeout=180, follow_redirects=True) as client:
                    payload = fetch_power(client, params, cache / f'power_{grid_id}_{start}_{end}.json')
                parsed, quality = parse_power(payload, start, end, lat, lon)
                result = writer.persist(dataset_id, PIPELINE, start, end, grid_id, lat, lon, payload, parsed, quality, job_id, POWER_URL)
                results.append(result)
            except Exception as exc:
                writer.fail_job(job_id, exc)
                raise
    return results
