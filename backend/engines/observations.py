"""Engine 1 output adapters: prepared observations → EngineResult (data_type="observed")."""

from __future__ import annotations

import numpy as np

from engines import prepared_data as pd_
from engines.contract import EngineResult, Finding, FieldSpec, GridPayload, Tracer, clean


def _arr_to_cells(stack: np.ndarray, cells: list[dict]) -> dict[str, list]:
    out = {}
    for c in cells:
        out[c["id"]] = [clean(v, 2) for v in stack[:, c["row"], c["col"]]]
    return out


def observed_lst() -> EngineResult:
    tr = Tracer()
    d = pd_.modis_lst()
    tr.add("data_retrieval", f"Loaded MOD11A1.061 {d['tile']} BBMP window {d['shape']} × {len(d['dates'])} days")
    day, night = d["day"], d["night"]
    n_pix = day.shape[1] * day.shape[2]
    clear_day = np.isfinite(day).reshape(len(d["dates"]), -1).mean(1) * 100
    clear_night = np.isfinite(night).reshape(len(d["dates"]), -1).mean(1) * 100
    tr.add("quality_filtering", f"QC: {d['report']['qc_filter']}; rejected pixels kept as null")
    fields = {
        "lst_day": FieldSpec(unit="°C", label="Land surface temperature, day (~10:30 local)", kind="time_series", values=_arr_to_cells(day, d["cells"])),
        "lst_night": FieldSpec(unit="°C", label="Land surface temperature, night (~22:30 local)", kind="time_series", values=_arr_to_cells(night, d["cells"])),
        "qc_tier_day": FieldSpec(unit="tier", label="QC tier, day (1 = QA good, 2 = other quality with error ≤2 K, 0 = rejected)", kind="time_series", role="quality",
                                 values={c["id"]: [int(x) for x in d["tier_day"][:, c["row"], c["col"]]] for c in d["cells"]}),
    }
    tr.add("result_generation", f"{n_pix} pixels as sinusoidal-grid polygons (corners reprojected to EPSG:4326)")
    return EngineResult(
        engine_name="acquisition", data_type="observed",
        title="MODIS land surface temperature (MOD11A1.061), Bengaluru BBMP window",
        variable="LST", units="°C", native_resolution="~1 km (926.6 m MODIS sinusoidal pixel)",
        effective_resolution="~1 km (native; no resampling)", temporal_resolution="daily (Terra overpass), clear-sky only",
        temporal_coverage={"start": d["dates"][0], "end": d["dates"][-1]},
        grid=GridPayload(cells=[{k: c[k] for k in ("id", "polygon", "center")} for c in d["cells"]], times=d["dates"], fields=fields,
                         cell_attributes={}),
        default_field="lst_day",
        sources=[{"dataset_id": "modis_lst_mod11a1", "product": "MOD11A1.061", "tile": d["tile"], "provider": "NASA LP DAAC", "access": "Earthdata (token)"}],
        methodology={"id": "obs.modis_lst_qc", "version": "1.0", "doc_ref": "scientific/METHODOLOGY_REGISTRY.md#obs-modis-lst",
                     "procedure": f"DN × 0.02 − 273.15 → °C; keep: {d['report']['qc_filter']}; per-pixel tier stored in field qc_tier_day"},
        quality={"pct_pixel_days_strict_qa_day": clean(float(np.mean(d["tier_day"] == 1)) * 100, 1), "pct_pixel_days_relaxed_qa_day": clean(float(np.mean(d["tier_day"] == 2)) * 100, 1),
                 "clear_sky_pct_day_mean": clean(clear_day.mean(), 1), "clear_sky_pct_night_mean": clean(clear_night.mean(), 1),
                 "clear_sky_pct_by_date_day": [clean(v, 1) for v in clear_day], "n_pixels": n_pix, **d["report"]},
        uncertainty={"type": "retrieval", "statement": "MOD11A1 C6.1 LST accuracy is typically ≤1 K over validated sites (product user guide); per-pixel error bits not yet propagated."},
        assumptions=["Clear-sky pixels only: daily composites are biased toward clear conditions."],
        findings=[Finding(statement=f"Observed: on average {clear_day.mean():.0f}% of pixels were cloud-free and passed QC ({np.mean(d['tier_day'] == 2) * 100:.0f}% of pixel-days accepted at the ≤2 K-error tier, mostly built-up pixels) each day (day overpass), {clear_night.mean():.0f}% at night; daily clear-sky coverage ranged {clear_day.min():.0f}–{clear_day.max():.0f}%. Clear-sky day LST ranged {np.nanmin(day):.1f}–{np.nanmax(day):.1f} °C.",
                          category="observation", evidence={"days": len(d["dates"]), "pixels": n_pix}, rule="Direct QC-filtered observations; no statistics applied",
                          limitations=["Days with heavy cloud have few or no valid pixels — gaps are shown as 'no data', never filled."])],
        limitations=["Land SURFACE (skin) temperature — not 2 m air temperature.", "Window is the BBMP bounding window of the MODIS tile, slightly larger than the ward boundary.", "Only Jan–Mar 2024 acquired so far."],
        trace=tr.steps,
    )


