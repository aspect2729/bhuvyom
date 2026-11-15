"""Import immutable local monthly experiment ledgers into existing Supabase tables.

No training, schema changes, observation downloads, or automatic promotion.
This bounded archive import is separate from the paused bulk observation loader.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engines.prediction.records import digest, joined

PIPELINE = 'monthly-ledger-supabase-v1'
ROOT = Path(__file__).resolve().parents[1] / 'data/prediction_experiments'
MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_GROWTH_BYTES = 64 * 1024 * 1024


def month(value):
    return datetime.fromisoformat(value + '-01').replace(tzinfo=timezone.utc)


def load_archive(root):
    experiments = []
    for path in sorted(root.glob('*/development.json')):
        folder = path.parent
        artifacts = {p.name: p.read_bytes() for p in folder.glob('*.json*')}
        manifest = json.loads(artifacts['development.json'])
        fingerprint = digest({k: hashlib.sha256(v).hexdigest() for k, v in artifacts.items()})
        groups = defaultdict(list)
        all_evaluations = {}
        seen = set()
        for name, raw in artifacts.items():
            if not name.endswith('_predictions.jsonl'):
                continue
            stage = name.removesuffix('_predictions.jsonl')
            report = json.loads(artifacts['test.json' if stage == 'independent_test' else 'interval_repair.json']) if stage in ('independent_test', 'interval_repair') else None
            expected = report['prediction_sha256'] if report else manifest['artifact_hashes'][stage + '_predictions']
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError('Prediction artifact checksum mismatch')
            predictions = [json.loads(line) for line in raw.splitlines() if line.strip()]
            eval_name = stage + '_evaluations.jsonl'
            if eval_name in artifacts:
                expected_eval = report['evaluation_sha256'] if report else manifest['artifact_hashes'].get(stage + '_evaluations')
                if expected_eval and hashlib.sha256(artifacts[eval_name]).hexdigest() != expected_eval:
                    raise ValueError('Evaluation artifact checksum mismatch')
                evaluations = [json.loads(line) for line in artifacts[eval_name].splitlines() if line.strip()]
                joined(predictions, evaluations)  # reject unmatched and duplicate IDs
                for e in evaluations:
                    if e['prediction_artifact_sha256'] != expected:
                        raise ValueError('Evaluation references a different prediction artifact')
                    all_evaluations[e['prediction_id']] = e
            for row in predictions:
                if row['prediction_id'] in seen or row['run_id'] != folder.name or row['evaluation_dataset'] != stage:
                    raise ValueError('Prediction identity/stage mismatch')
                seen.add(row['prediction_id'])
                e = all_evaluations.get(row['prediction_id'])
                if e and e['actual_value'] is not None and row['predicted_value'] is not None:
                    error = e['actual_value'] - row['predicted_value']
                    if any(abs(e[k] - v) > 1e-8 for k, v in [('signed_error', error), ('absolute_error', abs(error)), ('squared_error', error ** 2)]):
                        raise ValueError('Stored error disagrees with prediction/actual')
                groups[(stage, row['model_id'], row['forecast_origin'])].append(row)
        experiments.append(dict(id=folder.name, manifest=manifest, artifacts=artifacts, fingerprint=fingerprint, groups=groups, evaluations=all_evaluations))
    if sum(sum(len(v) for v in e['artifacts'].values()) for e in experiments) > MAX_ARCHIVE_BYTES:
        raise ValueError('Archive exceeds bounded import size')
    return experiments


def bulk(q, sql, rows):
    for start in range(0, len(rows), 1000):
        q.execute(sql, (Jsonb(rows[start:start + 1000]),))


def transfer(conn, experiments):
    summary = dict(experiments=0, skipped=0, predictions=0, evaluations=0, runs=0)
    with conn.transaction(), conn.cursor() as q:
        q.execute('SET LOCAL statement_timeout=120000')
        q.execute('SELECT pg_advisory_xact_lock(21473001)')
        q.execute('SELECT pg_database_size(current_database()) AS bytes')
        before = q.fetchone()['bytes']
        q.execute('SELECT variable_code,variable_id FROM ref_environmental_variables')
        variables = {r['variable_code']: r['variable_id'] for r in q.fetchall()}
        q.execute('SELECT unit_code,unit_id FROM ref_units')
        units = {r['unit_code']: r['unit_id'] for r in q.fetchall()}
        q.execute("SELECT dataset_id FROM datasets WHERE dataset_code='nasa_power'")
        dataset_id = q.fetchone()['dataset_id']
        q.execute("SELECT region_id FROM geo_regions WHERE region_code='IN-KA-BLR-BBMP'")
        region_id = q.fetchone()['region_id']
        for exp in experiments:
            manifest = exp['manifest']
            version_label = PIPELINE + ':' + exp['id']
            q.execute('SELECT dataset_version_id,checksum FROM dataset_versions WHERE dataset_id=%s AND version_label=%s', (dataset_id, version_label))
            previous = q.fetchone()
            if previous:
                if previous['checksum'] != exp['fingerprint']:
                    raise ValueError('Imported experiment changed; refusing overwrite')
                summary['skipped'] += 1
                continue
            # Preserve all small JSON manifests, input values and exact code snapshots.
            archive = {k: json.loads(v) for k, v in exp['artifacts'].items() if k.endswith('.json')}
            metadata = {'pipeline': PIPELINE, 'experiment_id': exp['id'], 'archive': archive,
                        'artifact_sha256': {k: hashlib.sha256(v).hexdigest() for k, v in exp['artifacts'].items()},
                        'provenance': 'Imported local NASA POWER monthly experiment; not trained from newly ingested hourly observations',
                        'temporal_resolution': 'monthly', 'release_vintage_verified': False}
            q.execute('INSERT INTO dataset_versions(dataset_id,version_label,checksum,metadata) VALUES (%s,%s,%s,%s) RETURNING dataset_version_id', (dataset_id, version_label, exp['fingerprint'], Jsonb(metadata)))
            version_id = q.fetchone()['dataset_version_id']
            variable_id = variables['temperature_air_temperature' if manifest['variable'] == 'T2M' else 'precipitation_water_rainfall_intensity']
            factor = 1 if manifest['unit'] == 'C' else 1 / 24
            if manifest['unit'] not in ('C', 'mm/day'):
                raise ValueError('Unsupported source unit')
            unit_id = units['C' if manifest['unit'] == 'C' else 'MM_H']
            model_ids = {}
            for model, spec in manifest['candidates'].items():
                q.execute('''INSERT INTO model_registry(model_code,model_name,model_type,algorithm,version,target_variable_id,training_dataset_ids,feature_specification,hyperparameters,status,description)
                    VALUES (%s,%s,'regression',%s,%s,%s,%s,%s,%s,'development',%s) RETURNING model_id''',
                    (PIPELINE + ':' + exp['id'] + ':' + model, model, model, spec['version'], variable_id, [dataset_id],
                     Jsonb({'features': manifest['features'], 'preprocessing': manifest['preprocessing'], 'training_period': manifest['training_period'], 'evaluation_periods': manifest['periods'], 'source_dataset_version_id': version_id}),
                     Jsonb(spec['parameters']), 'Archived retrospective experiment; import does not grant production approval.'))
                model_ids[model] = q.fetchone()['model_id']
            run_rows, prediction_rows, eval_rows = [], [], []
            eval_by_key = {}
            for (stage, model, origin), rows in exp['groups'].items():
                run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, PIPELINE + ':' + exp['id'] + ':' + ':'.join((stage, model, origin))))
                targets = [month(r['target_timestamp']) for r in rows]
                # Retain original bounds only as archive data; invalid test intervals are not exposed as valid bounds.
                interval_status = 'invalid_archived_interval_timing' if stage == 'independent_test' else 'retrospective_repair_not_fresh_holdout' if stage == 'interval_repair' else 'archived_estimate'
                parameters = {'pipeline': PIPELINE, 'experiment_id': exp['id'], 'archive_sha256': exp['fingerprint'], 'evaluation_dataset': stage,
                              'source_dataset_version_id': version_id, 'interval_status': interval_status,
                              'original_unit': manifest['unit'], 'stored_unit': 'C' if factor == 1 else 'mm/h', 'value_conversion_factor': factor,
                              'horizon_definition': 'calendar months; run horizon_seconds is maximum target-start minus origin-start',
                              'source_records': rows, 'unevaluated_records': [e for r in rows if (e := exp['evaluations'].get(r['prediction_id'])) and e['actual_value'] is None]}
                run_rows.append((run_id, model_ids[model], month(origin), int((max(targets) - month(origin)).total_seconds()), min(targets), max(targets), region_id, Jsonb(parameters), rows[0]['prediction_generated_at']))
                for r in rows:
                    if r['predicted_value'] is None:
                        continue  # original null record remains in run_parameters; schema requires finite predictions
                    key = (run_id, r['target_timestamp'] + '-01T00:00:00+00:00', r['grid_id'])
                    if key in eval_by_key:
                        raise ValueError('Duplicate run/grid/target')
                    e = exp['evaluations'].get(r['prediction_id'])
                    eval_by_key[key] = (e, factor, version_id)
                    valid_interval = stage != 'independent_test'
                    prediction_rows.append({'run': run_id, 'variable': variable_id, 'target': key[1], 'region': region_id, 'grid': r['grid_id'], 'lon': r['longitude'], 'lat': r['latitude'], 'value': r['predicted_value'] * factor, 'unit': unit_id,
                        'low': r.get('pi95_low') * factor if valid_interval and r.get('pi95_low') is not None else None,
                        'high': r.get('pi95_high') * factor if valid_interval and r.get('pi95_high') is not None else None,
                        'quantiles': {k: r[k] * factor for k in ('pi80_low','pi80_high','pi95_low','pi95_high') if valid_interval and r.get(k) is not None}, 'generated': r['prediction_generated_at']})
            q.executemany('''INSERT INTO prediction_runs(prediction_run_id,model_id,forecast_origin,horizon_seconds,target_start,target_end,region_id,status,run_parameters,generated_at,completed_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'completed',%s,%s,now())''', run_rows)
            bulk(q, '''INSERT INTO predictions(prediction_run_id,variable_id,target_timestamp,region_id,grid_id,location,predicted_value,unit_id,lower_bound,upper_bound,quantile_values,generated_at)
                SELECT x.run,x.variable,x.target,x.region,x.grid,extensions.ST_SetSRID(extensions.ST_MakePoint(x.lon,x.lat),4326)::extensions.geography,x.value,x.unit,x.low,x.high,x.quantiles,x.generated
                FROM jsonb_to_recordset(%s) AS x(run uuid,variable bigint,target timestamptz,region bigint,grid text,lon float8,lat float8,value float8,unit bigint,low float8,high float8,quantiles jsonb,generated timestamptz)''', prediction_rows)
            q.execute('SELECT prediction_id,prediction_run_id,target_timestamp,grid_id,predicted_value FROM predictions WHERE prediction_run_id=ANY(%s::uuid[])', ([r[0] for r in run_rows],))
            saved = q.fetchall()
            if len(saved) != len(prediction_rows):
                raise ValueError('Persisted prediction count mismatch')
            for r in saved:
                key = (str(r['prediction_run_id']), r['target_timestamp'].astimezone(timezone.utc).isoformat(), r['grid_id'])
                e, factor, version_id = eval_by_key[key]
                if e is None or e['actual_value'] is None:
                    continue
                actual = e['actual_value'] * factor
                error = actual - r['predicted_value']
                eval_rows.append({'prediction': r['prediction_id'], 'actual': actual, 'signed': error, 'absolute': abs(error), 'squared': error ** 2, 'at': e['evaluation_timestamp'], 'version': version_id, 'notes': json.dumps({'original_evaluation': e, 'conversion_factor': factor, 'signed_error_convention': 'actual - predicted'})})
            bulk(q, '''INSERT INTO prediction_evaluations(prediction_id,actual_value,signed_error,absolute_error,squared_error,evaluated_at,evaluation_dataset_version_id,quality_notes)
                SELECT x.prediction,x.actual,x.signed,x.absolute,x.squared,x.at,x.version,x.notes FROM jsonb_to_recordset(%s)
                AS x(prediction bigint,actual float8,signed float8,absolute float8,squared float8,at timestamptz,version bigint,notes text)''', eval_rows)
            q.execute('SELECT count(*) AS n FROM prediction_evaluations WHERE evaluation_dataset_version_id=%s', (version_id,))
            if q.fetchone()['n'] != len(eval_rows):
                raise ValueError('Persisted evaluation count mismatch')
            summary['experiments'] += 1
            summary['predictions'] += len(saved)
            summary['evaluations'] += len(eval_rows)
            summary['runs'] += len(run_rows)
        q.execute('SELECT pg_database_size(current_database()) AS bytes')
        after = q.fetchone()['bytes']
        if after - before > MAX_GROWTH_BYTES:
            raise RuntimeError('Archive exceeded bounded growth; rolling back (allocated disk may remain)')
        summary.update(database_bytes_before=before, database_bytes_after=after)
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--credential-file', type=Path, required=True)
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    archive = load_archive(ROOT)
    if not args.apply:
        print(json.dumps({'experiments': len(archive), 'predictions': sum(len(rows) for e in archive for rows in e['groups'].values()), 'max_growth_bytes': MAX_GROWTH_BYTES}))
        return
    with psycopg.connect(args.credential_file.read_text().strip(), row_factory=dict_row) as conn:
        print(json.dumps(transfer(conn, archive)))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'status': 'failed', 'error_type': type(exc).__name__, 'sqlstate': getattr(exc, 'sqlstate', None)}))
        sys.exit(1)
