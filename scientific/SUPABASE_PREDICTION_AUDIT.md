# Supabase prediction readiness audit

Audit date: 2026-11-15 UTC. Project: `jmecdqlhirtobdctnavt`.
Status: database and repository audit completed; hourly forecasting is **not ready for training or deployment**.

## Scope and evidence

The supplied credential connected successfully with TLS. Every audit transaction
explicitly used `READ ONLY`; the connection's account itself is broader than
read-only (`BYPASSRLS=true`, not a PostgreSQL superuser). This does not establish
that an anon or dedicated deployment role has the same access. No database writes,
schema changes, ingestion, model training, or deployment were performed in this audit.

Reproducible inspector: `backend/scripts/audit_prediction_database.py`.
Local aggregate/schema evidence: `backend/data/audits/supabase_prediction_audit.json`.
The evidence contains no connection string or passwords and is Git-ignored.
Counts are observations of the live database during the audit, not a frozen
training snapshot: queries used separate read-only transactions. The initial
inventory began at 2026-11-15 13:00 UTC; focused follow-up queries refined it.

The audit reads the actual live schema. Do not execute `database/schema.sql` or
reapply old migrations on the assumption that the database matches the old draft.

## Existing architecture to reuse

There are 23 public base tables and five compatibility views. RLS is enabled on
all 23 public base tables. Views are `regions`, `acquisition_jobs`,
`observation_assets`, `observation_series`, and `simulation_input_bundles`;
they are not separate observation stores. Metadata visibility through these
views is not a substitute for testing the intended application role.

| Existing location | Actual content / count | Intended reuse |
|---|---|---|
| `environmental_observations` | 93,565 rows | Authoritative historical values after source/quality filtering |
| `datasets`, `dataset_versions`, `dataset_variables` | 14, 19, 23 rows | Dataset identity, immutable extraction versions, source-variable mapping |
| `data_sources` | 8 rows | Provider provenance |
| `ref_environmental_variables`, `ref_units` | 145, 15 rows | Variable and unit dictionaries |
| `geo_regions` | 4 rows | Existing BBMP and Greater Bengaluru geometries; Karnataka/India metadata |
| `geospatial_assets` | 0 rows | File/feature dataset asset registration |
| `processing_jobs`, `quality_reports` | 16 jobs, 0 quality reports | Ingestion, feature preparation, training and quality tracking |
| `model_registry` | 0 rows | Algorithm/version, features, hyperparameters, metrics, artifact references |
| `prediction_runs`, `predictions`, `prediction_evaluations` | 0 rows each | Run origins/horizons, immutable forecasts, observation-linked errors |
| `simulation_models`, `simulation_scenarios`, `simulation_runs`, `simulation_outputs` | 1, 5, 5, 350 rows | Existing simulation storage; preserve it |
| `analytical_results`, `derived_indicators` | 0 rows each | Existing analysis output structure |
| Storage bucket `bhuvyom-rasters` | Private; 0 objects | Existing asset bucket; ML artifact prefix/purpose needs confirmation |

`model_registry` already has `artifact_bucket` and `artifact_path`; a second model
table or bucket is not justified. No populated model rows establish a designated
ML artifact prefix yet. Proposed prefixes inside the existing private bucket:
`ml/datasets/{version}/` and `ml/models/{model_code}/{version}/`, subject to approval.
Prepared datasets can be registered through existing dataset versions and assets
with explicit `prepared_feature_dataset` metadata, rather than observation rows.

Foreign keys connect observations to variable, dataset, dataset version, unit and
region; runs to models; forecasts to runs; evaluations to forecasts and observations.
GiST indexes exist on observation/prediction locations and region boundaries.
Observation `location` is geography (cast to geometry for geometry-only functions);
stored coordinates use SRID 4326. BBMP and Greater Bengaluru boundaries are valid
MULTIPOLYGON geometries. No separate 1 km grid table was discovered.

## Actual observation coverage

