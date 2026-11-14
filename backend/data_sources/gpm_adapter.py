"""GPM IMERG V07 adapter (daily + half-hourly).

Access: Earthdata token + CMR granule discovery. When credentials are missing,
returns a structured dry-run / skipped result (offline tests still pass).

Native resolution: 0.1° (~11 km), unsuitable as neighbourhood-scale rainfall
detail — flagged explicitly in provenance.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from acquisition.earthdata_auth import load_auth
from acquisition.granule_discovery import discover_granules_for_region
from config.dataset_registry import get_dataset
from config.settings import get_settings
from data_sources.base_adapter import AcquisitionRequest, AcquisitionResult, BaseAdapter
from processing.metadata import ProvenanceRecord, build_quality_report

logger = logging.getLogger(__name__)

PRODUCT_MAP = {
    "gpm_imerg_v07_daily": {"short_name": "GPM_3IMERGDF", "version": "07", "mode": "daily"},
    "gpm_imerg_v07_half_hourly": {
        "short_name": "GPM_3IMERGHH",
        "version": "07",
        "mode": "half_hourly",
    },
}


class GpmAdapter(BaseAdapter):
    dataset_ids = list(PRODUCT_MAP.keys())

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        product = PRODUCT_MAP[request.dataset_id]
        auth = load_auth()

        # Always attempt CMR metadata search (public); download requires auth.
        granules: list[dict[str, Any]] = []
        cmr_error: str | None = None
        try:
            granules = discover_granules_for_region(
                product["short_name"],
                request.region,
                version=product["version"],
                start=request.start,
                end=request.end,
                page_size=20,
            )
        except Exception as exc:
            cmr_error = str(exc)
            logger.warning("GPM CMR search failed: %s", exc)

        if not auth.available:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    "EARTHDATA_TOKEN not configured — granule discovery metadata "
                    f"returned {len(granules)} entries; download skipped."
                ),
            )
            result.data["granules_discovered"] = [
                {
                    "id": g.get("id"),
                    "title": g.get("title"),
                    "time_start": g.get("time_start"),
                    "time_end": g.get("time_end"),
                    "n_download_urls": len(g.get("download_urls") or []),
                }
                for g in granules
            ]
            result.data["cmr_error"] = cmr_error
            result.data["native_notes"] = {
                "spatial_resolution": "0.1°",
                "temporal_resolution": product["mode"],
                "variable_warning": (
                    "precipitationCal is a rate (mm/hr) in half-hourly files; "
                    "daily product uses mm/day accumulation fields — do not confuse "
                    "with precipitation retrieval counts."
                ),
            }
            return result

        # With credentials: record planned subset download paths (OPeNDAP/HTTPS).
        settings = get_settings()
        out_dir = settings.raw_dir / "gpm" / request.dataset_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "dataset_id": request.dataset_id,
            "product": product,
            "region": request.region.bbox_dict(),
            "start": str(request.start),
            "end": str(request.end),
            "granules": granules,
            "download_status": "urls_ready",
            "note": (
                "Prefer OPeNDAP spatial subset over full global granules. "
                "Full-file download is a last resort."
            ),
        }
        # Attempt download of first small set of https links if present
        downloaded: list[str] = []
        from acquisition.remote_access import download_file
        import asyncio

        async def _dl() -> list[str]:
            paths: list[str] = []
            for g in granules[:3]:
                for url in g.get("download_urls") or []:
                    if "opendap" in url.lower():
                        continue
                    if not url.startswith("https://"):
                        continue
                    try:
                        dest = out_dir / (g.get("title") or "granule").replace("/", "_")
                        path = await download_file(url, dest=dest, require_auth=True)
                        paths.append(str(path))
                        break
                    except Exception as exc:
                        logger.warning("GPM download failed for %s: %s", url, exc)
            return paths

        try:
            downloaded = asyncio.run(_dl())
            manifest["downloaded"] = downloaded
            status = "ok" if downloaded else "dry_run"
            message = (
                f"Downloaded {len(downloaded)} granules"
                if downloaded
                else "Credentials present but no downloadable HTTPS links retrieved; "
                "manifest saved for OPeNDAP subset tooling."
            )
        except Exception as exc:
            status = "error"
            message = str(exc)
            manifest["error"] = message

        manifest_path = out_dir / f"manifest_{request.start}_{request.end}.json"
        manifest_path.write_text(json.dumps(manifest, default=str), encoding="utf-8")

        units = {
            k: v.get("units", "")
            for k, v in (meta.get("variables") or {}).items()
        }
        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name=product["short_name"],
            product_version=product["version"],
            quantity_type="Observed",
            variables=list((meta.get("variables") or {}).keys()),
            native_spatial_resolution="0.1°",
            native_temporal_resolution=meta["native_temporal_resolution"],
            units=units,
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism="Earthdata + CMR (+ HTTPS/OPeNDAP)",
            source_urls=[u for g in granules for u in (g.get("download_urls") or [])][:20],
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        prov.add_step("cmr_discover", n_granules=len(granules))
        if downloaded:
            prov.add_step("download_subset", n_files=len(downloaded))

        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=0,
            n_missing=0,
            units=units,
            native_spatial_resolution="0.1° (~11 km)",
            urban_suitability=meta.get("urban_suitability"),
            limitations=list(meta.get("limitations") or []),
            extra={
                "granules_discovered": len(granules),
                "files_downloaded": len(downloaded),
                "cmr_error": cmr_error,
            },
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status=status,
            representation="raw",
            data={
                "granules": [
                    {
                        "id": g.get("id"),
                        "title": g.get("title"),
                        "time_start": g.get("time_start"),
                        "time_end": g.get("time_end"),
                    }
                    for g in granules
                ],
                "manifest_path": str(manifest_path),
            },
            provenance=prov,
            quality_report=report,
            local_paths=[str(manifest_path), *downloaded],
            message=message,
        )
