# Validation Protocols

## Prediction (Engine 3)  [EXT: Tashman 2000; Hyndman & Athanasopoulos 2021 §5.10; Lei et al. 2018]
1. **Chronological only.** No random splits. Models fitted with cutoff *c* use data ≤ *c*; features at origin *o* use data ≤ *o*.
   Unit test `test_prediction_models_use_only_past_data` changes all future values and checks predictions are identical.
2. **Rolling origin, yearly refit.** Calibration origins Jan 2011–Dec 2017; test origins Jan 2018–Dec 2024; horizons 1–12;
   pooled over 25 cells (n = 2100 test pairs per horizon at h=1).
3. **Metrics:** MAE, RMSE, bias per variable × horizon × model; skill = 1 − MAE/MAE_climatology. MAPE is **not** used (precipitation ≈ 0 in dry months).
4. **Intervals:** quantiles (2.5/10/90/97.5 %) of calibration residuals of the selected model per horizon; empirical 80 %/95 % coverage on test.
   Final forecast intervals use calibration+test residuals. Precipitation bounds clipped at 0 (physical bound).
5. **Status semantics:** `validated_out_of_sample` = the above was executed; it does not mean "accurate" — read the skill table.

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
