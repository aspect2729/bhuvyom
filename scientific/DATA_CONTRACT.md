# Shared Data Contract — schema 1.0  (`backend/engines/contract.py`)

```text
EngineResult
  result_id, schema_version="1.0", engine_name, data_type, title, variable, units, crs="EPSG:4326"
  native_resolution, effective_resolution, temporal_resolution, temporal_coverage{start,end,...}
  grid:
    cells[]          {id, polygon: closed ring [[lon,lat],...] (GeoJSON order), center: [lon,lat], is_city_cell?}
    times[]          ISO dates / YYYY-MM / YYYY shared by all time_series fields
    fields{name}     {unit, label, kind: time_series|static, role: value|uncertainty|diagnostic|quality,
                      values{cell_id: [v per time] | v}}       missing = null, never 0
    cell_attributes  {cell_id: {...diagnostics, e.g. S, var_s, Z, r1, p_bh}}
  default_field, sources[], methodology{id, version, doc_ref, ...}, model?, quality, uncertainty,
  validation{status,...}, configuration, scenario?, assumptions[], limitations[], findings[], trace[], executed_at
```

## Validation rules (enforced by pydantic)
| data_type | engine | must have |
|---|---|---|
| observed | acquisition | sources, native resolution |
| analysed | analysis | methodology id |
| predicted | prediction | model, uncertainty, validation.status |
| simulated | simulation | scenario, assumptions |
All: `default_field ∈ fields`; every time-series array length = len(times); cell ids must exist.

Large rasters (MODIS HDF, SRTM GeoTIFF, GPM subsets) stay as files under `backend/data/`; results reference products by id.
Errors: infeasible requests return HTTP 422 `{error:"infeasible_request", reason, requirement, hint}`; missing data 404 `data_not_acquired`.

## Endpoints
| Endpoint | Engine | data_type |
|---|---|---|
| `GET /api/engines/catalog` | — | product list (only real data) |
| `GET /api/knowledge/methodologies` | KB | registry + doc-sync flag |
| `GET /api/boundaries/bbmp` | 1 | GeoJSON |
| `GET /api/observed/lst`, `/api/observed/gpm` | 1 | observed |
| `GET /api/analysis/trends?var&start&end&allow_mixed_sources` | 2 | analysed |
| `GET /api/analysis/lst-composite` | 2 | analysed |
| `GET /api/prediction/forecast?var&horizon_months&frequency` · `POST /api/prediction/run?force_retrain` | 3 | predicted |
| `GET /api/simulation/runoff?baseline_impervious&scenario_impervious&soil_group&lam&forcing` | 4 | simulated |
Pre-existing acquisition routes (`/api/datasets`, `/api/regions`, `/api/observations*`, `/api/acquisition/jobs`, `/api/simulation/prepare-inputs`) are unchanged.

## Prediction experiments (workflow 2.0.0)

The existing forecast endpoint serves promoted, persisted experiment artifacts in
the shared EngineResult format. Reading a forecast does not train, promote, or
open an independent test. Monthly variables currently supported are `T2M` (C)
and `PRECTOTCORR` (mm/day, monthly mean daily precipitation rate).

| Endpoint | Purpose |
|---|---|
| `GET /api/prediction/experiments?var=T2M` | Experiment manifests, promotion history, data availability |
| `POST /api/prediction/experiments?var=T2M` | Train and record a development candidate |
| `POST /api/prediction/experiments/{id}/promote` | Apply validation-based promotion gates |
| `POST /api/prediction/experiments/{id}/test` | Persist and evaluate the sealed fixed-origin test once |
| `POST /api/prediction/experiments/{id}/interval-audit` | Audit archived interval timing and append a labelled repair if needed |
| `GET /api/prediction/experiments/{id}/performance` | Metrics and spatial/temporal diagnostics calculated from saved records |
| `GET /api/prediction/experiments/{id}/records` | Paginated joined prediction and evaluation records |

Performance and record queries accept `dataset` (`validation`, `calibration`,
`independent_test`, `interval_repair`), optional `horizon` (1-12 months), and
optional `grid_id`. Records additionally accept `offset` and `limit`.

Prediction artifacts preserve `prediction_id`, `model_version`, `variable`,
`grid_id`, coordinates, `forecast_origin`, `target_timestamp`, `forecast_horizon`,
`predicted_value`, `unit`, optional `pi80_low/high` and `pi95_low/high`, dataset
references, preprocessing version, generation time, and input/training cutoffs.
Evaluation artifacts separately preserve `prediction_id`, `actual_value`,
`actual_observation_source`, `observation_quality`, `signed_error`,
`absolute_error`, `squared_error`, `evaluation_timestamp`, `evaluation_dataset`,
and the prediction artifact hash. Missing observations and errors are null.

Signed error is observation minus prediction; reported bias uses prediction
minus observation. All metrics include the matched-pair count. R-squared is null
for constant or absent observations. Per-cell metrics require 24 matched pairs;
interval maps also require 24 interval pairs. Region, season, month, year,
horizon and condition groupings retain their support counts.

An availability audit suppresses invalid archived independent-test interval
bounds and coverage, while preserving original files and valid point metrics.
Append-only repairs retain original point predictions and link new prediction
IDs to originals. Their evaluation label is
`retrospective_interval_repair_not_fresh_holdout`; repaired interval coverage
must never be presented as a fresh independent test.

Missing artifacts return 404, infeasible requests return 422, and detected
artifact integrity failures return 409. Exposure locks prevent opening the same
holdout for repeated iterative selection. See `PREDICTION_WORKFLOW.md` for
periods, provenance, promotion gates and scientific limitations.
