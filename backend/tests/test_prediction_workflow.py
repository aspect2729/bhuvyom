"""Scientific invariants. All generated series in this module are labelled test fixtures."""
import copy
import hashlib
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from engines.contract import FeasibilityError
from engines.prediction import records as ledger, workflow
from engines.prediction.models import CellData, FittedSet, MODEL_IDS
from main import app


def test_metrics_hand_calculation_and_sign_conventions():
    rows = [{'actual_value': a, 'predicted_value': p, 'signed_error': a - p} for a, p in [(1, 2), (2, 2), (4, 1)]]
    result = ledger.metrics(rows)
    assert result['mae'] == pytest.approx(4 / 3)
    assert result['rmse'] == pytest.approx(np.sqrt(10 / 3))
    assert result['bias'] == pytest.approx(-2 / 3)  # prediction minus observation
    assert result['r2'] == pytest.approx(-8 / 7)
    assert result['n'] == 3
    assert ledger.metrics([{'actual_value': 1, 'signed_error': 1}] * 3)['r2'] is None
    assert ledger.metrics([{'actual_value': None, 'signed_error': None}])['mae'] is None


def test_interval_coverage_width_and_quantile_loss():
    rows = [{'actual_value': a, 'signed_error': a - 2, 'pi80_low': 1, 'pi80_high': 3, 'pi95_low': 0, 'pi95_high': 4} for a in (0, 2, 4)]
    result = ledger.metrics(rows)
    assert result['coverage_80'] == pytest.approx(1 / 3)
    assert result['coverage_95'] == 1
    assert result['mean_width_80'] == 2
    assert result['pinball_10'] == pytest.approx((.9 + .1 + .3) / 3)
    assert result['interval_n'] == 3


def test_sparse_grid_groups_suppress_metrics():
    rows = [{'grid_id': 'a', 'actual_value': 2., 'signed_error': 1.}] * 23
    group = ledger.grouped(rows, lambda r: r['grid_id'])[0]
    assert group['n'] == 23 and not group['sufficient']
    assert group['mae'] is None and group['bias'] is None


def test_predictions_are_durable_before_observation_lookup_and_id_matched(tmp_path):
    path = tmp_path / 'predictions.jsonl'
    prediction = {'prediction_id': 'p', 'grid_id': 'city', 'target_timestamp': '2025-01', 'variable': 'T2M', 'predicted_value': 22., 'evaluation_dataset': 'independent_test'}
    sha = ledger.write_once(path, [prediction], lines=True)
    class HiddenObservations(dict):
        def get(self, key):
            assert path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == sha
            assert key == ('city', '2025-01', 'T2M')
            return 24.
    evaluated = ledger.score(path, HiddenObservations(), 'test fixture only', sha)
    assert evaluated[0]['signed_error'] == 2.
    assert evaluated[0]['absolute_error'] == 2.
    assert evaluated[0]['squared_error'] == 4.
    assert ledger.joined([prediction], evaluated)[0]['actual_value'] == 24.
    with pytest.raises(FileExistsError):
        ledger.write_once(path, [], lines=True)
    with pytest.raises(ValueError):
        ledger.joined([prediction], evaluated * 2)
    path.write_text('changed')
    with pytest.raises(ValueError, match='changed'):
        ledger.score(path, {}, 'test', sha)


def test_real_ml_preprocessing_and_long_leads_cannot_see_future():
    rng = np.random.default_rng(21)
    values = 20 + np.sin(np.arange(180) * np.pi / 6) + rng.normal(0, .2, 180)
    changed = values.copy(); changed[135:] = 99999.
    predictions = []
    for series in (values, changed):
        fitted = FittedSet([CellData(series, 13., 77.5)], 120, horizons=(3, 14))
        predictions.append([fitted.predict(model, 0, 134, h) for model in MODEL_IDS for h in (3, 14)])
    np.testing.assert_allclose(predictions[0], predictions[1])


