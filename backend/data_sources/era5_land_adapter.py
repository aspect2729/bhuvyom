"""ERA5-Land adapter via Copernicus CDS.

Requires CDS_API_KEY and accepted dataset licences — separate from Earthdata.
When CDS credentials are absent, returns a documented skipped result.
"""

from __future__ import annotations

import json
import logging

from config.dataset_registry import get_dataset
from config.settings import get_settings
from data_sources.base_adapter import AcquisitionRequest, AcquisitionResult, BaseAdapter
from processing.metadata import ProvenanceRecord, build_quality_report

logger = logging.getLogger(__name__)


class Era5LandAdapter(BaseAdapter):
    dataset_ids = ["era5_land"]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        settings = get_settings()

        if not settings.has_cds:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    "CDS_API_KEY not configured. ERA5-Land requires a Copernicus CDS "
                    "account, API key, and acceptance of the ERA5-Land licence. "
                    "Engine remains operational using MERRA-2/POWER and other sources."
                ),
            )
            result.status = "skipped_no_credentials"
            result.data["cds_request_template"] = self._cds_template(request)
            return result

        # Live CDS retrieval is optional dependency (cdsapi). Attempt if installed.
        out_dir = settings.raw_dir / "era5_land"
        out_dir.mkdir(parents=True, exist_ok=True)
        template = self._cds_template(request)
        target = out_dir / f"era5_land_{request.start}_{request.end}.nc"
        try:
            import cdsapi  # type: ignore

            client = cdsapi.Client(
                url=settings.cds_api_url,
                key=settings.cds_api_key,
            )
            client.retrieve("reanalysis-era5-land", template, str(target))
            status = "ok"
            message = f"ERA5-Land retrieved to {target}"
            paths = [str(target)]
        except ImportError:
            status = "dry_run"
            message = "cdsapi not installed; request template saved only."
            paths = []
        except Exception as exc:
            status = "error"
            message = str(exc)
            paths = []
            logger.exception("ERA5-Land retrieval failed")

        template_path = out_dir / f"request_{request.start}_{request.end}.json"
        template_path.write_text(json.dumps(template, indent=2), encoding="utf-8")
        paths.append(str(template_path))

        units = {k: v.get("units", "") for k, v in (meta.get("variables") or {}).items()}
        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name="reanalysis-era5-land",
            product_version="ERA5-Land",
            quantity_type="Model-derived",
            variables=list((meta.get("variables") or {}).keys()),
            native_spatial_resolution="0.1°",
            native_temporal_resolution="1 hour",
            units=units,
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism="Copernicus CDS API",
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=0,
            n_missing=0,
            units=units,
            native_spatial_resolution="0.1°",
            urban_suitability=meta.get("urban_suitability"),
            limitations=list(meta.get("limitations") or []),
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status=status,
            representation="raw",
            data={"cds_request": template},
            provenance=prov,
            quality_report=report,
            local_paths=paths,
            message=message,
        )

    def _cds_template(self, request: AcquisitionRequest) -> dict:
        west, south, east, north = request.region.bbox_wsen()
        variables = request.variables or [
            "2m_temperature",
            "2m_dewpoint_temperature",
            "10m_u_component_of_wind",
            "10m_v_component_of_wind",
            "total_precipitation",
            "volumetric_soil_water_layer_1",
            "surface_solar_radiation_downwards",
        ]
        return {
            "product_type": "reanalysis",
            "variable": variables,
            "year": str(request.start)[:4],
            "month": str(request.start)[5:7] if len(str(request.start)) >= 7 else "01",
            "day": str(request.start)[8:10] if len(str(request.start)) >= 10 else "01",
            "time": [f"{h:02d}:00" for h in range(0, 24, 6)],
            "area": [north, west, south, east],
            "format": "netcdf",
            "note": "Template — expand day/month lists for multi-day jobs",
        }
