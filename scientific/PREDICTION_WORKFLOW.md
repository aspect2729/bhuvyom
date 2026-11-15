# Prediction Engine v2: reproducible monthly evaluation

This extends `backend/engines/prediction/models.py`; it does not introduce a
parallel forecasting engine. The existing `EngineResult` forecast API and explorer
remain supported. The new dashboard is `/prediction` in the React application.

## Existing architecture and gaps addressed

The existing engine had six direct multi-horizon candidates, annual refitting,
training-only ridge scaling, climatology anomalies and empirical residual
intervals. Its cached v1 results had pooled MAE/RMSE/bias without individual error
records, R-squared, geographical/seasonal diagnostics or durable experiment
history. Calibration-origin targets could overlap the test period at long leads,
and final intervals combined calibration and test residuals. The original engine
had already evaluated observations through 2025; these are not a fresh test.

The existing SQL schema has observations, assets and simulation tables, but no
prediction ledger. This implementation uses an actual local, immutable JSON/JSONL
ledger under the configured data root. Supabase is not required or silently
updated. Remote database mirroring is not implemented.

## Current data and scope

The acquisition script reuses `data_sources/nasa_power_adapter.py` and downloads
real NASA POWER monthly observations at 13.0 N, 77.5 E. As acquired on November 15,
2026, usable target months extend from January 1981 through September 2026.
Temperature is `T2M` in C; precipitation is `PRECTOTCORR` in mm/day (the monthly
mean daily rate, not a monthly total). YYYY13 annual aggregates are excluded.
Fill values and missing calendar keys become null; observations are never shifted
to close a gap. Updated archives supersede older files at the same point without
creating duplicate cells. Raw file SHA-256 values are retained in the snapshot.

The current acquisition contains one native NASA POWER cell covering Bengaluru.
The architecture accepts the acquired cell list, but no neighbourhood-scale skill
or generalization to unseen locations is claimed. A spatially blocked experiment
would be required to make the latter claim. Daily/weekly forecasts, classification
risk scores and other environmental variables remain unsupported.

## Chronology and information availability

The newest acquired calendar year is reserved for the final test. Before it,
five years of target months are used for validation and four years for separate
interval calibration. In this archive these are:

| Role | Target observations | Use |
|---|---|---|
| Initial training | Jan 1981-Dec 2015 | First annual fit |
| Validation | Jan 2017-Dec 2021 | Walk-forward candidate selection |
| Calibration | Jan 2022-Dec 2025 | Residual interval calibration |
| Final point test | Jan-Sep 2026 acquired | One fixed issue origin in Dec 2025 |

Every historical issue origin has an assumed two-month availability lag. Fitting
and feature objects are explicitly truncated to allowed inputs. Annual refits
use only training data preceding the input calendar year. The final test refits
once through October 2025; no 2026 observation enters fitting or features.
Features, scalers, climatology, trend and missing-feature exclusions are fitted
on the allowed training prefix. The seasonal lag is wrapped to an available
previous year even when the internal lead exceeds twelve months because of the
availability lag. There is no interpolation using future observations.

Interval calibration must satisfy this availability rule too: for the Dec 2025
test origin, only calibration targets through Oct 2025 may be used. Operational
NASA release vintages are unavailable. The lag is an explicit assumption and
does not establish real-time publication availability or immunity to revisions.
These are retrospective reanalysis results, not vintage-verified operational skill.

## Durable artifacts and verification

Each experiment stores an input snapshot, source-code snapshot, software versions,
model/feature/preprocessing configuration, criteria and content hashes. Before
actual targets are retrieved for scoring, predictions are written exclusively,
flushed, fsynced and reopened with a checksum check. Target lookup uses
`(grid_id, target_timestamp, variable)`. Separate evaluation records retain the
prediction ID, source/quality, signed/absolute/squared errors and evaluation time.

Prediction rows include model and experiment versions, coordinates, forecast
origin, horizon, input availability and training cutoffs, target date, value,
unit, interval bounds, preprocessing version, input references and generation time.
No historical prediction is overwritten when a later run is created. Artifact
integrity is checked before dashboard metrics are derived or forecasts served.

The final test reserves all twelve point predictions, including unacquired
October-December 2026 targets. Those targets have null actuals/errors and do not
contribute to metrics. There are currently nine matched point pairs total and
one pair per available horizon; these do not support reliable grid-level claims.

