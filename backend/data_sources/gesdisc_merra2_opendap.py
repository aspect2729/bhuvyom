"""Multi-variable MERRA-2 (M2T1NXSLV) fetch via NASA GES DISC / Earthdata OPeNDAP.

Uses the existing EARTHDATA_TOKEN only. No alternate providers.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx

from acquisition.cmr_search import search_granules
from acquisition.earthdata_auth import require_earthdata
from config.settings import get_settings

logger = logging.getLogger(__name__)

COLLECTION_CONCEPT_ID = "C1276812863-GES_DISC"
SHORT_NAME = "M2T1NXSLV"
VERSION = "5.12.4"

LAT0, DLAT = -90.0, 0.5
LON0, DLON = -180.0, 0.625
KA_BBOX = (74.05, 11.55, 78.60, 18.50)  # west, south, east, north

# Native MERRA-2 variables we request from M2T1NXSLV
NATIVE_VARS = ("T2M", "T2MDEW", "U2M", "V2M", "PS", "QV2M")


def lat_index(lat: float) -> int:
    return int(round((lat - LAT0) / DLAT))


def lon_index(lon: float) -> int:
    return int(round((lon - LON0) / DLON))


def _encode_dap_slice(start: int, stop: int, step: int = 1) -> str:
    return quote(f"[{start}:{step}:{stop}]", safe="")


def _opendap_ascii_url(granule_ur: str, query: str) -> str:
    encoded = quote(granule_ur, safe="")
    return (
        f"https://opendap.earthdata.nasa.gov/collections/{COLLECTION_CONCEPT_ID}"
        f"/granules/{encoded}.ascii?{query}"
    )


def granule_ur_for_day(day: date, bbox: tuple[float, float, float, float] = KA_BBOX) -> str | None:
    granules = search_granules(
        SHORT_NAME,
        version=VERSION,
        start=f"{day.isoformat()}T00:00:00Z",
        end=f"{day.isoformat()}T23:59:59Z",
        bbox=bbox,
        page_size=5,
    )
    if not granules:
        return None
    g = granules[0]
    title = g.get("title") or ""
    if ":" in title and title.startswith("M2T1NXSLV"):
        return title
    producer = g.get("producer_granule_id")
    if producer:
        return f"{SHORT_NAME}.{VERSION}:{producer}"
    return title or None


def latest_available_day(
    bbox: tuple[float, float, float, float] = KA_BBOX,
    lookback_days: int = 60,
) -> date | None:
    end = date.today()
    start = end - timedelta(days=lookback_days)
    granules = search_granules(
        SHORT_NAME,
        version=VERSION,
        start=f"{start.isoformat()}T00:00:00Z",
        end=f"{end.isoformat()}T23:59:59Z",
        bbox=bbox,
        page_size=50,
    )
    if not granules:
        return None
    ts = (granules[-1].get("time_start") or granules[-1].get("start_date") or "")[:10]
    try:
        return date.fromisoformat(ts)
    except ValueError:
        return None


def _parse_multi_ascii(text: str, variables: tuple[str, ...]) -> dict[str, Any]:
    """Parse OPeNDAP .ascii for one or more 3-D fields with shared lon vector."""
    lons: list[float] = []
    by_var: dict[str, list[dict[str, Any]]] = {v: [] for v in variables}
    lon_pat = re.compile(r"^(?:(?P<var>[A-Z0-9_]+)\.)?lon,")
    # VAR.VAR[VAR.time=i][VAR.lat=lat], v1, v2, ...
    val_pat = re.compile(
        r"^(?P<var>[A-Z0-9_]+)\.(?P=var)\[(?:[A-Z0-9_]+)\.time=(?P<t>\d+)\]"
        r"\[(?:[A-Z0-9_]+)\.lat=(?P<lat>[-+0-9.]+)\],\s*(?P<vals>.*)$"
    )
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("Dataset:"):
            continue
        m_lon = lon_pat.match(line)
        if m_lon and ("," in line):
            # Prefer first lon vector; MERRA-2 vars share lon axis
            if not lons:
                lons = [float(x) for x in line.split(",", 1)[1].split(",") if x.strip()]
            continue
        m = val_pat.match(line)
        if not m:
            continue
        var = m.group("var")
        if var not in by_var:
            continue
        lat = float(m.group("lat"))
        t_idx = int(m.group("t"))
        vals = [float(x) for x in m.group("vals").split(",") if x.strip()]
        for j, raw in enumerate(vals):
            lon = lons[j] if j < len(lons) else None
            by_var[var].append(
                {"time_index": t_idx, "lat": lat, "lon": lon, "value": raw}
            )
    return {"lons": lons, "by_var": by_var}


def rh_from_t_tdew(t_k: float, tdew_k: float) -> float:
    """Relative humidity (%) from air and dew-point temperatures (Kelvin).

    August–Roche–Magnus approximation; documented derived quantity.
    """
    t_c = t_k - 273.15
    td_c = tdew_k - 273.15
    es = 6.1094 * math.exp((17.625 * t_c) / (t_c + 243.04))
    e = 6.1094 * math.exp((17.625 * td_c) / (td_c + 243.04))
    if es <= 0:
        return float("nan")
    return max(0.0, min(100.0, 100.0 * e / es))


def wind_speed_dir(u: float, v: float) -> tuple[float, float]:
    """Return (speed m/s, meteorological FROM direction degrees)."""
    speed = math.hypot(u, v)
    # Meteorological direction: direction wind blows FROM
    wdir = (math.degrees(math.atan2(-u, -v)) + 360.0) % 360.0
    return speed, wdir


def fetch_merra2_slv(
    *,
    day: date,
    bbox: tuple[float, float, float, float] = KA_BBOX,
    hour: int = 6,
    variables: tuple[str, ...] = NATIVE_VARS,
) -> dict[str, Any]:
    """Fetch native M2T1NXSLV fields for one hour over bbox via GES DISC OPeNDAP."""
    require_earthdata()
    west, south, east, north = bbox
    i0, i1 = lat_index(south), lat_index(north)
    j0, j1 = lon_index(west), lon_index(east)
    if i0 > i1:
        i0, i1 = i1, i0
    if j0 > j1:
        j0, j1 = j1, j0

    granule_ur = granule_ur_for_day(day, bbox=bbox)
    if not granule_ur:
        return {
            "status": "error",
            "error": f"No MERRA-2 granule for {day.isoformat()}",
            "product": SHORT_NAME,
        }

    h = max(0, min(23, int(hour)))
    t_slice = _encode_dap_slice(h, h)
    lat_slice = _encode_dap_slice(i0, i1)
    lon_slice = _encode_dap_slice(j0, j1)
    parts = [f"{v}{t_slice}{lat_slice}{lon_slice}" for v in variables]
    query = ",".join(parts)
    url = _opendap_ascii_url(granule_ur, query)

    headers = require_earthdata().bearer_headers()
    timeout = get_settings().http_timeout_seconds
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = client.get(url)
        if resp.status_code in (401, 403):
            raise PermissionError(
                f"Earthdata auth failed HTTP {resp.status_code}. Check EARTHDATA_TOKEN."
            )
        if resp.status_code != 200:
            return {
                "status": "error",
                "error": f"OPeNDAP HTTP {resp.status_code}",
                "detail": resp.text[:500],
                "url": url,
            }
        parsed = _parse_multi_ascii(resp.text, variables)

    # Index by (lat, lon) for joining
    def key(lat: float | None, lon: float | None) -> tuple[float, float] | None:
        if lat is None or lon is None:
            return None
        return (round(lat, 4), round(lon, 4))

    grids: dict[tuple[float, float], dict[str, float]] = {}
    for var, pts in parsed["by_var"].items():
        for p in pts:
            k = key(p.get("lat"), p.get("lon"))
            if k is None:
                continue
            grids.setdefault(k, {})[var] = float(p["value"])

    points: list[dict[str, Any]] = []
    for (lat, lon), vals in grids.items():
        row: dict[str, Any] = {"lat": lat, "lon": lon, **vals}
        if "T2M" in vals:
            row["T2M_C"] = vals["T2M"] - 273.15
        if "T2M" in vals and "T2MDEW" in vals:
            row["RH2M"] = rh_from_t_tdew(vals["T2M"], vals["T2MDEW"])
            row["RH2M_derived"] = True
        if "U2M" in vals and "V2M" in vals:
            ws, wd = wind_speed_dir(vals["U2M"], vals["V2M"])
            row["WS2M"] = ws
            row["WD2M"] = wd
            row["wind_derived"] = True
        points.append(row)

    return {
        "status": "ok",
        "source": {
            "provider": "NASA GES DISC",
            "access_platform": "NASA GES DISC / Earthdata",
            "product_short_name": SHORT_NAME,
            "dataset_short_name": SHORT_NAME,
            "version": VERSION,
            "collection_concept_id": COLLECTION_CONCEPT_ID,
            "quantity_type": "Reanalysis",
            "native_spatial_resolution": "0.5° × 0.625°",
            "native_temporal_resolution": "1 hour",
            "granule": granule_ur,
            "opendap_url": url,
        },
        "request": {
            "day": day.isoformat(),
            "hour": h,
            "bbox": {"west": west, "south": south, "east": east, "north": north},
            "variables": list(variables),
        },
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "n_points": len(points),
        "points": points,
    }
