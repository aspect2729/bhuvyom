"""Build structured environmental input bundles for a Bengaluru region/period.

Produces separate representations conceptually:
  raw → quality-controlled → aligned → simulation_bundle
without overwriting originals on disk.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4

from config.dataset_registry import get_dataset
from config.settings import get_settings
from data_sources.base_adapter import AcquisitionRequest
from data_sources.registry import get_adapter
from processing.metadata import utc_now_iso
from processing.spatial_subset import RegionSpec, load_region
from simulation.derived_variables import DERIVATION_CATALOG, derive_humidity
from simulation.input_alignment import align_variable_bundle
from simulation.input_validation import validate_simulation_bundle

logger = logging.getLogger(__name__)

Scenario = Literal["urban_heat", "rainfall_runoff", "generic"]

# Logical simulation variables → preferred dataset ids (ordered)
VARIABLE_SOURCES: dict[str, list[str]] = {
    "air_temperature": ["nasa_power", "merra2_assim", "era5_land"],
    "land_surface_temperature": ["modis_lst_mod11a1", "viirs_lst_vnp21a1d"],
    "relative_humidity": ["nasa_power", "merra2_assim", "era5_land"],
    "dew_point": ["merra2_assim", "era5_land"],
    "wind_speed": ["nasa_power", "merra2_assim", "era5_land"],
    "precipitation": ["gpm_imerg_v07_daily", "gpm_imerg_v07_half_hourly", "nasa_power"],
    "soil_moisture": ["smap_spl3smp_e", "era5_land"],
    "vegetation_ndvi": ["modis_vi_mod13q1", "modis_vi_mod13a2"],
    "elevation": ["srtm_dem"],
    "slope": ["srtm_dem"],
    "aspect": ["srtm_dem"],
    "solar_radiation": ["nasa_power", "era5_land"],
    "land_cover": ["modis_landcover_mcd12q1"],
}


def _series_from_power(processed: dict[str, Any], param: str) -> dict[str, Any] | None:
    var = (processed.get("variables") or {}).get(param)
    if not var:
        return None
    return {
        "times": [p["date"] for p in var["series"]],
        "values": [p["value"] for p in var["series"]],
        "units": var.get("unit"),
        "source_dataset_id": "nasa_power",
        "native_resolution": "0.5° × 0.625° (meteo) / 1° (solar)",
        "quantity_type": "Model-derived",
        "long_name": var.get("longName"),
    }


def prepare_simulation_inputs(
    *,
    region: RegionSpec | None = None,
    region_id: str = "bengaluru_bbmp",
    start: date | str,
    end: date | str,
    scenario: Scenario = "generic",
    sim_times: list[str] | None = None,
    acquire: bool = True,
) -> dict[str, Any]:
    """Acquire preferred sources and assemble a provenance-rich input bundle."""
    settings = get_settings()
    region = region or load_region(region_id)
    bundle_id = str(uuid4())

    acquisitions: dict[str, Any] = {}
    raw_variables: dict[str, Any] = {}

    # 1) Always try NASA POWER (works offline-credentials) for meteorology / solar
    if acquire:
        try:
            power = get_adapter("nasa_power").acquire(
                AcquisitionRequest(
                    dataset_id="nasa_power",
                    region=region,
                    start=start,
                    end=end,
                    temporal_mode="daily",
                )
            )
            acquisitions["nasa_power"] = power.to_dict()
            if power.status == "ok":
                mapping = {
                    "air_temperature": "T2M",
                    "relative_humidity": "RH2M",
                    "wind_speed": "WS2M",
                    "precipitation_power": "PRECTOTCORR",
                    "solar_radiation": "ALLSKY_SFC_SW_DWN",
                }
                for logical, param in mapping.items():
                    series = _series_from_power(power.data, param)
                    if series:
                        raw_variables[logical if logical != "precipitation_power" else "precipitation"] = series
                        if logical == "precipitation_power":
                            # Prefer GPM when available; mark POWER precip as secondary
                            raw_variables["precipitation"]["source_note"] = (
                                "From NASA POWER (MERRA-2 corrected precip) — "
                                "prefer GPM IMERG when credentials allow"
                            )
        except Exception as exc:
            logger.exception("POWER acquisition failed during simulation prep")
            acquisitions["nasa_power"] = {"status": "error", "message": str(exc)}

        # 2) Attempt higher-value / credentialed products (dry-run ok)
        for ds_id in (
            "gpm_imerg_v07_daily",
            "modis_lst_mod11a1",
            "modis_vi_mod13q1",
            "modis_landcover_mcd12q1",
            "smap_spl3smp_e",
            "srtm_dem",
            "merra2_assim",
            "era5_land",
        ):
            try:
                opts = {}
                if ds_id == "srtm_dem":
                    opts = {"allow_synthetic_fixture": False}
                result = get_adapter(ds_id).acquire(
                    AcquisitionRequest(
                        dataset_id=ds_id,
                        region=region,
                        start=start,
                        end=end,
                        options=opts,
                    )
                )
                acquisitions[ds_id] = result.to_dict()
            except Exception as exc:
                acquisitions[ds_id] = {"status": "error", "message": str(exc)}

    # Placeholders for variables not yet filled — explicit missing, no invention
    for logical, sources in VARIABLE_SOURCES.items():
        if logical in raw_variables:
            continue
        # Check if any acquisition succeeded with usable series (POWER already handled)
        chosen = None
        for src in sources:
            acq = acquisitions.get(src) or {}
            if acq.get("status") in {"ok", "dry_run", "skipped_no_credentials"}:
                chosen = src
                break
        if logical in {"elevation", "slope", "aspect"}:
            srtm = acquisitions.get("srtm_dem") or {}
            if (srtm.get("data") or {}).get("fixture"):
                fix = srtm["data"]["fixture"]
                # Spatial field — store summary stats only in bundle JSON
                raw_variables[logical] = {
                    "status": "spatial_field",
                    "units": {"elevation": "m", "slope": "degree", "aspect": "degree"}[logical],
                    "source_dataset_id": "srtm_dem",
                    "native_resolution": "fixture or SRTM 30 m",
                    "quantity_type": srtm.get("provenance", {}).get("quantity_type"),
                    "note": "Full grid stored in fixture/raw paths — not expanded here",
                    "WARNING": fix.get("WARNING"),
                }
            else:
                raw_variables[logical] = {
                    "status": "missing",
                    "reason": "SRTM not downloaded (credentials/fixture not enabled)",
                    "candidate_sources": sources,
                }
        elif logical == "land_surface_temperature":
            raw_variables[logical] = {
                "status": "missing",
                "reason": "MODIS/VIIRS LST requires Earthdata download + QC; not substituted with air temperature",
                "candidate_sources": sources,
                "quantity_type": "Observed",
            }
        elif logical == "soil_moisture":
            raw_variables[logical] = {
                "status": "missing",
                "reason": "SMAP/ERA5-Land not retrieved as a usable series in this run",
                "candidate_sources": sources,
                "urban_suitability_note": get_dataset("smap_spl3smp_e").get("urban_suitability_note"),
            }
        elif logical in {"vegetation_ndvi", "land_cover", "dew_point"}:
            raw_variables[logical] = {
                "status": "missing",
                "reason": f"No usable series for {logical} in this run",
                "candidate_sources": sources,
            }
        elif chosen and logical not in raw_variables:
            raw_variables[logical] = {
                "status": "missing",
                "reason": f"Source {chosen} contacted but no time series extracted yet",
                "candidate_sources": sources,
                "acquisition_status": (acquisitions.get(chosen) or {}).get("status"),
            }

    # Derived RH already from POWER; document catalog
    derived = {"catalog": DERIVATION_CATALOG}
    if (
        "air_temperature" in raw_variables
        and raw_variables["air_temperature"].get("values")
        and "relative_humidity" in raw_variables
    ):
        derived["note"] = "RH2M taken from POWER (model-derived), not recomputed from dew point"

    # Build simulation times from air temperature series if not provided
    if sim_times is None:
        at = raw_variables.get("air_temperature") or {}
        sim_times = [f"{d}T12:00:00" for d in (at.get("times") or [])]
        if not sim_times:
            sim_times = [f"{start}T00:00:00", f"{end}T00:00:00"]

    align_inputs = {
        k: v
        for k, v in raw_variables.items()
        if isinstance(v, dict) and v.get("times") and v.get("values") is not None
    }
    aligned = align_variable_bundle(align_inputs, sim_times)

    # Merge missing variables into aligned block
    for k, v in raw_variables.items():
        if k not in aligned["variables"]:
            aligned["variables"][k] = v if "status" in v else {**v, "status": "native"}

    bundle = {
        "bundle_id": bundle_id,
        "created_at": utc_now_iso(),
        "scenario": scenario,
        "region": region.to_dict(),
        "time_range": {"start": str(start), "end": str(end)},
        "representations": {
            "raw_acquisitions": "backend/data/raw/",
            "this_bundle": "simulation_inputs representation",
            "note": "Original acquisitions are not overwritten by alignment",
        },
        "variables": aligned["variables"],
        "alignment": {
            "sim_times": aligned["sim_times"],
            "method": aligned["alignment_method"],
            "max_delta_hours": aligned["max_delta_hours"],
        },
        "derived": derived,
        "acquisitions": {
            k: {
                "status": v.get("status"),
                "message": v.get("message"),
                "quality_report": v.get("quality_report"),
                "provenance": v.get("provenance"),
                "local_paths": v.get("local_paths"),
            }
            for k, v in acquisitions.items()
        },
        "variable_source_policy": VARIABLE_SOURCES,
        "additional_requirements": {
            "urban_heat": [
                "anthropogenic heat inventory",
                "surface material / albedo / emissivity",
                "boundary-layer scheme parameters",
                "calibration against local stations",
            ],
            "rainfall_runoff": [
                "soil hydraulic parameters",
                "infiltration and routing scheme",
                "impervious fraction (local high-res product preferred)",
                "calibration / validation gauges",
            ],
        },
    }

    validation = validate_simulation_bundle(bundle)
    bundle["validation"] = validation

    out_dir = settings.simulation_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"bundle_{bundle_id}.json"
    out_path.write_text(json.dumps(bundle, indent=2, default=str), encoding="utf-8")
    bundle["local_path"] = str(out_path)
    return bundle
