#!/usr/bin/env python3
"""Execute Karnataka environmental pipeline phases against live Supabase.

Usage (from backend/):
  python -m pipeline.run --phase all
  python -m pipeline.run --phase historical
  python -m pipeline.run --phase latest
  python -m pipeline.run --phase forecast
  python -m pipeline.run --phase verify
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, timedelta
from typing import Any

from config.settings import get_settings
from pipeline.db import SupabaseREST
from pipeline.ingest_open_meteo import ingest_open_meteo_archive_recent, ingest_open_meteo_forecast
from pipeline.ingest_power import ingest_power_daily_latest, ingest_power_monthly_historical
from pipeline.karnataka_grid import coverage_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("pipeline.run")


def verify(db: SupabaseREST) -> dict[str, Any]:
    total, cr = db.get("environmental_observations", params={"select": "observation_id", "limit": "1"}, count=True)
    # content-range like 0-0/12345
    total_n = int((cr or "*/0").split("/")[-1])

    # by variable
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

    # by dataset / source
    datasets = db.get("datasets", params={"select": "dataset_id,dataset_code", "limit": "200"})
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

    # time range — fetch min/max via order
    earliest = db.get(
        "environmental_observations",
        params={"select": "observed_at", "order": "observed_at.asc", "limit": "1"},
    )
    latest = db.get(
        "environmental_observations",
        params={"select": "observed_at", "order": "observed_at.desc", "limit": "1"},
    )

    # distinct grid cells
    grids = db.get(
        "environmental_observations",
        params={"select": "grid_id", "limit": "10000"},
    )
    # PostgREST can't DISTINCT easily without rpc — sample unique from a larger pull
    grid_ids = set()
    # page through first 50k ids lightly
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

    # forecasts
    forecasts, crf = db.get(
        "environmental_observations",
        params={"quality_flag": "eq.forecast", "select": "observation_id", "limit": "1"},
        count=True,
    )
    forecast_n = int((crf or "*/0").split("/")[-1])

    # sample forecast horizons from metadata
    forecast_sample = db.get(
        "environmental_observations",
        params={
            "quality_flag": "eq.forecast",
            "select": "metadata,observed_at,grid_id",
            "limit": "20",
            "order": "observed_at.asc",
        },
    )
    horizons = sorted(
        {
            round(float((r.get("metadata") or {}).get("forecast_horizon_hours", 0)), 1)
            for r in forecast_sample
            if (r.get("metadata") or {}).get("forecast_horizon_hours") is not None
        }
    )

    # jobs
    jobs = db.get(
        "processing_jobs",
        params={"select": "job_id,job_type,status,records_processed,error_message,created_at", "order": "created_at.desc", "limit": "10"},
    )

    # duplicate probe: count rows sharing one source_record_id pattern via exact match sample
    sample = db.get(
        "environmental_observations",
        params={"select": "source_record_id", "limit": "5", "order": "observation_id.desc"},
    )
    dup_checks = []
    for s in sample:
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
        "distinct_grid_ids_sampled": len(grid_ids),
        "earliest_observed_at": earliest[0]["observed_at"] if earliest else None,
        "latest_observed_at": latest[0]["observed_at"] if latest else None,
        "forecast_records": forecast_n,
        "forecast_horizon_hours_sample": horizons,
        "recent_jobs": jobs,
        "duplicate_checks": dup_checks,
        "coverage": coverage_summary(),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bhuvyom Karnataka environmental pipeline")
    parser.add_argument(
        "--phase",
        choices=["all", "historical", "latest", "forecast", "verify", "power-monthly", "power-daily", "om-archive", "om-forecast"],
        default="all",
    )
    parser.add_argument("--power-monthly-start", type=int, default=2020)
    parser.add_argument("--power-daily-days", type=int, default=30)
    parser.add_argument("--om-archive-days", type=int, default=90)
    parser.add_argument("--forecast-days", type=int, default=7)
    args = parser.parse_args(argv)

    settings = get_settings()
    if not settings.has_supabase:
        logger.error("Supabase credentials missing")
        return 2

    db = SupabaseREST()
    results: dict[str, Any] = {"coverage": coverage_summary()}
    logger.info("Coverage: %s", results["coverage"])

    try:
        if args.phase in ("all", "historical", "power-monthly"):
            logger.info("Phase A: POWER monthly historical %s–…", args.power_monthly_start)
            results["power_monthly"] = ingest_power_monthly_historical(
                db, start_year=args.power_monthly_start
            )
            logger.info("POWER monthly done: %s", results["power_monthly"])

        if args.phase in ("all", "historical", "om-archive"):
            logger.info("Phase A/B: Open-Meteo archive last %s days", args.om_archive_days)
            results["open_meteo_archive"] = ingest_open_meteo_archive_recent(
                db, days=args.om_archive_days
            )
            logger.info("OM archive done: %s", {k: results["open_meteo_archive"].get(k) for k in ("inserted", "skipped", "cells", "failures")})

        if args.phase in ("all", "latest", "power-daily"):
            logger.info("Phase B: POWER daily latest %s days", args.power_daily_days)
            results["power_daily"] = ingest_power_daily_latest(db, days=args.power_daily_days)
            logger.info("POWER daily done: %s", results["power_daily"])

        if args.phase in ("all", "forecast", "om-forecast"):
            logger.info("Phase C: Open-Meteo forecast %s days", args.forecast_days)
            results["open_meteo_forecast"] = ingest_open_meteo_forecast(
                db, forecast_days=args.forecast_days
            )
            logger.info("OM forecast done: %s", results["open_meteo_forecast"])

        if args.phase in ("all", "verify", "historical", "latest", "forecast"):
            results["verify"] = verify(db)
            logger.info("VERIFY\n%s", json.dumps(results["verify"], indent=2, default=str))

    except Exception:
        logger.exception("Pipeline failed")
        print(json.dumps(results, indent=2, default=str))
        return 1

    out_path = settings.data_root if settings.data_root.is_absolute() else settings.data_root
    # always print JSON summary
    print(json.dumps(results, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
