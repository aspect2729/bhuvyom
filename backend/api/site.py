"""Public-website summary endpoint: real values for the 'Bengaluru From Orbit' landing page.

Everything here is read from engine outputs / prepared observations — no sample values.
Missing data is returned as null and labelled in the UI.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from engines import prepared_data as pd_
from engines.analysis import service as analysis
from engines.contract import FeasibilityError, clean
from engines.simulation import service as simulation

router = APIRouter(tags=["site"])
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _mlabel(ym: str) -> str:
    return f"{MONTHS[int(ym[5:7]) - 1]} {ym[:4]}"


def _power_layer(var: str, label: str) -> dict[str, Any]:
    pm = pd_.power_monthly()
    i = len(pm["months"]) - 1
    while i > 0 and all(pm["series"][var][c["id"]][i] is None for c in pm["cells"]):
        i -= 1
    unit = pm["meta"][var]["unit"]
    unit = "°C" if unit == "C" else unit
    cells = [{"id": c["id"], "polygon": c["polygon"], "center": c["center"], "v": clean(pm["series"][var][c["id"]][i], 2)} for c in pm["cells"]]
    city = next(c for c in cells if c["id"] == pd_.CITY_CELL)
    return {"label": label, "unit": unit, "period": f"{_mlabel(pm['months'][i])} · Monthly mean", "source": f"NASA POWER · {var} (MERRA-2)",
            "resolution": "0.5° × 0.625° (~55 km) — one cell covers all of Bengaluru", "fit": "region", "cells": cells,
            "city_value": city["v"], "period_short": _mlabel(pm["months"][i])}


def _lst_layer() -> dict[str, Any]:
    d = pd_.modis_lst()
    with np.errstate(all="ignore"):
        m = np.nanmean(d["day"], 0)
        n = np.isfinite(d["day"]).sum(0)
    m[n < 10] = np.nan
    cells = [{"id": c["id"], "polygon": c["polygon"], "center": c["center"], "v": clean(m[c["row"], c["col"]], 2)} for c in d["cells"]]
    return {"label": "Land surface", "unit": "°C", "period": "Jan–Mar 2024 · Clear-sky daytime mean", "source": "MODIS · MOD11A1.061",
            "resolution": "~1 km", "fit": "city", "cells": cells, "city_value": clean(float(np.nanmean(m)), 1), "period_short": "Jan–Mar 2024"}


def _gpm_layer() -> dict[str, Any]:
    g = pd_.gpm_daily()
    months = sorted({d[:7] for d in g["dates"]})
    last = months[-1]
    idx = [i for i, d in enumerate(g["dates"]) if d.startswith(last)]
    ndays = int(last[:4]) % 4 == 0 and last[5:] == "02" and 29 or {"01": 31, "02": 28, "03": 31, "04": 30, "05": 31, "06": 30, "07": 31, "08": 31, "09": 30, "10": 31, "11": 30, "12": 31}[last[5:]]
    cells, tot = [], []
    for c in g["cells"]:
        vals = [g["values"][c["id"]][i] for i in idx]
        ok = len(vals) == ndays and all(v is not None for v in vals)  # monthly total only when every day is present
        v = clean(sum(vals), 1) if ok else None
        cells.append({"id": c["id"], "polygon": c["polygon"], "center": c["center"], "v": v})
        if v is not None:
            tot.append(v)
    return {"label": "Precipitation", "unit": "mm", "period": f"{_mlabel(last)} · Monthly total", "source": "GPM IMERG V07 Final (daily)",
            "resolution": "0.1° (~11 km)", "fit": "city", "cells": cells, "city_value": clean(float(np.mean(tot)), 0) if tot else None, "period_short": _mlabel(last)}


@lru_cache(maxsize=1)
def _summary() -> dict[str, Any]:
    pm = pd_.power_monthly()
    layers = {"air": _power_layer("T2M", "Air temperature"), "lst": _lst_layer(), "rain": _gpm_layer(),
              "rh": _power_layer("RH2M", "Humidity"), "wind": _power_layer("WS2M", "Wind")}
    for lay in layers.values():
        vs = [c["v"] for c in lay["cells"] if c["v"] is not None]
        lay["lo"], lay["hi"] = (min(vs), max(vs)) if vs else (None, None)
    solar, cloud = _power_layer("ALLSKY_SFC_SW_DWN", "Solar radiation"), _power_layer("CLOUD_AMT", "Cloud cover")
    readings = {k: {"value": v["city_value"], "unit": v["unit"], "period": v["period_short"]} for k, v in layers.items()}
    readings["solar"] = {"value": solar["city_value"], "unit": "kWh/m²/day", "period": solar["period_short"]}
    readings["cloud"] = {"value": cloud["city_value"], "unit": "%", "period": cloud["period_short"]}

    # Two temperatures, 2024: air (city cell, POWER) and land surface (BBMP-window clear-sky monthly mean, MODIS)
    air = [clean(pm["series"]["T2M"][pd_.CITY_CELL][pm["months"].index(f"2024-{m:02d}")], 2) for m in range(1, 13)]
    d = pd_.modis_lst()
    lst = []
    for m in range(1, 13):
        idx = [i for i, t in enumerate(d["dates"]) if t.startswith(f"2024-{m:02d}")]
        lst.append(clean(float(np.nanmean(d["day"][idx])), 2) if idx else None)

    sim = simulation.run(0.6, 0.8, "C", 0.2, forcing="observed_gpm", persist=False)
    diff = [v for v in sim.grid.fields["total_difference"].values.values() if v is not None]
    lo = [v for v in sim.grid.fields["diff_ens_low"].values.values() if v is not None]
    hi = [v for v in sim.grid.fields["diff_ens_high"].values.values() if v is not None]
    trend = analysis.trends("T2M")
    city_attr = trend.grid.cell_attributes[pd_.CITY_CELL]
    return {
        "layers": layers, "readings": readings,
        "compare": {"year": 2024, "air": air, "lst": lst, "air_source": "NASA POWER T2M · Bengaluru cell", "lst_source": "MODIS MOD11A1 · BBMP clear-sky daytime mean"},
        "runoff": {"baseline": 0.6, "scenario": 0.8, "period": f"{sim.temporal_coverage['start']} – {sim.temporal_coverage['end']}", "mean_extra_mm": clean(float(np.mean(diff)), 0),
                   "ens_low": clean(min(lo), 0), "ens_high": clean(max(hi), 0), "validation": sim.validation["status"]},
        "trend": {"slope": city_attr.get("slope_per_decade"), "p_bh": city_attr.get("p_bh"), "significant": city_attr.get("significant_bh")},
    }


@router.get("/api/site/summary")
def site_summary() -> dict[str, Any]:
    return _summary()


@router.get("/api/site/sim/live")
def site_sim_live(region: str = Query("ka", pattern="^(ka|blr)$")):
    """Live Simulation-map fields: NASA GES DISC MERRA-2 M2T1NXSLV (Earthdata OPeNDAP)."""
    from engines import site_sim

    try:
        return site_sim.live(region)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"error": "sim_live_unavailable", "reason": str(exc)})


@router.get("/api/site/sim/record")
def site_sim_record():
    """Annual Bengaluru record from verified GES DISC rows in Supabase."""
    from engines import site_sim

    try:
        return site_sim.record()
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"error": "sim_record_unavailable", "reason": str(exc)})


@router.get("/api/site/runoff")
def site_runoff(
    scenario_impervious: float = Query(0.8, ge=0, le=1),
    baseline_impervious: float = Query(0.6, ge=0, le=1),
    forcing: str = Query("auto"),
    persist: bool = Query(True),
):
    try:
        sim = simulation.run(baseline_impervious, scenario_impervious, "C", 0.2, forcing=forcing, persist=persist)
    except FeasibilityError as exc:
        return JSONResponse(status_code=422, content=exc.to_dict())
    diff = [v for v in sim.grid.fields["total_difference"].values.values() if v is not None]
    lo = [v for v in sim.grid.fields["diff_ens_low"].values.values() if v is not None]
    hi = [v for v in sim.grid.fields["diff_ens_high"].values.values() if v is not None]
    out = {
        "mean_extra_mm": clean(float(np.mean(diff)), 0),
        "ens_low": clean(min(lo), 0),
        "ens_high": clean(max(hi), 0),
        "period": f"{sim.temporal_coverage['start']} – {sim.temporal_coverage['end']}",
        "validation": sim.validation["status"],
        "forcing": (sim.configuration or {}).get("forcing"),
        "forcing_source_kind": (sim.configuration or {}).get("forcing_source_kind"),
    }
    if (sim.configuration or {}).get("persistence"):
        out["persistence"] = sim.configuration["persistence"]
    return out
