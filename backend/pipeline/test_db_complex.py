#!/usr/bin/env python3
"""Complex live-database validation for the Karnataka environmental pipeline.

Run from backend/:
  python -m pipeline.test_db_complex
"""

from __future__ import annotations

import json
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config.settings import get_settings
from pipeline.db import SupabaseREST
from pipeline.ingest_power import ingest_power_daily_latest
from pipeline.karnataka_grid import open_meteo_grid_cells, power_grid_cells
from pipeline.validation import in_karnataka_bbox, validate_value


def main() -> int:
    s = get_settings()
    if not s.has_supabase:
        print("FAIL: Supabase credentials missing")
        return 2

    db = SupabaseREST()
    h = db.headers
    hc = {**h, "Prefer": "count=exact"}
    base = db.base
    client = httpx.Client(timeout=120.0)
    passed: list[dict] = []
    failed: list[dict] = []
    warned: list[dict] = []
    metrics: dict = {}

    def ok(name: str, detail=None) -> None:
        passed.append({"test": name, "detail": detail})
        print(f"PASS  {name}" + (f" — {detail}" if detail is not None else ""))

    def bad(name: str, detail=None) -> None:
        failed.append({"test": name, "detail": detail})
        print(f"FAIL  {name}" + (f" — {detail}" if detail is not None else ""))

    def warn(name: str, detail=None) -> None:
        warned.append({"test": name, "detail": detail})
        print(f"WARN  {name}" + (f" — {detail}" if detail is not None else ""))

    def count(params: dict | None = None) -> int:
        r = client.get(
            f"{base}/environmental_observations",
            headers=hc,
            params={**(params or {}), "select": "observation_id", "limit": "1"},
        )
        r.raise_for_status()
        return int(r.headers.get("content-range", "*/0").split("/")[-1])

    def fetch(params: dict, limit: int = 1000) -> list:
        r = client.get(
            f"{base}/environmental_observations",
            headers=h,
            params={**params, "limit": str(limit)},
        )
        r.raise_for_status()
        return r.json()

    def get_table(table: str, params: dict | None = None) -> list:
        r = client.get(f"{base}/{table}", headers=h, params=params or {})
        r.raise_for_status()
        return r.json()

    total = count()
    metrics["total"] = total
    (ok if total > 100_000 else bad)("total_records_substantial", total)

    dss = {d["dataset_code"]: d for d in get_table("datasets", {"select": "*", "limit": "200"})}
    for code in ("nasa_power", "open_meteo_archive", "open_meteo_forecast"):
        if code not in dss:
            bad("dataset_present", code)
            continue
        n = count({"dataset_id": f"eq.{dss[code]['dataset_id']}"})
        metrics[f"n_{code}"] = n
        (ok if n > 0 else bad)(f"dataset_has_rows:{code}", n)

    regions = {r["region_code"]: r for r in get_table("geo_regions", {"select": "*", "limit": "20"})}
    ka_id = regions.get("IN-KA", {}).get("region_id")
    (ok if ka_id else bad)("karnataka_region_exists", ka_id)

    ear = fetch({"select": "observed_at", "order": "observed_at.asc"}, 1)
    lat = fetch({"select": "observed_at", "order": "observed_at.desc"}, 1)
    metrics["earliest"] = ear[0]["observed_at"] if ear else None
    metrics["latest"] = lat[0]["observed_at"] if lat else None
    (ok if metrics["earliest"] and metrics["earliest"].startswith("2020") else bad)(
        "historical_starts_2020", metrics["earliest"]
    )
    (ok if metrics["latest"] and metrics["latest"] >= "2026-11" else bad)(
        "latest_includes_near_present_or_forecast", metrics["latest"]
    )
    (ok if count({"observed_at": "gt.2026-12-01T00:00:00Z"}) == 0 else bad)("no_far_future_timestamps")

    n_fc = count({"quality_flag": "eq.forecast"})
    n_ok = count({"quality_flag": "eq.ok"})
    metrics["forecasts"] = n_fc
    metrics["observations_ok"] = n_ok
    (ok if n_fc > 0 and n_ok > 0 else bad)(
        "forecast_and_observation_both_present", {"forecast": n_fc, "ok": n_ok}
    )

    fc_sample = fetch(
        {
            "quality_flag": "eq.forecast",
            "select": "metadata,observed_at",
            "order": "observed_at.desc",
        },
        200,
    )
    bad_kind = sum(1 for r in fc_sample if (r.get("metadata") or {}).get("record_kind") != "forecast")
    missing_meta = sum(
        1
        for r in fc_sample
        if not (r.get("metadata") or {}).get("forecast_init_time")
        or (r.get("metadata") or {}).get("forecast_horizon_hours") is None
    )
    (ok if bad_kind == 0 else bad)("forecast_record_kind_set", bad_kind)
    (ok if missing_meta == 0 else bad)("forecast_init_horizon_present", missing_meta)

    fc_ds = dss["open_meteo_forecast"]["dataset_id"]
    (ok if count({"dataset_id": f"eq.{fc_ds}", "quality_flag": "eq.ok"}) == 0 else bad)(
        "forecast_dataset_has_no_ok_observations"
    )

    power_cells = {c["grid_id"] for c in power_grid_cells()}
    om_cells = {c["grid_id"] for c in open_meteo_grid_cells()}
    present_power: set[str] = set()
    offset = 0
    power_ds = dss["nasa_power"]["dataset_id"]
    while offset < 60000:
        page = fetch(
            {
                "dataset_id": f"eq.{power_ds}",
                "select": "grid_id",
                "offset": str(offset),
                "order": "observation_id.asc",
            },
            1000,
        )
        if not page:
            break
        present_power.update(r["grid_id"] for r in page if r.get("grid_id"))
        if len(page) < 1000 or len(present_power) >= len(power_cells):
            break
        offset += 1000
    metrics["power_grids_present"] = len(present_power)
    (ok if len(present_power) >= 70 else bad)(
        "power_statewide_grid_coverage", f"{len(present_power)}/{len(power_cells)}"
    )

    spatial = fetch(
        {
            "select": "grid_id,value_numeric,metadata,unit_id,source_record_id,quality_flag,variable_id,dataset_id,observed_at",
            "order": "observation_id.asc",
        },
        1000,
    )
    spatial += fetch(
        {
            "select": "grid_id,value_numeric,metadata,unit_id,source_record_id,quality_flag,variable_id,dataset_id,observed_at",
            "order": "observation_id.desc",
        },
        1000,
    )
    outside = 0
    implausible = 0
    checked = 0
    for r in spatial:
        gid = r.get("grid_id") or ""
        parts = gid.split("_")
        if len(parts) >= 3:
            lat, lon = float(parts[1]), float(parts[2])
            if not in_karnataka_bbox(lon, lat):
                outside += 1
        param = (r.get("metadata") or {}).get("source_parameter")
        if param is not None and r.get("value_numeric") is not None:
            checked += 1
            good, _ = validate_value(param, r["value_numeric"])
            if not good:
                implausible += 1
    (ok if outside == 0 else bad)("sample_coords_in_karnataka_bbox", outside)
    (ok if implausible == 0 and checked > 100 else bad)(
        "physical_ranges_on_sample", f"checked={checked} bad={implausible}"
    )
    with_unit = sum(1 for r in spatial if r.get("unit_id") is not None)
    (ok if with_unit == len(spatial) else warn)("units_populated", f"{with_unit}/{len(spatial)}")

    # Cross-source consistency: Bengaluru POWER vs nearby OM archive
    blr = "power_13.000_77.500"
    om = min(open_meteo_grid_cells(), key=lambda c: (c["lat"] - 13) ** 2 + (c["lon"] - 77.5) ** 2)
    power = fetch(
        {
            "grid_id": f"eq.{blr}",
            "and": "(observed_at.gte.2026-10-31T00:00:00Z,observed_at.lte.2026-11-11T23:59:59Z,quality_flag.eq.ok)",
            "select": "observed_at,value_numeric,metadata",
        },
        500,
    )
    omr = fetch(
        {
            "grid_id": f"eq.{om['grid_id']}",
            "and": "(observed_at.gte.2026-10-31T00:00:00Z,observed_at.lte.2026-11-11T23:59:59Z,quality_flag.eq.ok)",
            "select": "observed_at,value_numeric,metadata",
        },
        500,
    )
    pt = {
        r["observed_at"][:10]: r["value_numeric"]
        for r in power
        if (r.get("metadata") or {}).get("source_parameter") == "T2M"
    }
    ot = {
        r["observed_at"][:10]: r["value_numeric"]
        for r in omr
        if (r.get("metadata") or {}).get("source_parameter") == "temperature_2m_mean"
    }
    common = sorted(set(pt) & set(ot))
    diffs = [abs(pt[d] - ot[d]) for d in common]
    metrics["cross_source_common_days"] = len(common)
    metrics["cross_source_mean_abs_diff_C"] = round(statistics.mean(diffs), 2) if diffs else None
    if len(common) >= 5 and statistics.mean(diffs) < 8:
        ok(
            "cross_source_temp_roughly_consistent",
            f"days={len(common)} mean|Δ|={statistics.mean(diffs):.2f}C",
        )
    else:
        bad(
            "cross_source_temp_roughly_consistent",
            f"days={len(common)} mean|Δ|={metrics['cross_source_mean_abs_diff_C']}",
        )

    dup_hits = 0
    for r in spatial[::25][:40]:
        sid = r.get("source_record_id")
        if not sid:
            continue
        if count({"source_record_id": f"eq.{sid}"}) != 1:
            dup_hits += 1
    (ok if dup_hits == 0 else bad)("source_record_id_unique_spotcheck", dup_hits)

    dup = ingest_power_daily_latest(db, days=14)
    metrics["dedup_reingest"] = {k: dup.get(k) for k in ("attempted", "inserted", "skipped")}
    (ok if dup.get("inserted") == 0 and dup.get("skipped", 0) > 0 else bad)(
        "reingest_skips_duplicates", metrics["dedup_reingest"]
    )

    probe = client.post(
        f"{base}/environmental_observations?on_conflict=source_record_id",
        headers={**h, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=[
            {
                "variable_id": spatial[0]["variable_id"],
                "dataset_id": spatial[0]["dataset_id"],
                "observed_at": spatial[0]["observed_at"],
                "value_numeric": spatial[0]["value_numeric"],
                "quality_flag": spatial[0]["quality_flag"],
                "source_record_id": spatial[0]["source_record_id"],
                "metadata": spatial[0].get("metadata") or {},
                "grid_id": spatial[0].get("grid_id"),
            }
        ],
    )
    if probe.status_code in (200, 201, 204):
        ok("unique_index_supports_upsert", probe.status_code)
    elif "42P10" in probe.text or "no unique" in probe.text.lower():
        warn("unique_index_supports_upsert", "run migrations/003_pipeline_constraints.sql")
    else:
        warn("unique_index_supports_upsert", f"{probe.status_code} {probe.text[:160]}")

    jobs = get_table("processing_jobs", {"select": "status", "order": "created_at.desc", "limit": "30"})
    (ok if sum(1 for j in jobs if j.get("status") == "succeeded") >= 3 else bad)(
        "processing_jobs_succeeded_present"
    )
    (ok if not any(j.get("status") == "running" for j in jobs) else warn)("no_stuck_running_jobs")

    var_map = {
        v["variable_code"]: v["variable_id"]
        for v in get_table("ref_environmental_variables", {"select": "variable_id,variable_code", "limit": "500"})
    }
    by_var = {
        code: count({"variable_id": f"eq.{var_map[code]}"})
        for code in (
            "temperature_air_temperature",
            "atmospheric_activity_humidity",
            "precipitation_water_rainfall",
            "atmospheric_activity_wind_speed",
            "solar_space_solar_irradiance",
            "atmospheric_activity_cloud_cover",
        )
    }
    metrics["by_variable"] = by_var
    (ok if all(v > 0 for v in by_var.values()) else bad)("all_core_variables_populated", by_var)

    # write roundtrip
    probe_body = {
        "variable_id": var_map["temperature_air_temperature"],
        "dataset_id": power_ds,
        "observed_at": "2099-06-01T00:00:00Z",
        "value_numeric": 25.0,
        "quality_flag": "ok",
        "grid_id": "PROBE_COMPLEX_TEST",
        "source_record_id": "probe-complex-test-delete-me",
        "metadata": {
            "record_kind": "observation",
            "source": "probe",
            "source_parameter": "T2M",
            "collected_at": datetime.now(timezone.utc).isoformat(),
        },
        "location": "POINT(77.5 13.0)",
        "region_id": ka_id,
    }
    r = client.post(
        f"{base}/environmental_observations",
        headers={**h, "Prefer": "return=representation"},
        json=probe_body,
    )
    if r.status_code in (200, 201):
        oid = r.json()[0]["observation_id"]
        client.delete(
            f"{base}/environmental_observations",
            headers=h,
            params={"observation_id": f"eq.{oid}"},
        )
        leftover = count({"source_record_id": "eq.probe-complex-test-delete-me"})
        (ok if leftover == 0 else bad)("write_delete_roundtrip", leftover)
    else:
        bad("write_delete_roundtrip", r.text[:200])

    summary = {
        "passed": len(passed),
        "failed": len(failed),
        "warnings": len(warned),
        "metrics": metrics,
        "failures": failed,
        "warnings_detail": warned,
        "om_cells_expected": len(om_cells),
    }
    print("\n==== SUMMARY ====")
    print(json.dumps(summary, indent=2, default=str))
    out = Path(s.data_root if Path(str(s.data_root)).is_absolute() else Path(__file__).resolve().parents[2] / "logs")
    # write beside backend logs if possible
    report = Path("/Users/advik/nasa/logs/db_complex_test_report.json")
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(summary, indent=2, default=str))
    print(f"Wrote {report}")
    client.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
