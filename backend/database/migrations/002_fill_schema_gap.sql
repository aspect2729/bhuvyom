-- =============================================================================
-- BhuVyom — fill schema / catalog gap against LIVE Supabase
-- Project: jmecdqlhirtobdctnavt
--
-- Run in: Supabase Dashboard → SQL Editor (as postgres / service role)
-- Safe to re-run (idempotent WHERE NOT EXISTS / CREATE OR REPLACE VIEW)
--
-- What this does
--   1) Compatibility VIEWS so old draft names (schema.sql) resolve onto live tables
--   2) Seeds NASA/POWER/MODIS/GPM/… dataset catalog from backend/config/dataset_registry.py
--   3) Links dataset ↔ ref_environmental_variables
--   4) Seeds a baseline simulation model row (SCS-CN runoff)
--
-- What this does NOT do
--   Does not recreate the old physical tables (regions, observation_assets, …)
--   Does not invent observation values
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1) Compatibility views  (old draft name → live table)
-- ---------------------------------------------------------------------------

-- old: regions  →  live: geo_regions
CREATE OR REPLACE VIEW regions AS
SELECT
  COALESCE(region_code, region_id::text)          AS id,
  region_name                                     AS name,
  CASE
    WHEN region_type IN ('named','bbox','polygon','grid_cell') THEN region_type
    WHEN region_type IN ('city','state','country','district') THEN 'named'
    ELSE 'polygon'
  END                                             AS kind,
  boundary                                        AS geom,
  jsonb_build_object(
    'region_id', region_id,
    'region_type', region_type,
    'admin_level', admin_level,
    'country_code', country_code,
    'parent_region_id', parent_region_id
  ) || COALESCE(properties, '{}'::jsonb)          AS bbox,   -- legacy col name; holds props+ids
  COALESCE(properties, '{}'::jsonb)               AS properties,
  created_at
FROM geo_regions;

-- old: acquisition_jobs  →  live: processing_jobs
CREATE OR REPLACE VIEW acquisition_jobs AS
SELECT
  job_id                                          AS id,
  dataset_id::text                                AS dataset_id,
  NULL::text                                      AS region_id,
  started_at                                      AS start_time,
  completed_at                                    AS end_time,
  status,
  COALESCE(parameters, '{}'::jsonb)               AS request,
  COALESCE(output_metadata, '{}'::jsonb)          AS result_summary,
  error_message                                   AS error,
  created_at,
  COALESCE(completed_at, started_at, created_at)  AS updated_at
FROM processing_jobs;

-- old: observation_assets  →  live: geospatial_assets
CREATE OR REPLACE VIEW observation_assets AS
SELECT
  asset_id                                        AS id,
  dataset_id::text                                AS dataset_id,
  region_id::text                                 AS region_id,
  COALESCE(file_format, 'raw')                    AS representation,
  temporal_start                                  AS time_start,
  temporal_end                                    AS time_end,
  CASE
    WHEN resolution_x IS NOT NULL THEN resolution_x::text || ' (x)'
    ELSE NULL
  END                                             AS native_spatial_resolution,
  NULL::text                                      AS native_temporal_resolution,
  '{}'::jsonb                                     AS units,
  '{}'::jsonb                                     AS quality_report,
  COALESCE(metadata, '{}'::jsonb)                 AS provenance,
  (storage_bucket || '/' || storage_path)         AS storage_uri,
  checksum                                        AS checksum_sha256,
  NULL::double precision                          AS missing_percent,
  created_at
FROM geospatial_assets;

-- old: observation_series  →  live: environmental_observations
-- (no asset_id on live table; keep NULL for draft-schema compatibility)
CREATE OR REPLACE VIEW observation_series AS
SELECT
  o.observation_id                                AS id,
  NULL::uuid                                      AS asset_id,
  v.variable_code                                 AS variable,
  CASE WHEN o.location IS NOT NULL THEN ST_Y(o.location::geometry) END AS lat,
  CASE WHEN o.location IS NOT NULL THEN ST_X(o.location::geometry) END AS lon,
  o.observed_at,
  o.value_numeric                                 AS value,
  COALESCE(u.unit_code, '')                       AS unit,
  o.quality_flag,
  o.ingested_at                                   AS source_timestamp
