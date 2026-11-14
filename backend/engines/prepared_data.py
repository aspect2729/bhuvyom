"""Engine 1 (acquisition & preparation) — read-only interface to PREPARED datasets.

Downstream engines read observations only through these functions. Nothing here
fabricates or interpolates values: fill values / QC-rejected pixels become None/NaN.

Datasets (all acquired for real by backend/scripts or the POWER adapter):
  * NASA POWER monthly (MERRA-2 meteorology; SRB/CERES solar) — 25 native cells, 1981–2025
  * MOD11A1.061 LST day/night, QC-filtered, BBMP window, Jan–Mar 2024 (~1 km sinusoidal)
  * GPM IMERG V07 daily (GPM_3IMERGDF.07), 0.1° cells over BBMP, Jun–Oct 2024
  * SRTMGL1.003 elevation (~30 m), aggregated (area mean) onto MODIS pixels for analysis
"""

from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from config.settings import get_settings

from config.settings import BACKEND_ROOT

_dr = Path(get_settings().data_root)
# Empty BHUVYOM_DATA_ROOT in .env resolves to "." — fall back to backend/data.
DATA = _dr if _dr.is_absolute() else (BACKEND_ROOT / "data" if str(_dr) in ("", ".") else BACKEND_ROOT / _dr)
POWER_MONTHLY_DIR = DATA / "raw" / "nasa_power_monthly"
MODIS_DIR = DATA / "processed" / "modis_lst_mod11a1" / "processed"
GPM_DIR = DATA / "processed" / "gpm_imerg_v07_daily" / "raw_ascii"
SRTM_ELEV = DATA / "processed" / "srtm" / "srtm_elevation_m_bbmp.tif"
REPORT = DATA / "processed" / "bbmp_e2e_acquisition_report.json"
BOUNDARY = DATA / "boundaries" / "bengaluru_bbmp.geojson"

# NASA POWER meteorological grid (POWER docs, Data Sources): 0.5° lat × 0.625° lon
POWER_DLAT, POWER_DLON = 0.5, 0.625
CITY_CELL = "p_13.000_77.500"

# MODIS sinusoidal grid constants (MODIS Land tile grid; sphere R = 6371007.181 m)
R_SIN = 6371007.181
TILE_M = 1111950.5197665
PIX_1KM = TILE_M / 1200.0
X_MIN, Y_MAX = -20015109.354, 10007554.677


def _ring(w: float, s: float, e: float, n: float, nd: int = 6) -> list[list[float]]:
    return [[round(w, nd), round(s, nd)], [round(e, nd), round(s, nd)], [round(e, nd), round(n, nd)], [round(w, nd), round(n, nd)], [round(w, nd), round(s, nd)]]


def load_boundary() -> dict[str, Any]:
    return json.loads(BOUNDARY.read_text())


# ---------------------------------------------------------------- NASA POWER monthly
@lru_cache(maxsize=1)
def power_monthly() -> dict[str, Any]:
    files = sorted(POWER_MONTHLY_DIR.glob("monthly_*_1981_2025.json"))
    if not files:
        raise FileNotFoundError(f"No NASA POWER monthly files in {POWER_MONTHLY_DIR}")
    cells, series, meta, sources = [], {}, {}, set()
    for f in files:
        raw = json.loads(f.read_text())
        lat, lon = (float(x) for x in re.findall(r"monthly_([\d.]+)_([\d.]+)_", f.name)[0])
        cid = f"p_{lat:.3f}_{lon:.3f}"
        cells.append({"id": cid, "center": [lon, lat], "polygon": _ring(lon - POWER_DLON / 2, lat - POWER_DLAT / 2, lon + POWER_DLON / 2, lat + POWER_DLAT / 2), "is_city_cell": cid == CITY_CELL})
        fill = float(raw["header"].get("fill_value", -999.0))
        sources.update(raw["header"].get("sources", []))
        for var, vals in raw["properties"]["parameter"].items():
            m = raw["parameters"][var]
            meta[var] = {"unit": m["units"], "long_name": m["longname"]}
            keys = sorted(k for k in vals if not k.endswith("13"))  # YYYY13 = annual, excluded
            v = [None if (vals[k] is None or float(vals[k]) == fill) else float(vals[k]) for k in keys]
            series.setdefault(var, {})[cid] = v
            months = [f"{k[:4]}-{k[4:]}" for k in keys]
    return {"cells": cells, "months": months, "series": series, "meta": meta, "header_sources": sorted(sources), "api_version": raw["header"].get("api", {}).get("version"), "files": [f.name for f in files]}


