"""Engine 3 — Prediction service: feasibility checks, rolling-origin validation,
per-horizon model selection, empirical (split-conformal-style) intervals, forecast.

Protocol (scientific/VALIDATION_PROTOCOLS.md):
  * Calibration origins: Jan 2011 – Dec 2017 (models refit each January with data ≤ previous Dec)
  * Test origins:        Jan 2018 – Dec 2024 (same refit rule; targets ≤ Dec 2025)
  * Model per horizon h is SELECTED on calibration MAE only; test metrics are reported untouched.
  * Prediction intervals: quantiles of calibration residuals (obs − pred) of the selected model
    per horizon (Lei et al. 2018 split-conformal idea); empirical coverage reported on test.
  * Final forecast: models refit on all data ≤ last month; intervals from calibration+test residuals.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from engines import prepared_data as pd_
from engines.contract import EngineResult, FeasibilityError, Finding, FieldSpec, GridPayload, Tracer, clean
from engines.prediction.models import MAX_H, MODEL_IDS, SIMPLICITY, CellData, FittedSet

SUPPORTED = {"T2M": "air temperature (2 m)", "PRECTOTCORR": "precipitation (bias-corrected)"}
CAL_YEARS = range(2011, 2018)
TEST_YEARS = range(2018, 2025)
HISTORY_MONTHS = 48
MODEL_VERSION = "1.0.0"
RESULTS = pd_.DATA / "results"


def _ym(idx: int, y0: int = 1981) -> str:
    return f"{y0 + idx // 12}-{idx % 12 + 1:02d}"


def check_feasibility(var: str, horizon_months: int, frequency: str = "monthly") -> None:
    if var not in SUPPORTED:
        raise FeasibilityError(f"Prediction for '{var}' is not supported", requirement=f"one of {list(SUPPORTED)}",
                               hint="Other variables are not yet validated; see scientific/MODEL_SELECTION.md")
    if frequency != "monthly":
        raise FeasibilityError("Short-term (hourly/daily) forecasting is not available",
                               requirement="NWP initial conditions or ≥ several years of sub-daily observations; acquired GPM daily record covers only one monsoon season",
                               hint="Use the monthly product, or integrate an operational NWP forecast as forcing (not a statistical extrapolation).")
    if not 1 <= horizon_months <= MAX_H:
        raise FeasibilityError(f"Horizon {horizon_months} months is outside the validated range 1–{MAX_H}",
                               requirement="Multi-year/decadal outlooks need climate-model projections under emission scenarios (e.g. CMIP6 SSPs)",
                               hint="Statistical extrapolation of a 45-year record is not a climate projection; BhuVyom refuses rather than mislead.")


def _cells(var: str):
    pm = pd_.power_monthly()
    cds = []
    for c in pm["cells"]:
        y = np.array([np.nan if v is None else v for v in pm["series"][var][c["id"]]], float)
        cds.append(CellData(y, lat=c["center"][1], lon=c["center"][0]))
    return pm, cds


def _evaluate(cds, years, n) -> dict:
    """Return residuals[model][h] -> (obs, pred) arrays pooled over cells and origins."""
    out = {m: {h: ([], []) for h in range(1, MAX_H + 1)} for m in MODEL_IDS}
    for Y in years:
        c = (Y - 1981) * 12 - 1
        fs = FittedSet(cds, c)
        origins = list(range(c + 1, c + 13))
        for h in range(1, MAX_H + 1):
            org = [o for o in origins if o + h < n]
            if not org:
                continue
            for k, cd in enumerate(cds):
                obs = cd.y[np.asarray(org) + h]
                for m in MODEL_IDS:
                    pred = fs.predict_many(m, k, org, h)
                    out[m][h][0].extend(obs); out[m][h][1].extend(pred)
    return {m: {h: (np.asarray(v[0]), np.asarray(v[1])) for h, v in hs.items()} for m, hs in out.items()}


def _metrics(obs, pred, nonneg) -> dict:
    if nonneg:
        pred = np.maximum(pred, 0)
    ok = np.isfinite(obs) & np.isfinite(pred)
    e = pred[ok] - obs[ok]
    if not e.size:
        return {"n": 0}
    return {"n": int(e.size), "mae": float(np.mean(np.abs(e))), "rmse": float(np.sqrt(np.mean(e ** 2))), "bias": float(np.mean(e))}


def _data_hash(var: str) -> str:
    pm = pd_.power_monthly()
    h = hashlib.sha256(json.dumps(pm["series"][var], sort_keys=True).encode()).hexdigest()[:12]
    return f"{var}_{h}_v{MODEL_VERSION}"


def run(var: str = "T2M", horizon_months: int = 12, force: bool = False) -> EngineResult:
    check_feasibility(var, horizon_months)
    key = _data_hash(var)
    cache = RESULTS / f"prediction_{key}.json"
    if cache.exists() and not force:
        res = EngineResult.model_validate_json(cache.read_text())
        return _trim(res, horizon_months)
    res = _compute(var, key)
    RESULTS.mkdir(parents=True, exist_ok=True)
    cache.write_text(res.model_dump_json())
    return _trim(res, horizon_months)


def _trim(res: EngineResult, horizon: int) -> EngineResult:
    if horizon == MAX_H:
        return res
    r = res.model_copy(deep=True)
    n_keep = HISTORY_MONTHS + horizon
    r.grid.times = r.grid.times[:n_keep]
    for f in r.grid.fields.values():
        if f.kind == "time_series":
            f.values = {k: v[:n_keep] for k, v in f.values.items()}
    r.configuration["horizon_months"] = horizon
    return r


def _compute(var: str, key: str) -> EngineResult:
    tr = Tracer()
    pm, cds = _cells(var)
    n = cds[0].n
    meta = pm["meta"][var]
    nonneg = var == "PRECTOTCORR"
    miss = sum(int(np.isnan(cd.y).sum()) for cd in cds)
    tr.add("data_retrieval", f"NASA POWER monthly {var}: {len(cds)} cells × {n} months ({pm['months'][0]}–{pm['months'][-1]}), {miss} missing")
    if n < 30 * 12:
        raise FeasibilityError("Need ≥30 years of monthly history", requirement="≥360 months")
    tr.add("data_quality_check", "Record length ≥30 years; fill values already null")

    cal = _evaluate(cds, CAL_YEARS, n)
    tr.add("validation_calibration", f"Rolling origin, refit yearly, origins {CAL_YEARS.start}–{CAL_YEARS.stop - 1}")
    test = _evaluate(cds, TEST_YEARS, n)
    tr.add("validation_test", f"Rolling origin, origins {TEST_YEARS.start}–{TEST_YEARS.stop - 1} (targets ≤ {pm['months'][-1]})")

    per_h, chosen = {}, {}
    for h in range(1, MAX_H + 1):
        cal_m = {m: _metrics(*cal[m][h], nonneg) for m in MODEL_IDS}
        test_m = {m: _metrics(*test[m][h], nonneg) for m in MODEL_IDS}
        best = min(MODEL_IDS, key=lambda m: (round(cal_m[m]["mae"], 4), SIMPLICITY[m]))
        chosen[h] = best
        clim_test = test_m["climatology"]["mae"]
        obs_c, pred_c = cal[best][h]
        res_c = obs_c - (np.maximum(pred_c, 0) if nonneg else pred_c)
        res_c = res_c[np.isfinite(res_c)]
        q = {p: float(np.quantile(res_c, p)) for p in (0.025, 0.1, 0.9, 0.975)}
        obs_t, pred_t = test[best][h]
        pt = np.maximum(pred_t, 0) if nonneg else pred_t
        okt = np.isfinite(obs_t) & np.isfinite(pt)
        cov80 = float(np.mean((obs_t[okt] >= pt[okt] + q[0.1]) & (obs_t[okt] <= pt[okt] + q[0.9])))
        cov95 = float(np.mean((obs_t[okt] >= pt[okt] + q[0.025]) & (obs_t[okt] <= pt[okt] + q[0.975])))
        per_h[h] = {"selected_model": best, "calibration": {m: {k: clean(v, 4) for k, v in d.items()} for m, d in cal_m.items()},
                    "test": {m: {k: clean(v, 4) for k, v in d.items()} for m, d in test_m.items()},
                    "test_skill_vs_climatology": clean(1 - test_m[best]["mae"] / clim_test, 4),
                    "interval_quantiles_calibration": {str(k): clean(v, 4) for k, v in q.items()},
                    "test_coverage_80": clean(cov80, 3), "test_coverage_95": clean(cov95, 3)}
    tr.add("model_selection", "Per horizon: lowest calibration MAE (ties → simpler model); " + ", ".join(f"h{h}:{m}" for h, m in chosen.items()))

    # residual pool for final intervals: calibration + test residuals of selected model
    final_q = {}
    for h in range(1, MAX_H + 1):
        m = chosen[h]
        o = np.concatenate([cal[m][h][0], test[m][h][0]]); p = np.concatenate([cal[m][h][1], test[m][h][1]])
        r = o - (np.maximum(p, 0) if nonneg else p)
        r = r[np.isfinite(r)]
        final_q[h] = {pp: float(np.quantile(r, pp)) for pp in (0.025, 0.1, 0.9, 0.975)}

    c = n - 1
    fs = FittedSet(cds, c)
    tr.add("model_training", f"Final refit on all data ≤ {pm['months'][-1]} (6 candidates; ridge/GBM pooled over 25 cells)")
    hist_idx = list(range(n - HISTORY_MONTHS, n))
    times = [_ym(i) for i in hist_idx] + [_ym(c + h) for h in range(1, MAX_H + 1)]
    F = {k: {} for k in ("observed", "forecast", "pi80_low", "pi80_high", "pi95_low", "pi95_high", "climatology")}
    for k, (cd, cell) in enumerate(zip(cds, pm["cells"])):
        cid = cell["id"]
        F["observed"][cid] = [clean(cd.y[i], 3) for i in hist_idx] + [None] * MAX_H
        fc, l80, h80, l95, h95, cl = [], [], [], [], [], []
        for h in range(1, MAX_H + 1):
            p = fs.predict(chosen[h], k, c, h)
            p = max(p, 0.0) if nonneg else p
            qq = final_q[h]
            lo80, hi80, lo95, hi95 = p + qq[0.1], p + qq[0.9], p + qq[0.025], p + qq[0.975]
            if nonneg:
                lo80, lo95 = max(lo80, 0.0), max(lo95, 0.0)
            fc.append(clean(p, 3)); l80.append(clean(lo80, 3)); h80.append(clean(hi80, 3)); l95.append(clean(lo95, 3)); h95.append(clean(hi95, 3))
            cl.append(clean(fs.clim[k][(cd.month[c] + h) % 12], 3))
        pad = [None] * HISTORY_MONTHS
        F["forecast"][cid] = pad + fc
        for name, arr in (("pi80_low", l80), ("pi80_high", h80), ("pi95_low", l95), ("pi95_high", h95), ("climatology", cl)):
            F[name][cid] = pad + arr
    tr.add("prediction_generation", f"{MAX_H}-month forecast per cell from origin {pm['months'][-1]}")
    tr.add("uncertainty_estimation", "Empirical residual quantiles per horizon (80% & 95%)")

    unit = meta["unit"]
    fields = {
        "forecast": FieldSpec(unit=unit, label=f"Forecast {meta['long_name']} (monthly mean)", kind="time_series", values=F["forecast"]),
        "observed": FieldSpec(unit=unit, label="Observed (NASA POWER / MERRA-2)", kind="time_series", values=F["observed"]),
        "pi80_low": FieldSpec(unit=unit, label="80% prediction interval, lower", kind="time_series", role="uncertainty", values=F["pi80_low"]),
        "pi80_high": FieldSpec(unit=unit, label="80% prediction interval, upper", kind="time_series", role="uncertainty", values=F["pi80_high"]),
        "pi95_low": FieldSpec(unit=unit, label="95% prediction interval, lower", kind="time_series", role="uncertainty", values=F["pi95_low"]),
        "pi95_high": FieldSpec(unit=unit, label="95% prediction interval, upper", kind="time_series", role="uncertainty", values=F["pi95_high"]),
        "climatology": FieldSpec(unit=unit, label="Climatology baseline (1981–2025 monthly mean)", kind="time_series", role="diagnostic", values=F["climatology"]),
    }
    skills = [per_h[h]["test_skill_vs_climatology"] for h in range(1, MAX_H + 1)]
    findings = []
    skillful = [h for h in range(1, MAX_H + 1) if (per_h[h]["test_skill_vs_climatology"] or 0) > 0.02]
    if skillful:
        findings.append(Finding(statement=f"{meta['long_name']}: the selected models beat climatology on held-out 2018–2025 data at horizons {', '.join(map(str, skillful))} month(s) (MAE skill up to {max(skills):.0%}). Beyond that, forecasts carry no more information than the monthly climatology.",
                                category="modelled", evidence={"skill_by_horizon": skills}, rule="Skill = 1 − MAE_model/MAE_climatology on test; >2% counted as skill (engineering threshold)"))
    else:
        findings.append(Finding(statement=f"{meta['long_name']}: no candidate model beats climatology on held-out data; the forecast is effectively the monthly climatology.", category="no_conclusion", evidence={"skill_by_horizon": skills}, rule="Skill > 2% required"))
    c80 = [per_h[h]["test_coverage_80"] for h in range(1, MAX_H + 1)]
    findings.append(Finding(statement=f"80% prediction intervals covered {min(c80):.0%}–{max(c80):.0%} of held-out observations across horizons (nominal 80%).", category="modelled", evidence={"coverage_80": c80, "coverage_95": [per_h[h]['test_coverage_95'] for h in range(1, MAX_H + 1)]}, rule="Empirical coverage on test origins"))
    tr.add("result_generation", "contract result + findings")
    return EngineResult(
        engine_name="prediction", data_type="predicted", title=f"Monthly forecast — {meta['long_name']} (12 months)",
        variable=var, units=unit, native_resolution="0.5° × 0.625° (MERRA-2 grid via NASA POWER)", effective_resolution="0.5° × 0.625° — city-scale; NOT neighbourhood-scale",
        temporal_resolution="monthly mean", temporal_coverage={"start": times[0], "end": times[-1], "forecast_origin": pm["months"][-1]},
        grid=GridPayload(cells=[{k: cl[k] for k in ("id", "polygon", "center", "is_city_cell")} for cl in pm["cells"]], times=times, fields=fields,
                         cell_attributes={cl["id"]: {"is_city_cell": cl["is_city_cell"]} for cl in pm["cells"]}),
        default_field="forecast",
        sources=[{"dataset_id": "nasa_power", "product": "NASA POWER monthly (MERRA-2)", "upstream": pm["header_sources"], "api_version": pm["api_version"], "period": f"{pm['months'][0]}–{pm['months'][-1]}"}],
        methodology={"id": "prediction.monthly_direct_multi_horizon", "version": MODEL_VERSION, "doc_ref": "scientific/MODEL_SELECTION.md; scientific/VALIDATION_PROTOCOLS.md",
                     "candidates": MODEL_IDS, "selection": "per-horizon, lowest calibration MAE", "external_basis": "FPP3 (Hyndman & Athanasopoulos 2021); Tashman 2000; Lei et al. 2018"},
        model={"id": f"bhuvyom-monthly-{var}", "version": MODEL_VERSION, "selected_by_horizon": {str(h): m for h, m in chosen.items()}, "artifact_key": key,
               "training_period": f"{pm['months'][0]}–{pm['months'][-1]}", "calibration_origins": f"{CAL_YEARS.start}-01–{CAL_YEARS.stop - 1}-12", "test_origins": f"{TEST_YEARS.start}-01–{TEST_YEARS.stop - 1}-12"},
        quality={"missing_values": miss, "cells": len(cds), "months": n},
        uncertainty={"type": "predictive (model residual)", "method": "empirical residual quantiles per horizon from out-of-sample rolling-origin errors",
                     "excludes": ["reanalysis/measurement error", "non-stationary regime shifts", "spatial error correlation"],
                     "statement": "Intervals describe historical out-of-sample error of this statistical model; they are not climate-scenario uncertainty."},
        validation={"status": "validated_out_of_sample", "scheme": "rolling-origin, yearly refit", "per_horizon": {str(h): v for h, v in per_h.items()}},
        configuration={"var": var, "horizon_months": MAX_H, "history_months_returned": HISTORY_MONTHS},
        assumptions=["Monthly statistics are stationary apart from a linear trend over 1981–2025", "MERRA-2 reanalysis adequately represents the regional monthly climate"],
        limitations=["~50 km cells: one cell covers all of Bengaluru; no neighbourhood-scale prediction.", "Forecast issued from the last ACQUIRED month (Dec 2025); 2026 months already elapsed can be verified once acquired.",
                     "Not a weather forecast and not a climate projection."] + (["Precipitation forecasts clipped at 0 mm/day (physical bound)."] if nonneg else []),
        findings=findings, trace=tr.steps,
    )
