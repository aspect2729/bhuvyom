# BhuVyom database (Supabase / PostgreSQL)

Supabase is **optional**. Until `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, the engine uses local filesystem storage under `backend/data/`.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Full schema: regions, datasets, jobs, observation assets, simulation bundles |
| `migrations/001_initial.sql` | Initial migration entrypoint |

## Design rules

1. **Do not store rasters as millions of rows.** Use object storage + NetCDF/Zarr/GeoTIFF/Parquet; DB holds metadata and provenance.
2. Enable **PostGIS** for region polygons and spatial queries.
3. Preserve provenance fields on every `observation_assets` row.
4. Service-role keys stay server-side only.

## Recommended indexes

Already defined in `schema.sql`:

- `regions_geom_gix` (GIST)
- `acquisition_jobs_status_idx`
- `observation_assets_dataset_time_idx`
- `observation_series_var_time_idx`

## Apply later

```bash
# Example when Supabase/Postgres exists
psql "$DATABASE_URL" -f database/schema.sql
```
