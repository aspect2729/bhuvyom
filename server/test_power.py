"""Fetch one Bengaluru point from NASA POWER and print per-variable stats.

Usage (from /server, with venv active):
    python test_power.py
    python test_power.py --start 20261001 --end 20261031
    python test_power.py --monthly --start 2020 --end 2022
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
from datetime import date, timedelta

from api.power import fetch_power_daily_point, fetch_power_monthly_point
from processing.power import process_power_monthly_response, process_power_response

# Bengaluru city centre (project brief).
LAT = 12.97
LON = 77.59


def default_daily_window() -> tuple[str, str]:
    """Last ~30 days ending a few days behind NRT (POWER latency)."""
    end = date.today() - timedelta(days=5)
    start = end - timedelta(days=29)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def classify_null_pattern(dates: list[str], null_flags: list[bool]) -> str:
    """Describe whether nulls are trailing, leading, scattered, or all/none."""
    del dates  # dates kept in signature for call-site clarity
    n = len(null_flags)
    null_count = sum(null_flags)
    if null_count == 0:
        return "none"
    if null_count == n:
        return "all"

    last_valid = max(i for i, is_null in enumerate(null_flags) if not is_null)
    first_valid = min(i for i, is_null in enumerate(null_flags) if not is_null)
    has_trailing_suffix = last_valid < n - 1 and all(
        null_flags[i] for i in range(last_valid + 1, n)
    )
    nulls_before_last_valid = any(null_flags[i] for i in range(0, last_valid + 1))

    if has_trailing_suffix and not nulls_before_last_valid:
        return "trailing"
    if has_trailing_suffix and nulls_before_last_valid:
        return "scattered+trailing"
    if first_valid > 0 and all(not null_flags[i] for i in range(first_valid, n)):
        return "leading"
    return "scattered"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NASA POWER smoke test for Bengaluru")
    p.add_argument("--start", help="Daily YYYYMMDD or monthly YYYY")
    p.add_argument("--end", help="Daily YYYYMMDD or monthly YYYY")
    p.add_argument(
        "--monthly",
        action="store_true",
        help="Use POWER monthly endpoint (start/end = years)",
    )
    p.add_argument("--lat", type=float, default=LAT)
    p.add_argument("--lon", type=float, default=LON)
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    if args.monthly:
        start = args.start or "2020"
        end = args.end or "2022"
        print(
            f"Requesting NASA POWER MONTHLY point lat={args.lat} lon={args.lon} "
            f"start={start} end={end}"
        )
        raw = await fetch_power_monthly_point(args.lat, args.lon, start, end)
        processed = process_power_monthly_response(raw)
    else:
        if args.start and args.end:
            start, end = args.start, args.end
        elif args.start or args.end:
            raise SystemExit("Provide both --start and --end, or neither")
        else:
            start, end = default_daily_window()
        print(
            f"Requesting NASA POWER DAILY point lat={args.lat} lon={args.lon} "
            f"start={start} end={end}"
        )
        raw = await fetch_power_daily_point(args.lat, args.lon, start, end)
        processed = process_power_response(raw)

    print(f"Response lat={processed['lat']} lon={processed['lon']}")
    print(f"Header sources={processed['header'].get('sources')}")
    print(f"Fill value={processed['header'].get('fill_value')}")
    print("-" * 72)

    for param, info in processed["variables"].items():
        points = info["series"]
        values = [p["value"] for p in points]
        dates = [p["date"] for p in points]
        null_flags = [v is None for v in values]
        valid = [v for v in values if v is not None]
        null_dates = [d for d, is_null in zip(dates, null_flags) if is_null]
        pattern = classify_null_pattern(dates, null_flags)

        print(f"{param}")
        print(f"  longName : {info['longName']}")
        print(f"  unit     : {info['unit']}")
        print(f"  n_total  : {len(values)}")
        print(f"  n_valid  : {len(valid)}")
        print(f"  n_null   : {len(null_dates)}")
        if "annualKeysExcluded" in info:
            print(f"  annual YYYY13 excluded : {info['annualKeysExcluded']}")
        if valid:
            print(
                f"  min/max/mean : {min(valid):.4g} / {max(valid):.4g} / "
                f"{statistics.mean(valid):.4g}"
            )
        else:
            print("  min/max/mean : No data")
        print(f"  null pattern : {pattern}")
        if null_dates:
            preview = ", ".join(null_dates[:12])
            more = "" if len(null_dates) <= 12 else f" … (+{len(null_dates) - 12} more)"
            print(f"  null dates  : {preview}{more}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
