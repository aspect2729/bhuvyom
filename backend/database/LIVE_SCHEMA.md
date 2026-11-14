# Live Supabase schema (source of truth)

Project: `https://jmecdqlhirtobdctnavt.supabase.co`

`database/schema.sql` is an **older draft** and does **not** match production.
Do not apply it to this project — it would create conflicting table names.

## Tables present

| Table | Role | Seeded? |
|---|---|---|
| `ref_units` | Unit dictionary | yes (13) |
| `ref_environmental_categories` | Variable categories | yes (16) |
| `ref_environmental_variables` | Variable catalog | yes (145) |
| `data_sources` | NASA/NOAA/ESA/… | yes (6) |
| `geo_regions` | Spatial regions | yes (India, Karnataka, BBMP, Greater Bengaluru) |
| `datasets` / `dataset_versions` / `dataset_variables` | Dataset catalog | empty |
| `geospatial_assets` | Raster/file metadata → Storage | empty |
| `environmental_observations` | Point/series values | empty |
| `processing_jobs` / `quality_reports` | Acquisition & QC jobs | empty |
| `model_registry` / `prediction_runs` / `predictions` / `prediction_evaluations` | Prediction engine | empty |
| `simulation_models` / `simulation_scenarios` / `simulation_runs` / `simulation_outputs` | Simulation engine | empty |
| `derived_indicators` / `analytical_results` | Analysis engine | empty |
| `audit_logs` | Audit trail | empty |

## Storage

- Bucket: `bhuvyom-rasters` (private) — created
- Large rasters live here; DB rows in `geospatial_assets` point at `storage_bucket` + `storage_path`

## Not in live DB (from old `schema.sql`)

`regions`, `acquisition_jobs`, `observation_assets`, `observation_series`, `simulation_input_bundles`

Map instead (also created as **views** by `migrations/002_fill_schema_gap.sql`):

| Old draft | Live equivalent |
|---|---|
| `regions` | `geo_regions` |
| `acquisition_jobs` | `processing_jobs` |
| `observation_assets` | `geospatial_assets` |
| `observation_series` | `environmental_observations` |
| `simulation_input_bundles` | `simulation_scenarios` (+ assets) |

## Fill the gap

Run in Supabase SQL Editor:

`backend/database/migrations/002_fill_schema_gap.sql`

- Compatibility views for the old names
- Seeds all registry datasets (`status = catalogued`)
- Links `dataset_variables` → ref catalog
- Seeds SCS-CN `simulation_models` row

**Status enums discovered**

| Table | Allowed (known) |
|---|---|
| `datasets.status` | `catalogued`, `processed`, `validated`, `failed`, `retired` |
| `simulation_models.status` | `validated` (at least) |
