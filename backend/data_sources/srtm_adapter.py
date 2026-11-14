"""SRTM elevation adapter with documented slope/aspect derivation."""

from __future__ import annotations

import json
import logging
import math
from typing import Any

import numpy as np

from acquisition.earthdata_auth import load_auth
from acquisition.granule_discovery import discover_granules_for_region
from config.dataset_registry import get_dataset
from config.settings import get_settings
from data_sources.base_adapter import AcquisitionRequest, AcquisitionResult, BaseAdapter
from processing.metadata import ProvenanceRecord, build_quality_report

logger = logging.getLogger(__name__)


def compute_slope_aspect(
    elevation_m: np.ndarray,
    *,
    cellsize_x_m: float,
    cellsize_y_m: float,
) -> dict[str, Any]:
    """Horn (1981)-style slope/aspect from a regular elevation grid.

    slope: degrees from horizontal
    aspect: degrees clockwise from north (0–360); flat cells → NaN
    """
    z = np.asarray(elevation_m, dtype=float)
    dz_dy, dz_dx = np.gradient(z, cellsize_y_m, cellsize_x_m)
    slope_rad = np.arctan(np.hypot(dz_dx, dz_dy))
    slope_deg = np.degrees(slope_rad)
    # aspect: 0 = north
    aspect = (np.degrees(np.arctan2(dz_dx, -dz_dy)) + 360.0) % 360.0
    aspect = np.where(slope_deg < 1e-6, np.nan, aspect)
    return {
        "slope_deg": slope_deg,
        "aspect_deg": aspect,
        "formula": {
            "slope": "arctan(hypot(dz/dx, dz/dy)) in degrees (numpy.gradient)",
            "aspect": "(atan2(dz/dx, -dz/dy) in degrees + 360) % 360; NaN where flat",
            "reference": "Horn 1981 terrain derivatives (gradient approximation)",
        },
        "units": {"slope": "degree", "aspect": "degree", "elevation": "m"},
        "assumptions": [
            "Local planar approximation on projected metres",
            "No vertical datum transform applied here",
        ],
    }


class SrtmAdapter(BaseAdapter):
    dataset_ids = ["srtm_dem"]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        auth = load_auth()
        settings = get_settings()

        granules = []
        cmr_error = None
        try:
            granules = discover_granules_for_region(
                "SRTMGL1",
                request.region,
                version="003",
                start="2000-02-01",
                end="2000-02-28",
                page_size=5,
            )
        except Exception as exc:
            cmr_error = str(exc)
            logger.warning("SRTM CMR search failed: %s", exc)

        # Synthetic local grid ONLY for offline structural tests when explicitly requested
        use_fixture = bool(request.options.get("allow_synthetic_fixture"))
        fixture_data = None
        if use_fixture:
            # Mild dome over Bengaluru-like domain for pipeline testing — clearly labelled.
            west, south, east, north = request.region.bbox_wsen()
            lats = np.linspace(south, north, 32)
            lons = np.linspace(west, east, 32)
            lon_g, lat_g = np.meshgrid(lons, lats)
            # Approx urban elevation ~900 m with gentle relief — FIXTURE ONLY
            elev = 900.0 + 40.0 * np.sin((lon_g - west) * 40) * np.cos((lat_g - south) * 40)
            # Approximate metres per degree at ~13°N
            lat0 = 0.5 * (south + north)
            cell_y = abs(lats[1] - lats[0]) * 111_320.0
            cell_x = abs(lons[1] - lons[0]) * 111_320.0 * math.cos(math.radians(lat0))
            derived = compute_slope_aspect(elev, cellsize_x_m=cell_x, cellsize_y_m=cell_y)
            fixture_data = {
                "lats": lats.tolist(),
                "lons": lons.tolist(),
                "elevation_m": elev.tolist(),
                "slope_deg": derived["slope_deg"].tolist(),
                "aspect_deg": [
                    [None if (isinstance(v, float) and math.isnan(v)) else float(v) for v in row]
                    for row in derived["aspect_deg"].tolist()
                ],
                "derivation": derived["formula"],
                "WARNING": (
                    "SYNTHETIC FIXTURE for offline pipeline tests — not SRTM observations. "
                    "Do not use for simulation science."
                ),
            }
            fix_path = settings.data_root / "fixtures" / "srtm_synthetic_fixture.json"
            fix_path.parent.mkdir(parents=True, exist_ok=True)
            fix_path.write_text(json.dumps(fixture_data), encoding="utf-8")

        if not auth.available and not use_fixture:
            result = self.dry_run_payload(
                request,
                meta=meta,
                reason=(
                    f"EARTHDATA_TOKEN not configured. CMR found {len(granules)} SRTMGL1 "
                    "granules. Pass options.allow_synthetic_fixture=true only for offline "
                    "pipeline structural tests (never for science)."
                ),
            )
            result.data["granules_discovered"] = len(granules)
            result.data["cmr_error"] = cmr_error
            result.data["slope_aspect_method"] = compute_slope_aspect(
                np.zeros((3, 3)), cellsize_x_m=30.0, cellsize_y_m=30.0
            )["formula"]
            return result

        out_dir = settings.raw_dir / "srtm"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "manifest.json"
        path.write_text(
            json.dumps(
                {
                    "granules": granules,
                    "fixture_used": use_fixture,
                    "cmr_error": cmr_error,
                },
                default=str,
            ),
            encoding="utf-8",
        )

        units = {"elevation": "m", "slope": "degree", "aspect": "degree"}
        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name="SRTMGL1",
            product_version="003",
            quantity_type="Observed" if not use_fixture else "Simulated",
            variables=["elevation", "slope", "aspect"],
            native_spatial_resolution="1 arc-second (~30 m)" if not use_fixture else "fixture grid",
            native_temporal_resolution="static",
            units=units,
            region_id=request.region.id,
            time_start="2000-02",
            time_end="2000-02",
            access_mechanism="Earthdata SRTMGL1" if auth.available else "synthetic_fixture",
            limitations=list(meta.get("limitations") or [])
            + (["SYNTHETIC FIXTURE — not real SRTM"] if use_fixture else []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        if fixture_data:
            prov.add_step("synthetic_fixture", warning=fixture_data["WARNING"])
            prov.add_step("derive_slope_aspect", **fixture_data["derivation"])

        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=int(np.size(fixture_data["elevation_m"])) if fixture_data else 0,
            n_missing=0,
            units=units,
            native_spatial_resolution=prov.native_spatial_resolution,
            urban_suitability=meta.get("urban_suitability"),
            limitations=prov.limitations,
            extra={"fixture_used": use_fixture, "granules": len(granules)},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="ok" if (fixture_data or granules) else "dry_run",
            representation="quality_controlled" if fixture_data else "raw",
            data={"manifest_path": str(path), "fixture": fixture_data},
            provenance=prov,
            quality_report=report,
            local_paths=[str(path)],
        )
