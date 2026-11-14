"""Trend detection utilities aligned with METHODOLOGY_REFERENCE.md §§5–8, §11.

Implements Mann–Kendall (§5), Sen's slope (§6), Sen CI construction sketched in
§7.4 (classical ordered-slope / MK-critical ranks; formula not fully derived in
the supplied papers — implemented from the §7.4 description citing Sen 1968 /
Gilbert / Helsel & Hirsch), lag-1 autocorrelation screening (§8.1), and
trend-free pre-whitening when r1 is significant (§8.4; P2 applies TFPW).

Multiple-testing across cells uses Benjamini–Hochberg FDR (§11.3), flagged in
the methodology as essential additional research for multi-cell maps.

Quantity taxonomy (§1.2): trend statistics are "Statistically estimated";
POWER reanalysis inputs are "Model-derived".
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Iterable, Literal, Sequence

import numpy as np
from scipy import stats

MIN_YEARS = 10
MIN_MONTHS_FOR_ANNUAL = 10
ALPHA = 0.05

QuantityType = Literal[
    "Observed",
    "Statistically estimated",
    "Model-derived",
    "Simulated",
]


def _as_float_array(x: Sequence[float | None] | np.ndarray) -> np.ndarray:
    arr = np.asarray(x, dtype=float)
    return arr


def drop_nulls(
    x: Sequence[float | None] | np.ndarray,
    t: Sequence[float] | np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray | None, int]:
    """Drop NaN/None pairs. Returns (x_clean, t_clean_or_None, n_used)."""
    xv = _as_float_array(x)
    mask = np.isfinite(xv)
    xc = xv[mask]
    if t is None:
        return xc, None, int(xc.size)
    tv = np.asarray(t, dtype=float)
    if tv.shape != xv.shape:
        raise ValueError("x and t must have the same length")
    return xc, tv[mask], int(xc.size)


def deseasonalize_monthly(
    values: Sequence[float | None],
    months: Sequence[int],
) -> np.ndarray:
    """Subtract each calendar month's long-term mean (monthly anomalies).

    Methodology context: §4 / seasonal confounding notes; used so seasonality
    does not drive the monotonic trend test (§5).
    """
    xv = _as_float_array(values)
    mv = np.asarray(months, dtype=int)
    if xv.shape != mv.shape:
        raise ValueError("values and months must have the same length")
    out = np.full_like(xv, np.nan, dtype=float)
    for m in range(1, 13):
        idx = mv == m
        if not np.any(idx):
            continue
        mu = np.nanmean(xv[idx])
        out[idx] = xv[idx] - mu
    return out


def annual_means(
    values: Sequence[float | None],
    years: Sequence[int],
    months: Sequence[int] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute annual means. An annual mean is null unless ≥10 non-null months (§ request).

    Returns (year_array, mean_array) including NaN years that failed the threshold
    only when at least one month existed; years with zero months are omitted.
    """
    xv = _as_float_array(values)
    yv = np.asarray(years, dtype=int)
    if months is not None:
        mv = np.asarray(months, dtype=int)
        if mv.shape != xv.shape:
            raise ValueError("months must match values length")
    if yv.shape != xv.shape:
        raise ValueError("years must match values length")

    years_out: list[int] = []
    means_out: list[float] = []
    for y in sorted(set(int(v) for v in yv)):
        mask = yv == y
        vals = xv[mask]
        valid = vals[np.isfinite(vals)]
        years_out.append(y)
        if valid.size >= MIN_MONTHS_FOR_ANNUAL:
            means_out.append(float(np.mean(valid)))
        else:
            means_out.append(float("nan"))
    return np.asarray(years_out, dtype=float), np.asarray(means_out, dtype=float)


