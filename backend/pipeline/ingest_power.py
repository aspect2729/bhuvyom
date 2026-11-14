"""NASA POWER → Karnataka grid → Supabase environmental_observations."""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from data_sources.nasa_power_adapter import (
    POWER_DAILY_POINT_URL,
    POWER_MONTHLY_POINT_URL,
    POWER_PARAMETERS,
    _process_power,
)
from pipeline.db import SupabaseREST, observation_row
from pipeline.karnataka_grid import power_grid_cells
from pipeline.validation import in_karnataka_bbox, parse_observed_at, qc_summary, validate_value

logger = logging.getLogger(__name__)

TemporalMode = Literal["daily", "monthly"]

# Map POWER parameter → ref_environmental_variables.variable_code + unit_code
PARAM_MAP = {
    "T2M": ("temperature_air_temperature", "C"),
    "T2M_MAX": ("temperature_air_temperature", "C"),
    "T2M_MIN": ("temperature_air_temperature", "C"),
    "RH2M": ("atmospheric_activity_humidity", "PERCENT"),
    "WS2M": ("atmospheric_activity_wind_speed", "M_S"),
    "PRECTOTCORR": ("precipitation_water_rainfall", "MM"),
    "ALLSKY_SFC_SW_DWN": ("solar_space_solar_irradiance", "KWH_M2_DAY"),
    "CLOUD_AMT": ("atmospheric_activity_cloud_cover", "PERCENT"),
}

POWER_RES_M = 55000.0  # ~0.5°


async def _fetch_point(
    client: httpx.AsyncClient,
    url: str,
    lat: float,
    lon: float,
    start: str,
    end: str,
    temporal: TemporalMode,
    sem: asyncio.Semaphore,
) -> dict[str, Any]:
    params = {
        "parameters": ",".join(POWER_PARAMETERS),
        "community": "RE",
        "latitude": lat,
        "longitude": lon,
        "start": start,
        "end": end,
        "format": "JSON",
    }
    async with sem:
        for attempt in range(4):
            try:
                r = await client.get(url, params=params)
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                payload = r.json()
                if payload.get("errors"):
                    raise RuntimeError(str(payload["errors"]))
                return _process_power(payload, temporal)
            except Exception as exc:
                if attempt == 3:
                    raise
                logger.warning("POWER retry %s for %s,%s: %s", attempt + 1, lat, lon, exc)
                await asyncio.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def _rows_from_processed(
    processed: dict[str, Any],
    *,
    cell: dict[str, Any],
    temporal: TemporalMode,
    maps: dict[str, Any],
    dataset_id: int,
    region_id: int | None,
    dataset_version_id: int | None,
    record_kind: str,
    collected_at: str,
) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    rejected: list[dict] = []
    lat, lon = cell["lat"], cell["lon"]
    if not in_karnataka_bbox(lon, lat):
        rejected.append({"reason": "outside_bbox", "grid_id": cell["grid_id"]})
        return rows, rejected

    var_map = maps["variable_by_code"]
    unit_map = maps["unit_by_code"]

    for param, series_info in processed["variables"].items():
        if param not in PARAM_MAP:
            continue
        var_code, unit_code = PARAM_MAP[param]
        variable_id = var_map.get(var_code)
        unit_id = unit_map.get(unit_code)
        if variable_id is None:
            rejected.append({"reason": "unknown_variable", "param": param})
            continue
        for point in series_info["series"]:
            ok, reason = validate_value(param, point["value"])
            if not ok:
                rejected.append({"reason": reason, "param": param, "date": point["date"]})
                continue
            observed_at = parse_observed_at(point["date"], temporal=temporal)
            sid = f"nasa_power:{param}:{cell['grid_id']}:{observed_at}:{temporal}:{record_kind}"
            rows.append(
                observation_row(
                    variable_id=variable_id,
                    dataset_id=dataset_id,
                    observed_at=observed_at,
                    value=float(point["value"]),
                    unit_id=unit_id,
                    lat=lat,
                    lon=lon,
                    grid_id=cell["grid_id"],
                    source_record_id=sid,
                    quality_flag="ok" if record_kind == "observation" else "forecast",
                    region_id=region_id,
                    spatial_resolution_m=POWER_RES_M,
                    dataset_version_id=dataset_version_id,
                    metadata={
                        "record_kind": record_kind,
                        "source": "nasa_power",
                        "source_parameter": param,
                        "native_unit": series_info.get("unit"),
                        "temporal": temporal,
                        "quantity_type": "Model-derived",
                        "native_spatial_resolution": processed.get("native_spatial_resolution"),
                        "collected_at": collected_at,
                        "power_header": {
                            "sources": (processed.get("header") or {}).get("sources"),
                            "api_start": (processed.get("header") or {}).get("start"),
                            "api_end": (processed.get("header") or {}).get("end"),
                        },
                    },
                )
            )
    return rows, rejected


