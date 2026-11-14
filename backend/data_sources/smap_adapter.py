"""SMAP SPL3SMP_E surface soil moisture (~9 km enhanced posting).

Does NOT claim neighbourhood-scale soil moisture. Radiometer footprint ~36 km;
9 km is an enhanced grid posting. Surface (~5 cm) only — not root-zone.
"""

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


class SmapAdapter(BaseAdapter):
    dataset_ids = ["smap_spl3smp_e"]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        auth = load_auth()
        short_name = meta["product_short_name"]
        version = str(meta.get("version", "006"))

        granules: list[dict[str, Any]] = []
        cmr_error = None
        try:
            granules = discover_granules_for_region(
                short_name,
                request.region,
                version=version,
                start=request.start,
                end=request.end,
                page_size=10,
            )
        except Exception as exc:
            cmr_error = str(exc)
            logger.warning("SMAP CMR search failed: %s", exc)

        suitability_flag = {
            "urban_suitability": "unsuitable_for_neighbourhood",
            "native_info_content": "~36 km radiometer footprint",
            "grid_posting": "9 km EASE-Grid 2.0 (Backus-Gilbert enhanced)",
            "depth": "surface ~top 5 cm",
            "root_zone": False,
            "alternative_note": (
                "ERA5-Land swvl1 (~0.1°) is a model-based alternative for continuous "
                "soil moisture fields — still not neighbourhood-scale observation."
            ),
        }

        if not auth.available:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    f"EARTHDATA_TOKEN not configured. CMR found {len(granules)} SMAP "
                    "granules. Product flagged unsuitable for neighbourhood-scale soil moisture."
                ),
            )
            result.data["granules_discovered"] = len(granules)
            result.data["suitability_flag"] = suitability_flag
            result.data["cmr_error"] = cmr_error
            return result

        settings = get_settings()
        out_dir = settings.raw_dir / "smap"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"manifest_{request.start}_{request.end}.json"
        path.write_text(
            json.dumps(
                {
                    "dataset_id": request.dataset_id,
                    "short_name": short_name,
                    "version": version,
                    "granules": granules,
                    "suitability_flag": suitability_flag,
                    "quality_fields": meta.get("quality_fields"),
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
            access_mechanism="Earthdata + CMR (NSIDC)",
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
            urban_suitability="unsuitable_for_neighbourhood",
            limitations=list(meta.get("limitations") or []),
            extra={"suitability_flag": suitability_flag, "granules": len(granules)},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="ok" if granules else "dry_run",
            representation="raw",
            data={"manifest_path": str(path), "suitability_flag": suitability_flag},
            provenance=prov,
            quality_report=report,
            local_paths=[str(path)],
        )
