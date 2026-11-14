"""Provenance and data-quality reporting for simulation-ready outputs."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ProvenanceRecord:
    dataset_id: str
    product_short_name: str
    product_version: str
    quantity_type: str
    variables: list[str]
    native_spatial_resolution: str
    native_temporal_resolution: str
    units: dict[str, str]
    region_id: str
    time_start: Optional[str]
    time_end: Optional[str]
    access_mechanism: str
    source_urls: list[str] = field(default_factory=list)
    processing_steps: list[dict[str, Any]] = field(default_factory=list)
    quality_summary: dict[str, Any] = field(default_factory=dict)
    limitations: list[str] = field(default_factory=list)
    urban_suitability: Optional[str] = None
    urban_suitability_note: Optional[str] = None
    created_at: str = field(default_factory=utc_now_iso)

    def add_step(self, name: str, **details: Any) -> None:
        self.processing_steps.append(
            {"step": name, "at": utc_now_iso(), **details}
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_quality_report(
    *,
    dataset_id: str,
    n_values: int,
    n_missing: int,
    units: dict[str, str],
    native_spatial_resolution: str,
    output_spatial_resolution: str | None = None,
    resampling_method: str | None = None,
    temporal_aggregation: str | None = None,
    coordinate_checks: dict[str, Any] | None = None,
    quality_flag_summary: dict[str, Any] | None = None,
    urban_suitability: str | None = None,
    limitations: list[str] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    total = n_values + n_missing
    missing_pct = (100.0 * n_missing / total) if total else None
    report = {
        "dataset_id": dataset_id,
        "n_values": n_values,
        "n_missing": n_missing,
        "missing_percent": missing_pct,
        "units": units,
        "native_spatial_resolution": native_spatial_resolution,
        "output_spatial_resolution": output_spatial_resolution or native_spatial_resolution,
        "resampling_method": resampling_method or "none",
        "temporal_aggregation": temporal_aggregation or "none",
        "coordinate_checks": coordinate_checks or {},
        "quality_flag_summary": quality_flag_summary or {},
        "urban_suitability": urban_suitability,
        "limitations": limitations or [],
        "generated_at": utc_now_iso(),
        "notes": [
            "Resampling changes grid representation; it does not create new observations.",
            "Missing values are preserved; they are never invented.",
        ],
    }
    if extra:
        report["extra"] = extra
    return report
