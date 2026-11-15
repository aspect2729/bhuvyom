"""Engine 3 (long-term branch) — climate PROJECTIONS from NASA NEX-GDDP-CMIP6.

This is not a forecast from BhuVyom's own models: it summarises published, bias-corrected and
downscaled CMIP6 model runs (Thrasher et al. 2022) for the Bengaluru grid cell, following IPCC AR6
conventions: change relative to a 1995–2014 baseline, 20-year windows, multi-model median and range.

Inputs: backend/data/processed/nex_gddp_cmip6/annual.jsonl  (scripts/acquire_cmip6.py)
"""

from __future__ import annotations

import csv
import json
import statistics as st
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from engines import prepared_data as pd_
from engines.contract import clean

PROC = pd_.DATA / "processed" / "nex_gddp_cmip6"
RAW = pd_.DATA / "raw" / "nex_gddp_cmip6"
SSPS = [("ssp126", "Sustainable", "SSP1-2.6"), ("ssp245", "Middle road", "SSP2-4.5"), ("ssp585", "Fossil-fuelled", "SSP5-8.5")]
BASELINE = (1995, 2014)
WINDOWS = {2030: (2021, 2040), 2050: (2041, 2060), 2070: (2061, 2080), 2100: (2081, 2100)}
MIN_YEARS_IN_WINDOW = 15
MIN_MODELS = 3

METRICS = [
    # id, var, field, label, unit, decimals, why
    ("air", "tas", "mean", "Mean air temperature", "°C", 1, "Annual mean 2 m air temperature."),
    ("hot", "tasmax", "days_ge_35C", "Hot days (max ≥ 35 °C)", "days", 0, "Days a year whose daily maximum air temperature reaches 35 °C."),
    ("rain", "pr", "total_mm", "Annual rainfall", "mm", 0, "Total precipitation per year."),
    ("heavy", "pr", "days_ge_64_5mm", "Heavy-rain days (≥ 64.5 mm)", "days", 1, "Days with ≥ 64.5 mm — the IMD 'heavy rainfall' threshold."),
    ("rh", "hurs", "mean", "Relative humidity", "%", 1, "Annual mean near-surface relative humidity."),
    ("wind", "sfcWind", "mean", "Wind speed", "m/s", 2, "Annual mean near-surface wind speed."),
]
NOT_CONNECTED = [
    ("lst", "Summer surface temperature", "CMIP6 does not project land surface temperature at city scale; MODIS gives only the observed past."),
    ("flood", "Flood-prone area", "Needs a hydrological/flood model forced by projected rainfall — not built."),
    ("gw", "Groundwater level", "Needs GRACE-FO history and a groundwater model — not connected."),
    ("green", "Green cover", "Land-use change is not projected by climate models; needs a land-use scenario model."),
    ("lake", "Lake water area", "Needs a lake water-balance model and land-use scenarios — not connected."),
    ("pm", "Fine particles (PM2.5)", "Air-quality projections need an emissions/chemistry model — not connected."),
]


class NotAcquired(FileNotFoundError):
    pass


@lru_cache(maxsize=1)
def _load() -> dict:
    path = PROC / "annual.jsonl"
    if not path.exists():
        raise NotAcquired("NASA NEX-GDDP-CMIP6 projections not acquired yet — run: cd backend && python -u scripts/acquire_cmip6.py")
    data: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))  # var -> model -> scenario -> year -> rec
    for line in path.read_text().splitlines():
        r = json.loads(line)
        data[r["var"]][r["model"]][r["scenario"]][r["year"]] = r
    cell = None
    for f in RAW.rglob("*.csv"):
        with f.open(encoding='utf-8-sig') as stream:
            rows = csv.reader(stream)
            header, row = next(rows, []), next(rows, [])
        names = [name.split('[')[0].strip().lower() for name in header]
        try:
            lat, lon = float(row[names.index('latitude')]), float(row[names.index('longitude')])
        except (ValueError, IndexError):
            continue
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            cell = {"lat": lat, "lon": lon}
            break
    return {"data": data, "cell": cell}


def _window(series: dict, a: int, b: int, field: str) -> float | None:
    vals = [series[y][field] for y in range(a, b + 1) if y in series and series[y].get(field) is not None]
    return sum(vals) / len(vals) if len(vals) >= MIN_YEARS_IN_WINDOW else None


