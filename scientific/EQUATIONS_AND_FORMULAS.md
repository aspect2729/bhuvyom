# Equations and Formulas (as implemented)

Each entry: formula · units · source label · code location.

## Observation preparation
* MODIS LST: `LST[°C] = 0.02·DN − 273.15`; keep pixel if QA bits 0–1 = `00`, **or** = `01` with LST-error bits 6–7 ≤ `01` (≤ 2 K). Tier stored per pixel-day. [EXT MOD11 UG; ENG] `scripts/reprocess_mod11a1_qc.py` — the first pass (`acquire_bbmp_e2e.py`, QA 00 only) rejected the whole urban core because built-up pixels are flagged 01 for emissivity uncertainty.
* MODIS pixel geometry: sinusoidal x = −20015109.354 + h·1111950.5197 + col·926.6254, y = 10007554.677 − v·1111950.5197 − row·926.6254;
  φ = y/R, λ = x/(R cos φ), R = 6371007.181 m. Polygons are the 4 reprojected corners (sinusoidal pixels are not rectangles in lon/lat). [EXT MODIS grid] `engines/prepared_data.py`
* MODIS NDVI: `NDVI = 0.0001·DN`, fill −3000 → null, pixel reliability ∈ {0,1}; 1 km value = mean of the 4×4 nested 250 m pixels (≥12 valid). [EXT MOD13 UG; ENG]
* SRTM → MODIS: arithmetic mean of all 30 m pixels whose centres fall in a MODIS pixel (aggregation only). [ENG]

## Analysis  (METHODOLOGY_REFERENCE.md §5–§8, §11)
* Mann–Kendall: `S = Σ_{k<j} sgn(x_j − x_k)`; `Var(S) = [n(n−1)(2n+5) − Σ t_p(t_p−1)(2t_p+5)]/18`; `Z = (S − sgn S)/√Var(S)`; `p = 2(1 − Φ(|Z|))`. [DOC/PAPER P1,P3]
* Sen: `Q = median((x_j − x_k)/(t_j − t_k))`, t in years (actual elapsed time); per decade ×10. [DOC/PAPER P1]
* Sen CI: `C_α = z_{1−α/2}√Var(S)`, `M1 = (N − C_α)/2`, `M2 = (N + C_α)/2` ranks of ordered pairwise slopes. [EXT Sen 1968; Gilbert 1987]
* Trend line for plotting: intercept `b = median(x_i − Q t_i)` (Conover). [EXT]
* Lag-1: `r1` with bounds `(−1 ± 1.96√(n−2))/(n−1)`; TFPW if outside. [DOC §8 / PAPER P2]
* Benjamini–Hochberg: `p_(i)^adj = min_{j≥i} min(1, m p_(j)/j)`. [EXT]
* Annual mean valid only with ≥10 non-null months. [ENG, DOC §4]
* LST composite: `mean(p) = (1/n_p) Σ_t LST(p,t)`, n_p ≥ 10 clear days; anomaly = mean(p) − area mean; Spearman ρ with elevation (no p-value, spatial autocorrelation). [ENG + DOC §10/§12 caveats]

## Prediction  (see MODEL_SELECTION.md)
* Climatology: `ŷ = ȳ_{m(o+h)}` (means over data ≤ cutoff).
* Damped persistence: `ŷ = ȳ_{m(o+h)} + φ^h a_o`, `φ = corr(a_t, a_{t−1})`, `a_t = y_t − ȳ_{m(t)}`. [EXT]
* Clim + trend: `ŷ = ȳ_{m} + α + β t` (OLS of anomalies on time).
* Ridge: `min ||A − Xβ||² + λ||β||²`, λ = 1 on standardised features. [EXT Hoerl & Kennard 1970]
* Prediction interval: `[ŷ + q_{α/2}(r_h), ŷ + q_{1−α/2}(r_h)]`, r_h = out-of-sample residuals at horizon h. [EXT Lei et al. 2018]

## Simulation  (<a id="scs-cn"></a>SCS-CN)  [EXT USDA-NRCS NEH-630 Ch.10; TR-55 1986; Hawkins et al. 2002]
* `S = 25400/CN − 254` [mm]; `Ia = λS`, λ ∈ {0.2, 0.05}; `Q = (P − Ia)²/(P − Ia + S)` for P > Ia, else 0.
* Composite: `CN = f·98 + (1 − f)·CN_p`; CN_p = 69/79/84 for HSG B/C/D (open space, fair).
* NOTE: METHODOLOGY_REFERENCE.md §13.1 states runoff closures are **not** in the corpus. This is an externally sourced, cited standard — not an invented equation — and is labelled as such everywhere it is displayed.

## Not implemented (missing specification)
VPD, Penman–Monteith ET, surface energy balance (§13.1); Pettitt / SNHT statistics (§9.2); Moran's I weights for grids (§10); field significance (§11).
