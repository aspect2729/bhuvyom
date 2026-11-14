# Methodology Registry (human-readable)

Machine-readable source: `methodology_registry.json` (served at `/api/knowledge/methodologies`, shown in the Inspector's *Registry* tab).
The backend compares the SHA-256 of `METHODOLOGY_REFERENCE.md` with the SHA recorded at the last review
(`backend/engines/knowledge.py: SYNCED_DOC_SHA`) and shows a warning in the Inspector when they differ.

| id | Engine | Status | Corpus support |
|---|---|---|---|
| <a id="obs-modis-lst"></a>obs.modis_lst_qc | 1 | implemented_and_validated | external (MOD11 UG) |
| <a id="obs-gpm"></a>obs.gpm_imerg_daily | 1 | implemented_and_validated | external (IMERG ATBD) |
| <a id="analysis-trend"></a>analysis.trend_mk_sen | 2 | implemented_and_validated (12 tests) | P1–P3; §7.4 CI & BH external |
| <a id="analysis-lst"></a>analysis.lst_composite | 2 | implemented_not_fully_validated | engineering + corpus caveats |
| analysis.change_point | 2 | not_implemented | P2/P4 — Pettitt equations missing |
| analysis.spatial_autocorrelation | 2 | not_implemented | P5 limited; weights unspecified |
| prediction.monthly_direct_multi_horizon | 3 | implemented_and_validated (out-of-sample) | external (no forecasting in corpus) |
| prediction.short_term_daily | 3 | not_implemented | needs NWP |
| prediction.long_term_projection | 3 | not_implemented (refused) | needs CMIP6 |
| simulation.scs_cn_runoff | 4 | implemented_not_fully_validated | external; corpus §13.1 gap |

## Interpretation rules (used by the findings generators)
* <a id="interp-trend"></a>**Trend:** "significant increasing/decreasing" only when BH-adjusted p ≤ 0.05; otherwise "no reliable conclusion"; magnitude always with 95 % CI; non-significance ≠ no change.
* **Association:** reported as correlation only; no p-value when samples are spatially autocorrelated.
* **Prediction:** skill vs climatology on test data; "no skill" stated explicitly when ≤ 2 %.
* **Simulation:** always prefixed "SIMULATED (hypothetical scenario)", with validation status.
