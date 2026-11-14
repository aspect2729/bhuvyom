"""Engine 4 — Simulation: rainfall → direct runoff response under land-surface scenarios.

Forcing: observed GPM IMERG daily depths (mm/day) per 0.1° cell. Each day is treated as one
rainfall event (a standard simplification for daily SCS-CN). Uncertainty: ensemble over
pervious CN (hydrologic soil groups B/C/D, TR-55 'open space, fair') × λ ∈ {0.05, 0.2}.
"""

from __future__ import annotations

import itertools

import numpy as np

from engines import prepared_data as pd_
from engines.contract import EngineResult, FeasibilityError, Finding, FieldSpec, GridPayload, Tracer, clean
from engines.simulation.scs_cn import composite_cn, retention_mm, runoff_mm

HSG_CN = {"B": 69.0, "C": 79.0, "D": 84.0}  # TR-55 Table 2-2a, open space fair condition
LAMBDAS = (0.05, 0.2)


def check_forcing_compatibility(forcing: str) -> None:
    if forcing == "observed_gpm":
        return
    if forcing.startswith("prediction:"):
        raise FeasibilityError(
            "Prediction output is incompatible with the SCS-CN runoff simulation",
            requirement="SCS-CN needs event/daily rainfall DEPTHS (mm per event); the prediction engine produces MONTHLY-MEAN rates (mm/day averaged over a month), which cannot be disaggregated into events without a validated weather generator.",
            hint="Use forcing='observed_gpm'. A stochastic daily weather generator would be required to couple monthly predictions to this simulation (designed, not implemented).")
    raise FeasibilityError(f"Unknown forcing '{forcing}'", requirement="observed_gpm")


