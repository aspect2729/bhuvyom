# BhuVyom acquisition & simulation-preparation engine

Python backend that retrieves scientifically selected environmental observations for **Bengaluru**, preserves native resolution / units / quality / provenance, and prepares **simulation input bundles**.

This is **not** the simulation physics engine and **not** a frontend.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add EARTHDATA_TOKEN later — never commit secrets
```

Offline tests and NASA POWER work without Earthdata credentials.

## Run API

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8001
```

Health: http://localhost:8001/api/health

## Tests

```bash
cd backend
source .venv/bin/activate
pytest -q                 # offline + unit
pytest -q -m integration  # live POWER / simulation prep
```

## Key paths

| Path | Role |
|---|---|
| `data/boundaries/` | BBMP polygon + Greater Bengaluru envelope |
| `data/raw/` | Raw acquisition manifests / files |
| `data/processed/` | QC / harmonised outputs |
| `data/simulation_inputs/` | Simulation bundles |
| `data/cache/` | HTTP caches |
| `database/schema.sql` | Supabase/Postgres schema (optional) |

## API

| Method | Path |
|---|---|
| GET | `/api/health` |
| GET | `/api/datasets` |
| GET | `/api/datasets/{id}/metadata` |
| GET | `/api/regions` |
| GET | `/api/observations` |
| GET | `/api/observations/grid` |
| GET | `/api/observations/timeseries` |
| POST | `/api/acquisition/jobs` |
| GET | `/api/acquisition/jobs/{id}` |
| POST | `/api/simulation/prepare-inputs` |
| GET | `/api/simulation/inputs` |

Existing Phase-1 POWER map API remains under `../server/` (port 8000).