@pytest.fixture
def experiment_fixture(monkeypatch, tmp_path):
    """Fast deterministic stand-in for orchestration tests; not evidence of model skill."""
    rng = np.random.default_rng(5)
    months = [workflow.month_add('1981-01', i) for i in range(552)]
    values = (22 + np.sin(np.arange(552) * np.pi / 6) + rng.normal(0, .4, 552)).tolist()
    data = {'variable': 'T2M', 'months': months, 'cells': [{'id': 'test_city', 'center': [77.5, 13.], 'polygon': [[77, 12.5], [78, 12.5], [78, 13.5], [77, 13.5], [77, 12.5]], 'is_city_cell': True}],
            'values': {'test_city': values}, 'unit': 'C', 'sources': ['SYNTHETIC TEST FIXTURE'], 'files': ['test-fixture-not-a-NASA-observation'], 'api_version': 'test'}
    class InspectFit:
        def __init__(self, cells, c, **kwargs):
            assert all(cd.n == c + 1 for cd in cells)
            self.c = c
            self.cells = cells
            self.clim = [np.full(12, 22.) for _ in cells]
        def predict(self, model, k, origin, lead):
            assert self.c <= origin
            assert self.cells[k].n == origin + 1
            return 22. + (.1 if model == 'ridge_pooled' else 0.)
    monkeypatch.setattr(workflow, 'ROOT', tmp_path / 'experiments')
    monkeypatch.setattr(workflow, 'snapshot', lambda var: copy.deepcopy(data))
    monkeypatch.setattr(workflow, 'FittedSet', InspectFit)
    return data


def test_partitions_are_target_disjoint_and_test_is_a_fixed_blind_origin(experiment_fixture):
    data = experiment_fixture
    stages = {stage: workflow.generate(data, 'test-run', stage, {str(h): 'climatology' for h in workflow.HORIZONS}) for stage in workflow.partitions(data)}
    targets = {stage: {r['target_timestamp'] for r in rows} for stage, rows in stages.items()}
    assert not targets['validation'] & targets['calibration']
    assert not targets['calibration'] & targets['independent_test']
    assert not targets['validation'] & targets['independent_test']
    assert len({r['forecast_origin'] for r in stages['independent_test']}) == 1
    for rows in stages.values():
        for row in rows:
            assert row['input_available_through'] == workflow.month_add(row['forecast_origin'], -2)
            assert row['training_data_end'] <= row['input_available_through'] < row['target_timestamp']
            assert row['target_timestamp'] == workflow.month_add(row['forecast_origin'], row['forecast_horizon'])
    mutated = copy.deepcopy(data)
    start, end = workflow.partitions(data)['independent_test']
    mutated['values']['test_city'][start:end + 1] = [99999.] * (end - start + 1)
    new = workflow.generate(mutated, 'test-run', 'independent_test', {str(h): 'climatology' for h in workflow.HORIZONS})
    assert [r['predicted_value'] for r in new] == [r['predicted_value'] for r in stages['independent_test']]


def test_lifecycle_preserves_predictions_and_prevents_test_reuse(experiment_fixture):
    run = workflow.develop()
    folder, _ = workflow.load(run['run_id'])
    saved_forecast = (folder / 'forecast_predictions.jsonl').read_bytes()
    assert not (folder / 'test.json').exists()
    with pytest.raises(FeasibilityError, match='sealed'):
        workflow.stage_rows(run['run_id'], 'independent_test')
    report = workflow.evaluate_test(run['run_id'])
    assert report['interval_calibration_available_through'] == '2025-10'
    calibration = [r for r in workflow.stage_rows(run['run_id'], 'calibration') if r['target_timestamp'] <= '2025-10']
    first_test = workflow.stage_rows(run['run_id'], 'independent_test')[0]
    assert first_test['pi80_low'] - first_test['predicted_value'] == pytest.approx(workflow.calibrate(calibration)['1']['pi80_low'])
    assert report['metrics']['n'] == 12
    assert report['metrics']['interval_n'] == 12
    assert workflow.evaluate_test(run['run_id']) == report
    assert workflow.develop()['run_id'] == run['run_id']
    overlapping = copy.deepcopy(experiment_fixture)
    overlapping['months'].pop()
    overlapping['values']['test_city'].pop()
    assert workflow._opened_holdout(overlapping)  # a shifted period cannot evade the test lock
    with pytest.raises(FeasibilityError, match='already been opened'):
        workflow.develop(force=True)
    assert (folder / 'forecast_predictions.jsonl').read_bytes() == saved_forecast
    test = workflow.stage_rows(run['run_id'], 'independent_test')
    assert ledger.metrics(test)['mae'] == report['metrics']['mae']


