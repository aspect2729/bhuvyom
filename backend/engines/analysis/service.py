"""Engine 2 — Analysis. Historical patterns only; never forecasts.

Methods follow METHODOLOGY_REFERENCE.md (§5 MK, §6 Sen, §7.4 Sen CI, §8 r1/TFPW, §11.3 BH).
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from engines import prepared_data as pd_
from engines.analysis.trends import ALPHA, MIN_YEARS, analyze_trend_series, annual_means, benjamini_hochberg
from engines.contract import EngineResult, FeasibilityError, Finding, FieldSpec, GridPayload, Tracer, clean

SOLAR_CLOUD = {"ALLSKY_SFC_SW_DWN", "CLOUD_AMT"}


def trends(var: str = "T2M", start: int = 1981, end: int = 2025, allow_mixed_sources: bool = False) -> EngineResult:
    tr = Tracer()
    pm = pd_.power_monthly()
    if var not in pm["series"]:
        raise FeasibilityError(f"Variable {var} not in prepared NASA POWER data", requirement=f"one of {sorted(pm['series'])}")
    note = None
    if var in SOLAR_CLOUD and not allow_mixed_sources and start < 2001:
        start, note = 2001, "Start clamped to 2001: 1984–2000 from GEWEX SRB, 2001+ from CERES SYN1deg — mixing products can create artificial steps."
    if end - start + 1 < MIN_YEARS:
        raise FeasibilityError(f"Period {start}–{end} shorter than {MIN_YEARS} years", requirement="≥10 annual values (MIN_YEARS)")
    meta = pm["meta"][var]
    months = pm["months"]
    yrs = [int(m[:4]) for m in months]
    mos = [int(m[5:]) for m in months]
    tr.add("data_retrieval", f"NASA POWER monthly {var}, {len(pm['cells'])} cells, {months[0]}…{months[-1]}")
    tr.add("temporal_selection", f"{start}–{end}" + (f" ({note})" if note else ""))
    years_axis = list(range(start, end + 1))
    annual, trend_line, attrs, slopes, lo, hi, pvals = {}, {}, {}, {}, {}, {}, []
    order = []
    for c in pm["cells"]:
        cid = c["id"]
        y_arr, m_arr = annual_means(pm["series"][var][cid], yrs, mos)
        sel = (y_arr >= start) & (y_arr <= end)
        y_arr, m_arr = y_arr[sel], m_arr[sel]
        res = analyze_trend_series(m_arr, y_arr, unit=meta["unit"])
        amap = {int(y): v for y, v in zip(y_arr, m_arr)}
        annual[cid] = [clean(amap.get(y), 3) for y in years_axis]
        if res["status"] == "ok":
            ok = np.isfinite(m_arr)
            b = res["slope_per_year"]
            intercept = float(np.median(m_arr[ok] - b * y_arr[ok]))  # Theil–Sen intercept (Conover)
            trend_line[cid] = [clean(intercept + b * y, 3) for y in years_axis]
        else:
            trend_line[cid] = [None] * len(years_axis)
        slopes[cid], lo[cid], hi[cid] = clean(res.get("slope_per_decade")), clean(res.get("ci_low_per_decade")), clean(res.get("ci_high_per_decade"))
        pvals.append(res.get("p_value"))
        order.append(cid)
        attrs[cid] = {k: (clean(v, 6) if isinstance(v, float) else v) for k, v in res.items() if k not in ("years_used",)}
        attrs[cid]["years_first_last"] = [res["years_used"][0], res["years_used"][-1]] if res.get("years_used") else None
        attrs[cid]["is_city_cell"] = c["is_city_cell"]
    tr.add("preprocessing", "Annual means valid only with ≥10 non-null months (§4)")
    tr.add("mathematical_computation", "Per cell: r1 screen → TFPW if significant → Mann–Kendall S, Var(S), Z, p → Sen slope + ordered-rank 95% CI")
    adj, sig = benjamini_hochberg(pvals, alpha=ALPHA)
    sigclass = {}
    for cid, p, pa, s in zip(order, pvals, adj, sig):
        attrs[cid]["p_bh"] = clean(pa, 6)
        attrs[cid]["significant_bh"] = s
        sigclass[cid] = None if p is None else (2 if s else (1 if p < ALPHA else 0))
    tr.add("statistical_validation", f"Benjamini–Hochberg FDR across {sum(p is not None for p in pvals)} cells at q={ALPHA}")
    unit = meta["unit"]
    fields = {
        "slope_per_decade": FieldSpec(unit=f"{unit}/decade", label="Sen's slope (trend magnitude)", kind="static", values=slopes),
        "ci_low_per_decade": FieldSpec(unit=f"{unit}/decade", label="Sen slope 95% CI lower", kind="static", role="uncertainty", values=lo),
        "ci_high_per_decade": FieldSpec(unit=f"{unit}/decade", label="Sen slope 95% CI upper", kind="static", role="uncertainty", values=hi),
        "significance_class": FieldSpec(unit="class", label="0 = not significant · 1 = raw p<0.05 · 2 = BH-FDR significant", kind="static", role="quality", values=sigclass),
        "annual_mean": FieldSpec(unit=unit, label=f"Annual mean {meta['long_name']}", kind="time_series", values=annual),
        "trend_line": FieldSpec(unit=unit, label="Sen trend line (Conover intercept)", kind="time_series", role="diagnostic", values=trend_line),
    }
    # ---- findings (rules: scientific/METHODOLOGY_REGISTRY.md#interp-trend)
    findings = []
    valid = [cid for cid in order if slopes[cid] is not None]
    n_bh = sum(1 for cid in order if sigclass[cid] == 2)
    n_raw = sum(1 for cid in order if sigclass[cid] in (1, 2))
    if valid:
        svals = np.array([slopes[c] for c in valid])
        ev = {"cells_tested": len(valid), "raw_significant": n_raw, "bh_significant": n_bh, "median_slope_per_decade": clean(np.median(svals)), "period": f"{start}–{end}"}
        if n_bh == 0:
            findings.append(Finding(statement=f"No cell shows a statistically significant monotonic trend in annual {meta['long_name']} after FDR correction ({start}–{end}).",
                                    category="no_conclusion", evidence=ev, rule="BH-adjusted p ≤ 0.05 required (§11.3)",
                                    limitations=["Non-significance is not evidence of no change (MK power limits, §5.6)."]))
        else:
            ups = [c for c in order if sigclass[c] == 2 and slopes[c] > 0]
            downs = [c for c in order if sigclass[c] == 2 and slopes[c] < 0]
            for lab, group in (("increasing", ups), ("decreasing", downs)):
                if group:
                    findings.append(Finding(statement=f"{len(group)} of {len(valid)} cells show a statistically significant {lab} trend in annual {meta['long_name']} ({start}–{end}, BH-FDR q≤0.05): " + ", ".join(f"{c} {slopes[c]:+.3f} {unit}/decade [{lo[c]:+.3f}, {hi[c]:+.3f}]" for c in group) + ".",
                                            category="statistical", evidence=ev, rule="MK p (TFPW where r1 significant) → BH-adjusted ≤ 0.05; magnitude = Sen slope (§5–§7, §11.3)",
                                            limitations=["Statistical significance ≠ practical importance (§1.2).", "Source is MERRA-2 reanalysis (model-derived), ~50 km cells."]))
        city = pm and next((c for c in order if attrs[c]["is_city_cell"]), None)
        if city and slopes[city] is not None:
            findings.append(Finding(statement=f"Bengaluru city cell: Sen slope {slopes[city]:+.3f} {unit}/decade (95% CI {lo[city]:+.3f} to {hi[city]:+.3f}); MK p={attrs[city]['p_value']:.3g}, BH p={attrs[city]['p_bh']:.3g} → " + ("significant." if sigclass[city] == 2 else "not significant after FDR correction."),
                                    category="statistical" if sigclass[city] == 2 else "no_conclusion", evidence={"cell": city}, rule="same as above"))
    tr.add("result_generation", f"{len(findings)} rule-based findings")
    return EngineResult(
        engine_name="analysis", data_type="analysed", title=f"Trend analysis — annual {meta['long_name']} ({start}–{end})",
        variable=var, units=f"{unit}/decade", native_resolution="0.5° × 0.625° (MERRA-2 grid via NASA POWER)", effective_resolution="0.5° × 0.625° (native, no resampling)",
        temporal_resolution="annual means of monthly values", temporal_coverage={"start": str(start), "end": str(end)},
        grid=GridPayload(cells=[{k: c[k] for k in ("id", "polygon", "center", "is_city_cell")} for c in pm["cells"]], times=[str(y) for y in years_axis], fields=fields, cell_attributes=attrs),
        default_field="slope_per_decade",
        sources=[{"dataset_id": "nasa_power", "product": "NASA POWER monthly point API", "api_version": pm["api_version"], "upstream": pm["header_sources"], "n_files": len(pm["files"])}],
        methodology={"id": "analysis.trend_mk_sen", "version": "1.0", "doc_ref": "METHODOLOGY_REFERENCE.md §5–§8, §11.3; scientific/METHODOLOGY_REGISTRY.md#analysis-trend",
                     "alpha": ALPHA, "min_years": MIN_YEARS, "source_note": note},
        quality={"cells": len(order), "cells_with_result": len(valid)},
        uncertainty={"type": "sampling", "statement": "95% CI of Sen slope from ordered pairwise slopes (§7.4). Excludes reanalysis error."},
        validation={"status": "implemented_and_unit_tested", "tests": "tests/test_trends_ported.py (12)"},
        configuration={"var": var, "start": start, "end": end, "allow_mixed_sources": allow_mixed_sources},
        assumptions=["Monotonic trend model (MK)", "Annual aggregation removes seasonality", "TFPW applied only when lag-1 r1 is significant"],
        limitations=["25 neighbouring cells are spatially correlated; BH controls FDR under positive dependence but field significance is not tested (§11 gap).", "Reanalysis ≠ station observations."],
        findings=findings, trace=tr.steps,
    )


def lst_composite() -> EngineResult:
    tr = Tracer()
    d = pd_.modis_lst()
    tr.add("data_retrieval", f"MOD11A1 {len(d['dates'])} days, {d['shape']} pixels")
    day, night = d["day"], d["night"]
    with np.errstate(all="ignore"):
        mday, mnight = np.nanmean(day, 0), np.nanmean(night, 0)
        nday, nnight = np.isfinite(day).sum(0), np.isfinite(night).sum(0)
    MIN_CLEAR = 10
    mday[nday < MIN_CLEAR] = np.nan
    mnight[nnight < MIN_CLEAR] = np.nan
    tr.add("quality_filtering", f"Pixel composites require ≥{MIN_CLEAR} clear-sky days (engineering threshold, documented)")
    area_mean_day = float(np.nanmean(mday))
    anom = mday - area_mean_day
    try:
        el = pd_.srtm_on_modis()["mean"]
        ok = np.isfinite(el) & np.isfinite(mday)
        rho = float(stats.spearmanr(el[ok], mday[ok]).statistic) if ok.sum() > 30 else None
        n_el = int(ok.sum())
        tr.add("mathematical_computation", f"Spearman ρ(elevation, mean day LST) over {n_el} pixels")
    except Exception as exc:  # noqa: BLE001
        el, rho, n_el = None, None, 0
        tr.add("mathematical_computation", f"Elevation association skipped: {exc}", status="warning")

    def cellmap(a):
        return {c["id"]: clean(a[c["row"], c["col"]], 2) for c in d["cells"]}

    fields = {
        "mean_lst_day": FieldSpec(unit="°C", label="Mean clear-sky day LST, Jan–Mar 2024", kind="static", values=cellmap(mday)),
        "mean_lst_night": FieldSpec(unit="°C", label="Mean clear-sky night LST, Jan–Mar 2024", kind="static", values=cellmap(mnight)),
        "day_lst_anomaly": FieldSpec(unit="°C", label="Day LST minus area mean (surface temperature contrast)", kind="static", values=cellmap(anom)),
        "n_clear_days": FieldSpec(unit="days", label="Clear-sky days used (day)", kind="static", role="quality", values={c["id"]: int(nday[c["row"], c["col"]]) for c in d["cells"]}),
    }
    if el is not None:
        fields["elevation_mean"] = FieldSpec(unit="m", label="SRTM elevation, area mean per MODIS pixel", kind="static", role="diagnostic", values=cellmap(el))
    try:
        ndvi1k = pd_.ndvi_on_modis_1km()
        okn = np.isfinite(ndvi1k) & np.isfinite(mday)
        rho_n = float(stats.spearmanr(ndvi1k[okn], mday[okn]).statistic) if okn.sum() > 30 else None
        fields["ndvi_mean_1km"] = FieldSpec(unit="1", label="NDVI mean of composites, aggregated 250 m → 1 km (4×4 nested pixels)", kind="static", role="diagnostic", values=cellmap(ndvi1k))
        tr.add("mathematical_computation", f"Spearman ρ(NDVI, mean day LST) over {int(okn.sum())} pixels")
    except Exception as exc:  # noqa: BLE001
        rho_n, okn = None, None
        tr.add("mathematical_computation", f"NDVI association skipped: {exc}", status="warning")
    v = np.isfinite(anom)
    findings = [Finding(
        statement=f"Clear-sky daytime land surface temperature (Jan–Mar 2024) ranges from {np.nanmin(mday):.1f} °C to {np.nanmax(mday):.1f} °C across the BBMP window (area mean {area_mean_day:.1f} °C); spatial contrast {np.nanmax(anom) - np.nanmin(anom):.1f} °C.",
        category="observation", evidence={"pixels": int(v.sum()), "min_clear_days": MIN_CLEAR},
        rule="Descriptive composite; no hotspot threshold is defined in METHODOLOGY_REFERENCE.md, so no pixels are labelled 'hotspots'.",
        limitations=["Surface (skin) temperature, not air temperature.", "Dry-season clear-sky sample only."])]
    if rho is not None:
        findings.append(Finding(statement=f"Observed association: Spearman ρ = {rho:+.2f} between pixel elevation and mean daytime LST ({n_el} pixels). This is a correlation, not a causal effect; no p-value is reported because pixels are spatially autocorrelated (§10, §12).",
                                category="statistical", evidence={"rho": clean(rho, 3), "n": n_el}, rule="Association ≠ causation (§1.2, §12)"))
    if rho_n is not None:
        findings.append(Finding(statement=f"Observed association: Spearman ρ = {rho_n:+.2f} between 1 km NDVI and mean daytime LST ({int(okn.sum())} pixels, Jan–Mar 2024). Correlation only — not a causal cooling effect; no p-value (spatial autocorrelation).",
                                category="statistical", evidence={"rho": clean(rho_n, 3), "n": int(okn.sum())}, rule="Association ≠ causation (§1.2, §12)"))
    tr.add("result_generation", "composites + rule-based findings")
    return EngineResult(
        engine_name="analysis", data_type="analysed", title="Surface temperature composite & contrast (MODIS, Jan–Mar 2024)", variable="LST", units="°C",
        native_resolution="~1 km MODIS sinusoidal", effective_resolution="~1 km (native)", temporal_resolution="3-month clear-sky composite",
        temporal_coverage={"start": d["dates"][0], "end": d["dates"][-1]},
        grid=GridPayload(cells=[{k: c[k] for k in ("id", "polygon", "center")} for c in d["cells"]], times=[], fields=fields),
        default_field="mean_lst_day",
        sources=[{"dataset_id": "modis_lst_mod11a1", "product": "MOD11A1.061"}, {"dataset_id": "srtm_dem", "product": "SRTMGL1.003", "processing": "area mean 30 m → MODIS pixel"},
                 {"dataset_id": "modis_vi_mod13q1", "product": "MOD13Q1.061", "processing": "mean of composites, 4×4 nested 250 m → 1 km"}],
        methodology={"id": "analysis.lst_composite", "version": "1.0", "doc_ref": "scientific/METHODOLOGY_REGISTRY.md#analysis-lst", "min_clear_days": MIN_CLEAR,
                     "formula": "mean_LST(p) = (1/n_p) Σ_t LST(p,t) over QC-good days; anomaly(p) = mean_LST(p) − mean_p(mean_LST)"},
        quality={"pixels_with_composite": int(v.sum()), "pixels_total": int(v.size)},
        uncertainty={"type": "retrieval+sampling", "statement": "No per-pixel CI computed; composite inherits ~1 K retrieval error and clear-sky sampling bias."},
        validation={"status": "descriptive"}, assumptions=["Clear-sky days are representative enough for a dry-season composite"],
        limitations=["Not air temperature; not an urban heat island intensity unless a rural reference is defined (not specified in methodology)."],
        findings=findings, trace=tr.steps,
    )
