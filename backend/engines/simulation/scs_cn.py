"""SCS Curve Number direct-runoff model (USDA-NRCS NEH Part 630 Ch. 10; TR-55, 1986).

    S  = 25400 / CN − 254                       [mm]   potential maximum retention
    Ia = λ · S                                  [mm]   initial abstraction (λ = 0.2 standard; 0.05 per Hawkins et al. 2002 / Woodward et al. 2003)
    Q  = (P − Ia)² / (P − Ia + S)   if P > Ia   [mm]   direct runoff depth for a rainfall depth P
    Q  = 0                          otherwise
Composite CN for a cell with impervious fraction f:  CN_c = f·98 + (1 − f)·CN_pervious   (TR-55 §2 composite approach).

NOTE: METHODOLOGY_REFERENCE.md §13.1 lists infiltration–runoff closures as NOT in the
supplied corpus. This model is externally sourced (cited above) and recorded in
scientific/EQUATIONS_AND_FORMULAS.md as such.
"""

from __future__ import annotations

import numpy as np


def retention_mm(cn: float) -> float:
    if not 30 <= cn <= 100:
        raise ValueError("CN must be within [30, 100]")
    return 25400.0 / cn - 254.0


def composite_cn(impervious_fraction: float, cn_pervious: float, cn_impervious: float = 98.0) -> float:
    if not 0 <= impervious_fraction <= 1:
        raise ValueError("impervious_fraction must be in [0, 1]")
    return impervious_fraction * cn_impervious + (1 - impervious_fraction) * cn_pervious


def runoff_mm(p_mm: np.ndarray, cn: float, lam: float = 0.2) -> np.ndarray:
    p = np.asarray(p_mm, float)
    s = retention_mm(cn)
    ia = lam * s
    q = np.where(p > ia, (p - ia) ** 2 / (p - ia + s), 0.0)
    return np.where(np.isfinite(p), q, np.nan)
