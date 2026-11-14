"""FastAPI entrypoint for the NASA POWER Bengaluru map backend."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from analysis.trends import (
    analyze_trend_series,
    benjamini_hochberg,
    prepare_monthly_for_trend,
)
from api.power import (
    POWER_PARAMETERS,
    PowerAPIError,
    fetch_power_daily_point,
    fetch_power_monthly_point,
)
from processing.grid import grid_cells, grid_metadata
from processing.power import process_power_monthly_response, process_power_response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("server")

app = FastAPI(title="NASA POWER Bengaluru API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_DATE_RE = re.compile(r"^\d{8}$")
_YEAR_RE = re.compile(r"^\d{4}$")

# Solar / cloud radiative products switch source era in POWER.
# 1984–2000: GEWEX SRB; 2001+: CERES SYN1deg (see response header "sources").
MIXED_SOURCE_VARS = frozenset({"ALLSKY_SFC_SW_DWN", "CLOUD_AMT"})
CERES_ERA_START_YEAR = "2001"
MIXED_SOURCE_NOTE = (
    "ALLSKY_SFC_SW_DWN and CLOUD_AMT use GEWEX SRB for 1984–2000 and "
    "CERES SYN1deg from 2001 onward (see each POWER response header's "
    "\"sources\"). The trend window defaults to start=2001 so those eras "
    "are not mixed; pass allow_mixed_sources=true to override."
)


def _years_available(series: list[dict[str, Any]]) -> dict[str, int | None]:
    """First and last calendar year that have at least one non-null monthly value."""
    years = sorted(
        {
            int(pt["date"][0:4])
            for pt in series
            if pt.get("value") is not None and pt.get("date")
        }
    )
    if not years:
        return {"first": None, "last": None}
    return {"first": years[0], "last": years[-1]}


def _resolve_trend_start(
    var: str,
    start: str,
    *,
    allow_mixed_sources: bool,
) -> tuple[str, str | None, bool]:
    """Clamp solar/cloud start to 2001 unless mixed sources are allowed.

    Returns (effective_start, source_note_or_None, start_was_clamped).
    """
    if var not in MIXED_SOURCE_VARS:
        return start, None, False
    if allow_mixed_sources or start >= CERES_ERA_START_YEAR:
        return start, MIXED_SOURCE_NOTE, False
    return CERES_ERA_START_YEAR, MIXED_SOURCE_NOTE, True


def _validate_yyyymmdd(value: str, name: str) -> str:
    if not _DATE_RE.match(value):
        raise HTTPException(
            status_code=422,
            detail=f"{name} must be YYYYMMDD (got {value!r})",
        )
    return value


def _validate_year(value: str, name: str) -> str:
    if not _YEAR_RE.match(value):
        raise HTTPException(
            status_code=422,
            detail=f"{name} must be YYYY (got {value!r})",
        )
    return value


def _http_error_from_power(exc: PowerAPIError) -> HTTPException:
    status = 502 if exc.status_code is None or exc.status_code == 200 else (
        502 if exc.status_code >= 500 else exc.status_code
    )
    return HTTPException(
        status_code=status if status != 404 else 502,
        detail={
            "error": str(exc),
            "nasa_status": exc.status_code,
            "nasa_detail": exc.detail,
        },
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/power/point")
async def power_point(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start: str = Query(..., description="Start date YYYYMMDD"),
    end: str = Query(..., description="End date YYYYMMDD"),
) -> dict[str, Any]:
    _validate_yyyymmdd(start, "start")
    _validate_yyyymmdd(end, "end")
    if start > end:
        raise HTTPException(status_code=422, detail="start must be <= end")

    try:
        raw = await fetch_power_daily_point(lat, lon, start, end)
        processed = process_power_response(raw)
    except PowerAPIError as exc:
        logger.exception("POWER point request failed")
        raise _http_error_from_power(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    return processed


@app.get("/api/power/monthly")
async def power_monthly(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start: str = Query(..., description="Start year YYYY"),
    end: str = Query(..., description="End year YYYY"),
) -> dict[str, Any]:
    """Monthly POWER series for one point. Annual YYYY13 keys are excluded."""
    _validate_year(start, "start")
    _validate_year(end, "end")
    if start > end:
        raise HTTPException(status_code=422, detail="start must be <= end")

    try:
        raw = await fetch_power_monthly_point(lat, lon, start, end)
        processed = process_power_monthly_response(raw)
    except PowerAPIError as exc:
        logger.exception("POWER monthly request failed")
        raise _http_error_from_power(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    return processed


@app.get("/api/power/grid")
async def power_grid(
    start: str = Query(..., description="Start date YYYYMMDD"),
    end: str = Query(..., description="End date YYYYMMDD"),
    area: Literal["region", "city"] = Query(
        "region",
        description="region (lat 12–14, lon 76.5–78.5) or city (Bengaluru highlight bbox)",
    ),
) -> dict[str, Any]:
    """Return POWER meteo cells for the selected area (default: region)."""
    _validate_yyyymmdd(start, "start")
    _validate_yyyymmdd(end, "end")
    if start > end:
        raise HTTPException(status_code=422, detail="start must be <= end")

    try:
        cells = grid_cells(area)
        meta = grid_metadata(area)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc

    async with httpx.AsyncClient(timeout=120.0) as client:

        async def _one(cell: dict[str, Any]) -> dict[str, Any]:
            raw = await fetch_power_daily_point(
                cell["lat"],
                cell["lon"],
                start,
                end,
                client=client,
            )
            processed = process_power_response(raw)
            return {
                "lat": cell["lat"],
                "lon": cell["lon"],
                "bounds": cell["bounds"],
                "polygon": cell["polygon"],
                "variables": processed["variables"],
                "header": processed.get("header"),
            }

        gathered = await asyncio.gather(
            *[_one(cell) for cell in cells],
            return_exceptions=True,
        )

    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for cell, outcome in zip(cells, gathered):
        if isinstance(outcome, Exception):
            logger.error(
                "Grid cell failed lat=%s lon=%s: %s",
                cell["lat"],
                cell["lon"],
                outcome,
            )
            detail = getattr(outcome, "detail", None)
            errors.append(
                {
                    "lat": cell["lat"],
                    "lon": cell["lon"],
                    "error": str(outcome),
                    "detail": detail,
                }
            )
        else:
            results.append(outcome)

    if not results and errors:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "All grid cell requests to NASA POWER failed",
                "cell_errors": errors,
            },
        )

    return {
        "grid": meta,
        "area": area,
        "start": start,
        "end": end,
        "cell_count": len(results),
        "cells": results,
        "errors": errors,
    }


@app.get("/api/trends/grid")
async def trends_grid(
    var: str = Query(..., description="POWER parameter, e.g. T2M"),
    start: str = Query(..., description="Start year YYYY"),
    end: str = Query(..., description="End year YYYY"),
    area: Literal["region", "city"] = Query("region"),
    mode: Literal["annual", "monthly_anomaly"] = Query(
        "annual",
        description="annual means (≥10 months) or monthly anomalies",
    ),
    allow_mixed_sources: bool = Query(
        False,
        description=(
            "For ALLSKY_SFC_SW_DWN / CLOUD_AMT, allow start before 2001 "
            "(mixes GEWEX SRB and CERES SYN1deg)."
        ),
    ),
) -> dict[str, Any]:
    """Per-cell Mann–Kendall + Sen trend field (§§5–8) with BH-FDR (§11.3).

    Source series are NASA POWER monthly reanalysis/model products → Model-derived
    (§1.2). Trend statistics → Statistically estimated (§1.2).

    ALLSKY_SFC_SW_DWN / CLOUD_AMT default to start≥2001 (CERES era) unless
    allow_mixed_sources=true.
    """
    _validate_year(start, "start")
    _validate_year(end, "end")
    if start > end:
        raise HTTPException(status_code=422, detail="start must be <= end")
    if var not in POWER_PARAMETERS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown var {var!r}; expected one of {list(POWER_PARAMETERS)}",
        )

    effective_start, source_note, start_clamped = _resolve_trend_start(
        var, start, allow_mixed_sources=allow_mixed_sources
    )
    if effective_start > end:
        raise HTTPException(
            status_code=422,
            detail=(
                f"After applying CERES-era default start={effective_start} for {var}, "
                f"start > end ({end}). Widen end or pass allow_mixed_sources=true."
            ),
        )

    try:
        cells = grid_cells(area)
        meta = grid_metadata(area)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc

    async with httpx.AsyncClient(timeout=180.0) as client:

        async def _one(cell: dict[str, Any]) -> dict[str, Any]:
            raw = await fetch_power_monthly_point(
                cell["lat"],
                cell["lon"],
                effective_start,
                end,
                client=client,
            )
            processed = process_power_monthly_response(raw)
            if var not in processed["variables"]:
                raise ValueError(f"Variable {var} missing from POWER response")
            info = processed["variables"][var]
            years_available = _years_available(info["series"])
            x, t, years_used = prepare_monthly_for_trend(info["series"], mode=mode)
            trend = analyze_trend_series(x, t, unit=info["unit"])
            # Annual (or anomaly) series for the side-panel chart.
            annual_series = [
                {"year": int(yi), "value": float(xi)}
                for xi, yi in zip(x.tolist(), t.tolist())
            ]
            return {
                "lat": cell["lat"],
                "lon": cell["lon"],
                "bounds": cell["bounds"],
                "polygon": cell["polygon"],
                "var": var,
                "longName": info["longName"],
                "unit": info["unit"],
                "mode": mode,
                "years_used": years_used if years_used else trend.get("years_used"),
                "years_available": years_available,
                "annual_series": annual_series,
                "sources": (processed.get("header") or {}).get("sources"),
                "source_note": source_note,
                "trend": trend,
                "quantity_types": {
                    "source_data": "Model-derived",
                    "trend": "Statistically estimated",
                },
            }

        gathered = await asyncio.gather(
            *[_one(cell) for cell in cells],
            return_exceptions=True,
        )

    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for cell, outcome in zip(cells, gathered):
        if isinstance(outcome, Exception):
            logger.error(
                "Trend cell failed lat=%s lon=%s: %s",
                cell["lat"],
                cell["lon"],
                outcome,
            )
            errors.append(
                {
                    "lat": cell["lat"],
                    "lon": cell["lon"],
                    "error": str(outcome),
                    "detail": getattr(outcome, "detail", None),
                }
            )
        else:
            results.append(outcome)

    if not results and errors:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "All trend cell requests failed",
                "cell_errors": errors,
            },
        )

    raw_p = [
        (r["trend"]["p_value"] if r["trend"].get("status") == "ok" else None)
        for r in results
    ]
    adj_p, sig_adj = benjamini_hochberg(raw_p, alpha=0.05)
    for r, p_adj, significant_adj in zip(results, adj_p, sig_adj):
        r["p_value_raw"] = r["trend"].get("p_value")
        r["p_value_adjusted"] = p_adj
        r["significant_raw"] = bool(r["trend"].get("significant"))
        r["significant_adjusted"] = bool(significant_adj)
        # Flatten primary fields requested by the brief
        tr = r["trend"]
        r["slope_per_decade"] = tr.get("slope_per_decade")
        r["ci_low"] = tr.get("ci_low_per_decade")
        r["ci_high"] = tr.get("ci_high_per_decade")
        r["p_value"] = tr.get("p_value")
        r["significant"] = r["significant_raw"]
        r["n_years"] = tr.get("n_years")
        r["correction_applied"] = tr.get("correction_applied")
        r["status"] = tr.get("status")

    return {
        "grid": meta,
        "area": area,
        "var": var,
        "start": effective_start,
        "start_requested": start,
        "start_clamped_to_ceres_era": start_clamped,
        "end": end,
        "allow_mixed_sources": allow_mixed_sources,
        "source_note": source_note,
        "mode": mode,
        "multiple_testing": {
            "method": "Benjamini-Hochberg FDR",
            "alpha": 0.05,
            "methodology_ref": "METHODOLOGY_REFERENCE.md §11.3",
        },
        "quantity_types": {
            "source_data": "Model-derived",
            "trend": "Statistically estimated",
        },
        "cell_count": len(results),
        "cells": results,
        "errors": errors,
    }
