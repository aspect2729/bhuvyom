"""Match observations to simulation time steps without inventing values."""

from __future__ import annotations

from typing import Any, Literal

import numpy as np
import pandas as pd

MatchMethod = Literal["nearest", "ffill", "interval_mean"]


def align_to_timesteps(
    obs_times: list[str],
    obs_values: list[float] | np.ndarray,
    sim_times: list[str],
    *,
    method: MatchMethod = "nearest",
    max_delta_hours: float | None = 12.0,
    units: str,
) -> dict[str, Any]:
    """Align native observations to simulation timestamps.

    Unmatched / out-of-tolerance steps remain missing (None).
    """
    obs = pd.Series(
        np.asarray(obs_values, dtype=float),
        index=pd.to_datetime(obs_times),
    ).sort_index()
    sim_idx = pd.to_datetime(sim_times)

    aligned: list[float | None] = []
    source_timestamps: list[str | None] = []

    if method == "ffill":
        reindexed = obs.reindex(sim_idx, method="ffill", tolerance=pd.Timedelta(hours=max_delta_hours or 0))
        for t, v in reindexed.items():
            aligned.append(None if pd.isna(v) else float(v))
            # Approximate source stamp as last obs <= t
            prior = obs.loc[:t]
            source_timestamps.append(
                prior.index[-1].isoformat() if len(prior) else None
            )
    elif method == "nearest":
        for t in sim_idx:
            if obs.empty:
                aligned.append(None)
                source_timestamps.append(None)
                continue
            deltas = np.abs((obs.index - t).total_seconds())
            k = int(np.argmin(deltas))
            delta_h = deltas[k] / 3600.0
            if max_delta_hours is not None and delta_h > max_delta_hours:
                aligned.append(None)
                source_timestamps.append(None)
            else:
                val = obs.iloc[k]
                aligned.append(None if pd.isna(val) else float(val))
                source_timestamps.append(obs.index[k].isoformat())
    elif method == "interval_mean":
        # Mean of observations falling within ± half-step around each sim time
        if len(sim_idx) > 1:
            half = (sim_idx[1] - sim_idx[0]) / 2
        else:
            half = pd.Timedelta(hours=max_delta_hours or 12)
        for t in sim_idx:
            window = obs.loc[t - half : t + half]
            if window.empty or not np.isfinite(window.to_numpy()).any():
                aligned.append(None)
                source_timestamps.append(None)
            else:
                aligned.append(float(np.nanmean(window.to_numpy(dtype=float))))
                source_timestamps.append(t.isoformat())
    else:
        raise ValueError(f"Unknown match method {method}")

    return {
        "sim_times": [t.isoformat() for t in sim_idx.to_pydatetime()],
        "values": aligned,
        "original_measurement_timestamps": source_timestamps,
        "method": method,
        "max_delta_hours": max_delta_hours,
        "units": units,
        "note": "Native observations preserved separately; aligned series may contain gaps.",
    }