FROM environmental_observations o
LEFT JOIN ref_environmental_variables v ON v.variable_id = o.variable_id
LEFT JOIN ref_units u ON u.unit_id = o.unit_id;

-- old: simulation_input_bundles  →  live: simulation_scenarios
CREATE OR REPLACE VIEW simulation_input_bundles AS
SELECT
  scenario_id                                     AS id,
  COALESCE(scenario_name, intervention_type, 'unnamed') AS scenario,
  region_id::text                                 AS region_id,
  baseline_timestamp                              AS time_start,
  NULL::timestamptz                               AS time_end,
  COALESCE(assumptions, '{}'::jsonb)              AS validation,
  COALESCE(input_parameters->>'bundle_uri', '')   AS bundle_uri,
  COALESCE(input_parameters, '{}'::jsonb)         AS provenance,
  created_at
FROM simulation_scenarios;

-- ---------------------------------------------------------------------------
-- 2) Seed datasets (status MUST be one of: catalogued | processed | validated | failed | retired)
--    source_id 1 = NASA  (already seeded in data_sources)
--    source_id for ERA5 uses ESA (3) as closest open EO org; CDS noted in metadata
-- ---------------------------------------------------------------------------

WITH src AS (
  SELECT source_id FROM data_sources WHERE source_code = 'NASA' LIMIT 1
),
ins AS (
  INSERT INTO datasets (
    source_id, dataset_code, dataset_name, description, product_version,
    provider_dataset_id, data_format, spatial_resolution, temporal_resolution,
    coverage_start, status, metadata, landing_page_url
  )
  SELECT s.source_id, d.dataset_code, d.dataset_name, d.description, d.product_version,
         d.provider_dataset_id, d.data_format, d.spatial_resolution, d.temporal_resolution,
         d.coverage_start::timestamptz, 'catalogued', d.metadata::jsonb, d.landing_page_url
  FROM src s
  CROSS JOIN (VALUES
    ('gpm_imerg_v07_daily',
     'GPM IMERG Final Run Daily V07',
     'Daily calibrated precipitation (Final Run). Coarse for neighbourhood storms.',
     '07', 'GPM_3IMERGDF', 'NetCDF', '0.1° (~11 km)', '1 day',
     '2000-06-01', 'https://doi.org/10.5067/GPM/IMERGDF/DAY/07',
     '{"adapter":"gpm","quantity_type":"Observed","urban_suitability":"marginal","requires_earthdata":true}'),

    ('gpm_imerg_v07_half_hourly',
     'GPM IMERG Final Run Half-Hourly V07',
     'Half-hourly calibrated precipitation rate. Spatial scale remains ~11 km.',
     '07', 'GPM_3IMERGHH', 'NetCDF', '0.1° (~11 km)', '30 minutes',
     '2000-06-01', 'https://doi.org/10.5067/GPM/IMERG/3B-HH/07',
     '{"adapter":"gpm","quantity_type":"Observed","urban_suitability":"marginal","requires_earthdata":true}'),

    ('merra2_assim',
     'MERRA-2 tavg1_2d_slv_Nx',
     'Reanalysis meteorology. NOT neighbourhood air temperature / NOT LST.',
     '5.12.4', 'M2T1NXSLV', 'NetCDF', '0.5° × 0.625°', '1 hour',
     '1980-01-01', 'https://doi.org/10.5067/VJAFPLI1CSIV',
     '{"adapter":"merra2","quantity_type":"Model-derived","urban_suitability":"unsuitable_for_neighbourhood","requires_earthdata":true}'),

    ('nasa_power',
     'NASA POWER (MERRA-2 / CERES community API)',
     'Community meteorology + solar. Fill -999 → missing. Not neighbourhood-scale.',
     'v2', 'POWER', 'JSON', 'Meteo 0.5°×0.625°; solar 1°', 'daily / monthly',
     '1981-01-01', 'https://power.larc.nasa.gov/',
     '{"adapter":"nasa_power","quantity_type":"Model-derived","urban_suitability":"unsuitable_for_neighbourhood","requires_earthdata":false}'),

    ('modis_lst_mod11a1',
     'MODIS/Terra LST Daily 1 km (MOD11A1 v061)',
     'Day/night land surface temperature. LST ≠ 2 m air temperature. Cloud gaps.',
     '061', 'MOD11A1', 'HDF/GeoTIFF', '~1 km', '1 day (clear-sky)',
     '2000-02-01', 'https://doi.org/10.5067/MODIS/MOD11A1.061',
     '{"adapter":"modis","quantity_type":"Observed","urban_suitability":"suitable_city_scale","requires_earthdata":true,"tile":"h25v07/h25v08"}'),

    ('modis_vi_mod13a2',
     'MODIS/Terra Vegetation Indices 16-Day 1 km (MOD13A2 v061)',
     'NDVI/EVI 16-day composite at 1 km.',
     '061', 'MOD13A2', 'HDF/GeoTIFF', '1 km', '16 days',
     '2000-02-01', 'https://doi.org/10.5067/MODIS/MOD13A2.061',
     '{"adapter":"modis","quantity_type":"Observed","urban_suitability":"suitable_city_scale","requires_earthdata":true}'),

    ('modis_vi_mod13q1',
     'MODIS/Terra Vegetation Indices 16-Day 250 m (MOD13Q1 v061)',
     'Preferred vegetation product for urban green-cover context.',
     '061', 'MOD13Q1', 'HDF/GeoTIFF', '250 m', '16 days',
     '2000-02-01', 'https://doi.org/10.5067/MODIS/MOD13Q1.061',
     '{"adapter":"modis","quantity_type":"Observed","urban_suitability":"good_urban","requires_earthdata":true}'),

    ('modis_landcover_mcd12q1',
     'MODIS Land Cover Type Yearly 500 m (MCD12Q1 v061)',
     'Annual IGBP land-cover. Urban class is coarse.',
     '061', 'MCD12Q1', 'HDF/GeoTIFF', '500 m', '1 year',
     '2001-01-01', 'https://doi.org/10.5067/MODIS/MCD12Q1.061',
     '{"adapter":"modis","quantity_type":"Model-derived","urban_suitability":"moderate","requires_earthdata":true}'),

    ('viirs_lst_vnp21a1d',
     'VIIRS/NPP LST Daily 1 km Day (VNP21A1D v002)',
     'Complementary LST to MODIS; different overpass time.',
     '002', 'VNP21A1D', 'HDF/GeoTIFF', '~1 km', '1 day (clear-sky)',
     '2012-01-01', 'https://doi.org/10.5067/VIIRS/VNP21A1D.002',
     '{"adapter":"viirs","quantity_type":"Observed","urban_suitability":"suitable_city_scale","requires_earthdata":true}'),

    ('smap_spl3smp_e',
     'SMAP Enhanced L3 Radiometer Soil Moisture 9 km (SPL3SMP_E v006)',
     'Surface soil moisture. NOT neighbourhood-scale (radiometer ~36 km).',
     '006', 'SPL3SMP_E', 'HDF5', '9 km posting (~36 km footprint)', '1 day',
     '2015-03-31', 'https://doi.org/10.5067/M20OXIZHY3RJ',
     '{"adapter":"smap","quantity_type":"Observed","urban_suitability":"unsuitable_for_neighbourhood","requires_earthdata":true}'),

    ('srtm_dem',
     'SRTM 1 arc-second elevation',
     'Preferred terrain base for runoff / solar geometry. Static epoch Feb 2000.',
     '003', 'SRTMGL1', 'GeoTIFF', '1 arc-second (~30 m)', 'static',
     '2000-02-11', 'https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1.003',
     '{"adapter":"srtm","quantity_type":"Observed","urban_suitability":"good_urban","requires_earthdata":true}')
  ) AS d(dataset_code, dataset_name, description, product_version, provider_dataset_id,
         data_format, spatial_resolution, temporal_resolution, coverage_start,
         landing_page_url, metadata)
  WHERE NOT EXISTS (
    SELECT 1 FROM datasets x WHERE x.dataset_code = d.dataset_code
  )
  RETURNING dataset_id, dataset_code
)
SELECT * FROM ins;

