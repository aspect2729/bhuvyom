from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from data_sources.base_adapter import AcquisitionRequest
from data_sources.nasa_power_adapter import NasaPowerAdapter
from main import app
from processing.spatial_subset import load_region


client = TestClient(app)


def test_health_offline():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "earthdata_configured" in body


def test_datasets_and_regions_endpoints():
    r = client.get("/api/datasets")
    assert r.status_code == 200
    assert r.json()["count"] >= 8
    r2 = client.get("/api/datasets/nasa_power/metadata")
    assert r2.status_code == 200
    assert r2.json()["quantity_type"] == "Model-derived"
    r3 = client.get("/api/regions")
    assert r3.status_code == 200
    assert any(x["id"] == "bengaluru_bbmp" for x in r3.json()["regions"])


@pytest.mark.integration
def test_power_acquisition_live():
    region = load_region("bengaluru_bbmp")
    result = NasaPowerAdapter().acquire(
        AcquisitionRequest(
            dataset_id="nasa_power",
            region=region,
            start="2024-01-01",
            end="2024-01-07",
            variables=["T2M", "RH2M"],
        )
    )
    assert result.status == "ok"
    assert "T2M" in result.data["variables"]
    assert result.data["variables"]["T2M"]["unit"]
    # Fill values must be None, not -999
    vals = [p["value"] for p in result.data["variables"]["T2M"]["series"]]
    assert all(v is None or v > -100 for v in vals)
    assert result.provenance.quantity_type == "Model-derived"
    assert result.quality_report["missing_percent"] is not None


@pytest.mark.integration
def test_simulation_prepare_endpoint():
    r = client.post(
        "/api/simulation/prepare-inputs",
        json={
            "region_id": "bengaluru_bbmp",
            "start": "2024-01-01",
            "end": "2024-01-03",
            "scenario": "urban_heat",
            "acquire": True,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "validation" in body
    assert body["variables"]["land_surface_temperature"]["status"] == "missing"
    assert "air_temperature" in body["variables"]
    assert body["local_path"]
