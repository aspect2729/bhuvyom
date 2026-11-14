"""Simulation Lab endpoints (event runoff). Heat and air-flow modes are not modelled → 422."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from engines.contract import FeasibilityError
from engines.simulation import lab

router = APIRouter(tags=["lab"])


@router.get("/api/lab/runoff")
def lab_runoff(intensity: float = Query(40, gt=0, le=200), duration: float = Query(3, gt=0, le=24),
               permeable: float = Query(0.45, ge=0, le=1), today_permeable: float = Query(lab.TODAY_PERMEABLE, ge=0, le=1),
               soil_group: str = "C", lam: float = 0.2):
    try:
        return lab.run(intensity, duration, permeable, today_permeable, soil_group, lam)
    except FeasibilityError as exc:
        return JSONResponse(status_code=422, content=exc.to_dict())


@router.get("/api/lab/{mode}")
def lab_other(mode: str):
    if mode in ("heat", "air"):
        return JSONResponse(status_code=422, content=FeasibilityError(
            f"The {'urban heat' if mode == 'heat' else 'air flow'} model is not built yet",
            requirement="A validated surface-energy-balance model (heat) or urban wind model (air flow) with calibration data",
            hint="Rain runoff is the only simulation connected today.").to_dict())
    return JSONResponse(status_code=404, content={"error": "unknown_mode"})
