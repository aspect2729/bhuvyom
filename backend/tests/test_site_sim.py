"""Site sim map endpoints + DB-backed runoff persistence (integration when Supabase is configured)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from config.settings import get_settings
from engines import prepared_data as pd_
from engines.site_sim import frontend_grid
from main import app

client = TestClient(app)
HAS_SUPABASE = get_settings().has_supabase
HAS_EARTHDATA = get_settings().has_earthdata_token
HAS_GPM = pd_.GPM_DIR.exists()


def test_frontend_grid_sizes():
    assert len(frontend_grid("ka")) == 11 * 9 + 1
    assert len(frontend_grid("blr")) == 9 * 9 + 1


@pytest.mark.integration
@pytest.mark.skipif(not HAS_EARTHDATA, reason="EARTHDATA_TOKEN not configured")
def test_site_sim_live_shape():
    r = client.get("/api/site/sim/live", params={"region": "ka"})
    assert r.status_code == 200
    j = r.json()
    assert "values" in j and "air" in j["values"]
    n = len(frontend_grid("ka"))
    assert len(j["values"]["air"]) == n
    assert j.get("stored_in_database") is False
    assert "supabase" not in (j.get("source") or "").lower()
    assert any(v is not None for v in j["values"]["air"])


@pytest.mark.integration
def test_site_sim_record_has_years():
    r = client.get("/api/site/sim/record")
    assert r.status_code == 200
    j = r.json()
    assert "air" in j
    assert isinstance(j["air"], dict)
    assert j.get("stored_in_database") is False
    assert "supabase" not in (j.get("source") or "").lower()


@pytest.mark.skipif(not (HAS_SUPABASE or HAS_GPM), reason="Need Supabase precip or local GPM")
def test_simulation_runoff_auto_and_optional_persist():
    r = client.get(
        "/api/simulation/runoff",
        params={"baseline_impervious": 0.5, "scenario_impervious": 0.7, "forcing": "auto", "persist": False},
    )
    assert r.status_code == 200
    j = r.json()
    assert j["data_type"] == "simulated"
    assert j["validation"]["status"] == "not_validated"
    assert j["configuration"]["forcing_source_kind"] in ("supabase", "local_file")


@pytest.mark.skipif(not HAS_SUPABASE, reason="Supabase not configured")
def test_simulation_persist_writes_rows():
    from pipeline.db import SupabaseREST

    db = SupabaseREST()
    _, cr0 = db.get("simulation_runs", params={"select": "simulation_run_id", "limit": "1"}, count=True)
    n0 = int((cr0 or "*/0").split("/")[-1])
    r = client.get(
        "/api/site/runoff",
        params={"baseline_impervious": 0.55, "scenario_impervious": 0.75, "forcing": "auto", "persist": True},
    )
    assert r.status_code == 200
    j = r.json()
    assert "persistence" in j
    assert j["persistence"]["simulation_run_id"]
    _, cr1 = db.get("simulation_runs", params={"select": "simulation_run_id", "limit": "1"}, count=True)
    n1 = int((cr1 or "*/0").split("/")[-1])
    assert n1 >= n0 + 1
