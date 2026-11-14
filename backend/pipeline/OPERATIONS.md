# Karnataka environmental pipeline — operations

## What runs

| Phase | Sources | Cadence | Command |
|---|---|---|---|
| Historical | NASA POWER monthly (native 0.5×0.625°), Open-Meteo archive | Weekly | `python -m pipeline.run --phase historical` |
| Latest | NASA POWER daily (lag ~2 days) | Daily | `python -m pipeline.run --phase latest` |
| Forecast | Open-Meteo hourly forecast (separate `record_kind=forecast`) | Daily | `python -m pipeline.run --phase forecast` |
| Verify | Supabase counts / coverage | After each run | `python -m pipeline.run --phase verify` |

Statewide grid: `pipeline/karnataka_grid.py` (~75 POWER cells, ~70 Open-Meteo sample points) clipped to `data/boundaries/karnataka.geojson`.

## Deployment location (persistent)

**GitHub Actions** — `.github/workflows/environmental-pipeline.yml`

- Daily `02:30 UTC`: latest POWER daily + Open-Meteo forecast + verify  
- Weekly Monday `03:30 UTC`: POWER monthly refresh + Open-Meteo archive + verify  
- Manual: Actions → Environmental pipeline → Run workflow  

This does **not** depend on a local terminal remaining open.

## Required secrets

Set in GitHub → Settings → Secrets and variables → Actions:

| Secret | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `https://jmecdqlhirtobdctnavt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | service-role / `sb_secret_…` — never expose to frontend |
| `EARTHDATA_TOKEN` | optional | for GPM / Earthdata downloads |

Local runs use `backend/.env` (already present on the workstation).

## One-time SQL

Run in Supabase SQL Editor:

1. `database/migrations/002_fill_schema_gap.sql` (already applied if datasets/views exist)  
2. `database/migrations/003_pipeline_constraints.sql` — unique index on `source_record_id` for true upserts  

Until 003 is applied, the pipeline uses application-level dedup.

## Restart

- GitHub Actions: re-run the workflow, or wait for the next cron.  
- Local: `cd backend && source .venv/bin/activate && python -m pipeline.run --phase latest`

## Monitor

- Actions run history (green/red)  
- Supabase table `processing_jobs` (`job_type`, `status`, `records_processed`, `error_message`, `output_metadata`)  
- `python -m pipeline.run --phase verify` for live counts  

## Investigate failures

1. Open the failed Actions log.  
2. Query recent jobs:  
   `GET /rest/v1/processing_jobs?order=created_at.desc&limit=20`  
3. Provider-specific: POWER rate limits / Open-Meteo 429 → lower `BHUVYOM_MAX_CONCURRENCY`.  
4. Auth errors → rotate `SUPABASE_SERVICE_ROLE_KEY` / `EARTHDATA_TOKEN`.

## Not yet automated (blocked on credentials)

| Provider | Blocker |
|---|---|
| ERA5 / ERA5-Land | `CDS_API_KEY` empty |
| IMD | no programmatic API credentials |
| ISRO | no Bhuvan/data portal credentials |
| GPM IMERG rasters | Earthdata token works for CMR; full granule ingest pending |
