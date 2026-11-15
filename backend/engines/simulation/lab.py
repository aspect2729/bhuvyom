"""Simulation Lab — single-storm (event) SCS-CN runoff, before vs after.

Event form of the same SCS-CN model as engines/simulation/scs_cn.py (USDA-NRCS NEH-630 Ch.10):
storm depth P = intensity [mm/h] × duration [h]. The SPATIAL SHAPE of the storm is taken from the
wettest observed GPM IMERG day over Bengaluru (cell depth / city-mean depth), so the map shows a
real storm footprint scaled to the chosen depth — not an invented pattern.
Permeable fraction p → impervious f = 1 − p → CN = f·98 + (1 − f)·CN_pervious.
"Today" uses an ASSUMED permeable fraction (no observed impervious-surface product is integrated).
"""

from __future__ import annotations

import json
from functools import lru_cache

import numpy as np

from engines import prepared_data as pd_
from engines.contract import FeasibilityError, clean
from engines.simulation.scs_cn import composite_cn, retention_mm, runoff_mm

HSG_CN = {"B": 69.0, "C": 79.0, "D": 84.0}
TODAY_PERMEABLE = 0.40  # assumption, shown as such in the UI


@lru_cache(maxsize=1)
def bbmp_area_km2() -> float:
    from pyproj import Geod

    g = Geod(ellps="WGS84")
    gj = pd_.load_boundary()
    geom = gj["features"][0]["geometry"] if "features" in gj else gj["geometry"]
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    total = 0.0
    for poly in polys:
        lon, lat = zip(*poly[0])
        a, _ = g.polygon_area_perimeter(lon, lat)
        total += abs(a)
        for hole in poly[1:]:
            lo, la = zip(*hole)
            total -= abs(g.polygon_area_perimeter(lo, la)[0])
    return total / 1e6


@lru_cache(maxsize=1)
def storm_pattern() -> dict:
    # Prefer Supabase daily precip wettest-day pattern when available
    try:
        from engines.simulation import db_forcing

        db = db_forcing.load_daily_precip()
        if db is not None:
            pat = db_forcing.wettest_day_pattern(db)
            if pat is not None:
                return pat
    except Exception:  # noqa: BLE001 — fall back to local GPM
        pass
    g = pd_.gpm_daily()
    arr = np.array([[np.nan if v is None else v for v in g["values"][c["id"]]] for c in g["cells"]], float)  # cells × days
    city_mean = np.nanmean(arr, 0)
    d = int(np.nanargmax(city_mean))
    pat = arr[:, d] / city_mean[d]
    return {"date": g["dates"][d], "city_mean_mm": float(city_mean[d]), "max_cell_mm": float(np.nanmax(arr[:, d])),
            "pattern": pat, "cells": g["cells"], "source": "gpm_imerg_v07_daily"}


def run(intensity_mm_h: float, duration_h: float, permeable: float, today_permeable: float = TODAY_PERMEABLE,
        soil_group: str = "C", lam: float = 0.2) -> dict:
    if not (0 < intensity_mm_h <= 200 and 0 < duration_h <= 24):
        raise FeasibilityError("Storm outside supported range", requirement="0 < intensity ≤ 200 mm/h, 0 < duration ≤ 24 h")
    if not (0 <= permeable <= 1 and 0 <= today_permeable <= 1):
        raise FeasibilityError("Permeable fraction must be 0–1", requirement="0 ≤ p ≤ 1")
    if soil_group not in HSG_CN or lam not in (0.05, 0.2):
        raise FeasibilityError("Unsupported soil group / λ", requirement="soil_group B/C/D, λ 0.05 or 0.2")
    sp = storm_pattern()
    depth = intensity_mm_h * duration_h
    P = depth * sp["pattern"]
    cnp = HSG_CN[soil_group]
    cn_b, cn_s = composite_cn(1 - today_permeable, cnp), composite_cn(1 - permeable, cnp)
    qb, qs = runoff_mm(P, cn_b, lam), runoff_mm(P, cn_s, lam)
    area = bbmp_area_km2()
    mb, ms = float(np.nanmean(qb)), float(np.nanmean(qs))
    # parameter ensemble on the scenario (soil group × λ)
    ens = [float(np.nanmean(runoff_mm(P, composite_cn(1 - permeable, c), l))) for c in HSG_CN.values() for l in (0.05, 0.2)]
    curve_p = np.arange(0, 201, 5.0)
    return {
        "inputs": {"intensity_mm_h": intensity_mm_h, "duration_h": duration_h, "storm_depth_mm": depth, "permeable": permeable,
                   "today_permeable": today_permeable, "soil_group": soil_group, "lambda": lam},
        "cells": [{"id": c["id"], "polygon": c["polygon"], "center": c["center"], "rain_mm": clean(p, 1), "today_mm": clean(b, 1), "scenario_mm": clean(s, 1)}
                  for c, p, b, s in zip(sp["cells"], P, qb, qs)],
        "results": {
            "runoff_today_mm": clean(mb, 1), "runoff_scenario_mm": clean(ms, 1),
            "change_pct": clean((ms - mb) / mb * 100 if mb > 0 else None, 0),
            "runoff_coeff_today": clean(mb / depth, 2), "runoff_coeff_scenario": clean(ms / depth, 2),
            "volume_today_mcm": clean(mb / 1000 * area * 1e6 / 1e6, 2), "volume_scenario_mcm": clean(ms / 1000 * area * 1e6 / 1e6, 2),
            "scenario_ensemble_mm": [clean(min(ens), 1), clean(max(ens), 1)],
            "bbmp_area_km2": clean(area, 0),
        },
        "curve": {"rain_mm": curve_p.tolist(), "today_mm": [clean(v, 2) for v in runoff_mm(curve_p, cn_b, lam)], "scenario_mm": [clean(v, 2) for v in runoff_mm(curve_p, cn_s, lam)]},
        "parameters": {"CN_pervious": cnp, "CN_today": clean(cn_b, 1), "CN_scenario": clean(cn_s, 1), "S_today_mm": clean(retention_mm(cn_b), 1),
                       "S_scenario_mm": clean(retention_mm(cn_s), 1), "Ia_today_mm": clean(lam * retention_mm(cn_b), 1), "Ia_scenario_mm": clean(lam * retention_mm(cn_s), 1)},
        "storm_shape": {
            "source": sp.get("source") or "GPM IMERG V07 Final daily",
            "date": sp["date"],
            "city_mean_mm": clean(sp["city_mean_mm"], 1),
            "max_cell_mm": clean(sp["max_cell_mm"], 1),
        },
        "data_type": "simulated", "validation": "not_validated",
        "assumptions": [f"Today's permeable share is an assumption ({today_permeable:.0%}); no impervious-surface product is integrated.",
                        "Storm footprint = wettest observed daily precip day (DB or GPM), rescaled to the chosen depth.", "AMC II antecedent moisture; no drainage, routing or lake storage."],
        "methodology": "SCS Curve Number, event form (USDA-NRCS NEH-630 Ch.10; TR-55)",
    }
