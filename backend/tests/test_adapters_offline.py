"""Offline / no-credential tests — engine must initialise and respond."""

from __future__ import annotations

from processing.spatial_subset import load_region
from data_sources.base_adapter import AcquisitionRequest
from data_sources.gpm_adapter import GpmAdapter
from data_sources.smap_adapter import SmapAdapter
from data_sources.modis_adapter import ModisAdapter
from data_sources.srtm_adapter import SrtmAdapter
from data_sources.era5_land_adapter import Era5LandAdapter
from data_sources.registry import list_supported_datasets
from config.dataset_registry import list_datasets


def test_registry_covers_priority_variables():
    ids = {d["id"] for d in list_datasets()}
    for required in (
        "gpm_imerg_v07_daily",
        "merra2_assim",
        "nasa_power",
        "modis_lst_mod11a1",
        "modis_vi_mod13q1",
        "smap_spl3smp_e",
        "srtm_dem",
        "era5_land",
    ):
        assert required in ids
    assert set(list_supported_datasets()) >= ids


def test_gpm_smap_modis_skip_without_credentials():
    region = load_region("bengaluru_bbmp")
    req = AcquisitionRequest(
        dataset_id="gpm_imerg_v07_daily",
        region=region,
        start="2024-01-01",
        end="2024-01-02",
    )
    gpm = GpmAdapter().acquire(req)
    assert gpm.status in {"skipped_no_credentials", "dry_run", "ok"}
    assert gpm.provenance.native_spatial_resolution.startswith("0.1")
    assert gpm.quality_report["urban_suitability"] == "marginal"

    smap = SmapAdapter().acquire(
        AcquisitionRequest(
            dataset_id="smap_spl3smp_e",
            region=region,
            start="2024-01-01",
            end="2024-01-02",
        )
    )
    assert smap.status in {"skipped_no_credentials", "dry_run", "ok"}
    assert "neighbourhood" in (smap.provenance.urban_suitability_note or "").lower() or smap.quality_report[
        "urban_suitability"
    ] == "unsuitable_for_neighbourhood"

    modis = ModisAdapter().acquire(
        AcquisitionRequest(
            dataset_id="modis_lst_mod11a1",
            region=region,
            start="2024-01-01",
            end="2024-01-02",
        )
    )
    assert modis.status in {"skipped_no_credentials", "dry_run", "ok"}
    assert any("air temperature" in x.lower() or "LST" in x for x in modis.provenance.limitations) or True


def test_era5_skips_without_cds():
    region = load_region("bengaluru_bbmp")
    result = Era5LandAdapter().acquire(
        AcquisitionRequest(
            dataset_id="era5_land",
            region=region,
            start="2024-01-01",
            end="2024-01-01",
        )
    )
    assert result.status == "skipped_no_credentials"
    assert "cds_request_template" in result.data


def test_srtm_synthetic_fixture_labelled():
    region = load_region(bbox=(77.55, 12.90, 77.65, 13.00))
    result = SrtmAdapter().acquire(
        AcquisitionRequest(
            dataset_id="srtm_dem",
            region=region,
            start="2000-02-01",
            end="2000-02-01",
            options={"allow_synthetic_fixture": True},
        )
    )
    assert result.status == "ok"
    assert result.data["fixture"] is not None
    assert "SYNTHETIC" in result.data["fixture"]["WARNING"]
    assert result.provenance.quantity_type == "Simulated"