-- ERA5-Land (CDS) — attach to ESA source_id if present, else NASA
INSERT INTO datasets (
  source_id, dataset_code, dataset_name, description, product_version,
  provider_dataset_id, data_format, spatial_resolution, temporal_resolution,
  coverage_start, status, metadata, landing_page_url
)
SELECT
  COALESCE(
    (SELECT source_id FROM data_sources WHERE source_code = 'ESA' LIMIT 1),
    (SELECT source_id FROM data_sources WHERE source_code = 'NASA' LIMIT 1)
  ),
  'era5_land',
  'ERA5-Land hourly reanalysis',
  'Regional forcing (~9 km). Still too coarse for neighbourhood UHIs. Requires CDS licence.',
  'ERA5-Land',
  'reanalysis-era5-land',
  'NetCDF/GRIB',
  '0.1° (~9 km)',
  '1 hour',
  '1950-01-01'::timestamptz,
  'catalogued',
  '{"adapter":"era5_land","quantity_type":"Model-derived","urban_suitability":"marginal","requires_earthdata":false,"requires_cds":true}'::jsonb,
  'https://doi.org/10.24381/cds.e2161bac'
WHERE NOT EXISTS (SELECT 1 FROM datasets WHERE dataset_code = 'era5_land');

-- ---------------------------------------------------------------------------
-- 3) dataset_versions (one "registry" version per dataset)
-- ---------------------------------------------------------------------------
INSERT INTO dataset_versions (dataset_id, version_label, retrieved_at, metadata)
SELECT d.dataset_id,
       COALESCE(d.product_version, 'registry'),
       now(),
       jsonb_build_object('note', 'seeded from dataset_registry.py', 'status', d.status)