async def ingest_power_async(
    db: SupabaseREST,
    *,
    mode: TemporalMode,
    start: str,
    end: str,
    max_concurrency: int = 3,
    record_kind: str = "observation",
) -> dict[str, Any]:
    maps = db.lookup_maps()
    # Ensure kWh unit exists for solar
    db.ensure_unit("KWH_M2_DAY", "kilowatt-hour per square metre per day", "kWh/m²/day", "radiative_energy_flux")
    maps = db.lookup_maps()

    dataset_id = maps["dataset_by_code"]["nasa_power"]
    region_id = maps["region_by_code"].get("IN-KA")
    version_label = f"power_{mode}_{start}_{end}_{date.today().isoformat()}"
    version_id = db.create_dataset_version(
        dataset_id,
        version_label,
        {"provider": "NASA POWER", "mode": mode, "start": start, "end": end, "region": "Karnataka"},
    )
    job_id = db.start_job(
        dataset_id=dataset_id,
        job_type=f"ingest_power_{mode}",
        parameters={"start": start, "end": end, "record_kind": record_kind, "cells": "karnataka_power_grid"},
    )

    cells = power_grid_cells()
    collected_at = datetime.now(timezone.utc).isoformat()
    url = POWER_MONTHLY_POINT_URL if mode == "monthly" else POWER_DAILY_POINT_URL
    all_rows: list[dict] = []
    all_rejected: list[dict] = []
    failures: list[dict] = []

    sem = asyncio.Semaphore(max_concurrency)
    timeout = httpx.Timeout(120.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = [
            _fetch_point(client, url, c["lat"], c["lon"], start, end, mode, sem) for c in cells
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for cell, result in zip(cells, results):
        if isinstance(result, Exception):
            failures.append({"grid_id": cell["grid_id"], "error": str(result)})
            logger.error("POWER failed %s: %s", cell["grid_id"], result)
            continue
        rows, rejected = _rows_from_processed(
            result,
            cell=cell,
            temporal=mode,
            maps=maps,
            dataset_id=dataset_id,
            region_id=region_id,
            dataset_version_id=version_id,
            record_kind=record_kind,
            collected_at=collected_at,
        )
        all_rows.extend(rows)
        all_rejected.extend(rejected)

    stats = db.insert_observations(all_rows)
    status = "completed" if not failures else ("completed_with_errors" if stats["inserted"] else "failed")
    # processing_jobs.status may be constrained — use completed/failed
    job_status = "completed" if stats["inserted"] or stats["skipped"] else "failed"
    db.finish_job(
        job_id,
        status=job_status,
        records_processed=stats["inserted"],
        output_metadata={
            "stats": stats,
            "rejected": qc_summary(all_rejected),
            "failures": failures[:50],
            "n_failures": len(failures),
            "n_cells": len(cells),
            "mode": mode,
            "start": start,
            "end": end,
        },
        error_message=None if not failures else f"{len(failures)} cell fetch failures",
    )
    # Mark dataset processed when we have data
    if stats["inserted"] > 0:
        db.patch("datasets", {"dataset_id": f"eq.{dataset_id}"}, {"status": "processed"})

    return {
        "provider": "nasa_power",
        "mode": mode,
        "start": start,
        "end": end,
        "cells": len(cells),
        "job_id": job_id,
        "version_id": version_id,
        **stats,
        "rejected": qc_summary(all_rejected),
        "failures": failures,
    }


def ingest_power_daily_latest(db: SupabaseREST, *, days: int = 30) -> dict[str, Any]:
    end = date.today() - timedelta(days=2)  # POWER near-real-time lag
    start = end - timedelta(days=days - 1)
    return asyncio.run(
        ingest_power_async(
            db,
            mode="daily",
            start=start.strftime("%Y%m%d"),
            end=end.strftime("%Y%m%d"),
        )
    )


def ingest_power_monthly_historical(
    db: SupabaseREST, *, start_year: int = 2020, end_year: int | None = None
) -> dict[str, Any]:
    end_year = end_year or (date.today().year - 1)
    return asyncio.run(
        ingest_power_async(
            db,
            mode="monthly",
            start=str(start_year),
            end=str(end_year),
        )
    )
