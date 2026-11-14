"""Derived variables with formulas, units, assumptions, and provenance."""

from __future__ import annotations

from typing import Any, Optional

import numpy as np

from processing.unit_conversion import (
    relative_humidity_from_dewpoint,
    vapour_pressure_deficit_hpa,
    wind_direction_from_uv,
    wind_speed_from_uv,
)


DERIVATION_CATALOG: dict[str, dict[str, Any]] = {
    "wind_speed": {
        "formula": "sqrt(U^2 + V^2)",
        "units": "m/s",
        "inputs": ["U", "V"],
        "assumptions": ["U eastward, V northward in m/s"],
    },
    "wind_direction": {
        "formula": "(atan2(-U, -V) * 180/pi + 360) % 360",
        "units": "degree",
        "convention": "meteorological_from (0=N, 90=E)",
        "inputs": ["U", "V"],
        "assumptions": ["Direction FROM which the wind blows"],
    },
    "relative_humidity": {
        "formula": "100 * e(Td) / e_s(T); Magnus-Tetens over water",
        "units": "%",
        "inputs": ["T_celsius", "Td_celsius"],
        "assumptions": ["Liquid water surface; valid near typical surface temps"],
    },
    "vapour_pressure_deficit": {
        "formula": "e_s(T) * (1 - RH/100)",
        "units": "hPa",
        "inputs": ["T_celsius", "RH_percent"],
        "assumptions": ["Same Magnus constants as RH derivation"],
    },
    "temperature_anomaly": {
        "formula": "T - mean(T_baseline)",
        "units": "same as T",
        "inputs": ["T", "baseline_mean"],
        "assumptions": ["Baseline window must be documented by caller"],
    },
    "precipitation_anomaly": {
        "formula": "P - mean(P_baseline)",
        "units": "same as P",
        "inputs": ["P", "baseline_mean"],
        "assumptions": ["Baseline window must be documented by caller"],
    },
}


def derive_wind(u: float, v: float) -> dict[str, Any]:
    return {
        "wind_speed": float(wind_speed_from_uv(u, v)),
        "wind_direction": float(wind_direction_from_uv(u, v)),
        "provenance": {
            "wind_speed": DERIVATION_CATALOG["wind_speed"],
            "wind_direction": DERIVATION_CATALOG["wind_direction"],
        },
    }


def derive_humidity(t_c: float, td_c: float) -> dict[str, Any]:
    rh = float(relative_humidity_from_dewpoint(t_c, td_c))
    vpd = float(vapour_pressure_deficit_hpa(t_c, rh))
    return {
        "relative_humidity": rh,
        "vapour_pressure_deficit": vpd,
        "provenance": {
            "relative_humidity": DERIVATION_CATALOG["relative_humidity"],
            "vapour_pressure_deficit": DERIVATION_CATALOG["vapour_pressure_deficit"],
        },
    }


def anomaly(values: list[float | None], baseline_mean: float) -> dict[str, Any]:
    out = []
    for v in values:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            out.append(None)
        else:
            out.append(float(v) - float(baseline_mean))
    return {
        "values": out,
        "baseline_mean": baseline_mean,
        "provenance": DERIVATION_CATALOG["temperature_anomaly"],
    }


def require_inputs(**kwargs: Optional[float]) -> None:
    missing = [k for k, v in kwargs.items() if v is None]
    if missing:
        raise ValueError(
            f"Cannot derive variable — missing inputs {missing}. "
            "Do not invent substitutes from unrelated datasets."
        )
