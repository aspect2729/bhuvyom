# BhuVyom — Repository & Scientific Audit, Plan and Status (2026-11-14)

## 1. Repository structure
```
nasa/
  METHODOLOGY_REFERENCE.md      scientific source of truth (trend detection corpus summary) — unchanged
  PROJECT_CONTEXT.md            living context for agents
  scientific/                   knowledge base (this folder) + methodology_registry.json
  backend/                      FastAPI — all five engines' computation
    data_sources/ acquisition/ processing/ simulation/(input bundles) storage/ database/   Engine 1 (Cursor build)
    engines/prepared_data.py, observations.py                                              Engine 1 outputs → contract
    engines/analysis/  engines/prediction/  engines/simulation/                            Engines 2–4
    engines/contract.py, knowledge.py; api/engines.py                                      contract, KB, routes
    data/ (raw, processed, results, boundaries)  tests/
  web/                          Engine 5 — Vite + React + TS + MapLibre + deck.gl + recharts + KaTeX
  server/, _archive_trend_v1/   superseded v1 (kept for reference; nothing imports it)
```

## 2. Scientific documentation audit
* `METHODOLOGY_REFERENCE.md` covers trend detection, Sen CI (gap), autocorrelation, change points (no location CIs), Moran's I (limited),
  multiple testing (gap), uncertainty concepts, and explicitly **excludes** ET/runoff/energy-balance equations and forecasting.
* The research PDFs (P1–P10) are **not in the repository**; their content is used only as summarised in the methodology document.

## 3. Functional capabilities (verified this session)
| Capability | Evidence |
|---|---|
| Real data: SRTM 30 m, MOD11A1 LST 91 days (two-tier QC reprocessing), GPM IMERG daily 153 days, POWER monthly 25 cells × 45 yr | files in `backend/data`, acquisition report, `scripts/reprocess_mod11a1_qc.py` |
| Trend analysis (MK/Sen/TFPW/BH) | 12 unit tests; reproduces v1 numbers |
| LST composite + elevation association | `/api/analysis/lst-composite` |
| Monthly T2M/precip prediction with validation & intervals | rolling-origin; tables in MODEL_SELECTION.md |
| SCS-CN runoff scenario with ensemble | reference-value tests |
| Contract validation, feasibility refusals | `tests/test_engines.py` |
| Map + linked charts + time animation + findings + Inspector | `web/` (typechecked with tsc 5.8) |

## 4. Missing / incomplete
MODIS land cover, impervious fraction product, SMAP, ERA5-Land (no CDS key),
IMD gauges, change-point & Moran's I, field significance, daily forecasting, weather generator (prediction→simulation coupling),
Supabase (not configured), IMERG randomError propagation.

## 5–9. Research conflicts, temperature & precipitation methodology, candidate comparison, horizons
See `SCIENTIFIC_FOUNDATION.md §5` and `MODEL_SELECTION.md`.

## 10. First simulation — SCS-CN rainfall–runoff
Chosen over urban-heat simulation because (a) its equations are an established, citable standard, (b) the required forcing
(GPM daily) is actually acquired, (c) the scenario variable (impervious fraction) maps directly to urbanisation questions.
Urban heat requires a surface energy balance with parameters (albedo, emissivity, anthropogenic heat, thermal properties) that
are neither in the corpus (§13.1) nor acquired. Status: implemented, **not validated** (no streamflow data).

## 11. Data contract — `DATA_CONTRACT.md`
## 12. Validation & uncertainty — `VALIDATION_PROTOCOLS.md`

## 13. Roadmap (next, in priority order)
1. Run the acquisition for more GPM years (2001–2025) → daily precipitation climatology & extreme-event analysis; IMERG randomError.
2. Add MCD12Q1 land cover → observed impervious proxy → replace user-assumed impervious fraction.
3. Trend-aware / adaptive conformal intervals to fix under-coverage; longer calibration window; re-evaluate ridge.
4. Change-point (Pettitt) once equations are sourced and added to the methodology doc.
5. Stochastic daily weather generator to let monthly predictions force the runoff simulation (with uncertainty propagation).
6. Supabase/PostGIS for result metadata once a project exists.

## Evidence labelling
Every recommendation in these documents carries [DOC] / [PAPER] / [EXT] / [ENG] / [OPEN] (defined in SCIENTIFIC_FOUNDATION.md).
