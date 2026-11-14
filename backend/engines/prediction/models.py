"""Engine 3 — candidate monthly forecasting models (direct multi-horizon).

All models predict y(o+h) using ONLY data available at forecast origin o and a
fitting cutoff c ≤ o (no temporal leakage). Notation: m(t) calendar month,
clim_c[m] = mean of y over months ≤ c with calendar month m, a_t = y_t − clim_c[m(t)].

  climatology        ŷ = clim_c[m(o+h)]
  seasonal_naive     ŷ = y(o+h−12)                       (h ≤ 12)
  damped_persistence ŷ = clim_c[m(o+h)] + φ^h a_o,  φ = lag-1 autocorrelation of a (≤ c)
  clim_trend         ŷ = clim_c[m(o+h)] + α + β·t(o+h),  OLS of a on t (≤ c)
  ridge_pooled       â(o+h) = Ridge(x_o,h), x = [a_o, a_{o−1}, a_{o−2}, a_{o+h−12}, mean(a_{o−11..o}), sin/cos m(o+h), t, lat, lon]
  gbm_pooled         same features, HistGradientBoostingRegressor
References: Hyndman & Athanasopoulos (2021) FPP3 §5.2 (simple benchmark methods), §5.10 (time-series CV);
Tashman (2000) rolling-origin evaluation; Hoerl & Kennard (1970) ridge; Friedman (2001) gradient boosting.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MODEL_IDS = ["climatology", "seasonal_naive", "damped_persistence", "clim_trend", "ridge_pooled", "gbm_pooled"]
SIMPLICITY = {m: i for i, m in enumerate(MODEL_IDS)}  # tie-break: simpler first
MAX_H = 12


class CellData:
    def __init__(self, y: np.ndarray, lat: float, lon: float, month0: int = 1, year0: int = 1981):
        self.y = np.asarray(y, float)
        self.n = len(self.y)
        self.month = (np.arange(self.n) + month0 - 1) % 12  # 0..11
        self.t = (np.arange(self.n) / 12.0 + year0 - 1981) / 10.0  # decades since 1981
        self.lat, self.lon = lat, lon


def climatology(cd: CellData, c: int) -> np.ndarray:
    clim = np.full(12, np.nan)
    for m in range(12):
        v = cd.y[: c + 1][cd.month[: c + 1] == m]
        v = v[np.isfinite(v)]
        if v.size:
            clim[m] = v.mean()
    return clim


def anomalies(cd: CellData, clim: np.ndarray) -> np.ndarray:
    return cd.y - clim[cd.month]


def features(cd: CellData, a: np.ndarray, o: int, h: int) -> list[float]:
    tgt = o + h
    mt = (cd.month[o] + h) % 12
    return [a[o], a[o - 1], a[o - 2], a[tgt - 12], np.nanmean(a[o - 11 : o + 1]),
            np.sin(2 * np.pi * mt / 12), np.cos(2 * np.pi * mt / 12), cd.t[o] + h / 120.0, cd.lat, cd.lon]


class FittedSet:
    """All candidate models fitted with cutoff c, for every cell and horizon."""

    def __init__(self, cells: list[CellData], c: int, with_ml: bool = True):
        self.c, self.cells = c, cells
        self.clim = [climatology(cd, c) for cd in cells]
        self.anom = [anomalies(cd, cl) for cd, cl in zip(cells, self.clim)]
        self.phi, self.trend = [], []
        for cd, a in zip(cells, self.anom):
            aa = a[: c + 1]
            ok = np.isfinite(aa[1:]) & np.isfinite(aa[:-1])
            self.phi.append(float(np.corrcoef(aa[1:][ok], aa[:-1][ok])[0, 1]) if ok.sum() > 24 else 0.0)
            okt = np.isfinite(aa)
            beta, alpha = np.polyfit(cd.t[: c + 1][okt], aa[okt], 1)
            self.trend.append((alpha, beta))
        self.ml: dict[tuple[str, int], object] = {}
        if with_ml:
            for h in range(1, MAX_H + 1):
                X, Y = [], []
                for cd, a in zip(cells, self.anom):
                    for o in range(12, c - h + 1):
                        X.append(features(cd, a, o, h)); Y.append(a[o + h])
                X, Y = np.asarray(X), np.asarray(Y)
                ok = np.all(np.isfinite(X), 1) & np.isfinite(Y)
                self.ml[("ridge_pooled", h)] = make_pipeline(StandardScaler(), Ridge(alpha=1.0)).fit(X[ok], Y[ok])
                self.ml[("gbm_pooled", h)] = HistGradientBoostingRegressor(max_iter=120, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, random_state=0).fit(X[ok], Y[ok])

    def predict(self, model: str, k: int, o: int, h: int) -> float:
        cd, a, clim = self.cells[k], self.anom[k], self.clim[k]
        mt = (cd.month[o] + h) % 12
        if model == "climatology":
            return clim[mt]
        if model == "seasonal_naive":
            return cd.y[o + h - 12]
        if model == "damped_persistence":
            return clim[mt] + (self.phi[k] ** h) * a[o]
        if model == "clim_trend":
            al, be = self.trend[k]
            return clim[mt] + al + be * (cd.t[o] + h / 120.0)
        x = np.asarray([features(cd, a, o, h)])
        if not np.all(np.isfinite(x)):
            return np.nan
        return clim[mt] + float(self.ml[(model, h)].predict(x)[0])

    def predict_many(self, model: str, k: int, origins: list[int], h: int) -> np.ndarray:
        if model in ("ridge_pooled", "gbm_pooled"):
            cd, a, clim = self.cells[k], self.anom[k], self.clim[k]
            X = np.asarray([features(cd, a, o, h) for o in origins])
            out = np.full(len(origins), np.nan)
            ok = np.all(np.isfinite(X), 1)
            if ok.any():
                out[ok] = self.ml[(model, h)].predict(X[ok])
            mts = (cd.month[np.asarray(origins)] + h) % 12
            return clim[mts] + out
        return np.asarray([self.predict(model, k, o, h) for o in origins])
