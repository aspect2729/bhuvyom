"""Align multi-source fields into a common simulation time index without silent substitution."""

from __future__ import annotations

from typing import Any

from processing.temporal_harmonisation import align_to_timesteps


def align_variable_bundle(
    variables: dict[str, dict[str, Any]],
    sim_times: list[str],
    *,
    method: str = "nearest",
    max_delta_hours: float = 12.0,
) -> dict[str, Any]:
    """variables[name] = {times, values, units, source_dataset_id, native_resolution}."""
    aligned: dict[str, Any] = {}
    for name, spec in variables.items():
        times = spec.get("times") or []
        values = spec.get("values") or []
        if not times:
            aligned[name] = {
                "status": "missing",
                "reason": "No observations supplied — not substituted",
                "source_dataset_id": spec.get("source_dataset_id"),
                "units": spec.get("units"),
                "native_resolution": spec.get("native_resolution"),
            }
            continue
        result = align_to_timesteps(
            times,
            values,
            sim_times,
            method=method,  # type: ignore[arg-type]
            max_delta_hours=max_delta_hours,
            units=spec.get("units") or "unknown",
        )
        aligned[name] = {
            **result,
            "status": "aligned",
            "source_dataset_id": spec.get("source_dataset_id"),
            "native_resolution": spec.get("native_resolution"),
            "quantity_type": spec.get("quantity_type"),
        }
    return {
        "sim_times": sim_times,
        "variables": aligned,
        "alignment_method": method,
        "max_delta_hours": max_delta_hours,
    }
