"""Future Earth endpoints — NASA NEX-GDDP-CMIP6 projections for Bengaluru."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from engines.prediction import projections

router = APIRouter(tags=["future"])


@router.get("/api/future/status")
def future_status():
    return projections.status()


@router.get("/api/future/projections")
def future_projections():
    try:
        return projections.projections()
    except projections.NotAcquired as exc:
        return JSONResponse(status_code=404, content={"error": "data_not_acquired", "reason": str(exc),
                                                      "hint": "Run: cd backend && python -u scripts/acquire_cmip6.py (≈15–40 min, public NASA server)"})
