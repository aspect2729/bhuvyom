"""MERRA-2 reanalysis adapter (M2T1NXSLV and related).

Quantity type: Model-derived. Native 0.5°×0.625° — unsuitable for neighbourhood
urban heat; suitable as regional atmospheric boundary conditions.
Air temperature fields must never be labelled as LST.
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


class Merra2Adapter(BaseAdapter):
    dataset_ids = ["merra2_assim"]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        auth = load_auth()
        short_name = meta["product_short_name"]
        version = str(meta.get("version", "5.12.4"))

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
            logger.warning("MERRA-2 CMR search failed: %s", exc)

        # POWER already provides MERRA-2-derived daily meteorology without tokens;
        # document that path as the practical Bengaluru fallback.
        from data_sources.nasa_power_adapter import NasaPowerAdapter

        power_fallback = None
        if request.options.get("use_power_fallback", True):
            try:
                power_req = AcquisitionRequest(
                    dataset_id="nasa_power",
                    region=request.region,
                    start=request.start,
                    end=request.end,
                    variables=["T2M", "RH2M", "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"],
                    temporal_mode="daily",
                )
                power_fallback = NasaPowerAdapter().acquire(power_req).to_dict()
            except Exception as exc:
                logger.warning("POWER fallback failed: %s", exc)

        if not auth.available:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    "EARTHDATA_TOKEN not configured for direct MERRA-2 OPeNDAP. "
                    "NASA POWER fallback used for MERRA-2-derived daily meteorology "
                    "when available (still Model-derived, same coarse resolution)."
                ),
            )
            result.data["granules_discovered"] = len(granules)
            result.data["cmr_error"] = cmr_error
            result.data["power_fallback"] = power_fallback
            result.data["physical_distinction"] = {
                "air_temperature": "T2M is 2 m air temperature (reanalysis)",
                "not_lst": "Do not present as land surface temperature",
            }
            if power_fallback and power_fallback.get("status") == "ok":
                result.status = "ok"
                result.representation = "quality_controlled"
                result.message = (
                    "Direct MERRA-2 skipped (no token); NASA POWER MERRA-2-derived "
                    "fields acquired as documented fallback."
                )
            return result

        settings = get_settings()
        out_dir = settings.raw_dir / "merra2"
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "dataset_id": request.dataset_id,
            "short_name": short_name,
            "version": version,
            "region": request.region.bbox_dict(),
            "granules": granules,
            "opendap_hint": "https://goldsmr4.gesdisc.eosdis.nasa.gov/opendap/",
            "power_fallback": power_fallback,
        }
        path = out_dir / f"manifest_{request.start}_{request.end}.json"
        path.write_text(json.dumps(manifest, default=str), encoding="utf-8")

        units = {k: v.get("units", "") for k, v in (meta.get("variables") or {}).items()}
        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name=short_name,
            product_version=version,
            quantity_type="Model-derived",
            variables=list((meta.get("variables") or {}).keys()),
            native_spatial_resolution="0.5° × 0.625°",
            native_temporal_resolution="1 hour",
            units=units,
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism="Earthdata + CMR / OPeNDAP (POWER fallback documented)",
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        prov.add_step("cmr_discover", n_granules=len(granules))
        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=0,
            n_missing=0,
            units=units,
            native_spatial_resolution="0.5° × 0.625°",
            urban_suitability=meta.get("urban_suitability"),
            limitations=list(meta.get("limitations") or []),
            extra={"granules": len(granules), "cmr_error": cmr_error},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="ok" if granules or power_fallback else "dry_run",
            representation="raw",
            data={"manifest_path": str(path), "power_fallback": power_fallback},
            provenance=prov,
            quality_report=report,
            local_paths=[str(path)],
            message="MERRA-2 granule manifest written; prefer OPeNDAP spatial subset.",
        )