# ---------------------------------------------------------------- MODIS LST
def _sin_to_lonlat(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lat = y / R_SIN
    lon = x / (R_SIN * np.cos(lat))
    return np.degrees(lon), np.degrees(lat)


@lru_cache(maxsize=1)
def modis_lst() -> dict[str, Any]:
    # Prefer the two-tier QC product (scripts/reprocess_mod11a1_qc.py): strict QA=00 rejected the
    # whole urban core (QA=01 over built-up surfaces). Fall back to the strict-only first pass.
    npz = MODIS_DIR / "mod11a1_lst_C_bbmp_qc2k.npz"
    qc_rule = "QA bits 0–1 == 00, or == 01 with LST error flag (bits 6–7) ≤ 2 K"
    if not npz.exists():
        npz = MODIS_DIR / "mod11a1_lst_C_bbmp.npz"
        qc_rule = "QA bits 0–1 == 00 only (strict; urban core largely rejected)"
    if not npz.exists():
        raise FileNotFoundError("MOD11A1 LST not acquired (run backend/scripts/acquire_bbmp_e2e.py)")
    z = np.load(npz, allow_pickle=True)
    rep = json.loads(REPORT.read_text())["products"]["modis_lst_mod11a1"]
    w = rep["window_indices"]
    gran = rep["daily"][0]["granule"]
    h, v = (int(x) for x in re.search(r"h(\d\d)v(\d\d)", gran).groups())
    day, night = np.asarray(z["LST_Day_C"], float), np.asarray(z["LST_Night_C"], float)
    nr, nc = day.shape[1:]
    assert nr == w["row1"] - w["row0"] + 1 and nc == w["col1"] - w["col0"] + 1, "window/array mismatch"
    rows = np.arange(w["row0"], w["row1"] + 2)
    cols = np.arange(w["col0"], w["col1"] + 2)
    xe = X_MIN + h * TILE_M + cols * PIX_1KM
    ye = Y_MAX - v * TILE_M - rows * PIX_1KM
    XX, YY = np.meshgrid(xe, ye)
    LON, LAT = _sin_to_lonlat(XX, YY)
    cells = []
    for i in range(nr):
        for j in range(nc):
            ring = [[LON[i + 1, j], LAT[i + 1, j]], [LON[i + 1, j + 1], LAT[i + 1, j + 1]], [LON[i, j + 1], LAT[i, j + 1]], [LON[i, j], LAT[i, j]]]
            ring = [[round(float(a), 6), round(float(b), 6)] for a, b in ring]
            ring.append(ring[0])
            cx = X_MIN + h * TILE_M + (w["col0"] + j + 0.5) * PIX_1KM
            cy = Y_MAX - v * TILE_M - (w["row0"] + i + 0.5) * PIX_1KM
            clon, clat = _sin_to_lonlat(np.array(cx), np.array(cy))
            cells.append({"id": f"m_{i}_{j}", "row": i, "col": j, "polygon": ring, "center": [round(float(clon), 6), round(float(clat), 6)]})
    report = {k: rep[k] for k in ("product", "native_resolution", "scale_factor", "units_after_scale", "note")}
    report["qc_filter"] = qc_rule
    report["source_file"] = npz.name
    tier_day = np.asarray(z["tier_day"]) if "tier_day" in z.files else np.where(np.isfinite(day), 1, 0)
    tier_night = np.asarray(z["tier_night"]) if "tier_night" in z.files else np.where(np.isfinite(night), 1, 0)
    return {"dates": [str(d) for d in z["dates"]], "day": day, "night": night, "tier_day": tier_day, "tier_night": tier_night, "cells": cells, "shape": (nr, nc), "tile": f"h{h:02d}v{v:02d}", "report": report}


# ---------------------------------------------------------------- GPM IMERG daily
@lru_cache(maxsize=1)
def gpm_daily() -> dict[str, Any]:
    files = sorted(GPM_DIR.glob("*_precip_subset.ascii"))
    if not files:
        raise FileNotFoundError("GPM IMERG daily not acquired")
    grid: dict[tuple[float, float], dict[str, float | None]] = {}
    dates, granules = [], []
    for f in files:
        txt = f.read_text().splitlines()
        d = f.name[:8]
        date = f"{d[:4]}-{d[4:6]}-{d[6:]}"
        lats = None
        rows: dict[float, list[float]] = {}
        for line in txt:
            if line.startswith("Dataset:"):
                granules.append(line.split(":", 1)[1].strip())
            m = re.match(r"precipitation\.precipitation\[.*\]\[precipitation\.lon=([\d.]+)\],\s*(.*)", line)
            if m:
                rows[float(m.group(1))] = [float(x) for x in m.group(2).split(",")]
            elif line.startswith("precipitation.lat,"):
                lats = [float(x) for x in line.split(",")[1:]]
        if not rows or lats is None:
            continue
        dates.append(date)
        for lon, vals in rows.items():
            for lat, val in zip(lats, vals):
                grid.setdefault((lat, lon), {})[date] = None if val < 0 else val  # negative = fill
    cells, values = [], {}
    for (lat, lon) in sorted(grid):
        cid = f"g_{lat:.2f}_{lon:.2f}"
        cells.append({"id": cid, "center": [lon, lat], "polygon": _ring(lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05)})
        values[cid] = [grid[(lat, lon)].get(d) for d in dates]
    return {"dates": dates, "cells": cells, "values": values, "granules": granules, "product": "GPM_3IMERGDF.07 (IMERG Final daily, V07B)", "units": "mm/day"}


# ---------------------------------------------------------------- SRTM on MODIS pixels
@lru_cache(maxsize=1)
def srtm_on_modis() -> dict[str, Any]:
    """Area-mean SRTM elevation inside each MODIS pixel (aggregation 30 m → ~1 km; no new detail created)."""
    import rasterio

    cache = DATA / "processed" / "derived" / "srtm_mean_on_mod11a1.npz"
    lst = modis_lst()
    nr, nc = lst["shape"]
    if cache.exists():
        z = np.load(cache)
        return {"mean": z["mean"], "count": z["count"], "nr": nr, "nc": nc}
    with rasterio.open(SRTM_ELEV) as src:
        elev = src.read(1).astype(float)
        if src.nodata is not None:
            elev[elev == src.nodata] = np.nan
        tr = src.transform
    rr, cc = np.mgrid[0 : elev.shape[0], 0 : elev.shape[1]]
    lon = tr.c + (cc + 0.5) * tr.a
    lat = tr.f + (rr + 0.5) * tr.e
    rep = json.loads(REPORT.read_text())["products"]["modis_lst_mod11a1"]["window_indices"]
    h, v = (int(x) for x in re.search(r"h(\d\d)v(\d\d)", lst["tile"]).groups())
    x = np.radians(lon) * R_SIN * np.cos(np.radians(lat))
    y = np.radians(lat) * R_SIN
    col = np.floor((x - (X_MIN + h * TILE_M)) / PIX_1KM).astype(int) - rep["col0"]
    row = np.floor(((Y_MAX - v * TILE_M) - y) / PIX_1KM).astype(int) - rep["row0"]
    ok = (row >= 0) & (row < nr) & (col >= 0) & (col < nc) & np.isfinite(elev)
    idx = row[ok] * nc + col[ok]
    s = np.bincount(idx, weights=elev[ok], minlength=nr * nc)
    n = np.bincount(idx, minlength=nr * nc)
    mean = np.where(n > 0, s / np.maximum(n, 1), np.nan).reshape(nr, nc)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, mean=mean, count=n.reshape(nr, nc))
    return {"mean": mean, "count": n.reshape(nr, nc), "nr": nr, "nc": nc}


