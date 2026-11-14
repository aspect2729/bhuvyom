"""MODIS adapters: LST (MOD11A1), vegetation (MOD13Q1/A2), land cover (MCD12Q1).

LST is land surface temperature — never present as 2 m air temperature.
Prefer MOD13Q1 (250 m) for urban vegetation context.
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

# Bengaluru lies in MODIS sinusoidal tiles h25v07 / h25v08 (approx).
BENGALURU_MODIS_TILES = ["h25v07", "h25v08"]


class ModisAdapter(BaseAdapter):
    dataset_ids = [
        "modis_lst_mod11a1",
        "modis_vi_mod13a2",
        "modis_vi_mod13q1",
        "modis_landcover_mcd12q1",
    ]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        auth = load_auth()
        short_name = meta["product_short_name"]
        version = str(meta.get("version", "061"))

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
            logger.warning("MODIS CMR search failed: %s", exc)

        scale_notes = {
            k: {
                "native_name": v.get("native_name"),
                "units": v.get("units"),
                "scale_factor": v.get("scale_factor"),
            }
            for k, v in (meta.get("variables") or {}).items()
        }

        if not auth.available:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    f"EARTHDATA_TOKEN not configured. CMR found {len(granules)} granules "
                    f"for {short_name}. Apply documented scale factors and QC bitmasks "
                    "before simulation use."
                ),
            )
            result.data.update(
                {
                    "granules_discovered": len(granules),
                    "expected_tiles": BENGALURU_MODIS_TILES,
                    "scale_notes": scale_notes,
                    "cmr_error": cmr_error,
                    "cloud_note": (
                        "Thermal/VI products are clear-sky / composite biased; "
                        "document missing-data percentage per period."
                    ),
                }
            )
            return result

        settings = get_settings()
        out_dir = settings.raw_dir / "modis" / request.dataset_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "dataset_id": request.dataset_id,
            "short_name": short_name,
            "version": version,
            "region": request.region.bbox_dict(),
            "expected_tiles": BENGALURU_MODIS_TILES,
            "scale_notes": scale_notes,
            "granules": granules,
            "quality_filtering": meta.get("quality_fields"),
        }
        path = out_dir / f"manifest_{request.start}_{request.end}.json"
        path.write_text(json.dumps(manifest, default=str), encoding="utf-8")

        units = {k: v.get("units", "") for k, v in (meta.get("variables") or {}).items()}
        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name=short_name,
            product_version=version,
            quantity_type=meta.get("quantity_type", "Observed"),
            variables=list((meta.get("variables") or {}).keys()),
            native_spatial_resolution=meta["native_spatial_resolution"],
            native_temporal_resolution=meta["native_temporal_resolution"],
            units=units,
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism="Earthdata + CMR (LP DAAC)",
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        prov.add_step("cmr_discover", n_granules=len(granules))
        prov.add_step("document_scale_factors", scale_notes=scale_notes)
        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=0,
            n_missing=0,
            units=units,
            native_spatial_resolution=meta["native_spatial_resolution"],
            urban_suitability=meta.get("urban_suitability"),
            limitations=list(meta.get("limitations") or []),
            quality_flag_summary={"fields": meta.get("quality_fields")},
            extra={"granules": len(granules), "cmr_error": cmr_error},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="ok" if granules else "dry_run",
            representation="raw",
            data={"manifest_path": str(path), "scale_notes": scale_notes},
            provenance=prov,
            quality_report=report,
            local_paths=[str(path)],
        )
