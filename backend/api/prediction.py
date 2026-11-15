"""Experiment lifecycle and record-backed model-performance API."""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Literal, Optional

import numpy as np
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from engines.contract import FeasibilityError
from engines.prediction import workflow, records as ledger

router = APIRouter(tags=['prediction-validation'])
Variable = Literal['T2M', 'PRECTOTCORR']
Dataset = Literal['validation', 'calibration', 'independent_test', 'interval_repair']


def guard(fn):
    try:
        return fn()
    except FileNotFoundError as error:
        return JSONResponse(status_code=404, content={'error': 'not_available', 'reason': str(error), 'hint': 'Acquire NASA monthly inputs and run scripts/prediction_workflow.py'})
    except (FeasibilityError, FileExistsError) as error:
        return JSONResponse(status_code=422, content={'error': 'infeasible_request', 'reason': str(error)})
    except ValueError as error:
        return JSONResponse(status_code=409, content={'error': 'artifact_integrity_error', 'reason': str(error)})


@router.get('/api/prediction/experiments')
def experiments(var: Variable = 'T2M'):
    return {'experiments': workflow.runs(var), 'protocol': workflow.PROTOCOL,
            'supported': {'frequency': 'monthly', 'horizons': list(workflow.HORIZONS), 'variables': ['T2M', 'PRECTOTCORR'], 'spatial_generalization': False},
            'promotion_events': [json.loads(p.read_text()) for p in sorted((workflow.ROOT / 'promotions').glob('*.json')) if json.loads(p.read_text())['variable'] == var]}


@router.post('/api/prediction/experiments')
def train(var: Variable = 'T2M'):
    return guard(lambda: workflow.develop(var))


@router.post('/api/prediction/experiments/{run_id}/test')
def independent_test(run_id: str):
    return guard(lambda: workflow.evaluate_test(run_id))


@router.post('/api/prediction/experiments/{run_id}/promote')
def promote(run_id: str):
    return guard(lambda: workflow.promote(run_id))


@router.post('/api/prediction/experiments/{run_id}/interval-audit')
def interval_audit(run_id: str):
    return guard(lambda: workflow.repair_intervals(run_id))


def performance_data(run_id, dataset, horizon, grid_id):
    folder, manifest = workflow.load(run_id)
    rows = workflow.stage_rows(run_id, dataset)
    data = json.loads((folder / 'input_snapshot.json').read_text(encoding='utf-8'))
    known_cells = {c['id'] for c in data['cells']}
    if grid_id and grid_id not in known_cells:
        raise FeasibilityError('Unknown grid cell')
    if horizon is not None:
        rows = [r for r in rows if r['forecast_horizon'] == horizon]
    if grid_id:
        rows = [r for r in rows if r['grid_id'] == grid_id]
    # Conditions are descriptive strata, defined by the initial TRAINING sample.
    start = data['months'].index(manifest['training_period']['end']) + 1
    thresholds = {}
    for cell in data['cells']:
        values = [v for v in data['values'][cell['id']][:start] if v is not None]
        thresholds[cell['id']] = np.quantile(values, [.1, .9]).tolist()
    for row in rows:
        actual = row['actual_value']
        low, high = thresholds[row['grid_id']]
        row['condition'] = 'missing' if actual is None else 'lower training decile' if actual < low else 'upper training decile' if actual > high else 'central training range'
    by_target = defaultdict(list)
    for row in rows:
        if row['signed_error'] is not None:
            by_target[row['target_timestamp']].append(row)
    timeline = []
    for target, values in sorted(by_target.items()):
        average = lambda field: float(np.mean([r[field] for r in values])) if all(r.get(field) is not None for r in values) else None
        timeline.append({'target': target, 'actual': average('actual_value'), 'predicted': average('predicted_value'),
                         'signed_error': average('signed_error'), 'mae': ledger.metrics(values)['mae'], 'n': len(values),
                         'pi80_low': average('pi80_low'), 'pi80_high': average('pi80_high')})
    errors = [r['signed_error'] for r in rows if r['signed_error'] is not None]
    counts, edges = np.histogram(errors, bins=12) if errors else ([], [])
    histogram = [{'bin': f'{edges[i]:.2f} to {edges[i + 1]:.2f}', 'count': int(count), 'lower': float(edges[i]), 'upper': float(edges[i + 1])} for i, count in enumerate(counts)]
    cells = ledger.grouped(rows, lambda r: r['grid_id'])
    for group in cells:
        group['cell'] = next(c for c in data['cells'] if c['id'] == group['group'])
    forecast = workflow.forecast_rows(run_id)
    return {'run_id': run_id, 'variable': manifest['variable'], 'unit': manifest['unit'], 'dataset': dataset, 'horizon': horizon,
            'metrics': ledger.metrics(rows), 'cells': cells, 'regional': ledger.grouped(rows, lambda r: 'Acquired Bengaluru grid cells'),
            'months': ledger.grouped(rows, lambda r: r['target_timestamp'][5:], minimum=3),
            'seasons': ledger.grouped(rows, ledger.season, minimum=6),
            'years': ledger.grouped(rows, lambda r: r['target_timestamp'][:4], minimum=6),
            'horizons': ledger.grouped(workflow.stage_rows(run_id, dataset), lambda r: r['forecast_horizon'], minimum=1),
            'conditions': ledger.grouped(rows, lambda r: r['condition'], minimum=6),
            'condition_thresholds_training_only': thresholds, 'timeline': timeline, 'error_distribution': histogram,
            'forecast': [r for r in forecast if (not grid_id or r['grid_id'] == grid_id)],
            'minimum_grid_pairs': ledger.MIN_GROUP, 'comparisons': manifest['comparisons'],
            'notice': 'Means across acquired cells at the selected horizon. No area weighting or spatial independence is implied. Small descriptive seasonal/monthly samples have no confidence claim; grid metrics below 24 matched pairs remain null.',
            'interval_audit': workflow.interval_audit(run_id),
            'uncertainty': ('Retrospective interval repair after a protocol audit; this is not a fresh independent test. ' if dataset == 'interval_repair' else '') + 'Intervals use the separate calibration period. Coverage is reported only where valid intervals and actual observations both exist. Validation/calibration rows have no fitted intervals. Invalid archived independent-test interval metrics are suppressed.'}


@router.get('/api/prediction/experiments/{run_id}/performance')
def performance(
    run_id: str,
    dataset: Dataset = 'validation',
    horizon: Optional[int] = Query(1, ge=1, le=12),
    grid_id: Optional[str] = None,
):
    return guard(lambda: performance_data(run_id, dataset, horizon, grid_id))


@router.get('/api/prediction/experiments/{run_id}/records')
def records(
    run_id: str,
    dataset: Dataset = 'validation',
    horizon: Optional[int] = Query(None, ge=1, le=12),
    grid_id: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=5000),
):
    def result():
        rows = workflow.stage_rows(run_id, dataset)
        rows = [r for r in rows if (horizon is None or r['forecast_horizon'] == horizon) and (not grid_id or r['grid_id'] == grid_id)]
        return {'records': rows[offset:offset + limit], 'total': len(rows), 'offset': offset, 'limit': limit}
    return guard(result)
