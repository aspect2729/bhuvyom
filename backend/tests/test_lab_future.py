"""Lab (event runoff) and Future (CMIP6 summary) tests. Synthetic records here are TEST FIXTURES only."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from engines import prepared_data as pd_
from engines.prediction import projections as pj
from main import app

client = TestClient(app)


@pytest.mark.skipif(not pd_.GPM_DIR.exists(), reason="GPM not acquired")
def test_lab_runoff_monotonic_and_bounds():
    a = client.get("/api/lab/runoff", params={"intensity": 30, "duration": 2, "permeable": 0.2}).json()
    b = client.get("/api/lab/runoff", params={"intensity": 30, "duration": 2, "permeable": 0.7}).json()
    assert a["results"]["runoff_scenario_mm"] > b["results"]["runoff_scenario_mm"]  # less permeable → more runoff
    for c in a["cells"]:
        assert 0 <= c["scenario_mm"] <= c["rain_mm"] + 1e-6
    assert client.get("/api/lab/heat").status_code == 422
    assert client.get("/api/lab/runoff", params={"intensity": 500}).status_code == 422


def test_projection_summary_logic(tmp_path, monkeypatch):
    proc = tmp_path / "proc"; proc.mkdir()
    recs = []
    for i, m in enumerate(["A", "B", "C"]):
        for y in range(1995, 2015):
            recs.append({"model": m, "scenario": "historical", "var": "tas", "year": y, "mean": 24.0 + i * 0.1})
        for ssp, k in (("ssp126", 0.01), ("ssp245", 0.02), ("ssp585", 0.04)):
            for y in range(2015, 2101):
                recs.append({"model": m, "scenario": ssp, "var": "tas", "year": y, "mean": 24.0 + i * 0.1 + k * (y - 2005)})
    (proc / "annual.jsonl").write_text("\n".join(json.dumps(r) for r in recs))
    monkeypatch.setattr(pj, "PROC", proc); monkeypatch.setattr(pj, "RAW", tmp_path / "raw"); pj._load.cache_clear()
    out = pj.projections()
    air = next(m for m in out["metrics"] if m["id"] == "air")
    d585 = air["scenarios"]["ssp585"]["windows"]["2100"]["delta"]["median"]
    d126 = air["scenarios"]["ssp126"]["windows"]["2100"]["delta"]["median"]
    # window 2081–2100 centre 2090.5; fixture trend anchored at 2005 → k × 85.5
    assert d585 == pytest.approx(0.04 * 85.5, abs=1e-3) and d126 == pytest.approx(0.01 * 85.5, abs=1e-3)
    assert air["scenarios"]["ssp245"]["windows"]["2050"]["delta"]["n_models"] == 3
    assert not next(m for m in out["metrics"] if m["id"] == "hot")["available"]  # no tasmax records → honest gap
    pj._load.cache_clear()


def test_future_endpoint_without_data():
    pj._load.cache_clear()
    r = client.get("/api/future/projections")
    assert r.status_code in (200, 404)
    if r.status_code == 404:
        assert r.json()["error"] == "data_not_acquired"