FROM datasets d
WHERE d.dataset_code IN (
  'gpm_imerg_v07_daily','gpm_imerg_v07_half_hourly','merra2_assim','nasa_power',
  'modis_lst_mod11a1','modis_vi_mod13a2','modis_vi_mod13q1','modis_landcover_mcd12q1',
  'viirs_lst_vnp21a1d','smap_spl3smp_e','srtm_dem','era5_land'
)
AND NOT EXISTS (
  SELECT 1 FROM dataset_versions v
  WHERE v.dataset_id = d.dataset_id
    AND v.version_label = COALESCE(d.product_version, 'registry')
);

-- ---------------------------------------------------------------------------
-- 4) dataset_variables  (map native product fields → ref_environmental_variables)
-- ---------------------------------------------------------------------------
-- Helper: resolve variable_id by code
-- temperature_air_temperature=6
-- temperature_land_surface_temperature=5
-- precipitation_water_rainfall=16
-- precipitation_water_rainfall_intensity=14
-- precipitation_water_soil_moisture=13
-- precipitation_water_runoff=9
-- atmospheric_activity_humidity=35
-- atmospheric_activity_wind_speed=34
-- atmospheric_activity_cloud_cover=32
-- solar_space_solar_irradiance=91
-- vegetation_greenery_ndvi=56
-- land_soil_elevation=69
-- land_soil_land_cover=67

