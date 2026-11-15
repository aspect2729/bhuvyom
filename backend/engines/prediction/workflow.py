"""Chronological development, separate residual calibration and a sealed final test.

Reuses the existing FittedSet candidates. No historical vintages are available:
this is retrospective reanalysis backtesting with an assumed two-month input lag,
not a claim of demonstrated real-time operational performance.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import sklearn
from threadpoolctl import threadpool_limits

from engines import prepared_data as pd
from engines.contract import FeasibilityError
from engines.prediction.models import MAX_H, MODEL_IDS, SIMPLICITY, CellData, FittedSet, anomalies
from engines.prediction import records as ledger

VERSION = '2.0.0'
PROTOCOL = 'monthly-purged-lag2-v2'
LAG = 2
HORIZONS = tuple(range(1, MAX_H + 1))
ROOT = pd.DATA / 'prediction_experiments'
FEATURES = ['lagged_anomaly_0', 'lagged_anomaly_1', 'lagged_anomaly_2', 'last_available_same_season_anomaly', 'trailing_12_month_anomaly_mean', 'target_month_sin', 'target_month_cos', 'time_trend', 'latitude', 'longitude']
MODEL_CONFIG = {
    'climatology': {'version': 'baseline-v1', 'parameters': {'calendar_month_means': True}},
    'seasonal_naive': {'version': 'baseline-v1', 'parameters': {'lag': 'last same calendar month available'}},
    'damped_persistence': {'version': 'baseline-v1', 'parameters': {'phi': 'training lag-1 correlation'}},
    'clim_trend': {'version': 'baseline-v1', 'parameters': {'trend': 'training OLS'}},
    'ridge_pooled': {'version': 'ridge-v2', 'parameters': {'alpha': 1.0, 'scaler': 'StandardScaler fitted on training only'}},
    'gbm_pooled': {'version': 'boosting-v3', 'parameters': {'max_iter': 120, 'learning_rate': .05, 'max_leaf_nodes': 15, 'min_samples_leaf': 40, 'random_state': 0}},
}
CRITERIA = {'minimum_pairs': 24, 'minimum_mae_improvement': .02, 'maximum_rmse_regression': .05, 'maximum_season_mae_regression': .10, 'minimum_season_pairs': 6, 'bias_tolerance_fraction_of_baseline_rmse': .10}


def month_add(month, offset):
    year, value = map(int, month.split('-'))
    index = year * 12 + value - 1 + offset
    return f'{index // 12:04d}-{index % 12 + 1:02d}'


def snapshot(var):
    if var not in ('T2M', 'PRECTOTCORR'):
        raise FeasibilityError('Only monthly T2M and PRECTOTCORR are supported')
    pm = pd.power_monthly()
    if var not in pm['series']:
        raise FeasibilityError(f'Acquired monthly archive has no {var} observations')
    months = pm['months']
    if len(months) < 360 or any(month_add(a, 1) != b for a, b in zip(months, months[1:])):
        raise FeasibilityError('At least 30 years on a complete monthly calendar are required; gaps must be null')
    test_start = next(i for i, month in enumerate(months) if month == months[-1][:4] + '-01')
    initial_cutoff = ((test_start - 108 - 1 - LAG) // 12) * 12 - 1
    for cell in pm['cells']:
        values = pm['series'][var][cell['id']]
        if len(values) != len(months) or sum(v is not None for v in values[:initial_cutoff + 1]) < 180:
            raise FeasibilityError('Each cell needs at least 180 usable pre-validation monthly observations')
    value = {'variable': var, 'months': months, 'cells': pm['cells'], 'values': pm['series'][var],
             'unit': pm['meta'][var]['unit'], 'sources': pm['header_sources'], 'files': pm['files'], 'api_version': pm['api_version'],
             'raw_file_sha256': {name: hashlib.sha256((pd.POWER_MONTHLY_DIR / name).read_bytes()).hexdigest() for name in pm['files']}}
    return value


def partitions(data):
    n = len(data['months'])
    # Earlier engine versions have already exposed observations through 2025.
    # A fresh final test starts in January of the newest acquired year.
    test = next(i for i, month in enumerate(data['months']) if month == data['months'][-1][:4] + '-01')
    calibration = test - 48
    validation = calibration - 60
    return {'validation': (validation, calibration - 1), 'calibration': (calibration, test - 1), 'independent_test': (test, n - 1)}


def _cells(data, cutoff):
    return [CellData(np.array([np.nan if v is None else v for v in data['values'][c['id']][:cutoff + 1]]), lat=c['center'][1], lon=c['center'][0], month0=int(data['months'][0][5:]), year0=int(data['months'][0][:4])) for c in data['cells']]


def _record(data, run_id, dataset, model, origin, h, value, train_cutoff, generated_at, cell, quantiles=None):
    date = lambda i: month_add(data['months'][0], i)
    value = float(value) if np.isfinite(value) else None
    nonnegative = data['variable'] == 'PRECTOTCORR'
    if value is not None and nonnegative:
        value = max(0., value)
    row = {'prediction_id': ledger.digest([run_id, dataset, model, cell['id'], date(origin), h]),
           'run_id': run_id, 'model_id': model, 'model_version': MODEL_CONFIG[model]['version'],
           'experiment_version': VERSION, 'variable': data['variable'], 'grid_id': cell['id'],
           'latitude': cell['center'][1], 'longitude': cell['center'][0],
           'forecast_origin': date(origin), 'input_available_through': date(origin - LAG),
           'training_data_end': date(train_cutoff), 'target_timestamp': date(origin + h),
           'forecast_horizon': h, 'horizon_unit': 'months', 'predicted_value': value,
           'unit': data['unit'], 'input_dataset_references': ['input_snapshot.json'],
           'preprocessing_version': 'training-only-monthly-anomalies-v2',
           'prediction_generated_at': generated_at, 'evaluation_dataset': dataset,
           'pi80_low': None, 'pi80_high': None, 'pi95_low': None, 'pi95_high': None}
    if value is not None and quantiles:
        for key, residual in quantiles.items():
            bound = value + residual
            row[key] = max(0., bound) if nonnegative else bound
    return row


def generate(data, run_id, dataset, selected=None, quantiles=None):
    """Targets are NEVER read here. Each input object is truncated at origin-lag."""
    spans = partitions(data)
    if dataset == 'forecast':
        origins = [len(data['months']) - 1 + LAG]
        start, end = origins[0] + 1, origins[0] + MAX_H
    else:
        start, end = spans[dataset]
        origins = [start - 1] if dataset == 'independent_test' else range(start - 1, end)
        if dataset == 'independent_test':
            # Preserve all twelve blind predictions now. Unacquired future
            # observations remain null and contribute nothing to any metric.
            end = start + MAX_H - 1
    output, fs, prior_cutoff = [], None, None
    leads = tuple(h + LAG for h in HORIZONS)
    for origin in origins:
        available = origin - LAG
        # Annual refit on data before the input calendar year. Final test/forecast
        # refit once on every observation available at that fixed issue origin.
        cutoff = available if dataset in ('independent_test', 'forecast') else (available // 12) * 12 - 1
        if cutoff != prior_cutoff:
            fs = FittedSet(_cells(data, cutoff), cutoff, horizons=leads)
            prior_cutoff = cutoff
        fs.cells = _cells(data, available)
        fs.anom = [anomalies(cd, cl) for cd, cl in zip(fs.cells, fs.clim)]
        generated = ledger.now()
        for h in HORIZONS:
            if not start <= origin + h <= end:
                continue
            candidates = [selected[str(h)]] if selected else MODEL_IDS
            for model in candidates:
                for k, cell in enumerate(data['cells']):
                    value = fs.predict(model, k, available, h + LAG)
                    output.append(_record(data, run_id, dataset, model, origin, h, value, cutoff, generated, cell, (quantiles or {}).get(str(h))))
    return output


def reveal(data):
    return {(c['id'], t, data['variable']): v for c in data['cells'] for t, v in zip(data['months'], data['values'][c['id']])}


def persist_stage(folder, dataset, predictions, data):
    path = folder / f'{dataset}_predictions.jsonl'
    sha = ledger.write_once(path, predictions, lines=True)
    evaluations = ledger.score(path, reveal(data), 'NASA POWER monthly / MERRA-2; archived retrospective snapshot', sha)
    ledger.write_once(folder / f'{dataset}_evaluations.jsonl', evaluations, lines=True)
    return ledger.joined(predictions, evaluations), sha


def eligible(candidate, baseline, require_improvement=True):
    """Paired validation comparisons only. Predefined gates, no test inputs."""
    key = lambda r: (r['grid_id'], r['forecast_origin'], r['target_timestamp'])
    available = {key(r): r for r in candidate if r['signed_error'] is not None}
    pairs = [(available[key(r)], r) for r in baseline if r['signed_error'] is not None and key(r) in available]
    c, b = ledger.metrics([p[0] for p in pairs]), ledger.metrics([p[1] for p in pairs])
    base_count = ledger.metrics(baseline)['n']
    if c['n'] < CRITERIA['minimum_pairs'] or c['n'] != base_count or b['mae'] is None:
        return False
    if require_improvement and b['mae'] == 0:
        return False
    factor = .98 if require_improvement else 1.02
    if c['mae'] > factor * b['mae'] or c['rmse'] > 1.05 * b['rmse'] or abs(c['bias']) > abs(b['bias']) + .1 * b['rmse']:
        return False
    for season in ('DJF', 'MAM', 'JJAS', 'ON'):
        subset = [p for p in pairs if ledger.season(p[1]) == season]
        cm, bm = ledger.metrics([p[0] for p in subset]), ledger.metrics([p[1] for p in subset])
        if cm['n'] >= 6 and cm['mae'] > 1.1 * bm['mae']:
            return False
    return True


def select(validation):
    chosen, comparisons = {}, {}
    for h in HORIZONS:
        rows = [r for r in validation if r['forecast_horizon'] == h]
        baseline = [r for r in rows if r['model_id'] == 'climatology']
        by_model = {m: [r for r in rows if r['model_id'] == m] for m in MODEL_IDS}
        allowed = [m for m in MODEL_IDS if m != 'climatology' and eligible(by_model[m], baseline)]
        best = min(allowed, key=lambda m: (ledger.metrics(by_model[m])['mae'], SIMPLICITY[m])) if allowed else 'climatology'
        chosen[str(h)] = best
        comparisons[str(h)] = {m: {**ledger.metrics(v), 'passes_validation_gates': m in allowed, **MODEL_CONFIG[m]} for m, v in by_model.items()}
    return chosen, comparisons


def calibrate(rows):
    result = {}
    for h in HORIZONS:
        values = [r['signed_error'] for r in rows if r['forecast_horizon'] == h and r['signed_error'] is not None]
        if len(values) >= 24:
            q = np.quantile(values, [.1, .9, .025, .975])
            result[str(h)] = dict(zip(['pi80_low', 'pi80_high', 'pi95_low', 'pi95_high'], map(float, q)))
    return result


def load(run_id):
    if len(run_id) != 32 or any(c not in '0123456789abcdef' for c in run_id):
        raise FileNotFoundError('Unknown experiment ID')
    folder = ROOT / run_id
    manifest = json.loads((folder / 'development.json').read_text(encoding='utf-8'))
    data = json.loads((folder / 'input_snapshot.json').read_text(encoding='utf-8'))
    if ledger.digest(data) != manifest['dataset_sha256']:
        raise ValueError('Input snapshot integrity check failed')
    return folder, manifest


def runs(var=None):
    result = []
    for path in ROOT.glob('*/development.json'):
        manifest = json.loads(path.read_text(encoding='utf-8'))
        if var is None or manifest['variable'] == var:
            manifest['test_opened'] = (path.parent / 'test.json').exists()
            manifest['interval_repair_available'] = (path.parent / 'interval_repair.json').exists()
            result.append(manifest)
    return sorted(result, key=lambda r: r['created_at'], reverse=True)


def _claim_key(data):
    start, end = partitions(data)['independent_test']
    return ledger.digest([data['variable'], sorted(c['id'] for c in data['cells']), data['months'][start:end + 1]])


def _opened_holdout(data):
    start, end = partitions(data)['independent_test']
    cells, targets = {c['id'] for c in data['cells']}, set(data['months'][start:end + 1])
    for path in (ROOT / 'test_claims').glob('*.json'):
        claim = json.loads(path.read_text())
        if claim['variable'] == data['variable'] and cells.intersection(claim['grid_ids']) and targets.intersection(claim['targets']):
            return True
    return False


@contextmanager
def _claim_lock():
    path = ROOT / 'test_claims' / '.claim.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        stream.write(ledger.now())
    try:
        yield
    finally:
        path.unlink()


def develop(var='T2M', force=False):
    data = snapshot(var)
    fingerprint = ledger.digest(data)
    source = {name: (Path(__file__).parent / name).read_text(encoding='utf-8') for name in ('models.py', 'workflow.py', 'records.py')}
    signature = ledger.digest([fingerprint, source, sklearn.__version__, VERSION, PROTOCOL])
    previous = [r for r in runs(var) if r['signature'] == signature]
    if previous and not force:
        return previous[0]
    if _opened_holdout(data):
        raise FeasibilityError('This final test period has already been opened. Iterating on it is prohibited.',
                               hint='Acquire a later, genuinely unseen period before developing another model against this holdout.')
    run_id = uuid.uuid4().hex
    folder = ROOT / run_id
    ledger.write_once(folder / 'input_snapshot.json', data)
    ledger.write_once(folder / 'source_snapshot.json', source)
    with threadpool_limits(limits=1):
        validation, val_sha = persist_stage(folder, 'validation', generate(data, run_id, 'validation'), data)
        chosen, comparisons = select(validation)
        # Freeze the choice BEFORE accessing calibration targets.
        ledger.write_once(folder / 'selection.json', {'selected_by_horizon': chosen, 'criteria': CRITERIA, 'validation_prediction_sha256': val_sha})
        calibration, cal_sha = persist_stage(folder, 'calibration', generate(data, run_id, 'calibration', chosen), data)
        quantiles = calibrate(calibration)
        forecast = generate(data, run_id, 'forecast', chosen, quantiles)
        forecast_sha = ledger.write_once(folder / 'forecast_predictions.jsonl', forecast, lines=True)
    spans = partitions(data)
    periods = {name: {'start': data['months'][a], 'end': data['months'][b]} for name, (a, b) in spans.items()}
    manifest = {'run_id': run_id, 'variable': var, 'unit': data['unit'], 'experiment_version': VERSION,
                'protocol': PROTOCOL, 'signature': signature, 'dataset_sha256': fingerprint, 'created_at': ledger.now(),
                'periods': periods, 'training_period': {'start': data['months'][0], 'end': data['months'][((spans['validation'][0] - 1 - LAG) // 12) * 12 - 1]},
                'features': FEATURES, 'preprocessing': {'missing': 'no interpolation; incomplete ML feature rows excluded', 'scaling': 'training-only StandardScaler for ridge', 'climatology': 'training-only by cell and calendar month', 'assumed_availability_lag_months': LAG},
                'candidates': MODEL_CONFIG, 'selected_by_horizon': chosen, 'comparisons': comparisons,
                'interval_quantiles': quantiles, 'interval_calibration_counts': {str(h): ledger.metrics([r for r in calibration if r['forecast_horizon'] == h])['n'] for h in HORIZONS},
                'test_interval_policy': 'calibration_targets_available_at_issue_origin',
                'criteria': CRITERIA, 'software': {'sklearn': sklearn.__version__, 'numpy': np.__version__},
                'artifact_hashes': {'validation_predictions': val_sha, 'calibration_predictions': cal_sha, 'forecast_predictions': forecast_sha},
                'validation_status': 'retrospective_backtest_completed', 'test_status': 'sealed',
                'sources': {'product': 'NASA POWER monthly / MERRA-2', 'files': data['files'], 'upstream': data['sources'], 'api_version': data['api_version']},
                'limitations': ['Monthly only; 1-12 months from an issue origin with an assumed two-month input lag.',
                    'Historical release vintages and availability timestamps are unavailable. This retrospective reanalysis evaluation does not establish real-time operational skill.',
                    'Existing acquired grid cells only; no spatially blocked generalization test has been performed.',
                    'Bengaluru occupies one coarse NASA POWER cell; no neighbourhood forecast.',
                    'Repeated grid cells and overlapping forecast targets are dependent; sample counts are not independent effective sample sizes.',
                    'Intervals describe residual model/forecast error, exclude measurement error and climate-pathway uncertainty, and have no exchangeability guarantee for time series.',
                    'No streamflow, official risk-classification or daily-weather validation is claimed.']}
    for stage in ('validation', 'calibration'):
        manifest['artifact_hashes'][f'{stage}_evaluations'] = hashlib.sha256((folder / f'{stage}_evaluations.jsonl').read_bytes()).hexdigest()
    ledger.write_once(folder / 'development.json', manifest)
    return manifest


def evaluate_test(run_id):
    folder, manifest = load(run_id)
    report_path = folder / 'test.json'
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding='utf-8'))
        if report['development_sha256'] != ledger.digest(manifest):
            raise ValueError('The frozen development manifest changed after test evaluation')
        if interval_audit(run_id)['status'] == 'invalid_archived_interval_timing':
            for metrics in [report['metrics'], *report['per_horizon']]:
                for key in ('coverage_80', 'coverage_95', 'mean_width_80', 'pinball_10', 'pinball_90'):
                    metrics[key] = None
                metrics['interval_n'] = 0
            report['status'] = 'independent_point_test_completed_interval_timing_invalid'
            report['note'] += ' Archived interval scores failed the availability audit and are suppressed. Point forecasts are unchanged. Any repaired interval replay is retrospective, not a fresh independent test.'
        return report
    data = json.loads((folder / 'input_snapshot.json').read_text(encoding='utf-8'))
    if manifest['periods']['independent_test']['start'] <= '2025-12':
        raise FeasibilityError('The legacy engine already evaluated observations through 2025. Acquire a genuinely new test period after 2025.')
    source = {name: (Path(__file__).parent / name).read_text(encoding='utf-8') for name in ('models.py', 'workflow.py', 'records.py')}
    if ledger.digest([ledger.digest(data), source, sklearn.__version__, VERSION, PROTOCOL]) != manifest['signature']:
        raise FeasibilityError('Training code or environment changed after development. Complete a new development run before opening the test.')
    claim = ROOT / 'test_claims' / f'{_claim_key(data)}.json'
    frozen = ledger.digest(manifest)
    with _claim_lock():
        if _opened_holdout(data):
            raise FeasibilityError('This holdout overlaps observations already opened or an interrupted evaluation; it cannot be reused.')
        start, end = partitions(data)['independent_test']
        ledger.write_once(claim, {'run_id': run_id, 'opened_at': ledger.now(), 'development_sha256': frozen,
                                 'variable': data['variable'], 'grid_ids': [c['id'] for c in data['cells']], 'targets': data['months'][start:end + 1]})
    with threadpool_limits(limits=1):
        cutoff = data['months'][partitions(data)['independent_test'][0] - 1 - LAG]
        calibration = [r for r in stage_rows(run_id, 'calibration') if r['target_timestamp'] <= cutoff]
        test_quantiles = calibrate(calibration)
        predictions = generate(data, run_id, 'independent_test', manifest['selected_by_horizon'], test_quantiles)
    rows, sha = persist_stage(folder, 'independent_test', predictions, data)
    result = {'run_id': run_id, 'evaluated_at': ledger.now(), 'development_sha256': frozen, 'prediction_sha256': sha,
              'status': 'independent_fixed_origin_test_completed', 'period': manifest['periods']['independent_test'],
              'evaluation_sha256': hashlib.sha256((folder / 'independent_test_evaluations.jsonl').read_bytes()).hexdigest(),
              'interval_calibration_available_through': cutoff,
              'metrics': ledger.metrics(rows), 'per_horizon': ledger.grouped(rows, lambda r: r['forecast_horizon'], minimum=1),
              'available_horizons': sorted({r['forecast_horizon'] for r in rows if r['signed_error'] is not None}),
              'unevaluated_horizons': [h for h in HORIZONS if h not in {r['forecast_horizon'] for r in rows if r['signed_error'] is not None}],
              'note': 'One fixed issue origin before the fresh test year. Only acquired target months are evaluated; later horizons stay unevaluated. No test observation is a feature, training target, selector or interval residual. Per-horizon n may be small; no grid metrics below 24 pairs.'}
    ledger.write_once(report_path, result)
    return result


def stage_rows(run_id, dataset='validation'):
    if dataset not in ('validation', 'calibration', 'independent_test', 'interval_repair'):
        raise ValueError('Unknown evaluation dataset')
    folder, manifest = load(run_id)
    if dataset == 'independent_test' and not (folder / 'test.json').exists():
        raise FeasibilityError('The independent test is still sealed')
    report = evaluate_test(run_id) if dataset == 'independent_test' else json.loads((folder / 'interval_repair.json').read_text()) if dataset == 'interval_repair' else None
    hashes = manifest['artifact_hashes']
    for kind in ('predictions', 'evaluations'):
        path = folder / f'{dataset}_{kind}.jsonl'
        expected = report['prediction_sha256' if kind == 'predictions' else 'evaluation_sha256'] if report else hashes.get(f'{dataset}_{kind}')
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'{dataset} {kind} integrity check failed')
    predictions = ledger.read_rows(folder / f'{dataset}_predictions.jsonl')
    evaluations = ledger.read_rows(folder / f'{dataset}_evaluations.jsonl')
    rows = ledger.joined(predictions, evaluations)
    if dataset == 'independent_test' and interval_audit(run_id)['status'] == 'invalid_archived_interval_timing':
        for row in rows:
            for field in ('pi80_low', 'pi80_high', 'pi95_low', 'pi95_high'):
                row[field] = None
            row['interval_validity'] = 'invalid_archived_interval_timing; original bytes retained'
    return [r for r in rows if r['model_id'] == manifest['selected_by_horizon'][str(r['forecast_horizon'])]]


def interval_audit(run_id):
    folder, manifest = load(run_id)
    data = json.loads((folder / 'input_snapshot.json').read_text())
    cutoff = data['months'][partitions(data)['independent_test'][0] - 1 - LAG]
    invalid = manifest.get('test_interval_policy') != 'calibration_targets_available_at_issue_origin' and manifest['periods']['calibration']['end'] > cutoff
    return {'run_id': run_id, 'status': 'invalid_archived_interval_timing' if invalid else 'availability_cutoff_enforced',
            'calibration_available_through': cutoff, 'archived_calibration_end': manifest['periods']['calibration']['end'],
            'note': 'Point forecasts and model selection are unchanged. Original artifacts are retained. A repair uses only calibration residuals available by the historical issue origin; replay scores are not a fresh independent test.'}


def repair_intervals(run_id):
    """Append an audit replay; NEVER retrain, reselect, overwrite or reopen a holdout."""
    folder, manifest = load(run_id)
    if not (folder / 'test.json').exists():
        raise FeasibilityError('Evaluate the sealed test under the correct protocol before requesting an audit replay')
    path = folder / 'interval_repair.json'
    if path.exists():
        return json.loads(path.read_text())
    audit = interval_audit(run_id)
    if audit['status'] != 'invalid_archived_interval_timing':
        return audit
    ledger.write_once(folder / 'interval_timing_audit.json', audit)
    calibration = [r for r in stage_rows(run_id, 'calibration') if r['target_timestamp'] <= audit['calibration_available_through']]
    quantiles = calibrate(calibration)
    stage_rows(run_id, 'independent_test')  # verify original artifact integrity
    predictions = []
    original_predictions = ledger.read_rows(folder / 'independent_test_predictions.jsonl')
    for saved in original_predictions:
        row = dict(saved)
        row['original_prediction_id'] = saved['prediction_id']
        row['prediction_id'] = ledger.digest([saved['prediction_id'], 'interval-availability-audit-v1'])
        row['prediction_generated_at'] = ledger.now()
        row['evaluation_dataset'] = 'interval_repair'
        row['interval_calibration_available_through'] = audit['calibration_available_through']
        for field in ('pi80_low', 'pi80_high', 'pi95_low', 'pi95_high'):
            q = quantiles.get(str(row['forecast_horizon']), {}).get(field)
            row[field] = row['predicted_value'] + q if row['predicted_value'] is not None and q is not None else None
            if row[field] is not None and manifest['variable'] == 'PRECTOTCORR':
                row[field] = max(0., row[field])
        predictions.append(row)
    data = json.loads((folder / 'input_snapshot.json').read_text())
    rows, sha = persist_stage(folder, 'interval_repair', predictions, data)
    report = {'run_id': run_id, 'status': 'retrospective_interval_repair_not_fresh_holdout', 'audit': audit,
              'prediction_sha256': sha, 'evaluation_sha256': hashlib.sha256((folder / 'interval_repair_evaluations.jsonl').read_bytes()).hexdigest(),
              'metrics': ledger.metrics(rows), 'evaluated_at': ledger.now(), 'note': audit['note']}
    ledger.write_once(path, report)
    return report


def forecast_rows(run_id):
    folder, manifest = load(run_id)
    path = folder / 'forecast_predictions.jsonl'
    if hashlib.sha256(path.read_bytes()).hexdigest() != manifest['artifact_hashes']['forecast_predictions']:
        raise ValueError('Forecast prediction integrity check failed')
    return ledger.read_rows(path)


def promote(run_id):
    folder, candidate = load(run_id)
    candidate_rows = stage_rows(run_id)
    if any(ledger.metrics([r for r in candidate_rows if r['forecast_horizon'] == h])['n'] < CRITERIA['minimum_pairs'] for h in HORIZONS):
        raise FeasibilityError('Insufficient matched validation pairs to promote this experiment')
    events = sorted((ROOT / 'promotions').glob('*.json'))
    prior = [json.loads(p.read_text()) for p in events]
    prior = [p for p in prior if p['variable'] == candidate['variable']]
    if prior:
        incumbent_id = prior[-1]['run_id']
        if incumbent_id == run_id:
            return prior[-1]
        _, incumbent = load(incumbent_id)
        if incumbent['dataset_sha256'] != candidate['dataset_sha256'] or incumbent['protocol'] != candidate['protocol']:
            raise FeasibilityError('Promotion comparison requires identical data and chronological protocol; run both recipes on a new shared development split.')
        crows, brows = candidate_rows, stage_rows(incumbent_id)
        improved = False
        for h in HORIZONS:
            c = [r for r in crows if r['forecast_horizon'] == h]
            b = [r for r in brows if r['forecast_horizon'] == h]
            if not eligible(c, b, require_improvement=False):
                raise FeasibilityError('Candidate regresses or has incompatible validation support; incumbent retained')
            improved |= eligible(c, b)
        if not improved:
            raise FeasibilityError('No horizon demonstrates the predefined meaningful improvement; incumbent retained')
    event = {'run_id': run_id, 'variable': candidate['variable'], 'promoted_at': ledger.now(),
             'basis': 'validation-only gates; no test metric is used for promotion', 'criteria': CRITERIA}
    ledger.write_once(ROOT / 'promotions' / f'{event["promoted_at"].replace(":", "-")}_{run_id}.json', event)
    return event


def champion(var):
    events = [json.loads(p.read_text()) for p in sorted((ROOT / 'promotions').glob('*.json'))]
    matching = [p for p in events if p['variable'] == var]
    if not matching:
        raise FeasibilityError('No promoted prediction experiment is available', hint=f'Run scripts/prediction_workflow.py --variable {var} --promote --evaluate-test')
    return load(matching[-1]['run_id'])