def lag1_autocorrelation(x: Sequence[float | None] | np.ndarray) -> dict[str, Any]:
    """Lag-1 serial correlation r1 and Anderson 95% bounds (§8.1, P2 Eqs. 1–2).

    Significance uses the Analyst note in §8.1: correlation when r1 lies
    *outside* the bounds (standard Anderson test), not the likely-misprinted
    "between" wording in P2.
    """
    xc, _, n = drop_nulls(x)
    if n < 3:
        return {
            "r1": None,
            "n_used": n,
            "bound_low": None,
            "bound_high": None,
            "significant": False,
            "quantity_type": "Statistically estimated",
        }
    xbar = float(np.mean(xc))
    num = float(np.sum((xc[:-1] - xbar) * (xc[1:] - xbar)))
    den = float(np.sum((xc - xbar) ** 2))
    r1 = num / den if den != 0.0 else 0.0
    bound_high = (-1.0 + 1.96 * np.sqrt(n - 2)) / (n - 1)
    bound_low = (-1.0 - 1.96 * np.sqrt(n - 2)) / (n - 1)
    significant = bool(r1 < bound_low or r1 > bound_high)
    return {
        "r1": r1,
        "n_used": n,
        "bound_low": float(bound_low),
        "bound_high": float(bound_high),
        "significant": significant,
        "quantity_type": "Statistically estimated",
    }


def _tie_counts(x: np.ndarray) -> list[int]:
    counts = Counter(np.round(x, 12).tolist())  # tame tiny float noise for ties
    return [c for c in counts.values() if c > 1]


def mann_kendall(x: Sequence[float | None] | np.ndarray) -> dict[str, Any]:
    """Mann–Kendall trend test (§5.4; prefer P1 Var(S) tie formula).

    Returns S, Var(S), Z (continuity-corrected), two-sided p-value, n_used.
    Nulls are dropped.
    """
    xc, _, n = drop_nulls(x)
    if n < 2:
        return {
            "S": 0,
            "var_s": 0.0,
            "Z": 0.0,
            "p_value": 1.0,
            "n_used": n,
            "quantity_type": "Statistically estimated",
        }

    s = 0
    for i in range(n - 1):
        diffs = xc[i + 1 :] - xc[i]
        s += int(np.sum(np.sign(diffs)))

    tie_sizes = _tie_counts(xc)
    tie_term = sum(t * (t - 1) * (2 * t + 5) for t in tie_sizes)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    if var_s <= 0:
        z = 0.0
    elif s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0

    p = float(2.0 * (1.0 - stats.norm.cdf(abs(z)))) if var_s > 0 else 1.0
    return {
        "S": int(s),
        "var_s": float(var_s),
        "Z": float(z),
        "p_value": p,
        "n_used": n,
        "quantity_type": "Statistically estimated",
    }


def _pairwise_slopes(x: np.ndarray, t: np.ndarray) -> np.ndarray:
    slopes: list[float] = []
    n = x.size
    for i in range(n - 1):
        dt = t[i + 1 :] - t[i]
        dx = x[i + 1 :] - x[i]
        ok = dt != 0
        if np.any(ok):
            slopes.extend((dx[ok] / dt[ok]).tolist())
    return np.asarray(slopes, dtype=float)