All rows below are in `public.environmental_observations`. Counts are across the
stored regional grids, **not all inside BBMP**. All have 0% null numeric values,
locations, grid IDs and dataset-version IDs among stored rows; that does not mean
complete historical coverage. Every stored `quality_score` is null. Quality flags
are source/category labels, not independent measurement validation.

| Dataset / provider | Variable or source parameter | Actual UTC coverage | Stored cadence | Native scale | Rows | Units | QC / ML suitability |
|---|---|---|---|---|---:|---|---|
| MERRA-2 / NASA | `T2M_C` | Sep 2-Oct 1, 2026, 06:00 | Once daily, 30 dates | ~55 km | 4,050 | C | `reanalysis`; insufficient hourly history |
| MERRA-2 / NASA | `RH2M` | Same 30 dates | Once daily | ~55 km | 4,050 | % | Derived humidity; verify derivation before input use |
| MERRA-2 / NASA | `WS2M` | Same 30 dates | Once daily | ~55 km | 4,050 | m/s | Derived from U/V; candidate input only |
| MERRA-2 / NASA | `WD2M` | Same 30 dates | Once daily | ~55 km | 4,050 | Stored INDEX | Degree-like values; unit normalization needed |
| MERRA-2 / NASA | `PS` | Same 30 dates | Once daily | ~55 km | 4,050 | Pa | Candidate pressure input only |
| IMERG Final / NASA | Precipitation | Aug 30-Sep 5, 2025 | Daily, 7 dates | ~11 km | 5,600 | Stored MM; source mm/day | `satellite`; retrospective target candidate, too short |
| IMERG Late / NASA | Precipitation | Nov 7-13, 2026 | Daily, 7 dates | ~11 km | 5,600 | Stored MM; source mm/day | Different product/run; do not silently pool with Final |
| POWER / NASA | `T2M` | Oct 31-Nov 12, 2026 | Daily, 13 dates | ~55 km | 975 | C | `ok`; short daily mean record |
| POWER / NASA | `T2M_MAX` | Same 13 dates | Daily maximum | ~55 km | 975 | C | Must remain distinct from mean temperature |
| POWER / NASA | `T2M_MIN` | Same 13 dates | Daily minimum | ~55 km | 975 | C | Must remain distinct from mean temperature |
| POWER / NASA | `PRECTOTCORR` | Same 13 dates | Daily | ~55 km | 975 | Stored MM; source mm/day | Resolve interval/rate semantics |
| POWER / NASA | `RH2M` | Same 13 dates | Daily | ~55 km | 975 | % | Candidate input only |
| POWER / NASA | `WS2M` | Same 13 dates | Daily | ~55 km | 975 | m/s | 2 m wind; distinguish from 10 m wind |
| POWER / NASA | `ALLSKY_SFC_SW_DWN` | Oct 31-Nov 10, 2026 | Daily, 11 dates | Solar grid coarser than met grid | 825 | kWh/m2/day | Stored 55 km resolution is not valid for all POWER fields |
| Open-Meteo forecast | Temperature | Nov 15-21, 2026 | Hourly, 168 timestamps | Stored ~25 km | 11,088 | C | `forecast`; never an observation target |
| Open-Meteo forecast | Rainfall | Same 168 timestamps | Hourly | Stored ~25 km | 11,088 | mm | External forecast input only, outside NASA-only training scope |
| Open-Meteo forecast | Humidity | Same 168 timestamps | Hourly | Stored ~25 km | 11,088 | % | External forecast input only |
| Open-Meteo forecast | Wind | Same 168 timestamps | Hourly | Stored ~25 km | 11,088 | Stored m/s | Source unit handling needs verification |
| Open-Meteo forecast | Radiation | Same 168 timestamps | Hourly | Stored ~25 km | 11,088 | W/m2 | External forecast input only |

Totals: MERRA-2 20,250; IMERG 11,200; POWER 6,675; Open-Meteo forecasts 55,440.
The NASA rows number 38,125. No monthly POWER observation rows are present despite
a monthly dataset-version record. A registry entry or product start date does not
establish acquired historical coverage. ERA5-Land, half-hourly IMERG, MODIS, SMAP,
SRTM and the retired Open-Meteo archive have no observation rows or registered
storage assets in this audit.

