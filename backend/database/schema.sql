-- BhuVyom acquisition & simulation-prep schema (Supabase / PostgreSQL + PostGIS)
-- Large rasters belong in object storage / NetCDF / Zarr / GeoTIFF — not row-per-pixel.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Regions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('named', 'bbox', 'polygon', 'grid_cell')),
    geom            geometry(MultiPolygon, 4326),
    bbox            jsonb NOT NULL,
    properties      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regions_geom_gix ON regions USING GIST (geom);

-- ---------------------------------------------------------------------------
-- Dataset catalog (mirrors config/dataset_registry.py)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS datasets (
    id                          TEXT PRIMARY KEY,
    name                        TEXT NOT NULL,
    product_short_name          TEXT NOT NULL,
    product_version             TEXT,
    provider                    TEXT,
    quantity_type               TEXT NOT NULL,
    native_spatial_resolution   TEXT NOT NULL,
    native_temporal_resolution  TEXT NOT NULL,
    urban_suitability           TEXT,
    urban_suitability_note      TEXT,
    metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Acquisition jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acquisition_jobs (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id      TEXT REFERENCES datasets(id),
    region_id       TEXT REFERENCES regions(id),
    start_time      timestamptz,
    end_time        timestamptz,
    status          TEXT NOT NULL DEFAULT 'queued',
    request         jsonb NOT NULL DEFAULT '{}'::jsonb,
    result_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,
    error           TEXT,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acquisition_jobs_status_idx ON acquisition_jobs (status);
CREATE INDEX IF NOT EXISTS acquisition_jobs_dataset_idx ON acquisition_jobs (dataset_id);

-- ---------------------------------------------------------------------------
-- Observation / granule provenance (NOT per-pixel values)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observation_assets (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id          TEXT REFERENCES datasets(id),
    region_id           TEXT REFERENCES regions(id),
    representation      TEXT NOT NULL CHECK (
        representation IN ('raw', 'quality_controlled', 'spatially_aligned', 'temporally_aligned', 'simulation_bundle')
    ),
    time_start          timestamptz,
    time_end            timestamptz,
    native_spatial_resolution   TEXT,
    native_temporal_resolution  TEXT,
    units               jsonb NOT NULL DEFAULT '{}'::jsonb,
    quality_report      jsonb NOT NULL DEFAULT '{}'::jsonb,
    provenance          jsonb NOT NULL DEFAULT '{}'::jsonb,
    storage_uri         TEXT NOT NULL,  -- object storage / local path to NetCDF/Zarr/GeoTIFF/Parquet
    checksum_sha256     TEXT,
    missing_percent     DOUBLE PRECISION,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS observation_assets_dataset_time_idx
    ON observation_assets (dataset_id, time_start, time_end);
CREATE INDEX IF NOT EXISTS observation_assets_region_idx ON observation_assets (region_id);

-- Optional tabular point/series extracts (keep small; prefer Parquet in object storage)
CREATE TABLE IF NOT EXISTS observation_series (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        uuid REFERENCES observation_assets(id) ON DELETE CASCADE,
    variable        TEXT NOT NULL,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    observed_at     timestamptz NOT NULL,
    value           DOUBLE PRECISION,  -- NULL = missing (never invent)
    unit            TEXT NOT NULL,
    quality_flag    TEXT,
    source_timestamp timestamptz,
    UNIQUE (asset_id, variable, lat, lon, observed_at)
);

CREATE INDEX IF NOT EXISTS observation_series_var_time_idx
    ON observation_series (variable, observed_at);

-- ---------------------------------------------------------------------------
-- Simulation input bundles & runs (engine itself is future work)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS simulation_input_bundles (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario        TEXT NOT NULL,
    region_id       TEXT REFERENCES regions(id),
    time_start      timestamptz,
    time_end        timestamptz,
    validation      jsonb NOT NULL DEFAULT '{}'::jsonb,
    bundle_uri      TEXT NOT NULL,
    provenance      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_runs (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id       uuid REFERENCES simulation_input_bundles(id),
    status          TEXT NOT NULL DEFAULT 'not_started',
    notes           TEXT,
    -- Placeholder for future engine; acquisition stage does not execute physics.
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Index / storage recommendations (documentation as SQL comments)
-- ---------------------------------------------------------------------------
-- * Use GIST on regions.geom for spatial filters.
-- * Index observation_assets on (dataset_id, time_start, time_end).
-- * Store rasters in Supabase Storage / S3-compatible buckets as NetCDF/Zarr/GeoTIFF.
-- * Use Parquet for dense tabular extracts; avoid millions of observation_series rows.
-- * Keep service-role key server-side only; never expose to frontend.
