#!/usr/bin/env python3
"""Execute Karnataka environmental pipeline — NASA GES DISC only.

Usage (from backend/):
  python -m pipeline.run --phase all
  python -m pipeline.run --phase historical
  python -m pipeline.run --phase latest
  python -m pipeline.run --phase verify
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any

from config.settings import get_settings
from pipeline.db import SupabaseREST
from pipeline.ingest_gesdisc_gpm import ingest_gpm_latest
from pipeline.ingest_gesdisc_merra2 import ingest_merra2_historical, ingest_merra2_latest
from pipeline.karnataka_grid import coverage_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("pipeline.run")


def verify(db: SupabaseREST) -> dict[str, Any]:
    total, cr = db.get("environmental_observations", params={"select": "observation_id", "limit": "1"}, count=True)
    total_n = int((cr or "*/0").split("/")[-1])

    by_var: dict[str, int] = {}
    variables = db.get("ref_environmental_variables", params={"select": "variable_id,variable_code", "limit": "500"})
    for v in variables:
        rows, crv = db.get(
            "environmental_observations",
            params={"variable_id": f"eq.{v['variable_id']}", "select": "observation_id", "limit": "1"},
            count=True,
        )
        n = int((crv or "*/0").split("/")[-1])
        if n:
            by_var[v["variable_code"]] = n

    datasets = db.get("datasets", params={"select": "dataset_id,dataset_code,status", "limit": "200"})
    by_dataset: dict[str, int] = {}
    for d in datasets:
        rows, crd = db.get(
            "environmental_observations",
            params={"dataset_id": f"eq.{d['dataset_id']}", "select": "observation_id", "limit": "1"},
            count=True,
        )
        n = int((crd or "*/0").split("/")[-1])
        if n:
            by_dataset[d["dataset_code"]] = n

    earliest = db.get(
        "environmental_observations",
        params={"select": "observed_at", "order": "observed_at.asc", "limit": "1"},
    )
    latest = db.get(
        "environmental_observations",
        params={"select": "observed_at", "order": "observed_at.desc", "limit": "1"},
    )

    grid_ids: set[str] = set()
    offset = 0
    while offset < 50000:
        page = db.get(
            "environmental_observations",
            params={"select": "grid_id", "limit": "1000", "offset": str(offset)},
        )
        if not page:
            break
        for r in page:
            if r.get("grid_id"):
                grid_ids.add(r["grid_id"])
        if len(page) < 1000:
            break
        offset += 1000

    # Provenance sample
    sample = db.get(
        "environmental_observations",
        params={"select": "source_record_id,metadata,quality_flag", "limit": "20", "order": "observation_id.desc"},
    )
    prohibited_hits = []
    for s in sample:
        blob = json.dumps(s.get("metadata") or {}).lower() + (s.get("source_record_id") or "").lower()
        for bad in ("open-meteo", "open_meteo", "nasa_power", "power.larc"):
            if bad in blob:
                prohibited_hits.append({"id": s.get("source_record_id"), "marker": bad})

    jobs = db.get(
        "processing_jobs",
        params={
            "select": "job_id,job_type,status,records_processed,error_message,created_at,parameters",
            "order": "created_at.desc",
            "limit": "10",
        },
    )

    dup_checks = []
    for s in sample[:5]:
        sid = s.get("source_record_id")
        if not sid:
            continue
        _, crc = db.get(
            "environmental_observations",
            params={"source_record_id": f"eq.{sid}", "select": "observation_id", "limit": "1"},
            count=True,
        )
        dup_checks.append({"source_record_id": sid, "count": int((crc or "*/0").split("/")[-1])})

    return {
        "total_records": total_n,
        "by_variable": by_var,
        "by_dataset": by_dataset,
        "dataset_status": {d["dataset_code"]: d.get("status") for d in datasets},
        "distinct_grid_ids_sampled": len(grid_ids),
        "earliest_observed_at": earliest[0]["observed_at"] if earliest else None,
        "latest_observed_at": latest[0]["observed_at"] if latest else None,
        "prohibited_source_hits_in_sample": prohibited_hits,
        "recent_jobs": jobs,
        "duplicate_checks": dup_checks,
        "coverage": coverage_summary(),
        "policy": "NASA GES DISC exclusive",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bhuvyom Karnataka GES DISC environmental pipeline")
    parser.add_argument(
        "--phase",
        choices=[
            "all",
            "historical",
            "latest",
            "verify",
            "merra2",
            "merra2-historical",
            "gpm",
            # Retained names reject with clear error (no Open-Meteo / POWER)
            "forecast",
            "power-monthly",
            "power-daily",
            "om-archive",
            "om-forecast",
        ],
        default="all",
    )
    parser.add_argument("--merra2-days", type=int, default=30)
    parser.add_argument("--merra2-historical-days", type=int, default=90)
    parser.add_argument("--gpm-days", type=int, default=30)
    parser.add_argument("--hour", type=int, default=6)
    args = parser.parse_args(argv)

    prohibited = {"forecast", "power-monthly", "power-daily", "om-archive", "om-forecast"}
    if args.phase in prohibited:
        logger.error(
            "Phase '%s' is retired. Open-Meteo and NASA POWER are prohibited. "
            "Use --phase merra2|gpm|historical|latest|verify (NASA GES DISC only).",
            args.phase,
        )
        return 3

    settings = get_settings()
    if not settings.use_supabase_ingest:
        logger.error(
            "Set BHUVYOM_USE_SUPABASE_INGEST=true to write GES DISC observations into Supabase."
        )
        return 2
    if not settings.has_supabase:
        logger.error("Supabase credentials missing")
        return 2
    if not settings.earthdata_token:
        logger.error("EARTHDATA_TOKEN missing — cannot authenticate to NASA GES DISC / Earthdata")
        return 2

    db = SupabaseREST()
    results: dict[str, Any] = {"coverage": coverage_summary(), "policy": "NASA GES DISC exclusive"}
    logger.info("Coverage: %s", results["coverage"])

    try:
        if args.phase in ("all", "historical", "merra2-historical"):
            logger.info("GES DISC MERRA-2 historical %s days", args.merra2_historical_days)
            results["merra2_historical"] = ingest_merra2_historical(
                db, days=args.merra2_historical_days, hour=args.hour
            )
            logger.info("MERRA-2 historical: %s", {k: results["merra2_historical"].get(k) for k in ("inserted", "skipped", "days_ok", "days_fail")})

        if args.phase in ("all", "latest", "merra2"):
            logger.info("GES DISC MERRA-2 latest %s days", args.merra2_days)
            results["merra2"] = ingest_merra2_latest(db, days=args.merra2_days, hour=args.hour)
            logger.info("MERRA-2 latest: %s", {k: results["merra2"].get(k) for k in ("inserted", "skipped", "days_ok", "days_fail")})

        if args.phase in ("all", "historical", "latest", "gpm"):
            logger.info("GES DISC GPM IMERG daily %s days", args.gpm_days)
            results["gpm"] = ingest_gpm_latest(db, days=args.gpm_days)
            logger.info("GPM: %s", {k: results["gpm"].get(k) for k in ("inserted", "skipped", "days_ok", "days_fail")})

        if args.phase in ("all", "verify", "historical", "latest"):
            results["verify"] = verify(db)
            logger.info("VERIFY\n%s", json.dumps(results["verify"], indent=2, default=str))

    except Exception:
        logger.exception("Pipeline failed")
        print(json.dumps(results, indent=2, default=str))
        return 1

    print(json.dumps(results, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