-- PK is (dataset_id, variable_id) — one row per pair (day+night LST collapsed).
INSERT INTO dataset_variables (dataset_id, variable_id, source_variable_name, source_unit, processing_notes)
SELECT d.dataset_id, v.variable_id, m.source_variable_name, m.source_unit, m.processing_notes
FROM datasets d
JOIN (VALUES
  -- GPM daily
  ('gpm_imerg_v07_daily', 'precipitation_water_rainfall', 'precipitation', 'mm/day', 'Daily accumulation; do not invent sub-grid detail'),
  ('gpm_imerg_v07_daily', 'precipitation_water_rainfall_intensity', 'precipitationCal', 'mm/hr', 'Rate field when present'),
  -- GPM half-hourly
  ('gpm_imerg_v07_half_hourly', 'precipitation_water_rainfall_intensity', 'precipitationCal', 'mm/hr', 'Calibrated multi-satellite rate'),
  -- MERRA-2
  ('merra2_assim', 'temperature_air_temperature', 'T2M', 'K', 'Reanalysis 2 m air temperature — NOT LST'),
  ('merra2_assim', 'atmospheric_activity_humidity', 'QV2M', 'kg/kg', '2 m specific humidity'),
  ('merra2_assim', 'atmospheric_activity_wind_speed', 'U2M/V2M', 'm/s', 'Derive speed from components'),
  -- POWER
  ('nasa_power', 'temperature_air_temperature', 'T2M', 'C', 'Fill -999 → NULL'),
  ('nasa_power', 'atmospheric_activity_humidity', 'RH2M', '%', 'Relative humidity'),
  ('nasa_power', 'atmospheric_activity_wind_speed', 'WS2M', 'm/s', NULL),
  ('nasa_power', 'precipitation_water_rainfall', 'PRECTOTCORR', 'mm/day', 'Corrected precipitation'),
  ('nasa_power', 'solar_space_solar_irradiance', 'ALLSKY_SFC_SW_DWN', 'kW-hr/m^2/day', 'CERES 1° solar grid'),
  ('nasa_power', 'atmospheric_activity_cloud_cover', 'CLOUD_AMT', '%', NULL),
  -- MODIS LST (day+night share one ref variable)
  ('modis_lst_mod11a1', 'temperature_land_surface_temperature', 'LST_Day_1km / LST_Night_1km', 'K', 'scale 0.02; clear-sky only; ≠ air temp'),
  -- MODIS VI
  ('modis_vi_mod13a2', 'vegetation_greenery_ndvi', 'NDVI', 'index', 'scale 0.0001; 16-day composite'),
  ('modis_vi_mod13q1', 'vegetation_greenery_ndvi', 'NDVI', 'index', '250 m preferred urban green cover'),
  -- Land cover
  ('modis_landcover_mcd12q1', 'land_soil_land_cover', 'LC_Type1', 'class', 'IGBP annual'),
  -- VIIRS LST
  ('viirs_lst_vnp21a1d', 'temperature_land_surface_temperature', 'LST_1KM', 'K', 'Clear-sky; complementary overpass to MODIS'),
  -- SMAP
  ('smap_spl3smp_e', 'precipitation_water_soil_moisture', 'soil_moisture', 'm3/m3', 'Surface ~5 cm; coarse footprint'),
  -- SRTM
  ('srtm_dem', 'land_soil_elevation', 'elevation', 'm', 'Orthometric height; static 2000'),
  -- ERA5-Land
  ('era5_land', 'temperature_air_temperature', '2m_temperature', 'K', 'Reanalysis'),
  ('era5_land', 'atmospheric_activity_wind_speed', '10m_u/v', 'm/s', '10 m wind components'),
  ('era5_land', 'precipitation_water_rainfall', 'total_precipitation', 'm', 'Convert to mm for hydrology'),
  ('era5_land', 'precipitation_water_soil_moisture', 'volumetric_soil_water_layer_1', 'm3/m3', 'Layer 1 ~0–7 cm')
) AS m(dataset_code, variable_code, source_variable_name, source_unit, processing_notes)
  ON d.dataset_code = m.dataset_code
