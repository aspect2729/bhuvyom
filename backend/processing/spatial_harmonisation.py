"""Spatial harmonisation without fabricating observational detail.

Coarse datasets may be resampled onto a finer grid for numerical alignment, but
metadata must record that observational accuracy remains that of the source.
"""

from __future__ import annotations

from typing import Any, Literal

import numpy as np

ResampleMethod = Literal["nearest", "bilinear", "area_weighted", "none"]


def resample_grid(
    values: np.ndarray,
    *,
    src_lats: np.ndarray,
    src_lons: np.ndarray,
    dst_lats: np.ndarray,
    dst_lons: np.ndarray,
    method: ResampleMethod,
    source_resolution: str,
    output_resolution: str,
) -> dict[str, Any]:
    """Resample a 2-D lat/lon grid onto a destination grid.

    Returns values plus mandatory harmonisation metadata.
    """
    if method == "none":
        return {
            "values": values,
            "lats": src_lats,
            "lons": src_lons,
            "metadata": {
                "source_resolution": source_resolution,
                "output_resolution": source_resolution,
                "resampling_method": "none",
                "note": "Native grid preserved.",
            },
        }

    src = np.asarray(values, dtype=float)
    if src.ndim != 2:
        raise ValueError("values must be 2-D (lat, lon)")

    # Ensure ascending coordinates for interpolation
    lat_asc = np.asarray(src_lats, dtype=float)
    lon_asc = np.asarray(src_lons, dtype=float)
    if lat_asc[0] > lat_asc[-1]:
        lat_asc = lat_asc[::-1]
        src = src[::-1, :]
    if lon_asc[0] > lon_asc[-1]:
        lon_asc = lon_asc[::-1]
        src = src[:, ::-1]

    dst_la = np.asarray(dst_lats, dtype=float)
    dst_lo = np.asarray(dst_lons, dtype=float)
    out = np.full((dst_la.size, dst_lo.size), np.nan, dtype=float)

    if method == "nearest":
        for i, lat in enumerate(dst_la):
            for j, lon in enumerate(dst_lo):
                ii = int(np.argmin(np.abs(lat_asc - lat)))
                jj = int(np.argmin(np.abs(lon_asc - lon)))
                out[i, j] = src[ii, jj]
    elif method in {"bilinear", "area_weighted"}:
        # Bilinear for point sampling; area_weighted uses the same for this
        # regular-grid MVP and is flagged in metadata as approximation.
        from scipy.interpolate import RegularGridInterpolator

        finite_mask = np.isfinite(src)
        fill = np.where(finite_mask, src, np.nan)
        # RegularGridInterpolator does not accept all-NaN; replace NaN with a
        # sentinel then remask — never invent values outside source support.
        sentinel = -1.0e30
        fill_for_interp = np.where(finite_mask, fill, sentinel)
        interp = RegularGridInterpolator(
            (lat_asc, lon_asc),
            fill_for_interp,
            method="linear" if method == "bilinear" else "nearest",
            bounds_error=False,
            fill_value=np.nan,
        )
        pts = np.array([[la, lo] for la in dst_la for lo in dst_lo])
        sampled = interp(pts).reshape(dst_la.size, dst_lo.size)
        out = np.where(sampled <= sentinel / 10.0, np.nan, sampled)
    else:
        raise ValueError(f"Unknown resampling method {method}")

    return {
        "values": out,
        "lats": dst_la,
        "lons": dst_lo,
        "metadata": {
            "source_resolution": source_resolution,
            "output_resolution": output_resolution,
            "resampling_method": method,
            "note": (
                "Resampling changes grid representation only. "
                "Observational accuracy remains that of the source resolution "
                f"({source_resolution}). A coarse field placed on fine pixels "
                "must not be treated as fine-resolution observations."
            ),
            "area_weighted_note": (
                "area_weighted currently uses nearest/bilinear on regular grids; "
                "true polygon area weights require vector target cells."
                if method == "area_weighted"
                else None
            ),
        },
    }
