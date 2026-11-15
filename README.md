# NASA POWER — Bengaluru Environmental Map (Phase 1)

## Prediction Engine

The active monthly engine and its model-performance dashboard are in `backend/`
and `web/`. Read [the scientific workflow](scientific/PREDICTION_WORKFLOW.md) for
acquisition, training, one-time test evaluation, promotion and interval audit
commands. Run the backend on port 8001, then `npm run dev -- --port 5174` from
`web/` and open `/prediction`. Metrics require real acquired observations and
completed experiment artifacts; no demo accuracy values are supplied.


Interactive geospatial map of Bengaluru using NASA POWER daily data.  
Monorepo: `server/` (FastAPI) + `web/` (Vite/React — frontend comes in later steps).

## Setup

### Server

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Web (later steps)

```bash
cd web
npm install
```

## Run

### API (port 8000)

```bash
cd server
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### Frontend (port 5173) — after web is scaffolded

```bash
cd web
npm run dev
```

## Test NASA POWER fetch

From `server/` with the venv active:

```bash
python test_power.py
python test_power.py --start 20261001 --end 20261031
python test_power.py --monthly --start 2020 --end 2022
python -m processing.grid   # print region vs city cell centres
```

`test_power.py` prints each variable’s unit, valid/null counts, min/max/mean, **null dates**, and whether nulls are trailing / scattered / etc.  
Samples: `server/samples/power_sample.json` (daily), `server/samples/power_monthly_sample.json` (monthly; `YYYY13` = annual).

**Cache:** historical ranges are cached permanently under `server/cache/`. If `end` is within 30 days of today, cache entries expire after 24 hours (NASA publish lag).

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness |
| `GET /api/power/point?lat=&lon=&start=YYYYMMDD&end=YYYYMMDD` | Daily point, processed |
| `GET /api/power/monthly?lat=&lon=&start=YYYY&end=YYYY` | Monthly point (years); annual `YYYY13` excluded |
| `GET /api/power/grid?start=YYYYMMDD&end=YYYYMMDD&area=region\|city` | Meteo cells + polygons + variables (`area` default `region`) |

CORS is enabled for `http://localhost:5173`. The browser must never call NASA directly. Grid fetches use `asyncio.gather` with a max of 2 concurrent NASA requests.

## Data notes

Verified against a live NASA POWER Daily Point response (`community=RE`, `format=JSON`) on 2026-11-13.

**Endpoint:** `https://power.larc.nasa.gov/api/temporal/daily/point`  
**Fill value:** `-999` / `-999.0` (from `header.fill_value`) → converted to `null` / shown as “No data”. Never interpolated.

### Variables (names, units, long names from live `parameters` metadata)

| Parameter | Long name (from API) | Unit (from API) | Native spatial resolution | Source family |
|---|---|---|---|---|
| `T2M` | Temperature at 2 Meters | `C` | 0.5° × 0.625° | MERRA-2 / GEOS-IT (meteorology) |
| `T2M_MAX` | Temperature at 2 Meters Maximum | `C` | 0.5° × 0.625° | MERRA-2 / GEOS-IT |
| `T2M_MIN` | Temperature at 2 Meters Minimum | `C` | 0.5° × 0.625° | MERRA-2 / GEOS-IT |
| `RH2M` | Relative Humidity at 2 Meters | `%` | 0.5° × 0.625° | MERRA-2 / GEOS-IT |
| `WS2M` | Wind Speed at 2 Meters | `m/s` | 0.5° × 0.625° | MERRA-2 / GEOS-IT |
| `PRECTOTCORR` | Precipitation Corrected | `mm/day` | 0.5° × 0.625° | MERRA-2 / GEOS-IT |
| `CLOUD_AMT` | Cloud Amount | `%` | 0.5° × 0.625° | MERRA-2 / GEOS-IT |
| `ALLSKY_SFC_SW_DWN` | All Sky Surface Shortwave Downward Irradiance | `kW-hr/m^2/day` | 1° × 1° | CERES (solar) |

**Grid spacing:** meteorological **0.5° latitude × 0.625° longitude** (MERRA-2), solar **1° × 1°** (CERES). Cited from [POWER Data Sources](https://power.larc.nasa.gov/docs/methodology/data/sources/) and the [API tutorial](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/).

Constants in `server/processing/grid.py`:

| Area | Bbox | Role |
|---|---|---|
| `region` (default) | lat 12.0–14.0, lon 76.5–78.5 | Map / trend detective spatial field |
| `city` (`BENGALURU_CITY`) | lat 12.80–13.15, lon 77.45–77.80 | City highlight (≈1 meteo cell) |

**Monthly API:** `https://power.larc.nasa.gov/api/temporal/monthly/point` with `start`/`end` as **years**. Series keys are `YYYYMM`; **`YYYY13` is the annual value** and is excluded from the monthly series.

**Time:** Daily API defaults to Local Solar Time (`header.time_standard: LST`). Near-real-time meteorology may include GEOS-IT appended to MERRA-2; POWER warns that climate-quality updates lag NRT by ~2 months.

## Build order

1. **(a) Server + `test_power.py`** ← current stop  
2. (b) `/api/power/grid` smoke test  
3. (c) Basemap only  
4. (d) Grid layer + controls  
5. (e) Click panel + chart  
