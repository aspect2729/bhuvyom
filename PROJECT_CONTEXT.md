# PROJECT_CONTEXT.md — read this first (updated 2026-11-14)

**BhuVyom** — Bengaluru environmental intelligence platform, NASA Space Apps ("Be An Earth System Trend Detective!").
Five independent engines + a shared scientific knowledge base. Prediction Engine is the primary scientific capability.

## Supabase audit update (2026-11-15)
Later update: existing monthly predictions were imported into Supabase after
explicit approval. See `scientific/SUPABASE_PREDICTION_IMPORT.md` for verified
counts and mapping. The earlier empty prediction-table inventory below is
historical; dashboard/training still use local artifacts. Bulk observation
ingestion remains paused for storage capacity.

Read `scientific/SUPABASE_PREDICTION_AUDIT.md` before new prediction work. Live
Supabase access was verified with explicit read-only transactions. It contains
93,565 observation-table rows, including 55,440 external forecasts that must not
be training targets. NASA history is short daily/once-daily coverage; hourly
product metadata does not mean hourly samples were acquired. Existing ML tables
and private bucket are present but empty. The current monthly engine still uses
local artifacts and does not satisfy Supabase-authoritative training requirements.
No new ingestion, training, schema changes or deployment occurred in this audit.
The report proposes a NASA-only January 2020 pilot and later 2016-2025 expansion;
Ingestion was subsequently approved and partially completed. It is now paused
for storage capacity review: see `scientific/NASA_HISTORY_INGESTION.md`.
Research access records: `scientific/references/REFERENCE_INDEX.md` and
`SOURCE_ACCESS_LOG.md`. Credentials never belong in this file.

## Prediction_engine branch update (2026-11-15)
Read `scientific/PREDICTION_WORKFLOW.md` for the current engine. `/prediction` is
its React performance dashboard. `workflow.py` reuses `models.py`; records and
artifacts are append-only under the configured data root. NASA monthly history
at the Bengaluru representative cell is acquired through Sep 2026. Current
validation targets are 2017–2021, calibration 2022–2025, and the fixed-origin
fresh point test uses Jan–Sep 2026. One cell and one pair per available test
horizon do not establish geographical skill. The first interval timing failure
is preserved and suppressed; an interval repair is labelled retrospective.
Do not reopen exposed tests, promote by test scores, or claim vintage-verified
operational forecasts. See the scientific document before changing this protocol.

## Start here
* `scientific/` — permanent knowledge base: SCIENTIFIC_FOUNDATION, MODEL_SELECTION, VALIDATION_PROTOCOLS,
  EQUATIONS_AND_FORMULAS, ASSUMPTIONS_AND_LIMITATIONS, REFERENCES, DATA_CONTRACT, METHODOLOGY_REGISTRY(.md/.json), AUDIT_AND_ROADMAP.
* `METHODOLOGY_REFERENCE.md` — scientific source of truth for analysis methods (do not edit without updating the registry SHA in `backend/engines/knowledge.py`).
* Rules: never invent methods/values; missing = null; label observed/analysed/predicted/simulated; refuse infeasible requests (HTTP 422).

## Run locally
```
cd backend && source .venv/bin/activate && pip install -r requirements.txt   # needs scikit-learn
uvicorn main:app --reload --port 8001
pytest -q -m "not integration"                                                  # 32 offline tests
cd web && npm install && npm run dev        # React app: / Home · /lab Simulation Lab · /future Future Earth · /explore BhuVyom explorer (Shift+I Inspector)
python -u scripts/acquire_cmip6.py           # (from backend/) NASA NEX-GDDP-CMIP6 projections for Future Earth; --check first
# web/ = React + react-router rebuild of the Claude Design canvas 'Bengaluru From Orbit — UI Collage' (Final Home / Simulation Lab / Future Earth boards).
# Previous web is in _archive_web_v1/. Vite proxies /api → :8001. New endpoints: /api/lab/runoff, /api/future/projections, /api/site/summary.
```
Scientific Inspector: press **Shift+I** in the app (or open `/?inspector`).

## Engines (code)
| Engine | Where | Status |
|---|---|---|
| 1 Acquisition & preparation | backend/data_sources, acquisition, processing, scripts/; engines/prepared_data.py, observations.py | SRTM 30 m, MOD11A1 LST (Jan–Mar 2024, two-tier QC), MOD13Q1 NDVI 250 m (7 composites), GPM IMERG daily (Jun–Oct 2024), POWER monthly 1981–2025 (25 cells) — all real |
| 2 Analysis | backend/engines/analysis/ | MK/Sen/TFPW/BH trends (12 tests); LST composite + elevation association |
| 3 Prediction | backend/engines/prediction/ | Monthly T2M & precip, 6 candidates, rolling-origin validation, per-horizon selection, empirical PIs. T2M skilful 1–4 months; precip = climatology (no skill) |
| 4 Simulation | backend/engines/simulation/ (+ input bundles in backend/simulation/) | SCS-CN runoff scenario on GPM forcing, 6-member parameter ensemble, not validated (no streamflow) |
| 5 Visualization | web/ | MapLibre + deck.gl map, linked recharts graphs, time animation, findings, CSV export, Scientific Inspector (KaTeX) |

Contract: `backend/engines/contract.py` (schema 1.0). API list: `scientific/DATA_CONTRACT.md`.

## Key data findings
* Whole BBMP area = one POWER/MERRA-2 cell → region of 25 cells for trends/prediction; never claim neighbourhood-scale air-temperature prediction.
* T2M 1981–2025: 2/25 cells BH-significant warming (+0.15 °C/decade, west); city cell +0.096 °C/decade, p=0.17 (not significant).
* MOD11A1 strict QA=00 rejects the urban core (built-up pixels flagged QA=01) → reprocessed with QA 00 ∪ (01 & error ≤2 K); tiers kept.
* Jan–Mar 2024 daytime LST: central city ~1–3 °C cooler than its periphery (surface contrast 7.4 °C); Spearman ρ(elevation, LST) = −0.32, ρ(NDVI, LST) = +0.13 (associations only; dry-season periphery is bare/cropland).
* POWER solar/cloud switch SRB→CERES in 2001 (trends clamped); recent daily POWER is GEOS-IT (not used for long-term work).

## Not done / next (see scientific/AUDIT_AND_ROADMAP.md)
Land cover/impervious product, SMAP, ERA5-Land, change points, Moran's I, field significance,
daily forecasting, weather generator for prediction→simulation coupling, Supabase.
`server/` and `_archive_trend_v1/` are superseded (nothing imports them). `web/src/map/Basemap.tsx`, `ui/Footer.tsx`, `ui/ModeToggle.tsx` are unused leftovers.
