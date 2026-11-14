"""Transform raw NASA POWER JSON into a normalized structure for the API.

Daily (samples/power_sample.json):
- header.fill_value = -999.0
- parameters.<PARAM> = { units, longname }
- properties.parameter.<PARAM> = { "YYYYMMDD": number, ... }

Monthly (samples/power_monthly_sample.json):
- Same metadata shape
- properties.parameter.<PARAM> keys are YYYYMM
- Keys ending in 13 (e.g. 202013) are annual aggregates — excluded from monthly series
"""

from __future__ import annotations

from typing import Any, Literal


def _yyyyymmdd_to_iso(date_key: str) -> str:
    if len(date_key) != 8 or not date_key.isdigit():
        raise ValueError(f"Unexpected POWER daily date key: {date_key!r}")
    return f"{date_key[0:4]}-{date_key[4:6]}-{date_key[6:8]}"


def _yyyymm_to_iso_month(date_key: str) -> str | None:
    """Return YYYY-MM for month keys; None for annual YYYY13 keys (exclude)."""
    if len(date_key) != 6 or not date_key.isdigit():
        raise ValueError(f"Unexpected POWER monthly date key: {date_key!r}")
    year = date_key[0:4]
    month = date_key[4:6]
    if month == "13":
        return None
    month_i = int(month)
    if month_i < 1 or month_i > 12:
        raise ValueError(f"Unexpected POWER monthly month component: {date_key!r}")
    return f"{year}-{month}"


def _coerce_value(raw: Any, fill_value: float) -> float | None:
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value == float(fill_value) or value == -999 or value == -999.0:
        return None
    return value


def _process_power_response(
    raw: dict[str, Any],
    *,
    temporal: Literal["daily", "monthly"],
) -> dict[str, Any]:
    header = raw.get("header") or {}
    fill_value = header.get("fill_value", -999.0)

    geometry = raw.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    if len(coords) < 2:
        raise ValueError("POWER response geometry.coordinates missing lon/lat")
    lon = float(coords[0])
    lat = float(coords[1])

    meta = raw.get("parameters") or {}
    series_by_param = (raw.get("properties") or {}).get("parameter") or {}

    variables: dict[str, Any] = {}
    for param, values in series_by_param.items():
        param_meta = meta.get(param) or {}
        unit = param_meta.get("units")
        long_name = param_meta.get("longname") or param_meta.get("longName")
        if unit is None or long_name is None:
            raise ValueError(
                f"POWER metadata missing units/longname for parameter {param!r}: {param_meta}"
            )

        if not isinstance(values, dict):
            raise ValueError(f"POWER parameter series for {param!r} is not an object")

        series = []
        annual_excluded = 0
        for date_key in sorted(values.keys()):
            if temporal == "daily":
                iso = _yyyyymmdd_to_iso(date_key)
            else:
                iso = _yyyymm_to_iso_month(date_key)
                if iso is None:
                    annual_excluded += 1
                    continue
            series.append(
                {
                    "date": iso,
                    "value": _coerce_value(values[date_key], float(fill_value)),
                }
            )

        entry: dict[str, Any] = {
            "longName": long_name,
            "unit": unit,
            "series": series,
        }
        if temporal == "monthly":
            entry["annualKeysExcluded"] = annual_excluded
        variables[param] = entry

    return {
        "lat": lat,
        "lon": lon,
        "temporal": temporal,
        "variables": variables,
        "header": {
            "title": header.get("title"),
            "sources": header.get("sources"),
            "fill_value": fill_value,
            "time_standard": header.get("time_standard"),
            "start": header.get("start"),
            "end": header.get("end"),
        },
    }


def process_power_response(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a daily POWER Feature (YYYYMMDD keys)."""
    return _process_power_response(raw, temporal="daily")


def process_power_monthly_response(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a monthly POWER Feature; drop YYYY13 annual keys."""
    return _process_power_response(raw, temporal="monthly")
