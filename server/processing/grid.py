"""Coverage grids aligned to NASA POWER native meteorological spacing.

NASA POWER data sources (https://power.larc.nasa.gov/docs/methodology/data/sources/):
  - Meteorological (MERRA-2 / GEOS-IT): 1/2° latitude × 5/8° longitude
    i.e. 0.5° × 0.625°
  - Solar (CERES SYN1deg): 1° × 1°

Also documented in the POWER API tutorial:
https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/
  "0.5 x 0.625 degree resolution for meteorology and 1 x 1 for solar parameters."

Most parameters requested by this app are meteorological, so the map grid uses
the MERRA-2 spacing. ALLSKY_SFC_SW_DWN is native at 1°×1° (coarser).

For "Be An Earth System Trend Detective" we need enough cells for spatial
comparison, so the default map area is a wider REGION around Bengaluru.
The original city bbox is retained as BENGALURU_CITY for highlighting.
"""

from __future__ import annotations

# --- Named constants (cited above) ---
POWER_METEO_LAT_SPACING_DEG = 0.5
POWER_METEO_LON_SPACING_DEG = 0.625
POWER_SOLAR_LAT_SPACING_DEG = 1.0
POWER_SOLAR_LON_SPACING_DEG = 1.0

# Wider region (enough POWER cells for spatial trend context).
REGION = {
    "lat_min": 12.0,
    "lat_max": 14.0,
    "lon_min": 76.5,
    "lon_max": 78.5,
}

# Original city bbox (typically one meteo cell) — keep for highlighting.
BENGALURU_CITY = {
    "lat_min": 12.80,
    "lat_max": 13.15,
    "lon_min": 77.45,
    "lon_max": 77.80,
}

# Backwards-compatible aliases (city).
BENGALURU_LAT_MIN = BENGALURU_CITY["lat_min"]
BENGALURU_LAT_MAX = BENGALURU_CITY["lat_max"]
BENGALURU_LON_MIN = BENGALURU_CITY["lon_min"]
BENGALURU_LON_MAX = BENGALURU_CITY["lon_max"]

AREAS = {
    "region": REGION,
    "city": BENGALURU_CITY,
}

# MERRA-2-style global alignment used by POWER meteorology:
# latitudes at multiples of 0.5° from -90..90; longitudes at -180 + k*0.625.
_LAT_ORIGIN = -90.0
_LON_ORIGIN = -180.0


def _aligned_centers(origin: float, spacing: float, lo: float, hi: float) -> list[float]:
    """Return grid centers whose cell footprints intersect [lo, hi]."""
    half = spacing / 2.0
    start_c = origin + spacing * ((lo - half - origin) // spacing)
    centers: list[float] = []
    c = start_c
    while c <= hi + half + 1e-9:
        cell_lo = c - half
        cell_hi = c + half
        if cell_hi >= lo - 1e-12 and cell_lo <= hi + 1e-12:
            centers.append(round(c, 10))
        c += spacing
        if len(centers) > 10_000:
            raise RuntimeError("Grid generation diverged")
    return centers


def cell_bounds(lat: float, lon: float) -> dict[str, float]:
    """Axis-aligned footprint for a meteo cell centre."""
    half_lat = POWER_METEO_LAT_SPACING_DEG / 2.0
    half_lon = POWER_METEO_LON_SPACING_DEG / 2.0
    return {
        "south": lat - half_lat,
        "north": lat + half_lat,
        "west": lon - half_lon,
        "east": lon + half_lon,
    }


def cell_polygon_corners(lat: float, lon: float) -> list[list[float]]:
    """Return closed ring of [lon, lat] corners (SW→SE→NE→NW→SW)."""
    b = cell_bounds(lat, lon)
    return [
        [b["west"], b["south"]],
        [b["east"], b["south"]],
        [b["east"], b["north"]],
        [b["west"], b["north"]],
        [b["west"], b["south"]],
    ]


def grid_cells_for_bbox(lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> list[dict]:
    """Grid cells whose footprints intersect the given bbox."""
    lats = _aligned_centers(
        _LAT_ORIGIN,
        POWER_METEO_LAT_SPACING_DEG,
        lat_min,
        lat_max,
    )
    lons = _aligned_centers(
        _LON_ORIGIN,
        POWER_METEO_LON_SPACING_DEG,
        lon_min,
        lon_max,
    )
    cells: list[dict] = []
    for lat in lats:
        for lon in lons:
            cells.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "bounds": cell_bounds(lat, lon),
                    "polygon": cell_polygon_corners(lat, lon),
                }
            )
    return cells


def resolve_area(area: str = "region") -> dict:
    key = (area or "region").strip().lower()
    if key not in AREAS:
        raise ValueError(f"Unknown area {area!r}; expected one of {sorted(AREAS)}")
    return {"name": key, **AREAS[key]}


def grid_cells(area: str = "region") -> list[dict]:
    """Cells for area=region|city (default region)."""
    bbox = resolve_area(area)
    return grid_cells_for_bbox(
        bbox["lat_min"],
        bbox["lat_max"],
        bbox["lon_min"],
        bbox["lon_max"],
    )


def bengaluru_grid_cells() -> list[dict]:
    """Backwards-compatible: city bbox cells."""
    return grid_cells("city")


def grid_metadata(area: str = "region") -> dict:
    bbox = resolve_area(area)
    return {
        "area": bbox["name"],
        "meteo_spacing_deg": {
            "lat": POWER_METEO_LAT_SPACING_DEG,
            "lon": POWER_METEO_LON_SPACING_DEG,
        },
        "solar_spacing_deg": {
            "lat": POWER_SOLAR_LAT_SPACING_DEG,
            "lon": POWER_SOLAR_LON_SPACING_DEG,
        },
        "bbox": {
            "lat_min": bbox["lat_min"],
            "lat_max": bbox["lat_max"],
            "lon_min": bbox["lon_min"],
            "lon_max": bbox["lon_max"],
        },
        "city_bbox": dict(BENGALURU_CITY),
        "citation": (
            "NASA POWER Data Sources: meteorological 0.5°×0.625° (MERRA-2/GEOS-IT); "
            "solar 1°×1° (CERES). "
            "https://power.larc.nasa.gov/docs/methodology/data/sources/"
        ),
    }


if __name__ == "__main__":
    for name in ("region", "city"):
        cells = grid_cells(name)
        print(f"=== area={name} cell_count={len(cells)} ===")
        for c in cells:
            print(f"  ({c['lat']}, {c['lon']}) bounds={c['bounds']}")
