"""Documented unit conversions for simulation inputs."""

from __future__ import annotations

import math

import numpy as np

# Magnus-Tetens constants for saturation vapour pressure over water (Alduchov & Eskridge 1996-style)
# e_s(T) = 6.112 * exp(17.67 * T / (T + 243.5)) with T in °C, e_s in hPa
MAGNUS_A = 17.67
MAGNUS_B = 243.5  # °C
MAGNUS_C = 6.112  # hPa


def kelvin_to_celsius(t_k: float | np.ndarray) -> float | np.ndarray:
    return np.asarray(t_k, dtype=float) - 273.15


def celsius_to_kelvin(t_c: float | np.ndarray) -> float | np.ndarray:
    return np.asarray(t_c, dtype=float) + 273.15


def saturation_vapour_pressure_hpa(t_c: float | np.ndarray) -> float | np.ndarray:
    """Saturation vapour pressure (hPa) from air temperature (°C)."""
    t = np.asarray(t_c, dtype=float)
    return MAGNUS_C * np.exp(MAGNUS_A * t / (t + MAGNUS_B))


def relative_humidity_from_dewpoint(
    t_c: float | np.ndarray,
    td_c: float | np.ndarray,
) -> float | np.ndarray:
    """RH (%) from air temperature and dew-point (°C).

    RH = 100 * e(Td) / e_s(T). Assumes liquid-water Magnus formula.
    """
    e = saturation_vapour_pressure_hpa(td_c)
    es = saturation_vapour_pressure_hpa(t_c)
    rh = 100.0 * e / es
    return np.clip(rh, 0.0, 100.0)


def vapour_pressure_deficit_hpa(
    t_c: float | np.ndarray,
    rh_percent: float | np.ndarray,
) -> float | np.ndarray:
    """VPD (hPa) = e_s(T) * (1 - RH/100)."""
    es = saturation_vapour_pressure_hpa(t_c)
    rh = np.asarray(rh_percent, dtype=float)
    return es * (1.0 - rh / 100.0)


def wind_speed_from_uv(u: float | np.ndarray, v: float | np.ndarray) -> float | np.ndarray:
    """Wind speed (m/s) from eastward U and northward V components."""
    return np.sqrt(np.asarray(u, dtype=float) ** 2 + np.asarray(v, dtype=float) ** 2)


def wind_direction_from_uv(
    u: float | np.ndarray,
    v: float | np.ndarray,
    *,
    convention: str = "meteorological_from",
) -> float | np.ndarray:
    """Wind direction (degrees).

    meteorological_from: direction FROM which the wind blows (0=N, 90=E),
    formula: (270 - atan2(v, u) * 180/pi) mod 360 — equivalent to
    atan2(-u, -v) in degrees.
    """
    if convention != "meteorological_from":
        raise ValueError(f"Unsupported wind convention: {convention}")
    u_a = np.asarray(u, dtype=float)
    v_a = np.asarray(v, dtype=float)
    # Direction from which wind blows
    direction = (np.degrees(np.arctan2(-u_a, -v_a)) + 360.0) % 360.0
    return direction


def mm_hr_to_mm_day(rate: float | np.ndarray) -> float | np.ndarray:
    return np.asarray(rate, dtype=float) * 24.0


def pa_to_hpa(pressure_pa: float | np.ndarray) -> float | np.ndarray:
    return np.asarray(pressure_pa, dtype=float) / 100.0