def availability() -> dict[str, Any]:
    out = {}
    for name, fn in (("nasa_power_monthly", power_monthly), ("modis_lst_mod11a1", modis_lst), ("gpm_imerg_v07_daily", gpm_daily)):
        try:
            d = fn()
            out[name] = {"available": True, "n_cells": len(d["cells"]), "n_times": len(d.get("months") or d.get("dates"))}
        except Exception as exc:  # noqa: BLE001
            out[name] = {"available": False, "reason": str(exc)}
    out["srtm"] = {"available": SRTM_ELEV.exists()}
    out["modis_vi_mod13q1"] = {"available": NDVI_NPZ.exists()}
    return out


# ---------------------------------------------------------------- MODIS NDVI (MOD13Q1, 250 m)
NDVI_NPZ = DATA / "processed" / "modis_vi_mod13q1" / "processed" / "mod13q1_ndvi_bbmp.npz"
PIX_250 = TILE_M / 4800.0


@lru_cache(maxsize=1)
def modis_ndvi() -> dict[str, Any]:
    if not NDVI_NPZ.exists():
        raise FileNotFoundError("MOD13Q1 NDVI not acquired")
    z = np.load(NDVI_NPZ, allow_pickle=True)
    r0, r1, c0, c1 = (int(z[k]) for k in ("row0", "row1", "col0", "col1"))
    ndvi = np.asarray(z["NDVI"], float)
    h, v = 25, 7  # same tile as MOD11A1 (granule names h25v07)
    nr, nc = ndvi.shape[1:]
    rows = np.arange(r0, r1 + 2)
    cols = np.arange(c0, c1 + 2)
    XX, YY = np.meshgrid(X_MIN + h * TILE_M + cols * PIX_250, Y_MAX - v * TILE_M - rows * PIX_250)
    LON, LAT = _sin_to_lonlat(XX, YY)
    cells = []
    for i in range(nr):
        for j in range(nc):
            ring = [[round(float(LON[a, b]), 6), round(float(LAT[a, b]), 6)] for a, b in ((i + 1, j), (i + 1, j + 1), (i, j + 1), (i, j))]
            ring.append(ring[0])
            cells.append({"id": f"n_{i}_{j}", "row": i, "col": j, "polygon": ring,
                          "center": [round(float((LON[i, j] + LON[i + 1, j + 1]) / 2), 6), round(float((LAT[i, j] + LAT[i + 1, j + 1]) / 2), 6)]})
    return {"dates": [str(d) for d in z["dates"]], "ndvi": ndvi, "cells": cells, "window": (r0, r1, c0, c1), "shape": (nr, nc)}


