"""Existing forecast contract backed by immutable, promoted experiment artifacts.

Training/evaluation lives in workflow.py and reuses models.py. Reading a forecast
never silently reopens the final holdout or promotes a newer experiment.
"""
from __future__ import annotations
import json

from engines.contract import EngineResult, FeasibilityError, FieldSpec, Finding, GridPayload
from engines.prediction.models import MAX_H
from engines.prediction import workflow, records as ledger

SUPPORTED = {"T2M": "air temperature (2 m)", "PRECTOTCORR": "precipitation (bias-corrected)"}
MODEL_VERSION = workflow.VERSION
HISTORY_MONTHS = 48

def check_feasibility(var: str, horizon_months: int, frequency: str = "monthly") -> None:
    if var not in SUPPORTED:
        raise FeasibilityError(f"Prediction for '{var}' is not supported", requirement=f"one of {list(SUPPORTED)}",
                               hint="Other variables are not yet validated; see scientific/MODEL_SELECTION.md")
    if frequency != "monthly":
        raise FeasibilityError("Short-term (hourly/daily) forecasting is not available",
                               requirement="NWP initial conditions or ≥ several years of sub-daily observations; acquired GPM daily record covers only one monsoon season",
                               hint="Use the monthly product, or integrate an operational NWP forecast as forcing (not a statistical extrapolation).")
    if not 1 <= horizon_months <= MAX_H:
        raise FeasibilityError(f"Horizon {horizon_months} months is outside the validated range 1–{MAX_H}",
                               requirement="Multi-year/decadal outlooks need climate-model projections under emission scenarios (e.g. CMIP6 SSPs)",
                               hint="Statistical extrapolation of a 45-year record is not a climate projection; BhuVyom refuses rather than mislead.")


def run(var="T2M", horizon_months=12, force=False):
    check_feasibility(var, horizon_months)
    if force:
        candidate = workflow.develop(var, force=True)
        folder, manifest = workflow.load(candidate['run_id'])
    else:
        folder, manifest = workflow.champion(var)
    data = json.loads((folder / 'input_snapshot.json').read_text(encoding='utf-8'))
    forecast = [r for r in workflow.forecast_rows(manifest['run_id']) if r['forecast_horizon'] <= horizon_months]
    history = data['months'][-HISTORY_MONTHS:]
    targets = sorted({r['target_timestamp'] for r in forecast})
    times = history + targets
    fields = {k: {} for k in ('observed', 'forecast', 'pi80_low', 'pi80_high', 'pi95_low', 'pi95_high', 'climatology')}
    for cell in data['cells']:
        cid = cell['id']
        values = data['values'][cid]
        rows = {r['target_timestamp']: r for r in forecast if r['grid_id'] == cid}
        fields['observed'][cid] = values[-HISTORY_MONTHS:] + [None] * len(targets)
        for name in ('forecast', 'pi80_low', 'pi80_high', 'pi95_low', 'pi95_high'):
            key = 'predicted_value' if name == 'forecast' else name
            fields[name][cid] = [None] * len(history) + [rows[t][key] for t in targets]
        # Diagnostic only, computed from the final forecast training prefix.
        clim = []
        for target in targets:
            month = target[5:]
            observed = [v for t, v in zip(data['months'], values) if t[5:] == month and v is not None]
            clim.append(sum(observed) / len(observed) if observed else None)
        fields['climatology'][cid] = [None] * len(history) + clim
    specs = {}
    for name, values in fields.items():
        specs[name] = FieldSpec(unit=data['unit'], label=name.replace('_', ' ').title(), kind='time_series',
            role='uncertainty' if name.startswith('pi') else 'diagnostic' if name == 'climatology' else 'value', values=values)
    test_path = folder / 'test.json'
    test = json.loads(test_path.read_text()) if test_path.exists() else None
    validation = workflow.stage_rows(manifest['run_id'])
    per_horizon = {}
    for h in range(1, horizon_months + 1):
        selected = manifest['selected_by_horizon'][str(h)]
        comp = manifest['comparisons'][str(h)]
        m, baseline = comp[selected], comp['climatology']
        per_horizon[str(h)] = {'selected_model': selected, 'validation': comp,
            'validation_skill_vs_climatology': 1 - m['mae'] / baseline['mae'] if baseline['mae'] else None,
            'independent_test': next((r for r in test['per_horizon'] if r['group'] == str(h)), None) if test else None}
    overall = ledger.metrics(validation)
    origin = forecast[0]['forecast_origin']
    return EngineResult(
        result_id=manifest['run_id'], engine_name='prediction', data_type='predicted',
        title=f"Archived-origin monthly forecast - {SUPPORTED[var]}", variable=var, units=data['unit'],
        native_resolution='0.5 x 0.625 degrees (NASA POWER / MERRA-2)',
        effective_resolution='Native coarse grid; not neighbourhood scale', temporal_resolution='monthly',
        temporal_coverage={'start': times[0], 'end': times[-1], 'forecast_origin': origin, 'input_available_through': data['months'][-1]},
        grid=GridPayload(cells=data['cells'], times=times, fields=specs,
            cell_attributes={c['id']: {'is_city_cell': c.get('is_city_cell', False)} for c in data['cells']}), default_field='forecast',
        sources=[manifest['sources']], methodology={'id': 'prediction.monthly_direct_multi_horizon', 'version': MODEL_VERSION, 'protocol': manifest['protocol'], 'doc_ref': 'scientific/PREDICTION_WORKFLOW.md'},
        model={'id': f'bhuvyom-monthly-{var}', 'version': MODEL_VERSION, 'artifact_key': manifest['run_id'],
            'selected_by_horizon': manifest['selected_by_horizon'], 'training_period': manifest['training_period'], 'run_id': manifest['run_id'], 'promotion': 'candidate_not_promoted' if force else 'promoted'},
        quality={'cells': len(data['cells']), 'months': len(data['months']), 'validation_pairs': overall['n']},
        uncertainty={'type': 'predictive residual error', 'method': 'Empirical per-horizon quantiles from a separate calibration period only',
            'excludes': ['measurement uncertainty', 'historical data revisions', 'future climate pathway uncertainty'], 'test_coverage': test['metrics'] if test else None},
        validation={'status': 'validated_out_of_sample' if test else 'validation_backtest_only', 'interpretation': 'Retrospective reanalysis, not vintage-verified operational validation',
            'scheme': manifest['protocol'], 'periods': manifest['periods'], 'per_horizon': per_horizon, 'independent_test': test},
        configuration={'horizon_months': horizon_months, 'history_months_returned': len(history), 'run_id': manifest['run_id'], 'assumed_input_lag_months': workflow.LAG},
        assumptions=['No future target is available to a historical model; two-month input lag is an assumption, not a verified NASA publication calendar.'],
        limitations=manifest['limitations'] + [f'Forecast is issued from archived origin {origin}; elapsed targets are not a current forecast.'],
        findings=[Finding(statement='Forecasts and metrics are linked to immutable prediction/evaluation records. Read validation and independent test separately.', category='modelled', evidence={'run_id': manifest['run_id'], 'validation': overall}, rule='No generic regression accuracy percentage; no test-based model selection.')],
    )