def test_api_performance_is_derived_from_records_and_rejects_bad_filters(experiment_fixture):
    run = workflow.develop()
    client = TestClient(app)
    base = f'/api/prediction/experiments/{run["run_id"]}'
    assert client.get(base + '/performance?dataset=independent_test').status_code == 422
    assert client.get(base + '/performance?horizon=0').status_code == 422
    assert client.get(base + '/performance?grid_id=unknown').status_code == 422
    response = client.get(base + '/performance?horizon=1')
    assert response.status_code == 200
    result = response.json()
    records = client.get(base + '/records?horizon=1').json()['records']
    expected = ledger.metrics(records)
    assert result['metrics']['mae'] == expected['mae']
    assert result['metrics']['n'] == len(records)
    assert result['cells'][0]['cell']['id'] == 'test_city'
    assert client.get('/api/prediction/experiments/not-a-run/records').status_code == 404
    assert client.get(base + '/records?limit=5001').status_code == 422
    assert client.post(base + '/promote').status_code == 200
    assert client.post(base + '/test').status_code == 200
    assert client.get(base + '/performance?dataset=independent_test').json()['cells'][0]['mae'] is None
    forecast = client.get('/api/prediction/forecast?var=T2M&horizon_months=3')
    assert forecast.status_code == 200
    body = forecast.json()
    assert body['configuration']['run_id'] == run['run_id']
    assert body['validation']['independent_test']['metrics']['n'] == 12
    assert len(body['grid']['times']) == 51
    assert body['temporal_coverage']['input_available_through'] == '2026-12'
    assert body['temporal_coverage']['forecast_origin'] == '2027-02'
    # Altering ledger bytes must invalidate the result rather than change metrics silently.
    folder, _ = workflow.load(run['run_id'])
    with (folder / 'validation_evaluations.jsonl').open('a') as stream:
        stream.write('{}\n')
    assert client.get(base + '/performance').status_code == 409


def test_interval_quantiles_use_only_the_supplied_calibration_errors():
    rows = [{'forecast_horizon': 1, 'signed_error': float(v)} for v in range(30)]
    q = workflow.calibrate(rows)['1']
    assert q['pi80_low'] == pytest.approx(np.quantile(np.arange(30), .1))
    assert q['pi95_high'] == pytest.approx(np.quantile(np.arange(30), .975))
    assert workflow.calibrate(rows[:23]) == {}


def test_unacquired_test_horizons_are_saved_but_not_scored(experiment_fixture):
    data = experiment_fixture
    data['months'] = data['months'][:-3]
    data['values']['test_city'] = data['values']['test_city'][:-3]
    run = workflow.develop()
    report = workflow.evaluate_test(run['run_id'])
    assert report['metrics']['n'] == 9
    assert report['available_horizons'] == list(range(1, 10))
    assert report['unevaluated_horizons'] == [10, 11, 12]
    records = workflow.stage_rows(run['run_id'], 'independent_test')
    assert len(records) == 12
    assert records[-1]['predicted_value'] is not None
    assert records[-1]['actual_value'] is None and records[-1]['signed_error'] is None


def test_legacy_exposed_test_year_is_not_called_independent(experiment_fixture):
    data = experiment_fixture
    data['months'] = data['months'][:-12]
    data['values']['test_city'] = data['values']['test_city'][:-12]
    run = workflow.develop()
    with pytest.raises(FeasibilityError, match='legacy engine'):
        workflow.evaluate_test(run['run_id'])


def test_interval_audit_preserves_archives_and_labels_replay(experiment_fixture):
    run = workflow.develop()
    folder, manifest = workflow.load(run['run_id'])
    # Emulate the pre-audit manifest schema in an isolated synthetic fixture.
    manifest.pop('test_interval_policy')
    (folder / 'development.json').write_text(json.dumps(manifest))
    workflow.evaluate_test(run['run_id'])
    original = (folder / 'independent_test_predictions.jsonl').read_bytes()
    assert workflow.evaluate_test(run['run_id'])['metrics']['coverage_80'] is None
    replay = workflow.repair_intervals(run['run_id'])
    assert replay['status'] == 'retrospective_interval_repair_not_fresh_holdout'
    assert replay['metrics']['interval_n'] == 12
    assert (folder / 'independent_test_predictions.jsonl').read_bytes() == original
    rows = workflow.stage_rows(run['run_id'], 'interval_repair')
    old = ledger.read_rows(folder / 'independent_test_predictions.jsonl')
    assert [r['predicted_value'] for r in rows] == [r['predicted_value'] for r in old]
    assert workflow.repair_intervals(run['run_id']) == replay


def test_promotion_gate_rejects_better_mae_with_excessive_rmse():
    def row(i, error):
        return {'grid_id': 'a', 'forecast_origin': f'2020-{i + 1:02d}', 'target_timestamp': f'2021-{i % 12 + 1:02d}', 'actual_value': 20., 'signed_error': error}
    baseline = [row(i, 1.) for i in range(30)]
    candidate = [row(i, 0. if i < 29 else 15.) for i in range(30)]
    assert ledger.metrics(candidate)['mae'] < ledger.metrics(baseline)['mae']
    assert not workflow.eligible(candidate, baseline)
