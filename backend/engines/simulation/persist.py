"""Persist SCS-CN simulation scenarios / runs / outputs to Supabase."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from engines.contract import EngineResult

logger = logging.getLogger(__name__)

MODEL_CODE = "scs_cn_runoff_v1"
RUNOFF_VARIABLE_CODE = "precipitation_water_runoff"
MM_UNIT_CODE = "MM"


def _db():
    from pipeline.db import SupabaseREST

    return SupabaseREST()


def _lookup_ids() -> dict[str, int | None]:
    db = _db()
    model = db.get("simulation_models", params={"model_code": f"eq.{MODEL_CODE}", "select": "simulation_model_id"})
    var = db.get("ref_environmental_variables", params={"variable_code": f"eq.{RUNOFF_VARIABLE_CODE}", "select": "variable_id"})
    unit = db.get("ref_units", params={"unit_code": f"eq.{MM_UNIT_CODE}", "select": "unit_id"})
    region = db.get("geo_regions", params={"region_code": "eq.IN-KA-BLR-BBMP", "select": "region_id"})
    if not region:
        region = db.get("geo_regions", params={"region_code": "eq.IN-KA", "select": "region_id"})
    return {
        "simulation_model_id": int(model[0]["simulation_model_id"]) if model else None,
        "variable_id": int(var[0]["variable_id"]) if var else None,
        "unit_id": int(unit[0]["unit_id"]) if unit else None,
        "region_id": int(region[0]["region_id"]) if region else None,
    }


def persist_runoff(result: EngineResult, *, forcing_meta: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Write scenario + run + per-cell outputs. Returns ids or None if Supabase unavailable."""
    try:
        from config.settings import get_settings

        if not get_settings().has_supabase:
            return None
        db = _db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("simulation persist skipped (no supabase): %s", exc)
        return None

    ids = _lookup_ids()
    if not ids["simulation_model_id"]:
        logger.warning("simulation persist skipped: model %s missing", MODEL_CODE)
        return None

    cfg = result.configuration or {}
    scenario_name = (
        f"scs_cn_imp_{cfg.get('baseline_impervious', '?')}_to_{cfg.get('scenario_impervious', '?')}_"
        f"{cfg.get('soil_group', 'C')}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"
    )
    input_parameters = {
        "baseline_impervious": cfg.get("baseline_impervious"),
        "scenario_impervious": cfg.get("scenario_impervious"),
        "soil_group": cfg.get("soil_group"),
        "lambda": cfg.get("lambda"),
        "forcing": cfg.get("forcing"),
        "forcing_meta": forcing_meta or {},
        "temporal_coverage": result.temporal_coverage,
        "methodology": result.methodology,
    }
    assumptions = {
        "assumptions": result.assumptions,
        "limitations": result.limitations,
        "validation": result.validation,
    }

    scen_resp = db.post(
        "simulation_scenarios",
        [
            {
                "scenario_name": scenario_name,
                "description": result.title,
                "intervention_type": "impervious_fraction_change",
                "region_id": ids["region_id"],
                "input_parameters": input_parameters,
                "assumptions": assumptions,
                "is_public": True,
                "baseline_timestamp": (result.temporal_coverage or {}).get("start"),
            }
        ],
        prefer="return=representation",
    )
    scen = scen_resp.json()
    scenario_id = scen[0]["scenario_id"] if isinstance(scen, list) else scen["scenario_id"]

    now = datetime.now(timezone.utc).isoformat()
    diff_vals = [v for v in result.grid.fields["total_difference"].values.values() if v is not None]
    summary = {
        "cells": len(result.grid.cells),
        "mean_extra_mm": float(sum(diff_vals) / len(diff_vals)) if diff_vals else None,
        "validation": (result.validation or {}).get("status"),
        "title": result.title,
    }
    run_resp = db.post(
        "simulation_runs",
        [
            {
                "scenario_id": scenario_id,
                "simulation_model_id": ids["simulation_model_id"],
                "status": "completed",
                "started_at": now,
                "completed_at": now,
                "run_parameters": input_parameters,
                "output_summary": summary,
            }
        ],
        prefer="return=representation",
    )
    run = run_resp.json()
    run_id = run[0]["simulation_run_id"] if isinstance(run, list) else run["simulation_run_id"]

    # Per-cell outputs
    out_rows = []
    scen_tot = result.grid.fields["total_runoff_scenario"].values
    base_tot = result.grid.fields["total_runoff_baseline"].values
    delta = result.grid.fields["total_difference"].values
    lo = result.grid.fields["diff_ens_low"].values
    hi = result.grid.fields["diff_ens_high"].values
    end_ts = (result.temporal_coverage or {}).get("end")
    for cell in result.grid.cells:
        cid = cell["id"]
        out_rows.append(
            {
                "simulation_run_id": run_id,
                "variable_id": ids["variable_id"],
                "unit_id": ids["unit_id"],
                "region_id": ids["region_id"],
                "grid_id": cid,
                "target_timestamp": end_ts,
                "simulated_value": scen_tot.get(cid),
                "delta_from_baseline": delta.get(cid),
                "uncertainty": {"ens_low": lo.get(cid), "ens_high": hi.get(cid), "baseline": base_tot.get(cid)},
                "metadata": {"cell_center": cell.get("center"), "forcing": cfg.get("forcing")},
            }
        )

    # Batch insert
    from pipeline.db import BATCH_SIZE

    for i in range(0, len(out_rows), BATCH_SIZE):
        db.post("simulation_outputs", out_rows[i : i + BATCH_SIZE], prefer="return=minimal")

    return {"scenario_id": scenario_id, "simulation_run_id": run_id, "outputs_written": len(out_rows)}