def run(baseline_impervious: float = 0.6, scenario_impervious: float = 0.8, soil_group: str = "C", lam: float = 0.2,
        start: str | None = None, end: str | None = None, forcing: str = "observed_gpm") -> EngineResult:
    tr = Tracer()
    check_forcing_compatibility(forcing)
    if soil_group not in HSG_CN:
        raise FeasibilityError(f"Unknown hydrologic soil group {soil_group}", requirement="B, C or D")
    for f in (baseline_impervious, scenario_impervious):
        if not 0 <= f <= 1:
            raise FeasibilityError("Impervious fraction must be within 0–1", requirement="0 ≤ f ≤ 1")
    if lam not in LAMBDAS:
        raise FeasibilityError("λ must be 0.05 or 0.2", requirement="documented values only")
    g = pd_.gpm_daily()
    dates = g["dates"]
    i0 = dates.index(start) if start in dates else 0
    i1 = dates.index(end) + 1 if end in dates else len(dates)
    dates = dates[i0:i1]
    if len(dates) < 7:
        raise FeasibilityError("Need ≥7 days of forcing", requirement="≥7 daily values")
    tr.add("input_validation", f"Forcing {forcing}: GPM IMERG daily mm/day, {len(g['cells'])} cells, {dates[0]}–{dates[-1]}; units checked (mm/day ≡ mm per daily event)")
    cn_p = HSG_CN[soil_group]
    cn_b, cn_s = composite_cn(baseline_impervious, cn_p), composite_cn(scenario_impervious, cn_p)
    tr.add("parameterisation", f"CN_pervious={cn_p} (HSG {soil_group}); CN_baseline={cn_b:.1f}, CN_scenario={cn_s:.1f}; S_b={retention_mm(cn_b):.1f} mm, S_s={retention_mm(cn_s):.1f} mm; λ={lam}")
    F = {k: {} for k in ("precipitation", "runoff_baseline", "runoff_scenario", "runoff_difference")}
    S = {k: {} for k in ("total_precip", "total_runoff_baseline", "total_runoff_scenario", "total_difference", "runoff_coeff_scenario", "diff_ens_low", "diff_ens_high")}
    attrs = {}
    for c in g["cells"]:
        cid = c["id"]
        p = np.array([np.nan if v is None else v for v in g["values"][cid][i0:i1]], float)
        qb, qs = runoff_mm(p, cn_b, lam), runoff_mm(p, cn_s, lam)
        F["precipitation"][cid] = [clean(v, 2) for v in p]
        F["runoff_baseline"][cid] = [clean(v, 2) for v in qb]
        F["runoff_scenario"][cid] = [clean(v, 2) for v in qs]
        F["runoff_difference"][cid] = [clean(v, 2) for v in qs - qb]
        P, QB, QS = np.nansum(p), np.nansum(qb), np.nansum(qs)
        ens = []
        for hsg, lm in itertools.product(HSG_CN.values(), LAMBDAS):
            ens.append(np.nansum(runoff_mm(p, composite_cn(scenario_impervious, hsg), lm)) - np.nansum(runoff_mm(p, composite_cn(baseline_impervious, hsg), lm)))
        S["total_precip"][cid], S["total_runoff_baseline"][cid], S["total_runoff_scenario"][cid] = clean(P, 1), clean(QB, 1), clean(QS, 1)
        S["total_difference"][cid] = clean(QS - QB, 1)
        S["runoff_coeff_scenario"][cid] = clean(QS / P if P > 0 else None, 3)
        S["diff_ens_low"][cid], S["diff_ens_high"][cid] = clean(min(ens), 1), clean(max(ens), 1)
        attrs[cid] = {"missing_days": int(np.isnan(p).sum()), "ensemble_members": len(ens)}
    tr.add("simulation", f"SCS-CN daily runoff, baseline vs scenario, {len(g['cells'])} cells × {len(dates)} days")
    tr.add("uncertainty", f"Parameter ensemble: CN_pervious ∈ {list(HSG_CN.values())} × λ ∈ {list(LAMBDAS)} (6 members)")
    fields = {
        "total_difference": FieldSpec(unit="mm", label="Scenario − baseline total runoff over period", kind="static", values=S["total_difference"]),
        "total_runoff_scenario": FieldSpec(unit="mm", label="Total direct runoff, scenario", kind="static", values=S["total_runoff_scenario"]),
        "total_runoff_baseline": FieldSpec(unit="mm", label="Total direct runoff, baseline", kind="static", values=S["total_runoff_baseline"]),
        "total_precip": FieldSpec(unit="mm", label="Total observed precipitation (forcing)", kind="static", role="diagnostic", values=S["total_precip"]),
        "runoff_coeff_scenario": FieldSpec(unit="1", label="Runoff coefficient Q/P, scenario", kind="static", role="diagnostic", values=S["runoff_coeff_scenario"]),
        "diff_ens_low": FieldSpec(unit="mm", label="Difference, ensemble minimum", kind="static", role="uncertainty", values=S["diff_ens_low"]),
        "diff_ens_high": FieldSpec(unit="mm", label="Difference, ensemble maximum", kind="static", role="uncertainty", values=S["diff_ens_high"]),
        "precipitation": FieldSpec(unit="mm/day", label="Daily precipitation forcing (GPM)", kind="time_series", role="diagnostic", values=F["precipitation"]),
        "runoff_baseline": FieldSpec(unit="mm/day", label="Daily runoff, baseline", kind="time_series", values=F["runoff_baseline"]),
        "runoff_scenario": FieldSpec(unit="mm/day", label="Daily runoff, scenario", kind="time_series", values=F["runoff_scenario"]),
        "runoff_difference": FieldSpec(unit="mm/day", label="Daily runoff difference", kind="time_series", values=F["runoff_difference"]),
    }
    d = np.array([v for v in S["total_difference"].values() if v is not None])
    lo = np.array([v for v in S["diff_ens_low"].values() if v is not None]); hi = np.array([v for v in S["diff_ens_high"].values() if v is not None])
    findings = [Finding(statement=f"SIMULATED (hypothetical scenario): raising impervious fraction from {baseline_impervious:.0%} to {scenario_impervious:.0%} increases modelled direct runoff by {d.mean():.0f} mm on average per cell over {dates[0]}–{dates[-1]} (cell range {d.min():.0f}–{d.max():.0f} mm; parameter-ensemble range {lo.min():.0f}–{hi.max():.0f} mm).",
                        category="simulated", evidence={"cells": len(d), "days": len(dates)}, rule="SCS-CN scenario difference; not validated against observed streamflow",
                        limitations=["Uncalibrated: no observed runoff/streamflow for Bengaluru catchments in the dataset.", "No routing, drainage network, storage or lakes.", "AMC II (average antecedent moisture) assumed; SMAP not integrated."])]
    tr.add("result_generation", "contract result + findings")
    return EngineResult(
        engine_name="simulation", data_type="simulated", title=f"Rainfall–runoff scenario (SCS-CN): impervious {baseline_impervious:.0%} → {scenario_impervious:.0%}",
        variable="direct_runoff", units="mm", native_resolution="0.1° (forcing: GPM IMERG)", effective_resolution="0.1° (~11 km) — uniform land surface assumed within each cell",
        temporal_resolution="daily", temporal_coverage={"start": dates[0], "end": dates[-1]},
        grid=GridPayload(cells=g["cells"], times=dates, fields=fields, cell_attributes=attrs), default_field="total_difference",
        sources=[{"dataset_id": "gpm_imerg_v07_daily", "product": g["product"], "role": "forcing (observed)"}],
        methodology={"id": "simulation.scs_cn_runoff", "version": "1.0", "doc_ref": "scientific/EQUATIONS_AND_FORMULAS.md#scs-cn",
                     "equations": ["S = 25400/CN − 254", "Ia = λS", "Q = (P − Ia)²/(P − Ia + S) for P > Ia, else 0", "CN = f·98 + (1−f)·CN_pervious"],
                     "external_basis": "USDA-NRCS NEH Part 630 Ch.10; TR-55 (1986); Hawkins et al. 2002", "corpus_note": "Not in supplied papers (METHODOLOGY §13.1) — externally sourced"},
        model={"id": "scs_cn_daily", "version": "1.0", "parameters": {"CN_pervious": cn_p, "CN_impervious": 98, "lambda": lam, "CN_baseline": cn_b, "CN_scenario": cn_s}},
        uncertainty={"type": "parameter ensemble", "members": 6, "statement": "Range over soil group (B/C/D) and λ (0.05/0.2). Forcing (IMERG) error not propagated."},
        validation={"status": "not_validated", "reason": "No observed runoff/streamflow available for calibration or validation."},
        configuration={"baseline_impervious": baseline_impervious, "scenario_impervious": scenario_impervious, "soil_group": soil_group, "lambda": lam, "forcing": forcing},
        scenario={"id": f"imp_{baseline_impervious:.2f}_to_{scenario_impervious:.2f}_{soil_group}", "type": "hypothetical land-surface change", "baseline_impervious_fraction": baseline_impervious, "scenario_impervious_fraction": scenario_impervious},
        assumptions=["Impervious fractions are USER-SPECIFIED scenario values, not observed (no impervious-surface product acquired)", "Each UTC day = one rainfall event", "AMC II antecedent moisture", "Spatially uniform land surface within each 0.1° cell", "CN_impervious = 98 (TR-55 paved surfaces)"],
        limitations=["Hypothetical experiment — not a prediction of real flooding.", "Daily SCS-CN underestimates runoff from short intense bursts within a day.", "No drainage/routing: depths are not flood levels."],
        findings=findings, trace=tr.steps,
    )