def sens_slope(
    x: Sequence[float | None] | np.ndarray,
    t: Sequence[float] | np.ndarray,
    *,
    alpha: float = 0.05,
    var_s: float | None = None,
) -> dict[str, Any]:
    """Sen's slope (§6) and 95% CI via classical ordered-slope ranks (§7.4).

    Point estimate: median of pairwise (x_j - x_i)/(t_j - t_i) (§6.3).
    For even N, uses the average of the two central slopes (standard Theil–Sen;
    P1 Eq. 5 index for even N is ambiguous — §6.3).

    CI (§7.4 additional classical construction):
        C_α = Z_{1-α/2} √Var(S)
        M1 = (N - C_α)/2 ,  M2 = (N + C_α)/2
        bounds from ordered pairwise slopes at those ranks.
    Var(S) defaults to the MK variance of x (§5.4) unless provided.
    """
    xc, tc, n = drop_nulls(x, t)
    assert tc is not None
    if n < 2:
        return {
            "slope": None,
            "ci_low": None,
            "ci_high": None,
            "n_used": n,
            "n_pairwise": 0,
            "quantity_type": "Statistically estimated",
        }

    slopes = np.sort(_pairwise_slopes(xc, tc))
    n_pair = int(slopes.size)
    if n_pair == 0:
        return {
            "slope": None,
            "ci_low": None,
            "ci_high": None,
            "n_used": n,
            "n_pairwise": 0,
            "quantity_type": "Statistically estimated",
        }

    if n_pair % 2 == 1:
        slope = float(slopes[n_pair // 2])
    else:
        slope = float(0.5 * (slopes[n_pair // 2 - 1] + slopes[n_pair // 2]))

    if var_s is None:
        var_s = float(mann_kendall(xc)["var_s"])

    z_crit = float(stats.norm.ppf(1.0 - alpha / 2.0))
    c_alpha = z_crit * np.sqrt(var_s) if var_s > 0 else 0.0
    m1 = (n_pair - c_alpha) / 2.0
    m2 = (n_pair + c_alpha) / 2.0
    # 1-based ranks → 0-based indices (common Gilbert / hydrology packaging)
    lower_rank = int(np.round(m1))
    upper_rank = int(np.round(m2))
    lower_idx = max(lower_rank - 1, 0)
    upper_idx = min(upper_rank, n_pair - 1)
    if lower_idx > upper_idx:
        lower_idx, upper_idx = upper_idx, lower_idx

    return {
        "slope": slope,
        "ci_low": float(slopes[lower_idx]),
        "ci_high": float(slopes[upper_idx]),
        "n_used": n,
        "n_pairwise": n_pair,
        "C_alpha": float(c_alpha),
        "quantity_type": "Statistically estimated",
    }


def tfpw_series(
    x: Sequence[float | None] | np.ndarray,
    t: Sequence[float] | np.ndarray,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Trend-free pre-whitening (Yue et al. 2002) as applied in P2 / §8.4.

    Steps: Sen slope → detrend → r1 on residual → AR(1) remove → add trend back.
    Returns (x_star, t_used, r1_used).
    """
    xc, tc, n = drop_nulls(x, t)
    assert tc is not None
    if n < 3:
        return xc, tc, 0.0

    slope = sens_slope(xc, tc)["slope"] or 0.0
    residual = xc - slope * tc
    r1 = float(lag1_autocorrelation(residual)["r1"] or 0.0)
    # Prewhiten residual
    y = residual[1:] - r1 * residual[:-1]
    t_star = tc[1:]
    x_star = y + slope * t_star
    return x_star, t_star, r1


def analyze_trend_series(
    x: Sequence[float | None] | np.ndarray,
    t: Sequence[float] | np.ndarray,
    *,
    unit: str,
    time_unit: Literal["year"] = "year",
    min_years: int = MIN_YEARS,
) -> dict[str, Any]:
    """Full per-series trend workflow (§5–§8).

    - Drops nulls; requires span covering ≥ min_years distinct years.
    - Screens r1 (§8.1); if significant, applies TFPW before MK (§8.4 / P2).
    - Sen slope + 95% CI on the (possibly TFPW) series used for testing magnitude
      on the original (non-prewhitened) series for interpretability of units,
      while MK p-value uses the corrected series when TFPW applies.
    - Reports slope per decade (§6.5 / P2: ×10 for annual / per-year slopes).
    """
    xc, tc, n_used = drop_nulls(x, t)
    assert tc is not None

    years_present = np.unique(np.floor(tc))
    n_years = int(years_present.size)
    year_span = float(np.nanmax(tc) - np.nanmin(tc)) if n_used else 0.0

    base_meta = {
        "status": "ok",
        "n_used": n_used,
        "n_years": n_years,
        "years_used": [int(y) for y in years_present.tolist()],
        "unit": unit,
        "slope_unit_per_decade": f"{unit}/decade",
        "quantity_type": "Statistically estimated",
        "source_data_quantity_type": "Model-derived",
        "correction_applied": "none",
        "r1": None,
        "r1_significant": False,
    }

    if n_years < min_years or n_used < min_years:
        return {
            **base_meta,
            "status": "insufficient_data",
            "reason": f"Need ≥{min_years} years of data (got n_years={n_years}, n_used={n_used})",
            "slope_per_decade": None,
            "ci_low_per_decade": None,
            "ci_high_per_decade": None,
            "p_value": None,
            "significant": False,
            "S": None,
            "Z": None,
        }

    r1_info = lag1_autocorrelation(xc)
    correction = "none"
    mk_x, mk_t = xc, tc
    if r1_info["significant"]:
        mk_x, mk_t, _ = tfpw_series(xc, tc)
        correction = "TFPW"
        # Recompute r1 after deciding correction (report pre-correction r1)
    
    mk = mann_kendall(mk_x)
    # Magnitude on original series (physical units); CI uses MK Var(S) from
    # the series actually tested when corrected, else original (§7.4 / §8.5).
    var_for_ci = float(mk["var_s"])
    sen = sens_slope(xc, tc, var_s=var_for_ci)

    # time_unit == year → slope is already per year
    if time_unit != "year":
        raise ValueError("Only time_unit='year' is supported")
    scale = 10.0  # per decade

    slope = sen["slope"]
    ci_low = sen["ci_low"]
    ci_high = sen["ci_high"]

    return {
        **base_meta,
        "correction_applied": correction,
        "r1": r1_info["r1"],
        "r1_significant": r1_info["significant"],
        "r1_bounds": {
            "low": r1_info["bound_low"],
            "high": r1_info["bound_high"],
        },
        "S": mk["S"],
        "var_s": mk["var_s"],
        "Z": mk["Z"],
        "p_value": mk["p_value"],
        "significant": bool(mk["p_value"] < ALPHA),
        "slope_per_year": slope,
        "slope_per_decade": None if slope is None else slope * scale,
        "ci_low_per_decade": None if ci_low is None else ci_low * scale,
        "ci_high_per_decade": None if ci_high is None else ci_high * scale,
        "year_span": year_span,
        "n_used_mk": mk["n_used"],
    }


def prepare_monthly_for_trend(
    series: Sequence[dict[str, Any]],
    *,
    mode: Literal["annual", "monthly_anomaly"] = "annual",
) -> tuple[np.ndarray, np.ndarray, list[int]]:
    """Convert processed POWER monthly series [{date, value}] to (x, t_years, years_list).

    date is 'YYYY-MM'. Annual mode uses annual_means (≥10 months). Monthly anomaly
    mode uses deseasonalize_monthly with decimal-year time index.
    """
    years: list[int] = []
    months: list[int] = []
    values: list[float | None] = []
    for pt in series:
        date_str = pt["date"]
        y = int(date_str[0:4])
        m = int(date_str[5:7])
        years.append(y)
        months.append(m)
        values.append(pt["value"])

    if mode == "annual":
        y_arr, mean_arr = annual_means(values, years, months)
        mask = np.isfinite(mean_arr)
        return mean_arr[mask], y_arr[mask], [int(y) for y in y_arr[mask].tolist()]

    if mode == "monthly_anomaly":
        anom = deseasonalize_monthly(values, months)
        t = np.asarray(years, dtype=float) + (np.asarray(months, dtype=float) - 1.0) / 12.0
        mask = np.isfinite(anom)
        years_used = sorted({int(y) for y, ok in zip(years, mask) if ok})
        return anom[mask], t[mask], years_used

    raise ValueError(f"Unknown mode {mode!r}")


def benjamini_hochberg(
    p_values: Sequence[float | None],
    *,
    alpha: float = ALPHA,
) -> tuple[list[float | None], list[bool]]:
    """Benjamini–Hochberg FDR adjusted p-values (§11.3).

    Not derived in the supplied papers; methodology marks BH as essential
    additional research for multi-cell significance maps.
    """
    m = len(p_values)
    adj: list[float | None] = [None] * m
    sig: list[bool] = [False] * m
    valid_idx = [i for i, p in enumerate(p_values) if p is not None and np.isfinite(p)]
    if not valid_idx:
        return adj, sig

    ordered = sorted(valid_idx, key=lambda i: float(p_values[i]))  # type: ignore[arg-type]
    m_valid = len(ordered)
    bh_vals = [0.0] * m_valid
    prev = 1.0
    for rank, idx in enumerate(reversed(ordered), start=1):
        # rank_from_end: when iterating reversed, BH index i = m_valid - rank + 1
        i = m_valid - rank + 1
        p = float(p_values[idx])  # type: ignore[arg-type]
        val = min(prev, p * m_valid / i)
        prev = val
        bh_vals[i - 1] = val
    for pos, idx in enumerate(ordered):
        adj[idx] = float(min(bh_vals[pos], 1.0))
        sig[idx] = bool(adj[idx] is not None and adj[idx] <= alpha)
    return adj, sig
