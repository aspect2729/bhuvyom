"""Quality control helpers — filter by flags, apply scale factors, track missingness."""

from __future__ import annotations

from typing import Any, Iterable, Optional

import numpy as np


def apply_scale_offset(
    values: np.ndarray,
    *,
    scale: float = 1.0,
    offset: float = 0.0,
    fill_value: float | int | None = None,
) -> np.ndarray:
    arr = np.array(values, dtype=float)
    if fill_value is not None:
        arr = np.where(arr == fill_value, np.nan, arr)
    return arr * scale + offset


def mask_by_quality(
    values: np.ndarray,
    quality: np.ndarray,
    *,
    accepted: Iterable[int],
) -> np.ndarray:
    accepted_set = set(int(x) for x in accepted)
    out = np.array(values, dtype=float)
    q = np.array(quality)
    out = np.where(np.isin(q, list(accepted_set)), out, np.nan)
    return out


def missing_stats(values: np.ndarray) -> dict[str, Any]:
    arr = np.array(values, dtype=float)
    n_missing = int(np.isnan(arr).sum())
    n_valid = int(np.isfinite(arr).sum())
    stats: dict[str, Any] = {
        "n_valid": n_valid,
        "n_missing": n_missing,
        "missing_percent": (100.0 * n_missing / arr.size) if arr.size else None,
    }
    if n_valid:
        valid = arr[np.isfinite(arr)]
        stats.update(
            {
                "min": float(valid.min()),
                "max": float(valid.max()),
                "mean": float(valid.mean()),
            }
        )
    return stats


def assert_units_documented(units: Optional[str], variable: str) -> str:
    if not units:
        raise ValueError(f"Units missing for variable {variable!r}")
    return units
