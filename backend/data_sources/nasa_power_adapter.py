"""NASA POWER adapter — preserves the working server/ POWER client behaviour.

Public API; no Earthdata token required. Meteorological fields are MERRA-2 /
GEOS-IT derived (model-derived), solar fields CERES (1°).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import httpx

from config.dataset_registry import get_dataset
from config.settings import get_settings
from data_sources.base_adapter import AcquisitionRequest, AcquisitionResult, BaseAdapter
from processing.metadata import ProvenanceRecord, build_quality_report
from processing.quality_control import missing_stats

logger = logging.getLogger(__name__)

POWER_DAILY_POINT_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_MONTHLY_POINT_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
POWER_PARAMETERS = (
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
    "CLOUD_AMT",
    "PRECTOTCORR",
)
NRT_END_WITHIN_DAYS = 30
NRT_CACHE_TTL_SECONDS = 24 * 60 * 60
TemporalMode = Literal["daily", "monthly"]


class PowerAPIError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, detail: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


def _cache_dir() -> Path:
    d = get_settings().cache_dir / "power"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cache_path(lat: float, lon: float, start: str, end: str, temporal: TemporalMode) -> Path:
    return _cache_dir() / f"{temporal}_{lat:.5f}_{lon:.5f}_{start}_{end}.json"


def _is_nrt(end: str, temporal: TemporalMode) -> bool:
    if temporal == "daily":
        end_d = datetime.strptime(end, "%Y%m%d").date()
    else:
        end_d = date(int(end), 12, 31)
    return end_d >= (date.today() - timedelta(days=NRT_END_WITHIN_DAYS))


def _read_cache(lat: float, lon: float, start: str, end: str, temporal: TemporalMode) -> dict | None:
    path = _cache_path(lat, lon, start, end, temporal)
    if not path.exists():
        return None
    if _is_nrt(end, temporal):
        age = time.time() - path.stat().st_mtime
        if age > NRT_CACHE_TTL_SECONDS:
            return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_cache(
    lat: float, lon: float, start: str, end: str, temporal: TemporalMode, payload: dict
) -> None:
    _cache_path(lat, lon, start, end, temporal).write_text(
        json.dumps(payload), encoding="utf-8"
    )


def _process_power(raw: dict[str, Any], temporal: TemporalMode) -> dict[str, Any]:
    header = raw.get("header") or {}
    fill_value = float(header.get("fill_value", -999.0))
    geometry = raw.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    if len(coords) < 2:
        raise ValueError("POWER response missing coordinates")
    lon, lat = float(coords[0]), float(coords[1])
    meta = raw.get("parameters") or {}
    series_by_param = (raw.get("properties") or {}).get("parameter") or {}
    variables: dict[str, Any] = {}
    for param, values in series_by_param.items():
        param_meta = meta.get(param) or {}
        unit = param_meta.get("units")
        long_name = param_meta.get("longname") or param_meta.get("longName") or param
        series = []
        annual_excluded = 0
        for key in sorted(values.keys()):
            if temporal == "daily":
                iso = f"{key[0:4]}-{key[4:6]}-{key[6:8]}"
            else:
                if key.endswith("13"):
                    annual_excluded += 1
                    continue
                iso = f"{key[0:4]}-{key[4:6]}"
            raw_v = values[key]
            try:
                v = float(raw_v)
            except (TypeError, ValueError):
                v = None
            if v is not None and (v == fill_value or v == -999):
                v = None
            series.append({"date": iso, "value": v})
        entry: dict[str, Any] = {"longName": long_name, "unit": unit, "series": series}
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
        "quantity_type": "Model-derived",
        "native_spatial_resolution": {
            "meteo": "0.5° × 0.625° (MERRA-2 / GEOS-IT)",
            "solar": "1° × 1° (CERES)",
        },
    }


async def _fetch_power_async(
    url: str,
    lat: float,
    lon: float,
    start: str,
    end: str,
    temporal: TemporalMode,
) -> dict[str, Any]:
    cached = _read_cache(lat, lon, start, end, temporal)
    if cached is not None:
        return cached
    params = {
        "parameters": ",".join(POWER_PARAMETERS),
        "community": "RE",
        "latitude": lat,
        "longitude": lon,
        "start": start,
        "end": end,
        "format": "JSON",
    }
    timeout = get_settings().http_timeout_seconds
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, params=params)
    if response.status_code != 200:
        raise PowerAPIError(
            f"NASA POWER HTTP {response.status_code}",
            status_code=response.status_code,
            detail=response.text[:1000],
        )
    payload = response.json()
    if payload.get("errors"):
        raise PowerAPIError("POWER reported errors", detail=payload.get("errors"))
    _write_cache(lat, lon, start, end, temporal, payload)
    return payload


def fetch_power_daily_point(lat: float, lon: float, start: str, end: str) -> dict[str, Any]:
    return asyncio.run(_fetch_power_async(POWER_DAILY_POINT_URL, lat, lon, start, end, "daily"))


def fetch_power_monthly_point(lat: float, lon: float, start: str, end: str) -> dict[str, Any]:
    return asyncio.run(
        _fetch_power_async(POWER_MONTHLY_POINT_URL, lat, lon, start, end, "monthly")
    )


class NasaPowerAdapter(BaseAdapter):
    dataset_ids = ["nasa_power"]

    def acquire(self, request: AcquisitionRequest) -> AcquisitionResult:
        meta = get_dataset(request.dataset_id)
        temporal: TemporalMode = (
            "monthly" if (request.temporal_mode or "daily") == "monthly" else "daily"
        )
        # Representative point: region centroid (POWER is point API)
        lon, lat = request.region.geometry.centroid.x, request.region.geometry.centroid.y
        start = str(request.start).replace("-", "")
        end = str(request.end).replace("-", "")
        if temporal == "monthly":
            start = start[:4]
            end = end[:4]

        raw = (
            fetch_power_monthly_point(lat, lon, start, end)
            if temporal == "monthly"
            else fetch_power_daily_point(lat, lon, start, end)
        )
        processed = _process_power(raw, temporal)

        # Optional filter to requested variables
        if request.variables:
            processed["variables"] = {
                k: v for k, v in processed["variables"].items() if k in request.variables
            }

        units = {k: v["unit"] for k, v in processed["variables"].items()}
        n_values = 0
        n_missing = 0
        for var in processed["variables"].values():
            vals = [p["value"] for p in var["series"]]
            n_values += sum(1 for v in vals if v is not None)
            n_missing += sum(1 for v in vals if v is None)

        settings = get_settings()
        out_path = (
            settings.raw_dir
            / "nasa_power"
            / f"{temporal}_{lat:.5f}_{lon:.5f}_{start}_{end}.json"
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps({"raw": raw, "processed": processed}), encoding="utf-8")

        prov = ProvenanceRecord(
            dataset_id=request.dataset_id,
            product_short_name="POWER",
            product_version="v2",
            quantity_type="Model-derived",
            variables=list(processed["variables"].keys()),
            native_spatial_resolution=meta["native_spatial_resolution"],
            native_temporal_resolution=temporal,
            units=units,
            region_id=request.region.id,
            time_start=str(request.start),
            time_end=str(request.end),
            access_mechanism="NASA POWER public JSON API",
            source_urls=[POWER_DAILY_POINT_URL if temporal == "daily" else POWER_MONTHLY_POINT_URL],
            limitations=list(meta.get("limitations") or []),
            urban_suitability=meta.get("urban_suitability"),
            urban_suitability_note=meta.get("urban_suitability_note"),
        )
        prov.add_step("fetch_power_point", lat=lat, lon=lon, temporal=temporal)
        prov.add_step("replace_fill_value", fill_value=-999)
        report = build_quality_report(
            dataset_id=request.dataset_id,
            n_values=n_values,
            n_missing=n_missing,
            units=units,
            native_spatial_resolution=meta["native_spatial_resolution"],
            urban_suitability=meta.get("urban_suitability"),
            limitations=list(meta.get("limitations") or []),
            coordinate_checks={"query_lat": lat, "query_lon": lon, "inside_region": request.region.contains(lon, lat)},
            extra={"per_variable": {k: missing_stats([p["value"] if p["value"] is not None else float("nan") for p in v["series"]]) for k, v in processed["variables"].items()}},
        )
        return AcquisitionResult(
            dataset_id=request.dataset_id,
            status="ok",
            representation="quality_controlled",
            data=processed,
            provenance=prov,
            quality_report=report,
            local_paths=[str(out_path)],
        )
