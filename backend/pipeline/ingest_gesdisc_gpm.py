"""Ingest GPM IMERG Final daily precipitation from NASA GES DISC OPeNDAP → Supabase.

Quantity type: Satellite observation (merged). Karnataka statewide coverage at 0.1°.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx

from acquisition.cmr_search import search_granules
from acquisition.earthdata_auth import require_earthdata
from config.settings import get_settings
from pipeline.db import SupabaseREST, observation_row
from pipeline.source_policy import assert_allowed_dataset, assert_metadata_ges_disc, require_nasa_collection
from pipeline.validation import in_karnataka_bbox, qc_summary, validate_value

logger = logging.getLogger(__name__)

DATASET_CODE = "gpm_imerg_v07_daily"
SHORT_NAME_FINAL = "GPM_3IMERGDF"
SHORT_NAME_LATE = "GPM_3IMERGDL"
VERSION = "07"
# CMR concept ids (GES DISC) — verified via collections search 2026-11-15
COLLECTION_FINAL = "C2723754864-GES_DISC"
COLLECTION_LATE = "C2723754859-GES_DISC"
KA_BBOX = (74.05, 11.55, 78.60, 18.50)
SPATIAL_RES_M = 11000.0  # ~0.1°


def _gpm_indices(bbox: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    west, south, east, north = bbox

    def lon_i(lon: float) -> int:
        return int(round((lon + 179.95) / 0.1))

    def lat_i(lat: float) -> int:
        return int(round((lat + 89.95) / 0.1))

    return lon_i(west), lon_i(east), lat_i(south), lat_i(north)


def _ensure_catalog(db: SupabaseREST) -> dict[str, Any]:
    assert_allowed_dataset(DATASET_CODE)
    source_id = db.ensure_data_source(
        source_code="GES_DISC",
        source_name="NASA Goddard Earth Sciences Data and Information Services Center",
        organization="NASA GES DISC",
        homepage_url="https://disc.gsfc.nasa.gov/",
        access_type="open",  # DB CHECK allows open|unknown; Earthdata token still required at fetch
        api_endpoint="https://gpm1.gesdisc.eosdis.nasa.gov/opendap/",
    )
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
                        "GPM IMERG Final precipitation L3 1 day 0.1° (GPM_3IMERGDF.07) "
                        "via NASA GES DISC Hyrax OPeNDAP."
                    ),
                    "landing_page_url": "https://doi.org/10.5067/GPM/IMERGDF/DAY/07",
                    "metadata": {
                        "adapter": "gesdisc_gpm_opendap",
                        "quantity_type": "Satellite observation",
                        "provider": "NASA GES DISC",
                        "access_platform": "NASA GES DISC",
                        "collection_concept_id": COLLECTION_FINAL,
                        "dataset_short_name": SHORT_NAME_FINAL,
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
            dataset_name="GPM IMERG Daily (GES DISC)",
            description="GPM IMERG Final/Late daily precipitation via NASA GES DISC",
            spatial_resolution="0.1°",
            temporal_resolution="1 day",
            product_version=VERSION,
            landing_page_url="https://doi.org/10.5067/GPM/IMERGDF/DAY/07",
            metadata={
                "adapter": "gesdisc_gpm_opendap",
                "quantity_type": "Satellite observation",
                "provider": "NASA GES DISC",
                "collection_concept_id": COLLECTION_FINAL,
            },
        )
    maps = db.lookup_maps()
    version_id = db.create_dataset_version(
        dataset_id,
        f"V{VERSION}",
        {"collection_concept_id": COLLECTION_FINAL, "short_name": SHORT_NAME_FINAL},
    )
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": version_id,
        "maps": maps,
        "region_id": maps["region_by_code"].get("karnataka") or maps["region_by_code"].get("KA"),
    }


def _parse_precip_ascii(text: str) -> tuple[list[float], list[float], list[list[float]]]:
    lons: list[float] = []
    lats: list[float] = []
    rows: list[list[float]] = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("lon,"):
            lons = [float(x) for x in line.split(",")[1:] if x.strip()]
        elif line.startswith("lat,"):
            lats = [float(x) for x in line.split(",")[1:] if x.strip()]
        elif line.startswith("precipitation.precipitation["):
            vals = [float(x) for x in line.split("],", 1)[1].split(",") if x.strip()]
            rows.append(vals)
    return lons, lats, rows


def _fetch_day(
    client: httpx.Client,
    day: date,
    bbox: tuple[float, float, float, float],
    *,
    short_name: str = SHORT_NAME_FINAL,
    collection_id: str = COLLECTION_FINAL,
    imerg_run: str = "Final",
) -> dict[str, Any]:
    granules = search_granules(
        short_name,
        version=VERSION,
        start=f"{day.isoformat()}T00:00:00Z",
        end=f"{day.isoformat()}T23:59:59Z",
        bbox=bbox,
        page_size=5,
    )
    if not granules:
        return {"status": "error", "error": f"No GPM granule for {day} ({short_name})"}

    title = granules[0].get("title") or ""
    fname = title.split(":", 1)[-1]
    lo0, lo1, la0, la1 = _gpm_indices(bbox)
    product_dir = "GPM_3IMERGDF.07" if short_name == SHORT_NAME_FINAL else "GPM_3IMERGDL.07"
    hyrax = (
        f"https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/{product_dir}/"
        f"{day.year}/{day.month:02d}/{fname}"
    )
    granule_ur = title if title.startswith("GPM_") else f"{short_name}.{VERSION}:{fname}"
    url = (
        f"{hyrax}.ascii?"
        f"precipitation[0:0][{lo0}:{lo1}][{la0}:{la1}],"
        f"lon[{lo0}:{lo1}],lat[{la0}:{la1}]"
    )
    encoded = quote(granule_ur, safe="")
    front_url = (
        f"https://opendap.earthdata.nasa.gov/collections/{collection_id}"
        f"/granules/{encoded}.ascii?"
        f"precipitation{quote(f'[0:1:0][{lo0}:1:{lo1}][{la0}:1:{la1}]', safe='')},"
        f"lon{quote(f'[{lo0}:1:{lo1}]', safe='')},"
        f"lat{quote(f'[{la0}:1:{la1}]', safe='')}"
    )

    text = None
    used_url = url
    for candidate in (url, front_url):
        r = client.get(candidate)
        if r.status_code == 200 and "precipitation" in r.text:
            text = r.text
            used_url = candidate
            break
        logger.warning("GPM OPeNDAP %s → HTTP %s", candidate[:80], r.status_code)

    if not text:
        return {"status": "error", "error": "OPeNDAP fetch failed", "url": url}

    lons, lats, rows = _parse_precip_ascii(text)
    if not lons or not lats or not rows:
        return {"status": "error", "error": "parse_failed", "detail": text[:300]}

    points: list[dict[str, Any]] = []
    fill = -9999.0
    for i, lon in enumerate(lons):
        if i >= len(rows):
            break
        for j, lat in enumerate(lats):
            if j >= len(rows[i]):
                break
            val = rows[i][j]
            if val <= fill + 1 or not math.isfinite(val):
                continue
            points.append({"lat": round(lat, 4), "lon": round(lon, 4), "precip_mm": float(val)})

    return {
        "status": "ok",
        "source": {
            "provider": "NASA GES DISC",
            "access_platform": "NASA GES DISC",
            "product_short_name": short_name,
            "dataset_short_name": short_name,
            "version": VERSION,
            "collection_concept_id": collection_id,
            "imerg_run": imerg_run,
            "quantity_type": "Satellite observation",
            "granule": granule_ur,
            "opendap_url": used_url,
            "native_spatial_resolution": "0.1°",
            "native_temporal_resolution": "1 day",
        },
        "request": {"day": day.isoformat(), "bbox": bbox},
        "n_points": len(points),
        "points": points,
    }


def ingest_gpm_days(
    db: SupabaseREST,
    *,
    start: date,
    end: date,
    bbox: tuple[float, float, float, float] = KA_BBOX,
    max_points_per_day: int | None = 800,
    short_name: str = SHORT_NAME_FINAL,
    collection_id: str = COLLECTION_FINAL,
    imerg_run: str = "Final",
) -> dict[str, Any]:
    """Ingest daily IMERG. Optionally subsample points to keep DB size manageable."""
    catalog = _ensure_catalog(db)
    job_id = db.start_job(
        dataset_id=catalog["dataset_id"],
        job_type="ingest_gesdisc_gpm",
        parameters={
            "start": start.isoformat(),
            "end": end.isoformat(),
            "provider": "NASA GES DISC",
            "product": short_name,
            "imerg_run": imerg_run,
        },
    )
    maps = catalog["maps"]
    vid = maps["variable_by_code"].get("precipitation_water_rainfall")
    uid = maps["unit_by_code"].get("MM")
    if not vid:
        raise RuntimeError("precipitation_water_rainfall variable missing from catalog")

    auth = require_earthdata()
    collected_at = datetime.now(timezone.utc).isoformat()
    stats = {"inserted": 0, "skipped": 0, "attempted": 0, "days_ok": 0, "days_fail": 0}
    all_rejected: list[dict] = []
    failures: list[dict] = []

    with httpx.Client(
        timeout=get_settings().http_timeout_seconds,
        follow_redirects=True,
        headers=auth.bearer_headers(),
    ) as client:
        day = start
        while day <= end:
            try:
                payload = _fetch_day(
                    client,
                    day,
                    bbox,
                    short_name=short_name,
                    collection_id=collection_id,
                    imerg_run=imerg_run,
                )
                if payload.get("status") != "ok":
                    stats["days_fail"] += 1
                    failures.append({"day": day.isoformat(), "error": payload.get("error")})
                    day += timedelta(days=1)
                    continue

                src = payload["source"]
                meta_base = {
                    "provider": "NASA GES DISC",
                    "access_platform": "NASA GES DISC",
                    "dataset_short_name": short_name,
                    "product_short_name": short_name,
                    "collection_concept_id": collection_id,
                    "dataset_version": VERSION,
                    "imerg_run": imerg_run,
                    "quantity_type": "Satellite observation",
                    "data_type": "satellite_observation",
                    "native_spatial_resolution": "0.1°",
                    "native_temporal_resolution": "1 day",
                    "native_variable": "precipitation",
                    "original_unit": "mm/day",
                    "normalized_unit": "MM",
                    "granule": src.get("granule"),
                    "processing_pipeline": "gesdisc_gpm_opendap@1",
                    "processing_version": "1",
                    "retrieved_at": collected_at,
                }
                assert_metadata_ges_disc(meta_base)
                require_nasa_collection(meta_base)

                points = payload["points"]
                if max_points_per_day and len(points) > max_points_per_day:
                    step = max(1, len(points) // max_points_per_day)
                    points = points[::step][:max_points_per_day]

                rows: list[dict] = []
                observed_at = f"{day.isoformat()}T00:00:00+00:00"
                for pt in points:
                    lat, lon, val = pt["lat"], pt["lon"], pt["precip_mm"]
                    if not in_karnataka_bbox(lon, lat):
                        all_rejected.append({"reason": "outside_bbox"})
                        continue
                    ok, reason = validate_value("precipitation", val)
                    if not ok:
                        all_rejected.append({"reason": reason, "value": val})
                        continue
                    grid_id = f"gpm:{lat:.2f}:{lon:.2f}"
                    sid = (
                        f"gesdisc:{short_name}:{VERSION}:{imerg_run}:"
                        f"precip:{grid_id}:{observed_at}:obs"
                    )
                    rows.append(
                        observation_row(
                            variable_id=vid,
                            dataset_id=catalog["dataset_id"],
                            observed_at=observed_at,
                            value=round(val, 3),
                            unit_id=uid,
                            lat=lat,
                            lon=lon,
                            grid_id=grid_id,
                            source_record_id=sid,
                            quality_flag="satellite",
                            region_id=catalog.get("region_id"),
                            spatial_resolution_m=SPATIAL_RES_M,
                            metadata=meta_base,
                            dataset_version_id=catalog["dataset_version_id"],
                        )
                    )
                ins = db.insert_observations(rows, skip_existing=True)
                stats["inserted"] += ins["inserted"]
                stats["skipped"] += ins["skipped"]
                stats["attempted"] += ins["attempted"]
                stats["days_ok"] += 1
                logger.info("GPM %s %s: inserted=%s n_pts=%s", imerg_run, day, ins["inserted"], len(rows))
            except Exception as exc:  # noqa: BLE001
                stats["days_fail"] += 1
                failures.append({"day": day.isoformat(), "error": str(exc)})
                logger.exception("GPM ingest failed for %s", day)
            day += timedelta(days=1)

    result = {
        "provider": "NASA GES DISC",
        "product": short_name,
        "imerg_run": imerg_run,
        "version": VERSION,
        "collection_concept_id": collection_id,
        "start": start.isoformat(),
        "end": end.isoformat(),
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
    )
    return result


def _latest_day_for(short_name: str, lookback_days: int = 800) -> date | None:
    end = date.today()
    start = end - timedelta(days=lookback_days)
    # Probe backward in monthly chunks for newest granule
    cursor = end
    while cursor > start:
        window_start = cursor - timedelta(days=40)
        g = search_granules(
            short_name,
            version=VERSION,
            start=f"{window_start.isoformat()}T00:00:00Z",
            end=f"{cursor.isoformat()}T23:59:59Z",
            bbox=KA_BBOX,
            page_size=50,
        )
        if g:
            ts = (g[-1].get("time_start") or "")[:10]
            try:
                return date.fromisoformat(ts)
            except ValueError:
                pass
        cursor = window_start
    return None


def ingest_gpm_latest(db: SupabaseREST, *, days: int = 30) -> dict[str, Any]:
    """Prefer IMERG Final when available; otherwise Late (both GES DISC)."""
    final_end = _latest_day_for(SHORT_NAME_FINAL)
    late_end = _latest_day_for(SHORT_NAME_LATE, lookback_days=60)
    results: dict[str, Any] = {"final_end": final_end.isoformat() if final_end else None, "late_end": late_end.isoformat() if late_end else None}

    if final_end:
        start = final_end - timedelta(days=max(0, days - 1))
        results["final"] = ingest_gpm_days(
            db,
            start=start,
            end=final_end,
            short_name=SHORT_NAME_FINAL,
            collection_id=COLLECTION_FINAL,
            imerg_run="Final",
        )
    if late_end:
        # Recent Late run — do not treat as Final; tagged in metadata
        start = late_end - timedelta(days=max(0, min(days, 14) - 1))
        results["late"] = ingest_gpm_days(
            db,
            start=start,
            end=late_end,
            short_name=SHORT_NAME_LATE,
            collection_id=COLLECTION_LATE,
            imerg_run="Late",
        )
    if "final" not in results and "late" not in results:
        return {"status": "error", "error": "No GPM Final or Late granules found via CMR", **results}
    results["inserted"] = (results.get("final") or {}).get("inserted", 0) + (results.get("late") or {}).get("inserted", 0)
    results["days_ok"] = (results.get("final") or {}).get("days_ok", 0) + (results.get("late") or {}).get("days_ok", 0)
    results["days_fail"] = (results.get("final") or {}).get("days_fail", 0) + (results.get("late") or {}).get("days_fail", 0)
    results["skipped"] = (results.get("final") or {}).get("skipped", 0) + (results.get("late") or {}).get("skipped", 0)
    return results
