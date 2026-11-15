"""BhuVyom — Bengaluru environmental data acquisition & simulation preparation API."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Allow `uvicorn main:app` from backend/
BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import acquisition, datasets, engines, future, lab, live, prediction, simulation, site
from config.settings import get_settings

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("bhuvyom")

app = FastAPI(
    title="BhuVyom Environmental Intelligence API",
    version="0.1.0",
    description=(
        "High-resolution Bengaluru environmental data acquisition and "
        "simulation-input preparation. Not a visualisation-only downloader; "
        "outputs preserve units, provenance, quality, and native resolution."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router)
app.include_router(acquisition.router)
app.include_router(simulation.router)
app.include_router(engines.router)
app.include_router(site.router)
app.include_router(lab.router)
app.include_router(future.router)
app.include_router(prediction.router)
app.include_router(live.router)


@app.get("/api/health")
def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "service": "bhuvyom-acquisition",
        "temperature_mode": "live_earthdata",
        "database_used_for_temperature": False,
        "live_temperature_endpoint": "/api/live/temperature",
        "earthdata_configured": s.has_earthdata_token,
        "supabase_configured": s.has_supabase,
        "cds_configured": s.has_cds,
        "default_region": s.default_region,
        "data_root": str(s.data_root),
    }


@app.on_event("startup")
def _startup() -> None:
    get_settings().ensure_dirs()
    logger.info(
        "BhuVyom ready — earthdata=%s supabase=%s cds=%s",
        settings.has_earthdata_token,
        settings.has_supabase,
        settings.has_cds,
    )
