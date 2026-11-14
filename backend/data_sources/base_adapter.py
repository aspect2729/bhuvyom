"""Abstract adapter contract for all data sources."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from processing.metadata import ProvenanceRecord, utc_now_iso
from processing.spatial_subset import RegionSpec


@dataclass
class AcquisitionRequest:
    dataset_id: str
    region: RegionSpec
    start: date | str
    end: date | str
    variables: list[str] | None = None
    temporal_mode: str | None = None  # e.g. daily | half_hourly | hourly
    options: dict[str, Any] = field(default_factory=dict)


@dataclass
class AcquisitionResult:
    dataset_id: str
    status: str  # ok | dry_run | skipped_no_credentials | error
    representation: str  # raw | quality_controlled | ...
    data: dict[str, Any]
    provenance: ProvenanceRecord
    quality_report: dict[str, Any]
    local_paths: list[str] = field(default_factory=list)
    message: str | None = None
    acquired_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "status": self.status,
            "representation": self.representation,
            "data": self.data,
            "provenance": self.provenance.to_dict(),
            "quality_report": self.quality_report,
            "local_paths": self.local_paths,
            "message": self.message,
            "acquired_at": self.acquired_at,
        }


class BaseAdapter(ABC):
    dataset_ids: list[str] = []

    @abstractmethod
    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        """Fetch / prepare data for the request (sync entrypoint)."""

    def supports(self, dataset_id: str) -> bool:
        return dataset_id in self.dataset_ids

    def dry_run_payload(
        self,
        request: AcquisitionRequest,
        *,
        meta: dict[str, Any],
        reason: str,
    ) -> AcquisitionResult:
        from processing.metadata import ProvenanceRecord, build_quality_report

        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name=meta.get("product_short_name", ""),
            product_version=str(meta.get("version", "")),
            quantity_type=meta.get("quantity_type", "Observed"),
            variables=list((meta.get("variables") or {}).keys()),
            native_spatial_resolution=meta.get("native_spatial_resolution", "unknown"),
            native_temporal_resolution=meta.get("native_temporal_resolution", "unknown"),
            units={
                k: v.get("units", "")
                for k, v in (meta.get("variables") or {}).items()
            },
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism=meta.get("access", ""),
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        prov.add_step("dry_run", reason=reason)
        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=0,
            n_missing=0,
            units=prov.units,
            native_spatial_resolution=prov.native_spatial_resolution,
            urban_suitability=prov.urban_suitability,
            limitations=prov.limitations,
            extra={"dry_run": True, "reason": reason},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="skipped_no_credentials" if "credential" in reason.lower() else "dry_run",
            representation="raw",
            data={
                "region": request.region.to_dict(),
                "planned_variables": request.variables
                or list((meta.get("variables") or {}).keys()),
            },
            provenance=prov,
            quality_report=report,
            message=reason,
        )
