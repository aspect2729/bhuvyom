# Prediction Engine — Model Selection (temperature & precipitation)

## 1. Data audit (performed 2026-11-14)

| Candidate input | Coverage | Freq. | Resolution | Verdict for prediction |
|---|---|---|---|---|
| NASA POWER monthly T2M, PRECTOTCORR (MERRA-2) | 1981-01 → 2025-12, 25 cells, **0 missing** | monthly | 0.5°×0.625° | **Used** — only record ≥30 yr [ENG] |
| GPM IMERG daily (acquired) | 2024-06-01 → 2024-10-31 | daily | 0.1° | **Insufficient** (one monsoon) for any daily model; used as simulation forcing |
| MODIS LST (acquired) | 2024-01 → 2024-03 | daily, clear-sky | ~1 km | Insufficient for forecasting; surface ≠ air temperature |
| ERA5-Land, MERRA-2 hourly | not acquired (CDS key absent / no resolution gain) | — | — | Future work |

## 2. Candidates [EXT: Hyndman & Athanasopoulos 2021 §5.2; Hoerl & Kennard 1970; Friedman 2001]

| Model | Why | Needs | Assumes | Horizon | Uncertainty |
|---|---|---|---|---|---|
| Climatology | Mandatory baseline for monthly climate | ≥ few years | stationarity | any | residual quantiles |
| Seasonal naive | Standard seasonal benchmark | 12 months | persistence of last year | ≤12 | residual quantiles |
| Damped anomaly persistence | Monthly anomalies are autocorrelated (soil/ocean memory) | anomalies | AR(1)-like decay φ^h | short | residual quantiles |
| Climatology + linear trend | Captures warming drift | ≥30 yr | linear trend | ≤12 (not extrapolated further) | residual quantiles |
| Pooled ridge (direct) | Uses several lags + season; regularised | 25 cells × 45 yr | linear relations | ≤12 | residual quantiles |
| Pooled gradient boosting (direct) | Non-linear interactions | same | none parametric; risk of overfit | ≤12 | residual quantiles |

ARIMA/ETS were not added: on monthly anomalies an AR(1) structure is already represented by damped persistence and
the ridge model with lags; adding them was not justified within the hackathon time box. [ENG]
Deep learning: **rejected** — 540 monthly values per cell are far too few. [ENG, EXT]

## 3. Selection rule
Per horizon h, the model with the lowest **calibration** MAE (origins 2011–2017) is selected; ties go to the simpler model.
Held-out **test** origins (2018–2024, targets to Dec 2025) are only reported, never used for selection. [ENG]

## 4. Results (held-out test, pooled over 25 cells; MAE in °C or mm/day)

### Air temperature (T2M)
| h | selected | MAE sel | clim | seas.naive | clim+trend | ridge | GBM | skill | cov80 | cov95 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | damped_persistence | 0.638 | 0.861 | 1.088 | 0.848 | 0.629 | 0.606 | +0.259 | 0.78 | 0.92 |
| 2 | damped_persistence | 0.743 | 0.852 | 1.099 | 0.840 | 0.726 | 0.800 | +0.127 | 0.76 | 0.93 |
| 3 | damped_persistence | 0.797 | 0.848 | 1.107 | 0.837 | 0.765 | 0.920 | +0.060 | 0.73 | 0.92 |
| 4 | damped_persistence | 0.829 | 0.849 | 1.125 | 0.841 | 0.799 | 1.034 | +0.023 | 0.70 | 0.91 |
| 6 | damped_persistence | 0.854 | 0.858 | 1.137 | 0.853 | 0.856 | 1.084 | +0.005 | 0.69 | 0.89 |
| 9 | damped_persistence | 0.844 | 0.844 | 1.122 | 0.838 | 0.859 | 1.115 | +0.001 | 0.70 | 0.89 |
| 12 | climatology | 0.807 | 0.807 | 1.082 | 0.799 | 0.822 | 1.207 | +0.000 | 0.74 | 0.93 |

### Precipitation (PRECTOTCORR)
| h | selected | MAE sel | clim | seas.naive | clim+trend | ridge | GBM | skill | cov80 | cov95 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | damped_persistence | 1.318 | 1.318 | 1.692 | 1.337 | 1.360 | 1.756 | +0.000 | 0.76 | 0.93 |
| 3 | climatology | 1.317 | 1.317 | 1.688 | 1.344 | 1.366 | 1.780 | +0.000 | 0.76 | 0.93 |
| 6 | climatology | 1.345 | 1.345 | 1.739 | 1.373 | 1.405 | 1.734 | +0.000 | 0.75 | 0.93 |
| 12 | climatology | 1.324 | 1.324 | 1.716 | 1.347 | 1.364 | 1.681 | +0.000 | 0.76 | 0.93 |

(full 12-horizon tables are in every prediction result under `validation.per_horizon` and in the Scientific Inspector)

### Interpretation
* **Temperature:** real skill over climatology at 1–4 months (26% → 2% MAE reduction), none beyond ~5 months.
* **Precipitation:** **no model beats monthly climatology** at any horizon — the honest forecast is the climatology with its spread.
* Ridge/GBM were slightly better than the selected model on *test* at h=1–4 for T2M but were not chosen on calibration data;
  switching after seeing the test set would be test-set leakage. [ENG] [OPEN: re-evaluate with a longer calibration window]
* Intervals **under-cover** (T2M 80%-PI: 69–78%; mean bias −0.16 °C at h=1): 2018–2025 was warmer than the calibration years.
  This is reported, not hidden. [OPEN: trend-aware or adaptive conformal intervals]

## 5. Recommended horizons

| Variable | Short-term (hours–days) | Medium-term (months) | Long-term (years–decades) |
|---|---|---|---|
| Air temperature | Not supported — needs NWP initial conditions | **1–4 months skilful**, 5–12 = climatology | **Refused** — needs CMIP6 scenario projections |
| Precipitation | Not supported | Climatology only (no skill) | Refused |

The API returns HTTP 422 with an explanation for unsupported horizons/frequencies.
