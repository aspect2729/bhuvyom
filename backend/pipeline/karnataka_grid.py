"""Karnataka spatial grids at each product's native resolution.

POWER meteorology is 0.5° × 0.625°. We never invent finer cells.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from shapely.geometry import Point, box, shape

from config.settings import BACKEND_ROOT, get_settings

POWER_DLAT = 0.5
POWER_DLON = 0.625
# Open-Meteo archive/forecast points — keep coarse to respect rate limits & native skill
OM_DLAT = 0.5
OM_DLON = 0.5


def _boundary_path() -> Path:
    settings = get_settings()
    root = settings.data_root if settings.data_root.is_absolute() else BACKEND_ROOT / "data"
    return root / "boundaries" / "karnataka.geojson"


@lru_cache(maxsize=1)
def karnataka_polygon():
    path = _boundary_path()
    data = json.loads(path.read_text(encoding="utf-8"))
    feat = data["features"][0] if data.get("type") == "FeatureCollection" else data
    return shape(feat["geometry"])


def power_grid_cells() -> list[dict[str, Any]]:
    """Native POWER meteorological cells intersecting Karnataka."""
    geom = karnataka_polygon()
    minx, miny, maxx, maxy = geom.bounds
    lats = np.arange(np.floor(miny / POWER_DLAT) * POWER_DLAT, np.ceil(maxy / POWER_DLAT) * POWER_DLAT + 1e-9, POWER_DLAT)
    lons = np.arange(np.floor(minx / POWER_DLON) * POWER_DLON, np.ceil(maxx / POWER_DLON) * POWER_DLON + 1e-9, POWER_DLON)
    cells: list[dict[str, Any]] = []
    for lat in lats:
        for lon in lons:
            lat_f, lon_f = float(lat), float(lon)
            cell = box(lon_f - POWER_DLON / 2, lat_f - POWER_DLAT / 2, lon_f + POWER_DLON / 2, lat_f + POWER_DLAT / 2)
            if not cell.intersects(geom):
                continue
            cells.append(
                {
                    "grid_id": f"power_{lat_f:.3f}_{lon_f:.3f}",
                    "lat": round(lat_f, 3),
                    "lon": round(lon_f, 3),
                    "resolution": "0.5x0.625",
                    "provider": "nasa_power",
                }
            )
    return cells


def open_meteo_grid_cells() -> list[dict[str, Any]]:
    """0.5° point sample across Karnataka for Open-Meteo (archive + forecast)."""
    geom = karnataka_polygon()
    minx, miny, maxx, maxy = geom.bounds
    lats = np.arange(np.floor(miny / OM_DLAT) * OM_DLAT + OM_DLAT / 2, maxy + 1e-9, OM_DLAT)
    lons = np.arange(np.floor(minx / OM_DLON) * OM_DLON + OM_DLON / 2, maxx + 1e-9, OM_DLON)
    cells: list[dict[str, Any]] = []
    for lat in lats:
        for lon in lons:
            lat_f, lon_f = float(lat), float(lon)
            if not geom.contains(Point(lon_f, lat_f)) and not geom.intersects(Point(lon_f, lat_f).buffer(0.01)):
                # keep cells whose centre is inside, or within a tiny buffer of the boundary
                if not geom.distance(Point(lon_f, lat_f)) <= 0.15:
                    continue
            if not geom.contains(Point(lon_f, lat_f)):
                # prefer interior centres
                if geom.distance(Point(lon_f, lat_f)) > 0.05:
                    continue
            cells.append(
                {
                    "grid_id": f"om_{lat_f:.2f}_{lon_f:.2f}",
                    "lat": round(lat_f, 2),
                    "lon": round(lon_f, 2),
                    "resolution": "0.5x0.5_sample",
                    "provider": "open_meteo",
                }
            )
    return cells


def coverage_summary() -> dict[str, Any]:
    geom = karnataka_polygon()
    return {
        "bounds": geom.bounds,
        "power_cells": len(power_grid_cells()),
        "open_meteo_cells": len(open_meteo_grid_cells()),
    }
