"""Engine + contract + API tests (offline: uses acquired local data only)."""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from engines import prepared_data as pd_
from engines.contract import EngineResult, FeasibilityError, FieldSpec, GridPayload
from engines.prediction import service as pred
from engines.prediction.models import CellData, FittedSet
from engines.simulation.scs_cn import composite_cn, retention_mm, runoff_mm
from main import app

client = TestClient(app)
HAS_POWER = pd_.POWER_MONTHLY_DIR.exists() and any(pd_.POWER_MONTHLY_DIR.iterdir())
HAS_GPM = pd_.GPM_DIR.exists()
HAS_LST = (pd_.MODIS_DIR / "mod11a1_lst_C_bbmp.npz").exists()


# ---------- contract
def _cell():
    return {"id": "a", "polygon": [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], "center": [0.5, 0.5]}


def test_contract_rejects_wrong_type_and_length():
    g = GridPayload(cells=[_cell()], times=["2020"], fields={"v": FieldSpec(unit="u", label="l", kind="time_series", values={"a": [1.0]})})
    base = dict(title="t", variable="v", units="u", native_resolution="x", effective_resolution="x", temporal_resolution="x", temporal_coverage={}, grid=g, default_field="v", sources=[{"id": 1}], methodology={})
    EngineResult(engine_name="analysis", data_type="analysed", **base)
    with pytest.raises(ValueError):
        EngineResult(engine_name="analysis", data_type="predicted", **base)
    with pytest.raises(ValueError):  # predicted requires model+validation
        EngineResult(engine_name="prediction", data_type="predicted", **base)
    with pytest.raises(ValueError):  # simulated requires scenario+assumptions
        EngineResult(engine_name="simulation", data_type="simulated", **base)
    bad = GridPayload(cells=[_cell()], times=["2020", "2021"], fields={"v": FieldSpec(unit="u", label="l", kind="time_series", values={"a": [1.0]})})
    with pytest.raises(ValueError):
        EngineResult(engine_name="analysis", data_type="analysed", **{**base, "grid": bad})


# ---------- SCS-CN (hand-computed reference: CN=80 → S=63.5 mm, Ia=12.7 mm, P=50 → Q=(37.3²)/(100.8)=13.80 mm)
def test_scs_cn_reference_values():
    assert retention_mm(80) == pytest.approx(63.5)
    assert runoff_mm(np.array([50.0]), 80, 0.2)[0] == pytest.approx(37.3 ** 2 / 100.8, rel=1e-6)
    assert runoff_mm(np.array([10.0]), 80, 0.2)[0] == 0.0
    assert np.isnan(runoff_mm(np.array([np.nan]), 80)[0])  # missing stays missing
    assert composite_cn(0.5, 80) == 89.0
    p = np.linspace(0, 200, 50)
    assert np.all(runoff_mm(p, 95) >= runoff_mm(p, 85))  # monotone in CN
    assert np.all(runoff_mm(p, 90) <= p)  # mass bound


# ---------- prediction: no leakage + baselines
def test_prediction_models_use_only_past_data():
    rng = np.random.default_rng(0)
    n = 240
    m = np.arange(n) % 12
    y = 20 + 3 * np.sin(2 * np.pi * m / 12) + rng.normal(0, 0.5, n)
    cd = CellData(y.copy(), 13.0, 77.5)
    c = 200
    fs = FittedSet([cd], c, with_ml=True)
    p1 = [fs.predict(mm, 0, c, 6) for mm in ("climatology", "damped_persistence", "ridge_pooled", "gbm_pooled")]
    y2 = y.copy(); y2[c + 1 :] = 999.0  # future values changed → predictions must not change
    fs2 = FittedSet([CellData(y2, 13.0, 77.5)], c, with_ml=True)
    p2 = [fs2.predict(mm, 0, c, 6) for mm in ("climatology", "damped_persistence", "ridge_pooled", "gbm_pooled")]
    assert np.allclose(p1, p2)


def test_prediction_feasibility_refusals():
    with pytest.raises(FeasibilityError):
        pred.check_feasibility("T2M", 120)
    with pytest.raises(FeasibilityError):
        pred.check_feasibility("T2M", 3, "daily")
    with pytest.raises(FeasibilityError):
        pred.check_feasibility("CLOUD_AMT", 3)


# ---------- API (needs acquired data)
@pytest.mark.skipif(not HAS_POWER, reason="NASA POWER monthly not acquired")
def test_api_trends_and_forecast():
    r = client.get("/api/analysis/trends", params={"var": "T2M"})
    assert r.status_code == 200
    j = r.json()
    assert j["data_type"] == "analysed" and len(j["grid"]["cells"]) == len(pd_.power_monthly()['cells'])
    r = client.get("/api/prediction/forecast", params={"var": "T2M", "horizon_months": 6})
    assert r.status_code == 200
    j = r.json()
    assert j["data_type"] == "predicted" and j["validation"]["status"] == "validated_out_of_sample"
    assert len(j["grid"]["times"]) == 48 + 6
    c = "p_13.000_77.500"
    f, lo, hi = (j["grid"]["fields"][k]["values"][c][48:] for k in ("forecast", "pi80_low", "pi80_high"))
    # A residual-quantile interval need not contain an uncorrected point forecast.
    assert all(a <= d and np.isfinite(b) for a, b, d in zip(lo, f, hi))
    assert client.get("/api/prediction/forecast", params={"var": "T2M", "horizon_months": 240}).status_code == 422


@pytest.mark.skipif(not HAS_GPM, reason="GPM not acquired")
def test_api_simulation_and_incompatible_forcing():
    r = client.get("/api/simulation/runoff", params={"baseline_impervious": 0.3, "scenario_impervious": 0.7})
    assert r.status_code == 200
    j = r.json()
    assert j["data_type"] == "simulated" and j["validation"]["status"] == "not_validated"
    assert all(v >= 0 for v in j["grid"]["fields"]["total_difference"]["values"].values() if v is not None)
    r = client.get("/api/simulation/runoff", params={"forcing": "prediction:abc"})
    assert r.status_code == 422 and "incompatible" in r.json()["reason"]


@pytest.mark.skipif(not HAS_LST, reason="MODIS LST not acquired")
def test_api_lst_and_catalog():
    j = client.get("/api/observed/lst").json()
    assert j["data_type"] == "observed" and len(j["grid"]["times"]) == 91
    vals = [v for arr in j["grid"]["fields"]["lst_day"]["values"].values() for v in arr if v is not None]
    assert 0 < min(vals) and max(vals) < 70  # physically plausible °C
    assert client.get("/api/engines/catalog").status_code == 200
    reg = client.get("/api/knowledge/methodologies").json()
    assert any(m["status"] == "not_implemented" for m in reg["methodologies"])


@pytest.mark.skipif(not pd_.NDVI_NPZ.exists(), reason="NDVI not acquired")
def test_ndvi_range_and_nesting():
    j = client.get("/api/observed/ndvi").json()
    vals = [v for arr in j["grid"]["fields"]["ndvi"]["values"].values() for v in arr if v is not None]
    assert -1 <= min(vals) and max(vals) <= 1
    agg = pd_.ndvi_on_modis_1km()
    assert agg.shape == pd_.modis_lst()["shape"] and np.nanmax(agg) <= 1
