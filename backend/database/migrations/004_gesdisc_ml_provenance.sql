-- NASA GES DISC exclusivity + ML-oriented provenance helpers
-- Apply in Supabase SQL editor when ready. Does not drop application tables.

-- 1) Trusted distributor marker on data_sources
UPDATE data_sources
SET is_trusted = FALSE,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'policy', 'prohibited_for_bhuvyom_environmental_ingest',
      'reason', 'Not NASA GES DISC distribution'
    )
WHERE source_code IN ('OPEN_METEO', 'IMD', 'ISRO');

INSERT INTO data_sources (source_code, source_name, organization, homepage_url, access_type, api_endpoint, is_trusted, metadata)
VALUES (
  'GES_DISC',
  'NASA Goddard Earth Sciences Data and Information Services Center',
  'NASA GES DISC',
  'https://disc.gsfc.nasa.gov/',
  'earthdata',
  'https://opendap.earthdata.nasa.gov/',
  TRUE,
  '{"policy":"exclusive_environmental_source"}'::jsonb
)
ON CONFLICT (source_code) DO UPDATE
SET is_trusted = TRUE,
    organization = EXCLUDED.organization,
    homepage_url = EXCLUDED.homepage_url;

-- 2) Quarantine table for unverifiable / prohibited rows (recoverable)
CREATE TABLE IF NOT EXISTS environmental_observations_quarantine (
  quarantine_id BIGSERIAL PRIMARY KEY,
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  original_observation_id BIGINT,
  payload JSONB NOT NULL,
  dataset_code TEXT,
  source_record_id TEXT
);

-- 3) Active NASA GES DISC view for ML training (excludes retired / forecast / open sources)
CREATE OR REPLACE VIEW ml_gesdisc_observations AS
SELECT
  o.observation_id,
  o.variable_id,
  v.variable_code,
  o.value_numeric,
  o.unit_id,
  u.unit_code AS original_unit,
  o.observed_at,
  o.ingested_at,
  o.grid_id,
  o.location,
  o.quality_flag,
  o.spatial_resolution_m,
  o.source_record_id,
  o.dataset_id,
  d.dataset_code,
  d.product_version,
  o.dataset_version_id,
  o.metadata,
  o.metadata->>'collection_concept_id' AS nasa_collection_id,
  o.metadata->>'dataset_short_name' AS dataset_short_name,
  o.metadata->>'quantity_type' AS quantity_type,
  o.metadata->>'data_type' AS data_type,
  (o.metadata->>'derived')::boolean AS is_derived,
  o.metadata->>'processing_pipeline' AS processing_pipeline
FROM environmental_observations o
JOIN datasets d ON d.dataset_id = o.dataset_id
LEFT JOIN ref_environmental_variables v ON v.variable_id = o.variable_id
LEFT JOIN ref_units u ON u.unit_id = o.unit_id
WHERE d.dataset_code IN ('merra2_assim', 'gpm_imerg_v07_daily', 'gpm_imerg_v07_half_hourly')
  AND COALESCE(d.status, 'active') NOT IN ('retired')
  AND COALESCE(o.metadata->>'provider', '') ILIKE '%GES DISC%';

COMMENT ON VIEW ml_gesdisc_observations IS
  'ML-ready environmental observations restricted to verified NASA GES DISC provenance';

-- 4) Training-split helper view (chronological; no future leakage — consumers must filter by observed_at)
CREATE OR REPLACE VIEW ml_gesdisc_observation_keys AS
SELECT
  observation_id,
  variable_code,
  grid_id,
  observed_at,
  quantity_type,
  data_type,
  is_derived,
  dataset_code,
  nasa_collection_id
FROM ml_gesdisc_observations;
