# Karnataka environmental pipeline — NASA GES DISC only

> **Policy:** NASA GES DISC is the exclusive environmental data access platform.
> Open-Meteo, NASA POWER (LaRC), IMD, ISRO, and other third-party weather APIs are prohibited.
> Set `BHUVYOM_USE_SUPABASE_INGEST=true` and provide the existing `EARTHDATA_TOKEN`.

## Phases

| Phase | Source | Cadence | Command |
|-------|--------|---------|---------|
| Latest MERRA-2 | GES DISC M2T1NXSLV OPeNDAP | Daily | `python -m pipeline.run --phase merra2 --merra2-days 14` |
| Latest GPM | GES DISC GPM_3IMERGDF.07 | Daily | `python -m pipeline.run --phase gpm --gpm-days 14` |
| Historical | Same, longer window | Weekly | `python -m pipeline.run --phase historical` |
| Verify | Supabase counts / provenance | After ingest | `python -m pipeline.run --phase verify` |

Coverage: Karnataka bbox `74.05–78.60°E, 11.55–18.50°N`.

## Production scheduler

GitHub Actions workflow `.github/workflows/environmental-pipeline.yml`:

- Daily `02:30 UTC`: MERRA-2 14-day + GPM 14-day + verify
- Weekly Monday `03:30 UTC`: MERRA-2 90-day + GPM 60-day + verify
- Manual `workflow_dispatch` for any phase

Secrets required (existing only — do not rotate/replace):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EARTHDATA_TOKEN`

## Provenance

Every observation metadata includes:

- `provider`: NASA GES DISC
- `collection_concept_id`
- `dataset_short_name` / version
- `quantity_type` (`Reanalysis` vs `Satellite observation`)
- `processing_pipeline` / `processing_version`
- `derived` flag when RH/wind are computed from native fields

`pipeline.source_policy` + `SupabaseREST.insert_observations` reject prohibited providers.

## Backup / cleanup

Non-GES-DISC purge backup (2026-11-15): `logs/backups/env_obs_2026-11-15/`

## Variables currently ingested

| Variable | Native product | Notes |
|----------|----------------|-------|
| Air temperature | M2T1NXSLV T2M | K→°C |
| Relative humidity | Derived T2M+T2MDEW | Marked `derived` |
| Wind speed / direction | Derived U2M/V2M | Marked `derived` |
| Surface pressure | M2T1NXSLV PS | Pa |
| Precipitation | GPM_3IMERGDF precipitation | mm/day |

Unavailable via GES DISC for this pipeline are reported as gaps — never filled from Open-Meteo/POWER.
