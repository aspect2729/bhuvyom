-- =============================================================================
-- BhuVyom — pipeline constraints & indexes for environmental_observations
-- Project: jmecdqlhirtobdctnavt
--
-- Run in: Supabase Dashboard → SQL Editor (as postgres)
-- Safe / idempotent.
--
-- Why: enables ON CONFLICT upserts and fast dedup/coverage queries.
-- =============================================================================

-- Stable idempotency key used by the Python pipeline
CREATE UNIQUE INDEX IF NOT EXISTS uq_env_obs_source_record_id
  ON environmental_observations (source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_env_obs_dataset_observed
  ON environmental_observations (dataset_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_env_obs_variable_observed
  ON environmental_observations (variable_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_env_obs_grid_observed
  ON environmental_observations (grid_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_env_obs_region_observed
  ON environmental_observations (region_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_env_obs_quality_flag
  ON environmental_observations (quality_flag);

CREATE INDEX IF NOT EXISTS idx_env_obs_record_kind
  ON environmental_observations ((metadata->>'record_kind'));

-- Optional: enable pg_cron scheduled HTTP call to a worker later
-- (requires supabase_cron / pg_net — enable in Dashboard → Integrations)
-- SELECT cron.schedule(
--   'bhuvyom-pipeline-daily',
--   '30 2 * * *',
--   $$SELECT net.http_post(...);$$
-- );
