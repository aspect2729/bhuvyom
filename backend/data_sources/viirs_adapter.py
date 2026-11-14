"""VIIRS land-surface products (LST complementary to MODIS)."""

from __future__ import annotations

import json
import logging
from typing import Any

from acquisition.earthdata_auth import load_auth
from acquisition.granule_discovery import discover_granules_for_region
from config.dataset_registry import get_dataset
from config.settings import get_settings
from data_sources.base_adapter import AcquisitionRequest, AcquisitionResult, BaseAdapter
from processing.metadata import ProvenanceRecord, build_quality_report

logger = logging.getLogger(__name__)


class ViirsAdapter(BaseAdapter):
    dataset_ids = ["viirs_lst_vnp21a1d"]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        auth = load_auth()
        short_name = meta["product_short_name"]
        version = str(meta.get("version", "002"))

        granules: list[dict[str, Any]] = []
        cmr_error = None
        try:
            granules = discover_granules_for_region(
                short_name,
                request.region,
                version=version,
                start=request.start,
                end=request.end,
                page_size=15,
            )
        except Exception as exc:
            cmr_error = str(exc)
            logger.warning("VIIRS CMR search failed: %s", exc)

        if not auth.available:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    f"EARTHDATA_TOKEN not configured. CMR found {len(granules)} "
                    f"granules for {short_name}. LST ≠ air temperature."
                ),
            )
            result.data["granules_discovered"] = len(granules)
            result.data["cmr_error"] = cmr_error
            return result

        settings = get_settings()
        out_dir = settings.raw_dir / "viirs" / request.dataset_id
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"manifest_{request.start}_{request.end}.json"
        path.write_text(
            json.dumps(
                {
                    "dataset_id": request.dataset_id,
                    "short_name": short_name,
                    "version": version,
                    "granules": granules,
                    "region": request.region.bbox_dict(),
                },
                default=str,
            ),
            encoding="utf-8",
        )
        units = {k: v.get("units", "") for k, v in (meta.get("variables") or {}).items()}
        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name=short_name,
            product_version=version,
            quantity_type="Observed",
            variables=list((meta.get("variables") or {}).keys()),
            native_spatial_resolution=meta["native_spatial_resolution"],
            native_temporal_resolution=meta["native_temporal_resolution"],
            units=units,
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism="Earthdata + CMR",
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=0,
            n_missing=0,
            units=units,
            native_spatial_resolution=meta["native_spatial_resolution"],
            urban_suitability=meta.get("urban_suitability"),
            limitations=list(meta.get("limitations") or []),
            extra={"granules": len(granules), "cmr_error": cmr_error},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="ok" if granules else "dry_run",
            representation="raw",
            data={"manifest_path": str(path)},
            provenance=prov,
            quality_report=report,
            local_paths=[str(path)],
        )
