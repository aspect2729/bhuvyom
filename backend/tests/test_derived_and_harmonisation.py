from __future__ import annotations

import numpy as np

from processing.spatial_harmonisation import resample_grid
from processing.unit_conversion import (
    relative_humidity_from_dewpoint,
    wind_direction_from_uv,
    wind_speed_from_uv,
)
from simulation.derived_variables import derive_humidity, derive_wind
from simulation.input_validation import validate_simulation_bundle


def test_wind_and_humidity_formulas():
    # Pure westerly wind: u=5, v=0 → from the west ≈ 270°
    assert abs(float(wind_speed_from_uv(5, 0)) - 5.0) < 1e-9
    assert abs(float(wind_direction_from_uv(5, 0)) - 270.0) < 1e-6
    rh = float(relative_humidity_from_dewpoint(30.0, 30.0))
    assert abs(rh - 100.0) < 1e-6
    derived = derive_humidity(30.0, 20.0)
    assert 0 < derived["relative_humidity"] < 100
    assert derived["vapour_pressure_deficit"] > 0
    w = derive_wind(3.0, 4.0)
    assert abs(w["wind_speed"] - 5.0) < 1e-9


def test_resample_documents_source_resolution():
    src = np.array([[1.0, 2.0], [3.0, 4.0]])
    out = resample_grid(
        src,
        src_lats=np.array([12.0, 13.0]),
        src_lons=np.array([77.0, 78.0]),
        dst_lats=np.array([12.0, 12.5, 13.0]),
        dst_lons=np.array([77.0, 77.5, 78.0]),
        method="nearest",
        source_resolution="1.0°",
        output_resolution="0.5°",
    )
    assert out["metadata"]["source_resolution"] == "1.0°"
    assert out["metadata"]["output_resolution"] == "0.5°"
    assert "does not create" in out["metadata"]["note"].lower() or "accuracy remains" in out["metadata"]["note"].lower()


def test_validation_rejects_silent_lst_substitution_and_warns_scenario():
    bundle = {
        "region": {"id": "x"},
        "time_range": {"start": "2024-01-01", "end": "2024-01-02"},
        "scenario": "urban_heat",
        "variables": {
            "air_temperature": {
                "status": "aligned",
                "units": "C",
                "quantity_type": "Model-derived",
                "native_resolution": "0.5°",
            },
            "land_surface_temperature": {"status": "missing", "reason": "no LST"},
        },
    }
    report = validate_simulation_bundle(bundle)
    assert report["ok"] is True
    assert any("land_surface_temperature" in w for w in report["warnings"])
    assert "NOT" in report["simulation_ready_claim"] or "not" in report["simulation_ready_claim"]