def observed_gpm() -> EngineResult:
    tr = Tracer()
    g = pd_.gpm_daily()
    tr.add("data_retrieval", f"Parsed {len(g['dates'])} IMERG daily OPeNDAP subsets ({len(g['cells'])} cells)")
    vals = np.array([g["values"][c["id"]] for c in g["cells"]], dtype=float)
    miss = int(np.isnan(vals).sum())
    tr.add("quality_filtering", f"Negative/fill values → null ({miss} missing)")
    return EngineResult(
        engine_name="acquisition", data_type="observed",
        title="GPM IMERG V07 Final daily precipitation, Bengaluru",
        variable="precipitation", units="mm/day", native_resolution="0.1° × 0.1° (~11 km)",
        effective_resolution="0.1° (native)", temporal_resolution="daily accumulation (00–24 UTC)",
        temporal_coverage={"start": g["dates"][0], "end": g["dates"][-1]},
        grid=GridPayload(cells=g["cells"], times=g["dates"], fields={
            "precipitation": FieldSpec(unit="mm/day", label="Daily precipitation (IMERG Final)", kind="time_series", values={k: [clean(x, 3) for x in v] for k, v in g["values"].items()})}),
        default_field="precipitation",
        sources=[{"dataset_id": "gpm_imerg_v07_daily", "product": g["product"], "provider": "NASA GES DISC", "n_granules": len(g["granules"]), "access": "OPeNDAP subset (Earthdata token)"}],
        methodology={"id": "obs.gpm_imerg_daily", "version": "1.0", "doc_ref": "scientific/METHODOLOGY_REGISTRY.md#obs-gpm", "procedure": "OPeNDAP spatial subset of 'precipitation' (mm/day); no rescaling"},
        quality={"missing_values": miss, "n_values": int(vals.size), "n_days": len(g["dates"])},
        uncertainty={"type": "retrieval", "statement": "IMERG 'randomError' field not yet acquired; satellite-gauge merged estimate, not gauge observations."},
        assumptions=["Daily totals are UTC days (05:30–05:30 IST)."],
        findings=[Finding(statement=f"Observed (satellite estimate): {g['dates'][0]} to {g['dates'][-1]} cell totals ranged {np.nansum(vals, 1).min():.0f}–{np.nansum(vals, 1).max():.0f} mm; wettest single cell-day {np.nanmax(vals):.1f} mm/day.",
                          category="observation", evidence={"cells": len(g["cells"]), "days": len(g["dates"])}, rule="Direct sums of IMERG daily values; missing days excluded, not zero-filled")],
        limitations=["~11 km cells cannot resolve individual convective storm cells or neighbourhood flooding.", "Acquired period is the 2024 monsoon only."],
        trace=tr.steps,
    )


def observed_ndvi() -> EngineResult:
    tr = Tracer()
    d = pd_.modis_ndvi()
    tr.add("data_retrieval", f"Loaded MOD13Q1.061 h25v07 250 m window {d['shape']} × {len(d['dates'])} 16-day composites")
    a = d["ndvi"]
    valid = float(np.isfinite(a).mean() * 100)
    tr.add("quality_filtering", "DN × 0.0001; fill −3000 → null; pixel reliability ∈ {0 good, 1 marginal}")
    vals = {c["id"]: [clean(x, 3) for x in a[:, c["row"], c["col"]]] for c in d["cells"]}
    return EngineResult(
        engine_name="acquisition", data_type="observed", title="MODIS NDVI 16-day composites (MOD13Q1.061, 250 m)",
        variable="NDVI", units="1", native_resolution="250 m (231.7 m MODIS sinusoidal pixel)", effective_resolution="250 m (native)",
        temporal_resolution="16-day maximum-value composite", temporal_coverage={"start": d["dates"][0], "end": d["dates"][-1]},
        grid=GridPayload(cells=[{k: c[k] for k in ("id", "polygon", "center")} for c in d["cells"]], times=d["dates"],
                         fields={"ndvi": FieldSpec(unit="1", label="NDVI (16-day composite)", kind="time_series", values=vals)}),
        default_field="ndvi",
        sources=[{"dataset_id": "modis_vi_mod13q1", "product": "MOD13Q1.061", "tile": "h25v07", "provider": "NASA LP DAAC", "access": "Earthdata (token)"}],
        methodology={"id": "obs.modis_ndvi", "version": "1.0", "doc_ref": "scientific/METHODOLOGY_REGISTRY.md", "procedure": "NDVI = DN × 0.0001; keep pixel reliability 0/1"},
        quality={"valid_pct": clean(valid, 2), "n_pixels": len(d["cells"])},
        uncertainty={"type": "retrieval", "statement": "Composite date is the best pixel within 16 days, not a single-day observation."},
        assumptions=["Maximum-value compositing selects the clearest observation in each 16-day window."],
        limitations=["Composite timestamps are period starts; within-period day varies by pixel.", "Mixed pixels at 250 m in dense urban fabric."],
        findings=[Finding(statement=f"Observed: BBMP-window NDVI ranged {np.nanmin(a):.2f}–{np.nanmax(a):.2f} (mean {np.nanmean(a):.2f}) across {len(d['dates'])} dry-season composites; {valid:.1f}% of pixel-composites valid.",
                          category="observation", evidence={"pixels": len(d["cells"])}, rule="Direct QC-filtered observations")],
        trace=tr.steps,
    )
