# Shared Data Contract — schema 1.0  (`backend/engines/contract.py`)

```text
EngineResult
  result_id, schema_version="1.0", engine_name, data_type, title, variable, units, crs="EPSG:4326"
  native_resolution, effective_resolution, temporal_resolution, temporal_coverage{start,end,...}
  grid:
    cells[]          {id, polygon: closed ring [[lon,lat],...] (GeoJSON order), center: [lon,lat], is_city_cell?}
    times[]          ISO dates / YYYY-MM / YYYY shared by all time_series fields
    fields{name}     {unit, label, kind: time_series|static, role: value|uncertainty|diagnostic|quality,
                      values{cell_id: [v per time] | v}}       missing = null, never 0
    cell_attributes  {cell_id: {...diagnostics, e.g. S, var_s, Z, r1, p_bh}}
  default_field, sources[], methodology{id, version, doc_ref, ...}, model?, quality, uncertainty,
  validation{status,...}, configuration, scenario?, assumptions[], limitations[], findings[], trace[], executed_at
```

## Validation rules (enforced by pydantic)
| data_type | engine | must have |
|---|---|---|
| observed | acquisition | sources, native resolution |
| analysed | analysis | methodology id |
| predicted | prediction | model, uncertainty, validation.status |
| simulated | simulation | scenario, assumptions |
All: `default_field ∈ fields`; every time-series array length = len(times); cell ids must exist.

Large rasters (MODIS HDF, SRTM GeoTIFF, GPM subsets) stay as files under `backend/data/`; results reference products by id.
Errors: infeasible requests return HTTP 422 `{error:"infeasible_request", reason, requirement, hint}`; missing data 404 `data_not_acquired`.

## Endpoints
| Endpoint | Engine | data_type |
|---|---|---|
| `GET /api/engines/catalog` | — | product list (only real data) |
| `GET /api/knowledge/methodologies` | KB | registry + doc-sync flag |
| `GET /api/boundaries/bbmp` | 1 | GeoJSON |
| `GET /api/observed/lst`, `/api/observed/gpm` | 1 | observed |
| `GET /api/analysis/trends?var&start&end&allow_mixed_sources` | 2 | analysed |
| `GET /api/analysis/lst-composite` | 2 | analysed |
| `GET /api/prediction/forecast?var&horizon_months&frequency` · `POST /api/prediction/run?force_retrain` | 3 | predicted |
| `GET /api/simulation/runoff?baseline_impervious&scenario_impervious&soil_group&lam&forcing` | 4 | simulated |
Pre-existing acquisition routes (`/api/datasets`, `/api/regions`, `/api/observations*`, `/api/acquisition/jobs`, `/api/simulation/prepare-inputs`) are unchanged.
