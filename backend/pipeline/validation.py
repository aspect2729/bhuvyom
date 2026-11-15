"""Physical / schema validation for environmental observations before insert."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


# Plausible ranges for Karnataka climate (reject only clearly broken values)
RANGES: dict[str, tuple[float, float]] = {
    "T2M": (-10.0, 55.0),
    "T2M_MAX": (-10.0, 60.0),
    "T2M_MIN": (-15.0, 50.0),
    "RH2M": (0.0, 100.0),
    "WS2M": (0.0, 60.0),
    "WD2M": (0.0, 360.0),
    "PS": (70000.0, 110000.0),
    "PRECTOTCORR": (0.0, 800.0),
    "ALLSKY_SFC_SW_DWN": (0.0, 40.0),  # kWh/m^2/day
    "CLOUD_AMT": (0.0, 100.0),
    "temperature_2m": (-10.0, 55.0),
    "temperature_2m_mean": (-10.0, 55.0),
    "relative_humidity_2m": (0.0, 100.0),
    "relative_humidity_2m_mean": (0.0, 100.0),
    "precipitation": (0.0, 800.0),
    "precipitation_sum": (0.0, 800.0),
    "shortwave_radiation_sum": (0.0, 40.0),  # MJ/m^2 often; still bounded
    "wind_speed_10m": (0.0, 60.0),
    "wind_speed_10m_mean": (0.0, 60.0),
}

KA_BOUNDS = (73.5, 11.0, 79.5, 19.0)  # lon_min, lat_min, lon_max, lat_max (padded)


def in_karnataka_bbox(lon: float, lat: float) -> bool:
    lon_min, lat_min, lon_max, lat_max = KA_BOUNDS
    return lon_min <= lon <= lon_max and lat_min <= lat <= lat_max


def validate_value(param: str, value: Optional[float]) -> tuple[bool, str]:
    if value is None:
        return False, "missing"
    if not isinstance(value, (int, float)):
        return False, "non_numeric"
    if value != value:  # NaN
        return False, "nan"
    lo, hi = RANGES.get(param, (-1e9, 1e9))
    if value < lo or value > hi:
        return False, "implausible"
    return True, "ok"


def parse_observed_at(date_str: str, *, temporal: str) -> str:
    """Return ISO-8601 UTC timestamp."""
    if temporal == "daily":
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    elif temporal == "monthly":
        # YYYY-MM → first of month
        dt = datetime.strptime(date_str[:7], "%Y-%m").replace(day=1, tzinfo=timezone.utc)
    elif temporal == "hourly":
        # Open-Meteo: 2024-01-01T00:00
        raw = date_str.replace("Z", "")
        if len(raw) == 16:
            dt = datetime.strptime(raw, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def qc_summary(rejected: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in rejected:
        reason = r.get("reason", "unknown")
        counts[reason] = counts.get(reason, 0) + 1
    return counts
