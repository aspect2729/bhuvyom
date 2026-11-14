"""Validate simulation input bundles for physical meaning and provenance completeness."""

from __future__ import annotations

from typing import Any


REQUIRED_PROVENANCE_KEYS = {
    "dataset_id",
    "quantity_type",
    "native_spatial_resolution",
    "units",
}


def validate_simulation_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    if "region" not in bundle:
        errors.append("Missing region")
    if "time_range" not in bundle:
        errors.append("Missing time_range")
    if "variables" not in bundle:
        errors.append("Missing variables")

    variables = bundle.get("variables") or {}
    for name, spec in variables.items():
        if spec.get("status") == "missing":
            warnings.append(f"{name}: missing — not silently substituted")
            continue
        units = spec.get("units")
        if not units:
            errors.append(f"{name}: units missing")
        qty = spec.get("quantity_type")
        if not qty:
            warnings.append(f"{name}: quantity_type undocumented")
        if name in {"land_surface_temperature", "LST", "LST_Day_1km"}:
            if qty == "Model-derived" and "air" in (spec.get("source_dataset_id") or ""):
                errors.append("LST must not be sourced from air-temperature reanalysis alone")
        native = spec.get("native_resolution") or spec.get("native_spatial_resolution")
        out_res = spec.get("output_resolution")
        if out_res and native and out_res != native:
            if not spec.get("resampling_method"):
                errors.append(f"{name}: resampled without documenting resampling_method")
            warnings.append(
                f"{name}: output grid {out_res} finer/different than source {native} — "
                "do not treat as finer observational accuracy"
            )

    # Scenario completeness checks (soft)
    scenario = bundle.get("scenario")
    if scenario == "urban_heat":
        for req in (
            "air_temperature",
            "land_surface_temperature",
            "solar_radiation",
            "wind_speed",
            "relative_humidity",
            "land_cover",
            "elevation",
        ):
            if req not in variables or variables[req].get("status") == "missing":
                warnings.append(f"urban_heat scenario incomplete: missing {req}")
        warnings.append(
            "These inputs alone are NOT sufficient for a physically validated UHI model; "
            "boundary conditions, anthropogenic heat, material properties, and calibration are required."
        )
    if scenario == "rainfall_runoff":
        for req in (
            "precipitation",
            "soil_moisture",
            "elevation",
            "slope",
            "land_cover",
        ):
            if req not in variables or variables[req].get("status") == "missing":
                warnings.append(f"rainfall_runoff scenario incomplete: missing {req}")
        warnings.append(
            "Rainfall-runoff simulation also needs soil hydraulic parameters, infiltration "
            "scheme, channel routing, and calibration — not provided by acquisition alone."
        )

    ok = not errors
    return {
        "ok": ok,
        "errors": errors,
        "warnings": warnings,
        "simulation_ready_claim": (
            "Data passed structural validation with provenance. "
            "This does NOT mean a physically validated simulation can be run without "
            "additional parameters, boundary conditions, and calibration."
            if ok
            else "Structural validation failed — do not claim simulation-ready."
        ),
    }
