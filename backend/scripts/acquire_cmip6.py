"""Acquire NASA NEX-GDDP-CMIP6 daily projections for Bengaluru (city point) via NCCS THREDDS NCSS.

Product: NEX-GDDP-CMIP6 (NASA Earth Exchange Global Daily Downscaled Projections), 0.25° daily,
bias-corrected & statistically downscaled CMIP6 (Thrasher et al. 2022, Sci. Data 9:262).
Server: https://ds.nccs.nasa.gov/thredds/  (public, no login).

What it does (resumable, safe to re-run):
  for each model × scenario × variable:
    1. read the THREDDS catalog to find that year's file (highest _vX.Y version wins)
    2. request the grid-as-point CSV at the Bengaluru point for that year
    3. save raw CSV  -> backend/data/raw/nex_gddp_cmip6/<model>/<scenario>/<var>/<year>.csv
    4. save annual aggregates -> backend/data/processed/nex_gddp_cmip6/annual.jsonl (one line per model/scenario/var/year)
Nothing is interpolated; days missing from a file are counted and reported.

Usage (from backend/, venv active):
  python -u scripts/acquire_cmip6.py                     # default 5 models, historical+3 SSPs, 5 variables
  python -u scripts/acquire_cmip6.py --models ACCESS-CM2 MIROC6 --workers 8
  python -u scripts/acquire_cmip6.py --check             # one request per model/scenario/var to verify access, then stop
Expect ~7,000 small requests for the default set (≈15–40 min depending on the server).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

BASE = "https://ds.nccs.nasa.gov/thredds"
ROOT = "AMES/NEX/GDDP-CMIP6"
POINT = (12.97, 77.59)  # Bengaluru centre (MG Road); NCSS returns the nearest 0.25° grid cell
DEFAULT_MODELS = ["ACCESS-CM2", "MIROC6", "MPI-ESM1-2-HR", "MRI-ESM2-0", "NorESM2-MM"]
SCENARIOS = {"historical": range(1995, 2015), "ssp126": range(2015, 2101), "ssp245": range(2015, 2101), "ssp585": range(2015, 2101)}
VARS = ["tas", "tasmax", "pr", "hurs", "sfcWind"]
MEMBER = "r1i1p1f1"

BACKEND = Path(__file__).resolve().parent.parent
RAW = BACKEND / "data" / "raw" / "nex_gddp_cmip6"
OUT = BACKEND / "data" / "processed" / "nex_gddp_cmip6"
_lock = threading.Lock()


def catalog(client: httpx.Client, model: str, scen: str, var: str) -> dict[int, str]:
    url = f"{BASE}/catalog/{ROOT}/{model}/{scen}/{MEMBER}/{var}/catalog.xml"
    r = client.get(url)
    if r.status_code != 200:
        raise RuntimeError(f"catalog HTTP {r.status_code}: {url}")
    files: dict[int, tuple[float, str]] = {}
    for el in ET.fromstring(r.content).iter():
        path = el.attrib.get("urlPath")
        if not path or not path.endswith(".nc"):
            continue
        m = re.search(r"_(\d{4})(?:_v(\d+)\.(\d+))?\.nc$", path)
        if not m:
            continue
        year = int(m.group(1))
        ver = float(f"{m.group(2) or 1}.{m.group(3) or 0}") if m.group(2) else 1.0
        if year not in files or ver > files[year][0]:
            files[year] = (ver, path)
    return {y: p for y, (v, p) in files.items()}


def fetch_year(client: httpx.Client, path: str, var: str, year: int) -> str:
    url = f"{BASE}/ncss/grid/{path}"
    params = {"var": var, "latitude": POINT[0], "longitude": POINT[1], "time_start": f"{year}-01-01T00:00:00Z",
              "time_end": f"{year}-12-31T23:59:59Z", "accept": "csv"}
    for attempt in range(5):
        try:
            r = client.get(url, params=params)
            if r.status_code == 200 and r.text.strip():
                return r.text
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"HTTP {r.status_code} for {r.url}: {r.text[:300]}")
        except httpx.HTTPError as exc:
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"gave up: {url}")


def parse(text: str, var: str) -> tuple[list[str], list[float | None], str]:
    rows = list(csv.reader(io.StringIO(text)))
    head = rows[0]
    col = next(i for i, h in enumerate(head) if h.split("[")[0].strip() == var)
    unit = re.search(r'unit="([^"]+)"', head[col])
    unit = unit.group(1) if unit else "?"
    times, vals = [], []
    for row in rows[1:]:
        if len(row) <= col:
            continue
        times.append(row[0])
        try:
            v = float(row[col])
            vals.append(None if v != v or abs(v) > 1e19 else v)
        except ValueError:
            vals.append(None)
    return times, vals, unit


def aggregate(var: str, vals: list[float | None], unit: str) -> dict:
    v = [x for x in vals if x is not None]
    n = len(v)
    out = {"n_days": len(vals), "n_valid": n, "unit_raw": unit}
    if not n:
        return out
    if var in ("tas", "tasmax"):
        c = [x - 273.15 for x in v] if unit.upper().startswith("K") else v
        out["mean"] = sum(c) / n
        if var == "tasmax":
            out["days_ge_35C"] = sum(1 for x in c if x >= 35.0)
    elif var == "pr":
        mm = [x * 86400.0 for x in v] if "s-1" in unit or "s^-1" in unit or "/s" in unit else v
        out["total_mm"] = sum(mm)
        out["days_ge_64_5mm"] = sum(1 for x in mm if x >= 64.5)
    else:
        out["mean"] = sum(v) / n
    return out


def job(client, model, scen, var, year, path):
    raw = RAW / model / scen / var / f"{year}.csv"
    if raw.exists() and raw.stat().st_size > 100:
        text = raw.read_text()
    else:
        text = fetch_year(client, path, var, year)
        raw.parent.mkdir(parents=True, exist_ok=True)
        raw.write_text(text)
    _, vals, unit = parse(text, var)
    rec = {"model": model, "scenario": scen, "var": var, "year": year, "file": path.rsplit("/", 1)[-1], **aggregate(var, vals, unit)}
    return rec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    ap.add_argument("--scenarios", nargs="+", default=list(SCENARIOS))
    ap.add_argument("--vars", nargs="+", default=VARS)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--check", action="store_true", help="one request per model/scenario/var, then stop")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / "annual.jsonl"
    done = set()
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            r = json.loads(line)
            done.add((r["model"], r["scenario"], r["var"], r["year"]))
    report = {"point": POINT, "missing": [], "errors": []}
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        tasks = []
        for model in a.models:
            for scen in a.scenarios:
                for var in a.vars:
                    try:
                        cat = catalog(client, model, scen, var)
                    except Exception as exc:  # noqa: BLE001
                        print(f"[skip] {model}/{scen}/{var}: {exc}", flush=True)
                        report["missing"].append({"model": model, "scenario": scen, "var": var, "reason": str(exc)})
                        continue
                    years = [y for y in SCENARIOS[scen] if y in cat]
                    gaps = [y for y in SCENARIOS[scen] if y not in cat]
                    if gaps:
                        report["missing"].append({"model": model, "scenario": scen, "var": var, "years_missing": gaps})
                    if a.check:
                        years = years[:1]
                    tasks += [(model, scen, var, y, cat[y]) for y in years if (model, scen, var, y) not in done]
        print(f"{len(tasks)} year-files to fetch ({len(done)} already done)", flush=True)
        with ThreadPoolExecutor(a.workers) as pool, out_path.open("a") as fh:
            futs = {pool.submit(job, client, *t): t for t in tasks}
            for i, f in enumerate(as_completed(futs), 1):
                t = futs[f]
                try:
                    rec = f.result()
                    with _lock:
                        fh.write(json.dumps(rec) + "\n"); fh.flush()
                    if a.check or i % 50 == 0 or i == len(tasks):
                        print(f"[{i}/{len(tasks)}] {t[0]} {t[1]} {t[2]} {t[3]} -> n_valid={rec.get('n_valid')} unit={rec.get('unit_raw')}", flush=True)
                except Exception as exc:  # noqa: BLE001
                    report["errors"].append({"task": t[:4], "error": str(exc)[:400]})
                    print(f"[error] {t[:4]}: {exc}", flush=True)
    (OUT / "acquisition_report.json").write_text(json.dumps(report, indent=1, default=str))
    print(f"Done. errors={len(report['errors'])}  missing={len(report['missing'])}  -> {out_path}", flush=True)
    if report["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