def _ens(vals: list[float]) -> dict:
    return {"median": st.median(vals), "min": min(vals), "max": max(vals), "n_models": len(vals)} if vals else {"median": None, "min": None, "max": None, "n_models": 0}


def projections() -> dict:
    L = _load()
    data = L["data"]
    metrics, models_used = [], set()
    for mid, var, field, label, unit, dp, why in METRICS:
        per_model = data.get(var, {})
        base = {m: _window(s.get("historical", {}), *BASELINE, field) for m, s in per_model.items()}
        base = {m: v for m, v in base.items() if v is not None}
        if len(base) < MIN_MODELS:
            metrics.append({"id": mid, "label": label, "unit": unit, "available": False, "reason": f"Only {len(base)} model(s) with a 1995–2014 baseline (need ≥{MIN_MODELS})."})
            continue
        models_used |= set(base)
        out = {"id": mid, "label": label, "unit": unit, "decimals": dp, "why": why, "available": True, "var": var,
               "baseline": {k: clean(v, 3) for k, v in _ens(list(base.values())).items()}, "scenarios": {}}
        for ssp, _, _ in SSPS:
            sc = {"windows": {}, "trajectory": []}
            for yr, (a, b) in WINDOWS.items():
                absv, dv = [], []
                for m, b0 in base.items():
                    w = _window(per_model[m].get(ssp, {}), a, b, field)
                    if w is not None:
                        absv.append(w); dv.append(w - b0)
                sc["windows"][str(yr)] = {"period": f"{a}–{b}", "value": {k: clean(v, 3) for k, v in _ens(absv).items()},
                                          "delta": {k: clean(v, 3) for k, v in _ens(dv).items()}}
            for y in range(2025, 2101, 5):
                a, b = max(2015, y - 10), min(2100, y + 9)
                vals = []
                for m in base:
                    s = per_model[m].get(ssp, {})
                    yrs = [s[t][field] for t in range(a, b + 1) if t in s and s[t].get(field) is not None]
                    if len(yrs) >= min(MIN_YEARS_IN_WINDOW, b - a + 1):
                        vals.append(sum(yrs) / len(yrs))
                e = _ens(vals)
                sc["trajectory"].append({"year": y, "window": f"{a}–{b}", "median": clean(e["median"], 3), "min": clean(e["min"], 3), "max": clean(e["max"], 3), "n_models": e["n_models"]})
            out["scenarios"][ssp] = sc
        metrics.append(out)
    for mid, label, reason in NOT_CONNECTED:
        metrics.append({"id": mid, "label": label, "available": False, "reason": reason})
    return {
        "data_type": "predicted", "kind": "climate_projection",
        "source": {"product": "NASA NEX-GDDP-CMIP6", "resolution": "0.25° (~25 km) daily, bias-corrected & downscaled", "reference": "Thrasher et al. 2022, Sci. Data 9:262",
                   "server": "NCCS THREDDS", "grid_cell": L["cell"], "models": sorted(models_used)},
        "scenarios": [{"id": s, "label": l, "code": c} for s, l, c in SSPS],
        "baseline_period": f"{BASELINE[0]}–{BASELINE[1]}", "windows": {str(k): f"{a}–{b}" for k, (a, b) in WINDOWS.items()},
        "method": "Per model: 20-year window mean minus 1995–2014 mean of that model; summary = multi-model median and min–max range (IPCC AR6 convention). Trajectory = rolling ~20-year window means.",
        "metrics": metrics,
        "limitations": ["One 0.25° grid cell represents Bengaluru — city-scale, not neighbourhood-scale.", "Range = spread of the models used (small ensemble), not a full likelihood.",
                        "Projections depend on the emissions pathway; they are not forecasts of a particular year.", "Urban effects (heat island, land-use change) are not represented in CMIP6."],
    }


def status() -> dict:
    p = PROC / "annual.jsonl"
    if not p.exists():
        return {"acquired": False, "how": "cd backend && python -u scripts/acquire_cmip6.py"}
    n = sum(1 for _ in p.open())
    return {"acquired": True, "records": n}
