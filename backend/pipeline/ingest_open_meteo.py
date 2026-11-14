"""Open-Meteo archive (observations/reanalysis) and forecast → Supabase.

Forecasts are stored separately identified via metadata.record_kind=forecast
with forecast_init_time, forecast_valid_time, and forecast_horizon_hours.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from pipeline.db import SupabaseREST, observation_row
from pipeline.karnataka_grid import open_meteo_grid_cells
from pipeline.validation import in_karnataka_bbox, parse_observed_at, qc_summary, validate_value

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

ARCHIVE_DAILY = [
    "temperature_2m_mean",
    "relative_humidity_2m_mean",
    "precipitation_sum",
    "shortwave_radiation_sum",
    "wind_speed_10m_mean",
]
FORECAST_HOURLY = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "shortwave_radiation",
    "wind_speed_10m",
]

PARAM_MAP = {
    "temperature_2m_mean": ("temperature_air_temperature", "C"),
    "temperature_2m": ("temperature_air_temperature", "C"),
    "relative_humidity_2m_mean": ("atmospheric_activity_humidity", "PERCENT"),
    "relative_humidity_2m": ("atmospheric_activity_humidity", "PERCENT"),
    "precipitation_sum": ("precipitation_water_rainfall", "MM"),
    "precipitation": ("precipitation_water_rainfall", "MM"),
    "shortwave_radiation_sum": ("solar_space_solar_irradiance", "MJ_M2"),
    "shortwave_radiation": ("solar_space_solar_irradiance", "W_M2"),
    "wind_speed_10m_mean": ("atmospheric_activity_wind_speed", "M_S"),
    "wind_speed_10m": ("atmospheric_activity_wind_speed", "M_S"),
}

OM_RES_M = 25000.0  # ~0.25° model skill; we sample at 0.5°


async def _get_json(client: httpx.AsyncClient, url: str, params: dict, sem: asyncio.Semaphore) -> dict:
    async with sem:
        for attempt in range(4):
            r = await client.get(url, params=params)
            if r.status_code == 429:
                await asyncio.sleep(2 ** attempt + 1)
                continue
            if r.status_code >= 500:
                await asyncio.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        r.raise_for_status()
        return {}


def _ensure_catalog(db: SupabaseREST) -> dict[str, int]:
    source_id = db.ensure_data_source(
        source_code="OPEN_METEO",
        source_name="Open-Meteo",
        organization="Open-Meteo",
        homepage_url="https://open-meteo.com/",
        access_type="open",
        api_endpoint="https://api.open-meteo.com/",
    )
    archive_id = db.ensure_dataset(
        source_id=source_id,
        dataset_code="open_meteo_archive",
        dataset_name="Open-Meteo Historical Weather",
        description="ERA5-based historical weather API via Open-Meteo (not station observations).",
        spatial_resolution="~0.25° native; Karnataka sampled at 0.5°",
        temporal_resolution="daily",
        product_version="v1",
        landing_page_url="https://open-meteo.com/en/docs/historical-weather-api",
        metadata={"quantity_type": "Model-derived", "adapter": "open_meteo"},
    )
    forecast_id = db.ensure_dataset(
        source_id=source_id,
        dataset_code="open_meteo_forecast",
        dataset_name="Open-Meteo Weather Forecast",
        description="Operational NWP forecast blend served by Open-Meteo.",
        spatial_resolution="model-dependent (~1–25 km); Karnataka sampled at 0.5°",
        temporal_resolution="hourly",
        product_version="v1",
        landing_page_url="https://open-meteo.com/en/docs",
        metadata={"quantity_type": "Model-derived", "adapter": "open_meteo", "record_kind": "forecast"},
    )
    db.ensure_unit("MJ_M2", "megajoule per square metre", "MJ/m²", "radiative_energy")
    db.ensure_unit("KWH_M2_DAY", "kilowatt-hour per square metre per day", "kWh/m²/day", "radiative_energy_flux")
    return {"archive": archive_id, "forecast": forecast_id}


def _build_rows_daily(
    payload: dict,
    *,
    cell: dict,
    maps: dict,
    dataset_id: int,
    region_id: int | None,
    dataset_version_id: int | None,
    collected_at: str,
) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    rejected: list[dict] = []
    lat, lon = cell["lat"], cell["lon"]
    if not in_karnataka_bbox(lon, lat):
        return rows, [{"reason": "outside_bbox", "grid_id": cell["grid_id"]}]
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    for param, (var_code, unit_code) in PARAM_MAP.items():
        values = daily.get(param)
        if not values:
            continue
        variable_id = maps["variable_by_code"].get(var_code)
        unit_id = maps["unit_by_code"].get(unit_code)
        if variable_id is None:
            rejected.append({"reason": "unknown_variable", "param": param})
            continue
        for t, v in zip(times, values):
            ok, reason = validate_value(param, v)
            if not ok:
                rejected.append({"reason": reason, "param": param, "date": t})
                continue
            observed_at = parse_observed_at(t, temporal="daily")
            sid = f"open_meteo_archive:{param}:{cell['grid_id']}:{observed_at}:daily:observation"
            rows.append(
                observation_row(
                    variable_id=variable_id,
                    dataset_id=dataset_id,
                    observed_at=observed_at,
                    value=float(v),
                    unit_id=unit_id,
                    lat=lat,
                    lon=lon,
                    grid_id=cell["grid_id"],
                    source_record_id=sid,
                    quality_flag="ok",
                    region_id=region_id,
                    spatial_resolution_m=OM_RES_M,
                    dataset_version_id=dataset_version_id,
                    metadata={
                        "record_kind": "observation",
                        "source": "open_meteo_archive",
                        "source_parameter": param,
                        "temporal": "daily",
                        "quantity_type": "Model-derived",
                        "collected_at": collected_at,
                        "timezone": payload.get("timezone"),
                        "elevation_m": payload.get("elevation"),
                    },
                )
            )
    return rows, rejected


def _build_rows_forecast(
    payload: dict,
    *,
    cell: dict,
    maps: dict,
    dataset_id: int,
    region_id: int | None,
    dataset_version_id: int | None,
    collected_at: str,
    init_time: str,
) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    rejected: list[dict] = []
    lat, lon = cell["lat"], cell["lon"]
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    init_dt = datetime.fromisoformat(init_time.replace("Z", "+00:00"))
    for param, (var_code, unit_code) in PARAM_MAP.items():
        values = hourly.get(param)
        if not values:
            continue
        variable_id = maps["variable_by_code"].get(var_code)
        unit_id = maps["unit_by_code"].get(unit_code)
        if variable_id is None:
            continue
        for t, v in zip(times, values):
            ok, reason = validate_value(param, v)
            if not ok:
                rejected.append({"reason": reason, "param": param, "date": t})
                continue
            valid_at = parse_observed_at(t, temporal="hourly")
            valid_dt = datetime.fromisoformat(valid_at)
            horizon_h = (valid_dt - init_dt).total_seconds() / 3600.0
            sid = f"open_meteo_forecast:{param}:{cell['grid_id']}:{valid_at}:hourly:forecast:{init_time}"
            rows.append(
                observation_row(
                    variable_id=variable_id,
                    dataset_id=dataset_id,
                    observed_at=valid_at,  # valid time
                    value=float(v),
                    unit_id=unit_id,
                    lat=lat,
                    lon=lon,
                    grid_id=cell["grid_id"],
                    source_record_id=sid,
                    quality_flag="forecast",
                    region_id=region_id,
                    spatial_resolution_m=OM_RES_M,
                    dataset_version_id=dataset_version_id,
                    metadata={
                        "record_kind": "forecast",
                        "source": "open_meteo_forecast",
                        "source_parameter": param,
                        "temporal": "hourly",
                        "quantity_type": "Model-derived",
                        "collected_at": collected_at,
                        "forecast_init_time": init_time,
                        "forecast_valid_time": valid_at,
                        "forecast_horizon_hours": horizon_h,
                        "timezone": payload.get("timezone"),
                    },
                )
            )
    return rows, rejected


async def ingest_open_meteo_archive_async(
    db: SupabaseREST,
    *,
    start: date,
    end: date,
    max_concurrency: int = 4,
) -> dict[str, Any]:
    ids = _ensure_catalog(db)
    maps = db.lookup_maps()
    dataset_id = ids["archive"]
    region_id = maps["region_by_code"].get("IN-KA")
    version_id = db.create_dataset_version(
        dataset_id,
        f"om_archive_{start}_{end}_{date.today().isoformat()}",
        {"start": str(start), "end": str(end), "region": "Karnataka"},
    )
    job_id = db.start_job(
        dataset_id=dataset_id,
        job_type="ingest_open_meteo_archive",
        parameters={"start": str(start), "end": str(end)},
    )
    cells = open_meteo_grid_cells()
    collected_at = datetime.now(timezone.utc).isoformat()
    all_rows: list[dict] = []
    all_rejected: list[dict] = []
    failures: list[dict] = []
    sem = asyncio.Semaphore(max_concurrency)
    async with httpx.AsyncClient(timeout=120.0) as client:
        tasks = []
        for c in cells:
            params = {
                "latitude": c["lat"],
                "longitude": c["lon"],
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "daily": ",".join(ARCHIVE_DAILY),
                "timezone": "UTC",
            }
            tasks.append(_get_json(client, ARCHIVE_URL, params, sem))
        results = await asyncio.gather(*tasks, return_exceptions=True)
    for cell, result in zip(cells, results):
        if isinstance(result, Exception):
            failures.append({"grid_id": cell["grid_id"], "error": str(result)})
            continue
        rows, rejected = _build_rows_daily(
            result,
            cell=cell,
            maps=maps,
            dataset_id=dataset_id,
            region_id=region_id,
            dataset_version_id=version_id,
            collected_at=collected_at,
        )
        all_rows.extend(rows)
        all_rejected.extend(rejected)
    stats = db.insert_observations(all_rows)
    db.finish_job(
        job_id,
        status="completed" if stats["inserted"] or stats["skipped"] else "failed",
        records_processed=stats["inserted"],
        output_metadata={"stats": stats, "rejected": qc_summary(all_rejected), "n_failures": len(failures), "failures": failures[:30]},
        error_message=None if not failures else f"{len(failures)} failures",
    )
    if stats["inserted"] > 0:
        db.patch("datasets", {"dataset_id": f"eq.{dataset_id}"}, {"status": "processed"})
    return {"provider": "open_meteo_archive", "start": str(start), "end": str(end), "cells": len(cells), "job_id": job_id, **stats, "rejected": qc_summary(all_rejected), "failures": failures}


async def ingest_open_meteo_forecast_async(
    db: SupabaseREST,
    *,
    forecast_days: int = 7,
    max_concurrency: int = 4,
) -> dict[str, Any]:
    ids = _ensure_catalog(db)
    maps = db.lookup_maps()
    dataset_id = ids["forecast"]
    region_id = maps["region_by_code"].get("IN-KA")
    collected_at = datetime.now(timezone.utc).isoformat()
    cells = open_meteo_grid_cells()
    all_rows: list[dict] = []
    all_rejected: list[dict] = []
    failures: list[dict] = []
    sem = asyncio.Semaphore(max_concurrency)
    async with httpx.AsyncClient(timeout=120.0) as client:
        tasks = []
        for c in cells:
            params = {
                "latitude": c["lat"],
                "longitude": c["lon"],
                "hourly": ",".join(FORECAST_HOURLY),
                "forecast_days": forecast_days,
                "timezone": "UTC",
            }
            tasks.append(_get_json(client, FORECAST_URL, params, sem))
        results = await asyncio.gather(*tasks, return_exceptions=True)

    # Init time = earliest hourly valid time across successful responses (API series start),
    # not wall-clock now — avoids negative horizons for same-day hours already started.
    series_starts: list[str] = []
    for result in results:
        if isinstance(result, Exception):
            continue
        times = ((result.get("hourly") or {}).get("time") or [])
        if times:
            series_starts.append(parse_observed_at(times[0], temporal="hourly"))
    init_time = min(series_starts) if series_starts else datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0).isoformat()

    version_id = db.create_dataset_version(
        dataset_id,
        f"om_forecast_{init_time}",
        {"forecast_init_time": init_time, "forecast_days": forecast_days, "region": "Karnataka"},
    )
    job_id = db.start_job(
        dataset_id=dataset_id,
        job_type="ingest_open_meteo_forecast",
        parameters={"forecast_days": forecast_days, "forecast_init_time": init_time},
    )
    for cell, result in zip(cells, results):
        if isinstance(result, Exception):
            failures.append({"grid_id": cell["grid_id"], "error": str(result)})
            continue
        rows, rejected = _build_rows_forecast(
            result,
            cell=cell,
            maps=maps,
            dataset_id=dataset_id,
            region_id=region_id,
            dataset_version_id=version_id,
            collected_at=collected_at,
            init_time=init_time,
        )
        all_rows.extend(rows)
        all_rejected.extend(rejected)
    stats = db.insert_observations(all_rows)
    db.finish_job(
        job_id,
        status="completed" if stats["inserted"] or stats["skipped"] else "failed",
        records_processed=stats["inserted"],
        output_metadata={"stats": stats, "rejected": qc_summary(all_rejected), "n_failures": len(failures), "forecast_init_time": init_time},
        error_message=None if not failures else f"{len(failures)} failures",
    )
    if stats["inserted"] > 0:
        db.patch("datasets", {"dataset_id": f"eq.{dataset_id}"}, {"status": "processed"})
    return {
        "provider": "open_meteo_forecast",
        "forecast_init_time": init_time,
        "forecast_days": forecast_days,
        "cells": len(cells),
        "job_id": job_id,
        **stats,
        "rejected": qc_summary(all_rejected),
        "failures": failures,
    }


def ingest_open_meteo_archive_recent(db: SupabaseREST, *, days: int = 90) -> dict[str, Any]:
    end = date.today() - timedelta(days=5)  # archive lag
    start = end - timedelta(days=days - 1)
    return asyncio.run(ingest_open_meteo_archive_async(db, start=start, end=end))


def ingest_open_meteo_forecast(db: SupabaseREST, *, forecast_days: int = 7) -> dict[str, Any]:
    return asyncio.run(ingest_open_meteo_forecast_async(db, forecast_days=forecast_days))