Opening a holdout writes an exposure claim. Changing versions, revising a dataset,
adding cells or slightly shifting the test window cannot reuse overlapping exposed
location/variable/target labels. Failed or interrupted test claims are not silently
cleared. Later development requires a genuinely unexposed test period. Test metrics
do not select models, calibrate intervals or trigger promotion.

## Selection and model evolution

Actual candidates are climatology, seasonal naive, damped persistence, climatology
plus trend, pooled ridge and histogram gradient boosting. Baseline-v1, ridge-v2
and boosting-v3 recipe metadata, hyperparameters and validation results are kept.
Missing ML feature rows are excluded without using future information. A candidate
must cover the same matched validation support as climatology to be eligible.

Per horizon, a candidate must improve validation MAE by at least 2%, avoid more than
5% RMSE regression, avoid more than 10% seasonal MAE regression in seasons with
at least six pairs, and satisfy a bias tolerance of 0.1 times baseline RMSE beyond
baseline absolute bias. At least 24 matched pairs are required. Otherwise the
climatology baseline is retained. Criteria are engineering choices, not published
scientific significance thresholds.

Promotion is separate from training. Against an existing champion it requires
identical data and protocol, meaningful improvement at some horizon and no
unacceptable horizon/season/bias regressions. A newer version alone never wins.
Promotion events are append-only. Additional feature/parameter recipes require a
versioned code change and new development before the fresh holdout is opened;
automatic hyperparameter search is not implemented.

## Metrics, diagnostics and uncertainty

Errors stored per record are actual minus predicted; bias is mean(predicted minus
actual). MAE and RMSE use matched finite pairs. R-squared is null for constant
targets or no pairs and may be negative. No regression accuracy percentage or
MAPE is reported. Interval coverage uses only rows with both bounds and actuals;
width and 0.10/0.90 pinball losses are also calculated.

The API supplies native-cell and regional errors, seasonal/month/year/horizon
groups, actual-versus-predicted values, signed-error histograms and error trends.
Environmental condition groups use deciles from the initial training data only.
Grid metrics require 24 matched pairs; interval maps additionally require 24
interval evaluation pairs. Smaller seasonal/monthly groups are descriptive with
counts. Cell averages are not area-weighted and do not imply independence.

Intervals are empirical residual quantiles from calibration data only, not
arbitrary ranges or guaranteed conformal coverage. They quantify historical
residual forecast/model error. Measurement error, reanalysis revisions, spatial
dependence and future climate-scenario uncertainty are not separately quantified.

## Preserved interval-timing audit

The first two real v2 archives were found to use Nov-Dec 2025 calibration targets
for Dec 2025 test intervals, despite the assumed input lag. Their point predictions
and validation-based selections did not use these values. Original artifacts are
preserved. The audit suppresses invalid archived interval coverage in the independent
test view and records the timing failure explicitly.

An append-only interval repair uses only calibration residuals through Oct 2025,
retains exactly the original point forecasts and gives repaired rows new IDs
linked to their originals. Actual coverage is calculated from saved repair rows,
but is labelled `retrospective_interval_repair_not_fresh_holdout`. It is not passed
off as a fresh independent test or used for model selection/promotion. Future
test executions enforce the availability cutoff before interval construction;
tests assert this cutoff directly.

## Run and inspect

From `backend/` on Windows:

```powershell
.\.venv\Scripts\python.exe scripts/acquire_prediction_power.py --through-year 2026
.\.venv\Scripts\python.exe scripts/prediction_workflow.py --variable T2M --promote --evaluate-test
.\.venv\Scripts\python.exe scripts/prediction_workflow.py --variable PRECTOTCORR --promote --evaluate-test
.\.venv\Scripts\python.exe scripts/prediction_workflow.py --run-id <id> --audit-intervals
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8001
```

From `web/`, run `npm run dev -- --port 5174` and open `/prediction`.
Re-running development after this holdout has been exposed intentionally refuses;
read the existing run, audit its intervals or acquire a fresh, unexposed test period.
Tests use explicit synthetic fixtures for invariants; those fixtures are not model
performance evidence. Real validation results are stored only in local artifacts.

Scientific basis: the existing repository references Hyndman and Athanasopoulos,
*Forecasting: Principles and Practice* (time-series cross-validation), Tashman
(2000), Hoerl and Kennard (ridge), and Friedman (gradient boosting). This protocol
does not claim time-series exchangeability or nominal conformal guarantees.
