"""Temporal aggregation that preserves provenance of the original interval."""

from __future__ import annotations

from typing import Any, Literal

import numpy as np
import pandas as pd

AggMethod = Literal["mean", "sum", "min", "max", "none"]


def aggregate_timeseries(
    times: list[str] | pd.DatetimeIndex,
    values: list[float] | np.ndarray,
    *,
    freq: str,
    method: AggMethod,
    units: str,
) -> dict[str, Any]:
    """Aggregate a time series to `freq` without inventing missing values.

    NaNs are excluded from aggregations; periods with no valid samples remain NaN.
    """
    if method == "none":
        return {
            "times": list(times),
            "values": [None if (v is None or (isinstance(v, float) and np.isnan(v))) else float(v) for v in values],
            "method": "none",
            "freq": None,
            "units": units,
        }

    series = pd.Series(np.asarray(values, dtype=float), index=pd.to_datetime(times))
    grouped = series.resample(freq)
    if method == "mean":
        out = grouped.mean()
    elif method == "sum":
        out = grouped.sum(min_count=1)
    elif method == "min":
        out = grouped.min()
    elif method == "max":
        out = grouped.max()
    else:
        raise ValueError(f"Unknown aggregation method {method}")

    return {
        "times": [t.isoformat() for t in out.index.to_pydatetime()],
        "values": [None if np.isnan(v) else float(v) for v in out.to_numpy()],
        "method": method,
        "freq": freq,
        "units": units,
        "note": "Aggregation excludes NaNs; empty bins remain missing.",
    }