JOIN ref_environmental_variables v ON v.variable_code = m.variable_code
ON CONFLICT (dataset_id, variable_id) DO UPDATE
SET
  source_variable_name = EXCLUDED.source_variable_name,
  source_unit = EXCLUDED.source_unit,
  processing_notes = EXCLUDED.processing_notes;

-- ---------------------------------------------------------------------------
-- 5) Optional: set default units on key ref variables (only if still NULL)
-- ---------------------------------------------------------------------------
UPDATE ref_environmental_variables SET default_unit_id = 2  WHERE variable_code = 'temperature_air_temperature' AND default_unit_id IS NULL;           -- °C
UPDATE ref_environmental_variables SET default_unit_id = 1  WHERE variable_code = 'temperature_land_surface_temperature' AND default_unit_id IS NULL;  -- K
UPDATE ref_environmental_variables SET default_unit_id = 3  WHERE variable_code = 'precipitation_water_rainfall' AND default_unit_id IS NULL;            -- mm
UPDATE ref_environmental_variables SET default_unit_id = 4  WHERE variable_code = 'precipitation_water_rainfall_intensity' AND default_unit_id IS NULL; -- mm/h
UPDATE ref_environmental_variables SET default_unit_id = 6  WHERE variable_code = 'atmospheric_activity_wind_speed' AND default_unit_id IS NULL;       -- m/s
UPDATE ref_environmental_variables SET default_unit_id = 8  WHERE variable_code IN ('atmospheric_activity_humidity','atmospheric_activity_cloud_cover') AND default_unit_id IS NULL;
UPDATE ref_environmental_variables SET default_unit_id = 5  WHERE variable_code = 'land_soil_elevation' AND default_unit_id IS NULL;                   -- m
UPDATE ref_environmental_variables SET default_unit_id = 13 WHERE variable_code = 'vegetation_greenery_ndvi' AND default_unit_id IS NULL;              -- index
UPDATE ref_environmental_variables SET default_unit_id = 10 WHERE variable_code = 'solar_space_solar_irradiance' AND default_unit_id IS NULL;          -- W/m² (approx)

-- ---------------------------------------------------------------------------
-- 6) Seed SCS-CN runoff simulation model (engine 4)
-- ---------------------------------------------------------------------------
INSERT INTO simulation_models (
  model_code, model_name, version, methodology, description, assumptions, status
)
SELECT
  'scs_cn_runoff_v1',
  'SCS-CN urban runoff scenario',
  '1.0.0',
  'NRCS Curve Number (METHODOLOGY_REFERENCE / engines/simulation/scs_cn.py)',
  'Scenario runoff on GPM forcing; 6-member parameter ensemble; not streamflow-validated.',
  '{"ensemble":"parameter","streamflow_validated":false,"forcing":"GPM IMERG"}'::jsonb,
  'validated'   -- allowed on simulation_models (datasets use catalogued/processed/…)
WHERE NOT EXISTS (
  SELECT 1 FROM simulation_models WHERE model_code = 'scs_cn_runoff_v1'
);

-- ---------------------------------------------------------------------------
-- 7) Sanity checks
-- ---------------------------------------------------------------------------
-- SELECT dataset_code, status FROM datasets ORDER BY dataset_id;
-- SELECT d.dataset_code, v.variable_code, dv.source_variable_name
--   FROM dataset_variables dv
--   JOIN datasets d ON d.dataset_id = dv.dataset_id
--   JOIN ref_environmental_variables v ON v.variable_id = dv.variable_id
--   ORDER BY 1,2;
-- SELECT * FROM regions;
-- SELECT count(*) FROM acquisition_jobs;
