"""Load daily precipitation forcing from Supabase for SCS-CN."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

VAR_RAIN = 16
MIN_DAYS = 7


def _db():
    from pipeline.db import SupabaseREST

    return SupabaseREST()


def _dataset_id(code: str) -> int | None:
    rows = _db().get("datasets", params={"dataset_code": f"eq.{code}", "select": "dataset_id"})
    return int(rows[0]["dataset_id"]) if rows else None


def _cell_polygon(lat: float, lon: float, dlat: float = 0.5, dlon: float = 0.5) -> list[list[float]]:
    return [
        [lon - dlon / 2, lat - dlat / 2],
        [lon + dlon / 2, lat - dlat / 2],
        [lon + dlon / 2, lat + dlat / 2],
        [lon - dlon / 2, lat + dlat / 2],
        [lon - dlon / 2, lat - dlat / 2],
    ]


def load_daily_precip(
    *,
    start: str | None = None,
    end: str | None = None,
    prefer: str = "gpm_imerg_v07_daily",
) -> dict[str, Any] | None:
    """Return {dates, cells, values, product, dataset_id} or None if insufficient.

    NASA GES DISC only — GPM IMERG daily (Final/Late). Open-Meteo / POWER removed.
    """
    try:
        from config.settings import get_settings

        if not get_settings().has_supabase:
            return None
    except Exception:  # noqa: BLE001
        return None

    # GES DISC exclusivity — never fall back to Open-Meteo or NASA POWER
    order = [prefer, "gpm_imerg_v07_daily"]
    seen = set()
    codes = [c for c in order if not (c in seen or seen.add(c))]

    for code in codes:
        if code in ("open_meteo_archive", "open_meteo_forecast", "nasa_power"):
            logger.warning("Skipping prohibited precip source %s", code)
            continue
        did = _dataset_id(code)
        if did is None:
            continue
        params: dict[str, str] = {
            "dataset_id": f"eq.{did}",
            "variable_id": f"eq.{VAR_RAIN}",
            "select": "observed_at,value_numeric,grid_id,source_record_id",
            "order": "observed_at.asc",
            "limit": "50000",
        }
        if start:
            params["observed_at"] = f"gte.{start}T00:00:00+00:00"
        rows = _db().get("environmental_observations", params=params)
        if not rows:
            continue

        daily = []
        for r in rows:
            sid = (r.get("source_record_id") or "").lower()
            if "gesdisc" not in sid and "gpm" not in sid:
                continue
            ts = r.get("observed_at")
            if not ts:
                continue
            day = ts[:10]
            if end and day > end:
                continue
            if start and day < start:
                continue
            daily.append(r)

        if not daily:
            continue

        by_grid_day: dict[str, dict[str, float]] = defaultdict(dict)
        grid_coords: dict[str, tuple[float, float]] = {}
        for r in daily:
            gid = r.get("grid_id")
            v = r.get("value_numeric")
            day = (r.get("observed_at") or "")[:10]
            if not gid or v is None or len(day) < 10:
                continue
            by_grid_day[gid][day] = float(v)
            # parse coords
            if gid.startswith("om_"):
                parts = gid.split("_")
                try:
                    grid_coords[gid] = (float(parts[1]), float(parts[2]))
                except (IndexError, ValueError):
                    pass
            elif gid.startswith("power_"):
                parts = gid.split("_")
                try:
                    grid_coords[gid] = (float(parts[1]), float(parts[2]))
                except (IndexError, ValueError):
                    pass

        if not by_grid_day:
            continue

        all_dates = sorted({d for g in by_grid_day.values() for d in g})
        if len(all_dates) < MIN_DAYS:
            continue

        cells = []
        values = {}
        for gid, series in by_grid_day.items():
            lat, lon = grid_coords.get(gid, (None, None))
            if lat is None:
                continue
            dlat = 0.5 if gid.startswith("om_") else 0.5
            dlon = 0.5 if gid.startswith("om_") else 0.625
            cells.append(
                {
                    "id": gid,
                    "polygon": _cell_polygon(lat, lon, dlat, dlon),
                    "center": [lon, lat],
                }
            )
            values[gid] = [series.get(d) for d in all_dates]

        if len(cells) < 1 or len(all_dates) < MIN_DAYS:
            continue

        return {
            "dates": all_dates,
            "cells": cells,
            "values": values,
            "product": f"Supabase {code} daily precipitation",
            "dataset_id": code,
            "dataset_numeric_id": did,
            "n_days": len(all_dates),
            "n_cells": len(cells),
        }

    return None


def wettest_day_pattern(forcing: dict[str, Any]) -> dict[str, Any] | None:
    """City-mean-normalised wettest-day pattern for lab storm shape."""
    if not forcing or not forcing.get("cells"):
        return None
    arr = np.array(
        [[np.nan if v is None else v for v in forcing["values"][c["id"]]] for c in forcing["cells"]],
        float,
    )
    city_mean = np.nanmean(arr, 0)
    if not np.any(np.isfinite(city_mean)):
        return None
    d = int(np.nanargmax(city_mean))
    if city_mean[d] <= 0:
        return None
    pat = arr[:, d] / city_mean[d]
    return {
        "date": forcing["dates"][d],
        "city_mean_mm": float(city_mean[d]),
        "max_cell_mm": float(np.nanmax(arr[:, d])),
        "pattern": pat,
        "cells": forcing["cells"],
        "source": forcing.get("dataset_id"),
    }
