"""Site Simulation map data — NASA GES DISC / Earthdata MERRA-2 only.

Air temperature, humidity, wind, and pressure: MERRA-2 M2T1NXSLV via GES DISC OPeNDAP.
Rainfall: left null here when GPM is not fetched live (use DB/GPM ingest for rain layers).
No Open-Meteo. No NASA POWER. No third-party weather APIs.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from engines.contract import clean

logger = logging.getLogger(__name__)

REGIONS = {
    "ka": {"s": 11.5, "n": 18.5, "w": 74.0, "e": 78.6, "rows": 11, "cols": 9},
    "blr": {"s": 12.62, "n": 13.27, "w": 77.28, "e": 77.87, "rows": 9, "cols": 9},
}
BLR = (12.9716, 77.5946)


def frontend_grid(region: str) -> list[tuple[float, float]]:
    if region not in REGIONS:
        raise ValueError(f"region must be one of {list(REGIONS)}")
    b = REGIONS[region]
    di = (b["n"] - b["s"]) / (b["rows"] - 1)
    dj = (b["e"] - b["w"]) / (b["cols"] - 1)
    grid = []
    for i in range(b["rows"]):
        for j in range(b["cols"]):
            grid.append((round(b["s"] + i * di, 4), round(b["w"] + j * dj, 4)))
    grid.append(BLR)
    return grid


def _nn_index(lat: float, lon: float, points: list[tuple[float, float]]) -> int:
    best_i, best_d = 0, 1e18
    for i, (pla, plo) in enumerate(points):
        d = (pla - lat) ** 2 + (plo - lon) ** 2
        if d < best_d:
            best_d, best_i = d, i
    return best_i


def _region_bbox(region: str) -> tuple[float, float, float, float]:
    b = REGIONS[region]
    return (b["w"], b["s"], b["e"], b["n"])


def _latest_merra2_day(bbox: tuple[float, float, float, float], lookback_days: int = 45) -> date | None:
    from data_sources.gesdisc_merra2_opendap import latest_available_day

    return latest_available_day(bbox=bbox, lookback_days=lookback_days)


def _fields_from_merra2(region: str, grid: list[tuple[float, float]]) -> tuple[dict[str, list[Any]], dict[str, Any]]:
    from data_sources.gesdisc_merra2_opendap import fetch_merra2_slv

    bbox = _region_bbox(region)
    day = _latest_merra2_day(bbox) or (date.today() - timedelta(days=30))
    hour = datetime.now(timezone.utc).hour
    payload = fetch_merra2_slv(day=day, hour=hour, bbox=bbox)
    n = len(grid)
    empty = {
        "air": [None] * n,
        "rh": [None] * n,
        "wind": [None] * n,
        "wdir": [None] * n,
        "rain": [None] * n,
        "cloud": [None] * n,
        "pm25": [None] * n,
        "surf": [None] * n,
    }
    meta = {
        "status": payload.get("status"),
        "day": day.isoformat(),
        "hour": hour,
        "granule": (payload.get("source") or {}).get("granule") if isinstance(payload.get("source"), dict) else None,
        "n_source_points": payload.get("n_points"),
        "provider": "NASA GES DISC",
        "product": "M2T1NXSLV",
    }
    if payload.get("status") != "ok":
        meta["error"] = payload.get("error") or payload.get("detail")
        return empty, meta

    src_pts = [
        p
        for p in payload.get("points") or []
        if p.get("lat") is not None and p.get("lon") is not None
    ]
    if not src_pts:
        return empty, meta

    coords = [(p["lat"], p["lon"]) for p in src_pts]
    air: list[Any] = [None] * n
    rh: list[Any] = [None] * n
    wind: list[Any] = [None] * n
    wdir: list[Any] = [None] * n
    for i, (lat, lon) in enumerate(grid):
        j = _nn_index(lat, lon, coords)
        p = src_pts[j]
        air[i] = clean(p.get("T2M_C"), 2)
        rh[i] = clean(p.get("RH2M"), 1)
        wind[i] = clean(p.get("WS2M"), 2)
        wdir[i] = clean(p.get("WD2M"), 1)
    return {
        "air": air,
        "rh": rh,
        "wind": wind,
        "wdir": wdir,
        "rain": [None] * n,  # precipitation from GPM ingest / separate layer — not fabricated
        "cloud": [None] * n,
        "pm25": [None] * n,
        "surf": [None] * n,
    }, meta


def live(region: str = "ka") -> dict[str, Any]:
    grid = frontend_grid(region)
    values, meta = _fields_from_merra2(region, grid)

    valid = meta.get("day")
    time_str = None
    if meta.get("hour") is not None and valid:
        try:
            dt = datetime.fromisoformat(f"{valid}T{int(meta['hour']):02d}:00:00+00:00")
            time_str = dt.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%H:%M")
        except ValueError:
            time_str = None

    return {
        "time": time_str,
        "valid_time": f"{valid}T{int(meta.get('hour') or 0):02d}:00:00+00:00" if valid else None,
        "values": values,
        "source": "earthdata:GES_DISC:MERRA-2_M2T1NXSLV",
        "air_source": meta,
        "region": region,
        "grid_points": len(grid),
        "stored_in_database": False,
        "note": (
            "Humidity/wind derived from MERRA-2 T2M/T2MDEW/U2M/V2M. "
            "Rain is not filled from non-GES-DISC sources; use GPM IMERG ingest for precipitation."
        ),
    }


def record() -> dict[str, Any]:
    """Annual Bengaluru series from verified GES DISC rows in Supabase (when present).

    Does not call Open-Meteo or NASA POWER. If the DB has no MERRA-2/GPM history yet,
    returns empty series with an explicit coverage note.
    """
    out: dict[str, dict[str, float]] = {k: {} for k in ("air", "rain", "rh", "wind")}
    try:
        from pipeline.db import SupabaseREST

        db = SupabaseREST()
        maps = db.lookup_maps()
        merra_id = maps["dataset_by_code"].get("merra2_assim")
        gpm_id = maps["dataset_by_code"].get("gpm_imerg_v07_daily")
        var_air = maps["variable_by_code"].get("temperature_air_temperature")
        var_rh = maps["variable_by_code"].get("atmospheric_activity_humidity")
        var_wind = maps["variable_by_code"].get("atmospheric_activity_wind_speed")
        var_rain = maps["variable_by_code"].get("precipitation_water_rainfall")

        def yearly_from_db(dataset_id: int | None, variable_id: int | None, layer: str, agg: str) -> None:
            if not dataset_id or not variable_id:
                return
            # Bengaluru-ish cells
            rows = db.get(
                "environmental_observations",
                params={
                    "dataset_id": f"eq.{dataset_id}",
                    "variable_id": f"eq.{variable_id}",
                    "select": "observed_at,value_numeric,grid_id",
                    "order": "observed_at.asc",
                    "limit": "5000",
                },
            )
            buckets: dict[int, list[float]] = {}
            for r in rows:
                gid = r.get("grid_id") or ""
                # keep near Bengaluru
                if "12.9" not in gid and "13.0" not in gid and "12.97" not in gid:
                    # also accept any KA cell if few BLR matches — filter lat via grid_id merra2:lat:lon
                    try:
                        parts = gid.split(":")
                        lat = float(parts[1])
                        lon = float(parts[2])
                        if abs(lat - BLR[0]) > 0.6 or abs(lon - BLR[1]) > 0.8:
                            continue
                    except (IndexError, ValueError):
                        continue
                try:
                    y = int(str(r["observed_at"])[:4])
                    v = float(r["value_numeric"])
                except (TypeError, ValueError, KeyError):
                    continue
                buckets.setdefault(y, []).append(v)
            for y, arr in buckets.items():
                if not arr:
                    continue
                if agg == "sum":
                    out[layer][str(y)] = float(clean(sum(arr), 1))
                else:
                    out[layer][str(y)] = float(clean(sum(arr) / len(arr), 2))

        yearly_from_db(merra_id, var_air, "air", "mean")
        yearly_from_db(merra_id, var_rh, "rh", "mean")
        yearly_from_db(merra_id, var_wind, "wind", "mean")
        yearly_from_db(gpm_id, var_rain, "rain", "sum")
    except Exception as exc:  # noqa: BLE001
        logger.warning("record() GES DISC DB read failed: %s", exc)

    return {
        **out,
        "source": "supabase:GES_DISC:merra2_assim+gpm_imerg_v07_daily",
        "focal": {"lat": BLR[0], "lon": BLR[1]},
        "stored_in_database": True,
        "coverage_note": (
            "Series only include years present in the NASA GES DISC–verified Supabase store. "
            "Empty layers mean backfill is incomplete — not a fallback to another provider."
        ),
    }
