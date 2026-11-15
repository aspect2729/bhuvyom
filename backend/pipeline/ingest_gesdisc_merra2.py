"""Ingest MERRA-2 M2T1NXSLV from NASA GES DISC OPeNDAP → Supabase.

Quantity type: Reanalysis (not ground observation). Karnataka statewide coverage.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from data_sources.gesdisc_merra2_opendap import (
    COLLECTION_CONCEPT_ID,
    KA_BBOX,
    SHORT_NAME,
    VERSION,
    fetch_merra2_slv,
    latest_available_day,
)
from pipeline.db import SupabaseREST, observation_row
from pipeline.source_policy import assert_allowed_dataset, assert_metadata_ges_disc, require_nasa_collection
from pipeline.validation import in_karnataka_bbox, qc_summary, validate_value

logger = logging.getLogger(__name__)

DATASET_CODE = "merra2_assim"
SPATIAL_RES_M = 55000.0  # ~0.5°

# (native_or_derived_key, variable_code, unit_code, validate_param, is_derived, notes)
FIELD_MAP = [
    ("T2M_C", "temperature_air_temperature", "C", "T2M", False, "Native T2M converted K→C"),
    ("RH2M", "atmospheric_activity_humidity", "PERCENT", "RH2M", True, "Derived from T2M+T2MDEW (August–Roche–Magnus)"),
    ("WS2M", "atmospheric_activity_wind_speed", "M_S", "WS2M", True, "Derived from U2M/V2M"),
    ("WD2M", "atmospheric_activity_wind_direction", "INDEX", "WD2M", True, "Meteorological FROM direction from U2M/V2M"),
    ("PS", "atmospheric_activity_atmospheric_pressure", "PA", "PS", False, "Native surface pressure"),
]


def _ensure_catalog(db: SupabaseREST) -> dict[str, Any]:
    assert_allowed_dataset(DATASET_CODE)
    source_id = db.ensure_data_source(
        source_code="GES_DISC",
        source_name="NASA Goddard Earth Sciences Data and Information Services Center",
        organization="NASA GES DISC",
        homepage_url="https://disc.gsfc.nasa.gov/",
        access_type="open",  # DB CHECK allows open|unknown; Earthdata token still required at fetch
        api_endpoint="https://opendap.earthdata.nasa.gov/",
    )
    # Prefer existing merra2_assim row; ensure it points at GES DISC
    maps = db.lookup_maps()
    if DATASET_CODE in maps["dataset_by_code"]:
        dataset_id = maps["dataset_by_code"][DATASET_CODE]
        try:
            db.patch(
                "datasets",
                {"dataset_id": f"eq.{dataset_id}"},
                {
                    "status": "active",
                    "source_id": source_id,
                    "product_version": VERSION,
                    "description": (
                        "MERRA-2 tavg1_2d_slv_Nx (M2T1NXSLV) via NASA GES DISC OPeNDAP. "
                        "Reanalysis — not station observations."
                    ),
                    "landing_page_url": "https://doi.org/10.5067/VJAFPLI1CSIV",
                    "metadata": {
                        "adapter": "gesdisc_merra2_opendap",
                        "quantity_type": "Reanalysis",
                        "provider": "NASA GES DISC",
                        "access_platform": "NASA GES DISC / Earthdata",
                        "collection_concept_id": COLLECTION_CONCEPT_ID,
                        "dataset_short_name": SHORT_NAME,
                        "requires_earthdata": True,
                    },
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("dataset patch skipped: %s", exc)
    else:
        dataset_id = db.ensure_dataset(
            source_id=source_id,
            dataset_code=DATASET_CODE,
            dataset_name="MERRA-2 M2T1NXSLV (GES DISC)",
            description="MERRA-2 single-level diagnostics via NASA GES DISC",
            spatial_resolution="0.5° × 0.625°",
            temporal_resolution="1 hour",
            product_version=VERSION,
            landing_page_url="https://doi.org/10.5067/VJAFPLI1CSIV",
            metadata={
                "adapter": "gesdisc_merra2_opendap",
                "quantity_type": "Reanalysis",
                "provider": "NASA GES DISC",
                "collection_concept_id": COLLECTION_CONCEPT_ID,
                "dataset_short_name": SHORT_NAME,
            },
        )
    maps = db.lookup_maps()
    version_id = db.create_dataset_version(
        dataset_id,
        VERSION,
        {
            "collection_concept_id": COLLECTION_CONCEPT_ID,
            "short_name": SHORT_NAME,
            "provider": "NASA GES DISC",
        },
    )
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": version_id,
        "maps": maps,
        "region_id": maps["region_by_code"].get("karnataka") or maps["region_by_code"].get("KA"),
    }


def _rows_for_payload(
    payload: dict[str, Any],
    *,
    catalog: dict[str, Any],
    collected_at: str,
) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    rejected: list[dict] = []
    if payload.get("status") != "ok":
        rejected.append({"reason": "fetch_error", "detail": payload.get("error")})
        return rows, rejected

    src = payload["source"]
    meta_base = {
        "provider": "NASA GES DISC",
        "access_platform": "NASA GES DISC / Earthdata",
        "dataset_short_name": SHORT_NAME,
        "product_short_name": SHORT_NAME,
        "collection_concept_id": COLLECTION_CONCEPT_ID,
        "dataset_version": VERSION,
        "quantity_type": "Reanalysis",
        "native_spatial_resolution": "0.5° × 0.625°",
        "native_temporal_resolution": "1 hour",
        "granule": src.get("granule"),
        "processing_pipeline": "gesdisc_merra2_opendap@1",
        "processing_version": "1",
        "data_type": "reanalysis",
    }
    assert_metadata_ges_disc(meta_base)
    require_nasa_collection(meta_base)

    maps = catalog["maps"]
    var_map = maps["variable_by_code"]
    unit_map = maps["unit_by_code"]
    day = payload["request"]["day"]
    hour = payload["request"]["hour"]
    observed_at = f"{day}T{int(hour):02d}:00:00+00:00"

    for pt in payload.get("points") or []:
        lat, lon = pt.get("lat"), pt.get("lon")
        if lat is None or lon is None or not in_karnataka_bbox(float(lon), float(lat)):
            rejected.append({"reason": "outside_bbox", "lat": lat, "lon": lon})
            continue
        grid_id = f"merra2:{lat:.2f}:{lon:.3f}"
        for key, var_code, unit_code, vparam, derived, note in FIELD_MAP:
            if key not in pt or pt[key] is None:
                continue
            val = float(pt[key])
            ok, reason = validate_value(vparam, val)
            if not ok:
                # WD2M not in RANGES — allow 0–360
                if vparam == "WD2M" and 0 <= val <= 360:
                    ok = True
                elif vparam == "PS" and 70000 <= val <= 110000:
                    ok = True
                else:
                    rejected.append({"reason": reason, "field": key, "value": val})
                    continue
            vid = var_map.get(var_code)
            uid = unit_map.get(unit_code)
            if not vid:
                rejected.append({"reason": "missing_variable", "code": var_code})
                continue
            sid = f"gesdisc:{SHORT_NAME}:{VERSION}:{key}:{grid_id}:{observed_at}:reanalysis"
            meta = {
                **meta_base,
                "native_variable": key if not derived else key,
                "derived": derived,
                "derivation_note": note if derived else None,
                "original_unit": "K" if key == "T2M_C" else unit_code,
                "normalized_unit": unit_code,
                "hour_utc": hour,
                "retrieved_at": collected_at,
            }
            rows.append(
                observation_row(
                    variable_id=vid,
                    dataset_id=catalog["dataset_id"],
                    observed_at=observed_at,
                    value=round(val, 4) if key != "PS" else round(val, 1),
                    unit_id=uid,
                    lat=float(lat),
                    lon=float(lon),
                    grid_id=grid_id,
                    source_record_id=sid,
                    quality_flag="reanalysis",
                    region_id=catalog.get("region_id"),
                    spatial_resolution_m=SPATIAL_RES_M,
                    metadata=meta,
                    dataset_version_id=catalog["dataset_version_id"],
                )
            )
    return rows, rejected


def ingest_merra2_days(
    db: SupabaseREST,
    *,
    start: date,
    end: date,
    hour: int = 6,
    bbox: tuple[float, float, float, float] = KA_BBOX,
) -> dict[str, Any]:
    catalog = _ensure_catalog(db)
    job_id = db.start_job(
        dataset_id=catalog["dataset_id"],
        job_type="ingest_gesdisc_merra2",
        parameters={
            "start": start.isoformat(),
            "end": end.isoformat(),
            "hour": hour,
            "provider": "NASA GES DISC",
            "product": SHORT_NAME,
        },
    )
    collected_at = datetime.now(timezone.utc).isoformat()
    stats = {"inserted": 0, "skipped": 0, "attempted": 0, "days_ok": 0, "days_fail": 0}
    all_rejected: list[dict] = []
    failures: list[dict] = []

    day = start
    while day <= end:
        try:
            payload = fetch_merra2_slv(day=day, bbox=bbox, hour=hour)
            rows, rejected = _rows_for_payload(payload, catalog=catalog, collected_at=collected_at)
            all_rejected.extend(rejected)
            if payload.get("status") != "ok":
                stats["days_fail"] += 1
                failures.append({"day": day.isoformat(), "error": payload.get("error")})
            else:
                ins = db.insert_observations(rows, skip_existing=True)
                stats["inserted"] += ins["inserted"]
                stats["skipped"] += ins["skipped"]
                stats["attempted"] += ins["attempted"]
                stats["days_ok"] += 1
                logger.info(
                    "MERRA-2 %s: inserted=%s skipped=%s points=%s",
                    day,
                    ins["inserted"],
                    ins["skipped"],
                    payload.get("n_points"),
                )
        except Exception as exc:  # noqa: BLE001
            stats["days_fail"] += 1
            failures.append({"day": day.isoformat(), "error": str(exc)})
            logger.exception("MERRA-2 ingest failed for %s", day)
        day += timedelta(days=1)

    result = {
        "provider": "NASA GES DISC",
        "product": SHORT_NAME,
        "version": VERSION,
        "collection_concept_id": COLLECTION_CONCEPT_ID,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "hour_utc": hour,
        "job_id": job_id,
        **stats,
        "rejected": qc_summary(all_rejected),
        "failures": failures[:20],
        "failure_count": len(failures),
    }
    db.finish_job(
        job_id,
        status="succeeded" if stats["days_ok"] else "failed",
        records_processed=stats["inserted"],
        output_metadata=result,
        error_message=None if stats["days_ok"] else "all days failed",
    )
    return result


def ingest_merra2_latest(db: SupabaseREST, *, days: int = 30, hour: int = 6) -> dict[str, Any]:
    end = latest_available_day() or (date.today() - timedelta(days=14))
    start = end - timedelta(days=max(0, days - 1))
    return ingest_merra2_days(db, start=start, end=end, hour=hour)


def ingest_merra2_historical(db: SupabaseREST, *, days: int = 90, hour: int = 6) -> dict[str, Any]:
    return ingest_merra2_latest(db, days=days, hour=hour)