### Missingness, duplicates and geography

- MERRA-2: 135 grid IDs x 30 daily timestamps for each variable. The product is
  hourly, but only 06:00 UTC is stored. Across those 30 full dates, 23/24 hourly
  slots are absent (95.83%); this is sampling sparsity, not a NASA product gap.
- GPM: 800 grid IDs on each of 14 dates. The span contains 441 calendar dates;
  427 dates are absent (96.83%). Keep the Final and Late windows distinct.
- POWER: 75 grid IDs; 13 consecutive dates for meteorology, 11 for solar.
  Solar is absent on the last two meteorological dates (15.38% on that explicit
  13-day reference window). Years before these windows are not represented.
- Open-Meteo: 66 grid IDs x 168 timestamps x five variables, all forecast rows.
- A naive `(dataset, variable, location, time)` key reports 975 POWER temperature
  groups with three rows each. These are mean/min/max parameters, not duplicates
  to delete. Including parameter, temporal type, record kind and forecast origin
  yields zero duplicate groups in the audited data.
- Point-in-BBMP counts: MERRA-2 150 rows / one point; GPM 28 / two points;
  POWER 89 / one point; Open-Meteo zero stored points inside BBMP. Coarse cell
  footprints may overlap BBMP even when their centres are outside. Reconstruct
  native footprints before spatial selection; do not interpret these counts as
  proof of total absence of regional forcing.
- All 19 dataset-version checksums and release dates are null. Dataset versions
  and ingestion timestamps exist but cannot prove historical publication vintages.

## Critical data issues before training

1. **Forecasts mixed into the observation table.** Enforce an explicit source and
   semantic allowlist, excluding `record_kind=forecast`, `quality_flag=forecast`
   and forecast dataset IDs from targets. Null record_kind on MERRA/GPM must be
   resolved using documented lineage, not silently interpreted as genuine ground
   measurements. Preserve existing rows; propose a governed relocation of external
   forecasts to the existing prediction architecture only after review.
2. **Forecast origin is not established.** The Open-Meteo importer sets
   `forecast_init_time` to the earliest returned valid time, not a provider model
   cycle. Its current records say midnight but were collected around 09:53 UTC.
   Do not treat them as forecasts available at midnight or as archived NWP cycles.
3. **Parameter collisions and units.** POWER mean/min/max share variable ID 6;
   precipitation rates and accumulations share a unit label in some rows;
   wind direction is stored as INDEX. Open-Meteo requests omit a wind-speed-unit
   argument and the importer labels values m/s without reading returned unit
   metadata. Verify raw response units before any conversion or training use.
4. **Mixed GPM products.** Dataset 199 is named Final but contains both
   GPM_3IMERGDF (Final) and GPM_3IMERGDL (Late). Separate product/version/QC/latency
   identities in the extraction contract and proposed catalog corrections.
5. **No adequate hourly targets or 1 km validation network.** Neither six-hour nor
   twelve-hour BBMP forecasts can currently be scientifically validated. Changing
   the forecast lead to twelve hours does not remove missing-data requirements.
6. **Provenance and QC gaps.** No quality_reports or asset objects are stored.
   Add reproducible source checksums, observed/valid/issued/available/ingested times,
   native units and aggregation windows to approved ingestion, preserving originals.

## Repository and mathematics audit

Reviewed `PROJECT_CONTEXT.md`, the scientific foundation, model selection,
validation, equations, limitations, registry, references, roadmap, relevant
methodology reference sections, prediction code/tests, acquisition pipeline,
storage adapters and migrations.

- `prediction/models.py` already implements climatology, seasonal naive, damped
  anomaly persistence, climatology-plus-trend, ridge and histogram gradient
  boosting. Retain these implementations where their monthly assumptions apply.
