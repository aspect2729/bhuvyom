# Validation Protocols

## Prediction (Engine 3)
The current protocol is specified in [PREDICTION_WORKFLOW.md](PREDICTION_WORKFLOW.md).
It supersedes the v1 origin-based calibration/test scheme and combined residual
pool. Validation/calibration targets are disjoint, input availability is lagged,
and a final test after legacy exposure through 2025 is protected against reuse.
Predictions are persisted before scoring; all displayed metrics are record-derived.
The first real archives have an explicit interval-timing audit: original invalid
interval coverage is suppressed, point forecasts are retained, and repaired
coverage is labelled retrospective rather than a fresh test. Tests assert
availability of both model inputs and interval-calibration targets.

## Analysis (Engine 2)
* `tests/test_trends_ported.py` (12 tests): MK S/Var(S)/Z against hand and scipy `kendalltau`; Sen vs scipy `theilslopes`;
  ties; TFPW triggering; BH monotonicity; insufficient-data path. Ported unchanged from the validated v1 server.
* Values reproduced: T2M 1981–2025 → 2/25 cells BH-significant (+0.154, +0.152 °C/decade), city cell +0.096 (p=0.17).

## Simulation (Engine 4)
* Closed-form reference test (CN 80, P 50 mm → Q 13.80 mm), zero below Ia, NaN propagation, monotonic in CN, Q ≤ P.
* **Not validated against observations** — no streamflow/runoff data. Status `not_validated` is emitted in every result.

## Contract & API
* `tests/test_engines.py`: contract rejects wrong engine/type pairs, missing model/validation for predictions, missing scenario
  for simulations, and time-series length mismatches; API smoke tests for each engine; 422 refusals for infeasible requests.

## How to run
```
cd backend && source .venv/bin/activate
pytest -q -m "not integration"      # 32 offline tests
```
