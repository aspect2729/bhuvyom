"""Live Earthdata fetches — no database persistence."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from data_sources.live_earthdata_temperature import KA_BBOX, fetch_merra2_t2m

router = APIRouter(tags=["live-earthdata"])


@router.get("/api/live/temperature")
def live_temperature(
    day: Optional[str] = Query(
        None,
        description="UTC day YYYY-MM-DD (defaults to ~2 days ago for MERRA-2 latency)",
    ),
    hour: Optional[int] = Query(0, ge=0, le=23, description="Hour 0–23 UTC; omit all hours with hour=-1 via all_hours"),
    all_hours: bool = Query(False, description="If true, return all 24 hourly fields"),
    west: float = Query(KA_BBOX[0]),
    south: float = Query(KA_BBOX[1]),
    east: float = Query(KA_BBOX[2]),
    north: float = Query(KA_BBOX[3]),
    unit: str = Query("C", description="C or K"),
) -> dict:
    if unit.upper() not in ("C", "K"):
        raise HTTPException(status_code=422, detail="unit must be C or K")
    """Pull MERRA-2 T2M for Karnataka (or bbox) directly from Earthdata OPeNDAP.

    Does **not** read or write Supabase. Requires EARTHDATA_TOKEN.
    """
    try:
        d = date.fromisoformat(day) if day else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid day: {exc}") from exc

    try:
        payload = fetch_merra2_t2m(
            day=d,
            bbox=(west, south, east, north),
            hour=None if all_hours else hour,
            as_celsius=unit.upper() == "C",
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Earthdata fetch failed: {exc}") from exc

    if payload.get("status") != "ok":
        raise HTTPException(status_code=502, detail=payload)

    return payload


@router.get("/api/live/status")
def live_status() -> dict:
    from config.settings import get_settings

    s = get_settings()
    return {
        "mode": "live_earthdata",
        "database_used_for_temperature": False,
        "earthdata_configured": s.has_earthdata_token,
        "supabase_configured_but_unused_for_temp": s.has_supabase,
        "endpoint": "/api/live/temperature",
        "product": "MERRA-2 M2T1NXSLV T2M",
        "checked_at": datetime.utcnow().isoformat() + "Z",
    }
