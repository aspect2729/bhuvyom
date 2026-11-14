-- Migration 001: initial BhuVyom schema
-- Apply the full schema file (this migration is an explicit version marker):
--   psql "$DATABASE_URL" -f database/schema.sql
--
-- Version: 001
-- Description: regions, datasets, acquisition_jobs, observation_assets,
--              observation_series, simulation_input_bundles, simulation_runs

SELECT 'bhuvyom_migration_001_apply_schema_sql' AS migration_hint;