- `workflow.py` reads local POWER files, writes local experiment artifacts, and
  fits candidates in development. It does not read Supabase or persist its model
  registry/predictions/evaluations there. GET forecasting serves saved artifacts;
  it does not load a serialized deployed estimator for new inputs.
- Current rolling origins, target-disjoint validation/calibration, training-only
  scaling, input cutoffs, immutable predictions and metrics are reusable concepts.
  Calendar-month indexing and a two-month lag cannot be relabelled as hourly.
- `records.py` correctly defines error as actual-predicted and bias as its
  negative, MAE as mean absolute error, RMSE as root mean squared error, and
  R-squared relative to observed variance (null for constant observations).
  Five focused numerical/durability/promotion tests passed during this audit.
- Existing saved independent-point artifacts were read and hashes verified:
  T2M MAE 1.1752921242 C, precipitation MAE 0.8669496850 mm/day, each n=9 pooled
  across different horizons. These are **legacy local-data results**, not new
  Supabase experiments or proof of hourly skill. No fitting or retesting occurred.
- The original interval timing failure remains documented. Empirical residual
  quantiles have no automatic conformal coverage guarantee for dependent series.
- Promotion checks currently concern validation errors; they do not implement
  the new specification's uncertainty-calibration acceptance gate or independent
  operational deployment review. Monitoring/drift-triggered retraining is absent.
- `pipeline/db.py` already targets the correct live tables but requires a service
  role and its generic job helper maps jobs to `download`. Extend deliberately for
  scoped access and true `model_training`/`evaluation` jobs; do not duplicate it.
- `SupabaseStorage` can silently fall back to local storage and constructs public
  object URLs even though the bucket is private. New authoritative ML persistence
  must fail clearly and use authenticated/signed access to private assets.
- Original research PDFs are absent. Authoritative online alternatives were
  checked for time-series evaluation, leakage prevention and NASA source semantics;
  see `references/REFERENCE_INDEX.md`. No unavailable paper page numbers are claimed.
- Old MODEL_SELECTION, SCIENTIFIC_FOUNDATION, ASSUMPTIONS_AND_LIMITATIONS,
  METHODOLOGY_REGISTRY.md and LIVE_SCHEMA text contains superseded coverage,
  calibration or Supabase status statements. Use this audit and
  PREDICTION_WORKFLOW.md for current status; reconcile these documents when the new
  approved workflow is implemented. The methodology reference hash still matches
  `6e7b288534d7f108`; it was not edited by this audit.

## Storage integration design (proposal, not applied)

| Requirement | Existing structure / proposed convention |
|---|---|
| Approved raw targets and features | Read existing environmental_observations with version, provider, parameter, window, QC and BBMP/native-footprint filters |
| Frozen extraction | Dataset version plus checksummed manifest of observation IDs, provenance and cutoff; store immutable feature/target assets in private Storage |
| Stable 1 km computation grid | Reuse geo_regions hierarchy with grid_cell entries or a versioned grid asset; approve EPSG:32643 grid origin/clipping before generation |
| Training provenance | model_registry.feature_specification/hyperparameters plus processing_jobs parameters/output_metadata, including software, seed and cutoffs |
| Serialized model | Existing artifact_bucket/path; separate preprocessing and estimator version; hash-verified load in inference |
| Forecasts | One prediction_run per model/origin/lead; predictions contains values, target times, spatial references and quantiles |
| Evaluations | prediction_evaluations links prediction_id, observation_id and evaluation_dataset_version_id; actual minus predicted errors |
| Missing actuals | Keep prediction without an evaluation until a matching observation is available; actual_value is NOT NULL in evaluations |
| Drift and improvement history | Versioned processing_jobs/quality_reports and model validation metadata; explicit deployed-model comparisons |
| Simulation | Continue existing simulation tables and hypothetical-scenario semantics |

Schema compatibility issues to resolve before writing:

- Prediction bound CHECKs require the point forecast to lie inside the interval;
  empirical residual intervals need not contain an uncorrected point forecast.
  Store explicit predictive quantiles in `quantile_values` with null generic bounds
  where necessary, or propose a reviewed constraint change; never alter intervals
  merely to satisfy a database check.
