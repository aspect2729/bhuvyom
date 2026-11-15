"""HTTP interface for the five-engine architecture (all responses follow engines/contract.py).

Existing acquisition routes (/api/datasets, /api/observations*, /api/acquisition/*,
/api/simulation/prepare-inputs, /api/simulation/inputs) are unchanged.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, Response

from engines import knowledge, observations, prepared_data
from engines.analysis import service as analysis
from engines.contract import FeasibilityError
from engines.prediction import service as prediction
from engines.simulation import service as simulation

router = APIRouter(tags=["engines"])


def _json(result) -> Response:
    return Response(content=result.model_dump_json(), media_type="application/json")


def _guard(fn, *a, **kw) -> Response:
    try:
        return fn(*a, **kw)
    except FeasibilityError as exc:
        return JSONResponse(status_code=422, content=exc.to_dict())
    except FileNotFoundError as exc:
        return JSONResponse(status_code=404, content={"error": "data_not_acquired", "reason": str(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=409, content={"error": "artifact_integrity_error", "reason": str(exc)})


@lru_cache(maxsize=32)
def _cached(kind: str, *args) -> bytes:
    fn = {"lst": observations.observed_lst, "gpm": observations.observed_gpm, "ndvi": observations.observed_ndvi, "lstc": analysis.lst_composite, "trend": analysis.trends}[kind]
    return fn(*args).model_dump_json().encode()


def _bytes(kind: str, *args) -> Response:
    return Response(content=_cached(kind, *args), media_type="application/json")


@router.get("/api/engines/catalog")
def catalog() -> dict:
    """Products the visualization engine can request (only those backed by real data/results)."""
    av = prepared_data.availability()
    items = [
        {"id": "obs_lst", "engine": "acquisition", "data_type": "observed", "label": "Land surface temperature (MODIS, ~1 km)", "endpoint": "/api/observed/lst", "available": av["modis_lst_mod11a1"]["available"]},
        {"id": "obs_gpm", "engine": "acquisition", "data_type": "observed", "label": "Daily rainfall (GPM IMERG, 0.1°)", "endpoint": "/api/observed/gpm", "available": av["gpm_imerg_v07_daily"]["available"]},
        {"id": "obs_ndvi", "engine": "acquisition", "data_type": "observed", "label": "Vegetation index NDVI (MODIS, 250 m)", "endpoint": "/api/observed/ndvi", "available": av["modis_vi_mod13q1"]["available"]},
        {"id": "ana_trend_T2M", "engine": "analysis", "data_type": "analysed", "label": "Air temperature trend 1981–2025", "endpoint": "/api/analysis/trends?var=T2M", "available": av["nasa_power_monthly"]["available"]},
        {"id": "ana_trend_PRECTOTCORR", "engine": "analysis", "data_type": "analysed", "label": "Precipitation trend 1981–2025", "endpoint": "/api/analysis/trends?var=PRECTOTCORR", "available": av["nasa_power_monthly"]["available"]},
        {"id": "ana_trend_RH2M", "engine": "analysis", "data_type": "analysed", "label": "Humidity trend 1981–2025", "endpoint": "/api/analysis/trends?var=RH2M", "available": av["nasa_power_monthly"]["available"]},
        {"id": "ana_trend_ALLSKY_SFC_SW_DWN", "engine": "analysis", "data_type": "analysed", "label": "Solar radiation trend 2001–2025", "endpoint": "/api/analysis/trends?var=ALLSKY_SFC_SW_DWN", "available": av["nasa_power_monthly"]["available"]},
        {"id": "ana_lst", "engine": "analysis", "data_type": "analysed", "label": "Surface temperature composite & contrast", "endpoint": "/api/analysis/lst-composite", "available": av["modis_lst_mod11a1"]["available"]},
        {"id": "pred_T2M", "engine": "prediction", "data_type": "predicted", "label": "Air temperature forecast (1–12 months)", "endpoint": "/api/prediction/forecast?var=T2M", "available": av["nasa_power_monthly"]["available"]},
        {"id": "pred_PRECTOTCORR", "engine": "prediction", "data_type": "predicted", "label": "Precipitation forecast (1–12 months)", "endpoint": "/api/prediction/forecast?var=PRECTOTCORR", "available": av["nasa_power_monthly"]["available"]},
        {"id": "sim_runoff", "engine": "simulation", "data_type": "simulated", "label": "Rainfall–runoff scenario (SCS-CN)", "endpoint": "/api/simulation/runoff", "available": av["gpm_imerg_v07_daily"]["available"], "parameters": {"baseline_impervious": 0.6, "scenario_impervious": 0.8, "soil_group": "C", "lam": 0.2}},
    ]
    return {"products": items, "data_availability": av}


@router.get("/api/knowledge/methodologies")
def methodologies() -> dict:
    return knowledge.registry()


@router.get("/api/boundaries/bbmp")
def boundary() -> dict:
    return prepared_data.load_boundary()


@router.get("/api/observed/lst")
def observed_lst() -> Response:
    return _guard(_bytes, "lst")


@router.get("/api/observed/gpm")
def observed_gpm() -> Response:
    return _guard(_bytes, "gpm")


@router.get("/api/observed/ndvi")
def observed_ndvi() -> Response:
    return _guard(_bytes, "ndvi")


@router.get("/api/analysis/trends")
def analysis_trends(var: str = Query("T2M"), start: int = Query(1981, ge=1981, le=2025), end: int = Query(2025, ge=1981, le=2025), allow_mixed_sources: bool = False) -> Response:
    return _guard(_bytes, "trend", var, start, end, allow_mixed_sources)


@router.get("/api/analysis/lst-composite")
def analysis_lst() -> Response:
    return _guard(_bytes, "lstc")


@router.get("/api/prediction/forecast")
def prediction_forecast(var: str = Query("T2M"), horizon_months: int = Query(12), frequency: Literal["monthly", "daily"] = "monthly") -> Response:
    def go():
        prediction.check_feasibility(var, horizon_months, frequency)
        return _json(prediction.run(var, horizon_months))
    return _guard(go)


@router.post("/api/prediction/run")
def prediction_run(var: str = Query("T2M"), horizon_months: int = Query(12), force_retrain: bool = False) -> Response:
    return _guard(lambda: _json(prediction.run(var, horizon_months, force=force_retrain)))


@router.get("/api/simulation/runoff")
def simulation_runoff(baseline_impervious: float = Query(0.6, ge=0, le=1), scenario_impervious: float = Query(0.8, ge=0, le=1),
                      soil_group: Literal["B", "C", "D"] = "C", lam: float = Query(0.2),
                      forcing: str = Query("auto"),
                      start: Optional[str] = None, end: Optional[str] = None,
                      persist: bool = Query(True)) -> Response:
    return _guard(lambda: _json(simulation.run(baseline_impervious, scenario_impervious, soil_group, lam, start, end, forcing, persist=persist)))
