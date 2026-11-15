"""Live 2 m air temperature from MERRA-2 via NASA Earthdata OPeNDAP.

No Supabase / no persistent observation store — fetch on demand with EARTHDATA_TOKEN.
T2M is model-derived reanalysis air temperature (Kelvin), NOT land-surface temperature.
Native grid: 0.5° lat × 0.625° lon.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx

from acquisition.earthdata_auth import require_earthdata
from acquisition.cmr_search import search_granules
from config.settings import get_settings

logger = logging.getLogger(__name__)

COLLECTION_CONCEPT_ID = "C1276812863-GES_DISC"
SHORT_NAME = "M2T1NXSLV"
VERSION = "5.12.4"

# MERRA-2 grid: lat -90..90 step 0.5 (361); lon -180..179.375 step 0.625 (576)
LAT0, DLAT = -90.0, 0.5
LON0, DLON = -180.0, 0.625

# Default Karnataka bbox
KA_BBOX = (74.05, 11.55, 78.60, 18.50)  # west, south, east, north


def _lat_index(lat: float) -> int:
    return int(round((lat - LAT0) / DLAT))


def _lon_index(lon: float) -> int:
    return int(round((lon - LON0) / DLON))


def _opendap_ascii_url(granule_ur: str, query: str) -> str:
    # granule_ur example: M2T1NXSLV.5.12.4:MERRA2_400.tavg1_2d_slv_Nx.20240101.nc4
    encoded = quote(granule_ur, safe="")
    return (
        f"https://opendap.earthdata.nasa.gov/collections/{COLLECTION_CONCEPT_ID}"
        f"/granules/{encoded}.ascii?{query}"
    )


def _encode_dap_slice(start: int, stop: int, step: int = 1) -> str:
    # brackets must be percent-encoded for earthdata opendap front-door
    return quote(f"[{start}:{step}:{stop}]", safe="")


def _parse_t2m_ascii(text: str) -> dict[str, Any]:
    """Parse OPeNDAP .ascii subset for T2M (+ optional lat/lon lines)."""
    lons: list[float] = []
    lats: list[float] = []
    rows: list[dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("Dataset:"):
            continue
        if line.startswith("T2M.lon,") or line.startswith("lon,"):
            lons = [float(x) for x in line.split(",", 1)[1].split(",") if x.strip()]
            continue
        if line.startswith("T2M.lat,") or (line.startswith("lat,") and "T2M" not in line):
            # lat vector sometimes separate
            try:
                lats = [float(x) for x in line.split(",", 1)[1].split(",") if x.strip()]
            except ValueError:
                pass
            continue
        # T2M.T2M[T2M.time=0][T2M.lat=13], v1, v2, ...
        m = re.match(
            r"T2M\.T2M\[T2M\.time=(\d+)\]\[T2M\.lat=([-+0-9.]+)\],\s*(.*)$",
            line,
        )
        if not m:
            continue
        t_idx = int(m.group(1))
        lat = float(m.group(2))
        vals = [float(x) for x in m.group(3).split(",") if x.strip()]
        if not lons and vals:
            # lon line should have appeared; if not, skip geo join
            pass
        for j, kelvin in enumerate(vals):
            lon = lons[j] if j < len(lons) else None
            celsius = kelvin - 273.15
            rows.append(
                {
                    "time_index": t_idx,
                    "lat": lat,
                    "lon": lon,
                    "t2m_k": round(kelvin, 3),
                    "t2m_c": round(celsius, 3),
                }
            )
    return {"lons": lons, "lats": lats, "points": rows}


def _granule_ur_for_day(day: date, bbox: tuple[float, float, float, float] = KA_BBOX) -> str | None:
    """Resolve granule UR via CMR for one UTC day over bbox."""
    start = f"{day.isoformat()}T00:00:00Z"
    end = f"{day.isoformat()}T23:59:59Z"
    granules = search_granules(
        SHORT_NAME,
        version=VERSION,
        start=start,
        end=end,
        bbox=bbox,
        page_size=5,
    )
    if not granules:
        return None
    g = granules[0]
    title = g.get("title") or ""
    # title: M2T1NXSLV.5.12.4:MERRA2_400.tavg1_2d_slv_Nx.20240101.nc4
    if ":" in title and title.startswith("M2T1NXSLV"):
        return title
    producer = g.get("producer_granule_id")
    if producer:
        return f"{SHORT_NAME}.{VERSION}:{producer}"
    return title or None


def fetch_merra2_t2m(
    *,
    day: date | None = None,
    bbox: tuple[float, float, float, float] = KA_BBOX,
    hour: int | None = 0,
    as_celsius: bool = True,
) -> dict[str, Any]:
    """Fetch MERRA-2 T2M for a day/bbox directly from Earthdata OPeNDAP.

    Returns JSON-serialisable payload. Does not write to any database.
    """
    require_earthdata()
    day = day or (date.today() - timedelta(days=2))  # MERRA-2 latency
    west, south, east, north = bbox
    i0, i1 = _lat_index(south), _lat_index(north)
    j0, j1 = _lon_index(west), _lon_index(east)
    if i0 > i1:
        i0, i1 = i1, i0
    if j0 > j1:
        j0, j1 = j1, j0

    granule_ur = _granule_ur_for_day(day, bbox=bbox)
    if not granule_ur:
        return {
            "status": "error",
            "error": f"No MERRA-2 granule found for {day.isoformat()}",
            "source": "Earthdata CMR + OPeNDAP",
            "product": SHORT_NAME,
        }

    if hour is None:
        t_slice = _encode_dap_slice(0, 23)
    else:
        h = max(0, min(23, int(hour)))
        t_slice = _encode_dap_slice(h, h)
    lat_slice = _encode_dap_slice(i0, i1)
    lon_slice = _encode_dap_slice(j0, j1)
    query = f"T2M{t_slice}{lat_slice}{lon_slice}"

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
        parsed = _parse_t2m_ascii(resp.text)

    points = parsed["points"]
    if as_celsius:
        values = [p["t2m_c"] for p in points]
        unit = "C"
    else:
        values = [p["t2m_k"] for p in points]
        unit = "K"

    collected_at = datetime.now(timezone.utc).isoformat()
    return {
        "status": "ok",
        "stored_in_database": False,
        "source": {
            "provider": "NASA GES DISC / Earthdata",
            "product": SHORT_NAME,
            "version": VERSION,
            "variable": "T2M",
            "quantity_type": "Model-derived",
            "not_lst": True,
            "native_spatial_resolution": "0.5° × 0.625°",
            "native_temporal_resolution": "1 hour",
            "access": "CMR granule discovery + Earthdata OPeNDAP ASCII subset",
            "granule": granule_ur,
            "opendap_url": url,
        },
        "request": {
            "day": day.isoformat(),
            "bbox": {"west": west, "south": south, "east": east, "north": north},
            "hour": hour,
            "unit": unit,
        },
        "collected_at": collected_at,
        "n_points": len(points),
        "summary": {
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "mean": round(sum(values) / len(values), 3) if values else None,
        },
        "points": points if as_celsius else [
            {**p, "value": p["t2m_k"], "unit": "K"} for p in points
        ],
    }