- Model training dataset IDs are an array without per-element foreign keys;
  enforce reference validity and version manifest checks in the application.
- Evaluation uniqueness includes a nullable version ID. Require non-null versions
  for ML evaluation and explicit idempotency. Predictions lack a natural-key
  unique constraint; propose transactional idempotency or a reviewed index.
- No separate availability timestamp field exists; use documented metadata with
  strict validation first, and propose schema additions only if needed.
- Model artifact prefixes are not established. Existing bucket is private and
  has no listed storage-object RLS policies. A scoped worker access path must be
  reviewed; do not disable RLS or assume public artifact URLs will work.

## Proposed phased implementation and approval boundary

The attachment explicitly says: "Obtain authorization before changing the database
or starting a new ingestion operation" and "Present the findings, identify data
gaps, and establish the scientifically justified implementation plan before
proceeding with modifications." The work below is therefore a proposal.

1. **Approve source and semantic contracts.** Retain NASA-only training scope.
   Define temperature as 2 m air temperature at target valid time (with source
   averaging window stated); rainfall as the accumulated depth over (origin,
   origin+6h] or (origin, origin+12h], not an ambiguous instantaneous rainfall value.
   Keep each lead's targets, units and acceptance gates distinct.
2. **One-month ingestion pilot, January 2020.** Obtain NASA POWER hourly
   temperature, humidity, pressure and wind where supported, explicitly requesting
   UTC; obtain GPM IMERG V07 Final half-hourly precipitation over native cells
   intersecting BBMP. Confirm parameter availability, units, QC, Earthdata access,
   native footprints and provider latency before requests. Reuse existing POWER
   and half-hourly GPM catalog entries, versions, jobs, observation tables and asset
   bucket. Register raw provenance and QC; no new physical tables or buckets.
3. **Historical expansion, January 2016-December 2025**, only after pilot checks.
   Use all hourly/half-hourly samples, with provider limits, resumable batches and
   exact coverage reports. MERRA-2 all-hour acquisition is an alternative or
   supplementary source; POWER and MERRA-2 are not independent validation sources.
   Native coarse fields are not 1 km truth. Keep Final as retrospective targets;
   assess Early/Late or forecast vintages separately for available-at-origin inputs.
4. **Database-backed preparation and baselines.** Fit temporal features,
   train-only preprocessing and persistence/diurnal-seasonal baselines on approved
   Supabase data. Chronological train/validation/calibration/test and rolling-origin
   periods depend on actual completeness. Document previously exposed periods;
   reserve a genuinely untouched holdout and a prospective post-freeze evaluation.
5. **Candidates and error analysis.** Reuse ridge/boosting patterns; consider a
   two-part rain-occurrence/positive-amount model and quantile models. Add algorithms
   only if they improve validation. Evaluate six and twelve hours separately,
   seasons, extremes, calibration and coarse spatial blocks. No deep learning yet.
6. **Operational feasibility gate.** NASA reanalysis availability may preclude
   current six-hour inputs. Investigate accessible NASA forecast products and
   genuine archived issue times; no provider-vintage availability is assumed.
   Independent stations/gauges and downscaling validation are required before a
   1 km accuracy claim; non-NASA sources need explicit scope approval. If these
   requirements fail, keep real-time/1 km forecasts unavailable.
7. **Persistence, inference, monitoring.** Store artifacts in the existing private
   bucket, register model/run/evaluation records, load deployed model for inference,
   verify forecasts as actuals arrive, and promote only after error, calibration
   and regression gates. New candidates never replace the deployed version merely
   because they are newer. Preserve existing monthly records as legacy evidence.

Approval requested: the NASA-only pilot and subsequent verified historical
ingestion above, plus the necessary application integration using existing tables.
No database migration, destructive cleanup, new bucket or deployment is included
in that request. Runtime write access must be scoped to the approved operations.