@lru_cache(maxsize=1)
def ndvi_on_modis_1km(min_valid: int = 12) -> np.ndarray:
    """Mean NDVI (over all composites) aggregated from the 4×4 nested 250 m pixels of each 1 km MODIS pixel.

    MOD13Q1 (4800²) and MOD11A1 (1200²) share the tile grid, so 250 m pixels nest exactly — pure aggregation.
    A 1 km value requires ≥ min_valid of 16 sub-pixels inside the acquired 250 m window; otherwise NaN.
    """
    nd = modis_ndvi()
    r0, _, c0, _ = nd["window"]
    with np.errstate(all="ignore"):
        mean250 = np.nanmean(nd["ndvi"], axis=0)
    rep = json.loads(REPORT.read_text())["products"]["modis_lst_mod11a1"]["window_indices"]
    nr, nc = modis_lst()["shape"]
    out = np.full((nr, nc), np.nan)
    for i in range(nr):
        for j in range(nc):
            R, C = (rep["row0"] + i) * 4 - r0, (rep["col0"] + j) * 4 - c0
            if R < 0 or C < 0 or R + 4 > mean250.shape[0] or C + 4 > mean250.shape[1]:
                continue
            blk = mean250[R : R + 4, C : C + 4]
            if np.isfinite(blk).sum() >= min_valid:
                out[i, j] = float(np.nanmean(blk))
    return out
