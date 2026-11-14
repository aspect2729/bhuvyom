# BhuVyom — Scientific Foundation

Permanent knowledge base for all engines. Read this before changing any scientific code.
Evidence labels used throughout:

| Label | Meaning |
|---|---|
| **[DOC]** | Supported by project documentation (`METHODOLOGY_REFERENCE.md`) |
| **[PAPER]** | Supported by the supplied papers P1–P10 *as summarised in METHODOLOGY_REFERENCE.md*; the PDFs are **not in the repository**, so they could not be re-read during this session |
| **[EXT]** | Supported by additional external literature (see `REFERENCES.md`) |
| **[ENG]** | Engineering recommendation / implementation choice |
| **[OPEN]** | Unresolved scientific question |

## 1. Platform scope
Bengaluru (BBMP boundary: union of 243 wards, DataMeet) plus, where the source grid is coarse, the
surrounding 2°×2° NASA POWER region (25 native cells) so that spatial patterns are visible at all. [ENG]

## 2. Five engines + knowledge base

| Engine | Code | Produces `data_type` | Never does |
|---|---|---|---|
| 1 Acquisition & preparation | `backend/data_sources`, `acquisition`, `processing`, `engines/prepared_data.py`, `engines/observations.py` | observed | statistics, forecasts |
| 2 Analysis | `backend/engines/analysis/` | analysed | forecasts |
| 3 Prediction | `backend/engines/prediction/` | predicted | scenario simulation |
| 4 Simulation | `backend/engines/simulation/` (+ existing input-bundle prep `backend/simulation/`) | simulated | predictions |
| 5 Visualization | `web/` | — (renders contract results) | any scientific computation |

All engines exchange the versioned contract in `DATA_CONTRACT.md`. The methodology registry
(`methodology_registry.json`) is the machine-readable index served at `/api/knowledge/methodologies`; it carries the
SHA of `METHODOLOGY_REFERENCE.md` and flags drift when the document changes.

## 3. Quantity taxonomy [DOC §1.2]
Observed · Statistically estimated · Model-derived · Simulated — mapped onto contract `data_type`
(observed / analysed / predicted / simulated) plus per-finding `category`
(observation / statistical / modelled / simulated / no_conclusion).

## 4. Key physical distinctions (enforced in code)
* MODIS LST is **surface skin temperature**; never substituted for 2 m air temperature (bundle validation refuses it; UI labels it). [EXT: Wan 2019]
* NASA POWER meteorology is **MERRA-2 reanalysis** (model-derived) on a 0.5°×0.625° grid; one cell covers all of Bengaluru. Direct MERRA-2 access gives no resolution gain. [EXT]
* POWER solar/cloud switch from GEWEX SRB (1984–2000) to CERES SYN1deg (2001+) → trends clamped to 2001+. [ENG, verified in file headers]
* Recent daily POWER comes from GEOS-IT/FLASHFlux (different from monthly MERRA-2) → long-term analysis and prediction use monthly data only. [ENG, verified]
* Resampling never creates information: SRTM is *aggregated* (30 m → ~1 km area mean) to MODIS pixels; nothing is disaggregated. [ENG]

## 5. Research conflicts and how they were resolved

| Topic | Competing approaches | Decision | Basis |
|---|---|---|---|
| Serial correlation in MK | PW vs TFPW vs variance correction (P2 applies TFPW; P3 debates Type I/II trade-off) | TFPW **only when lag-1 r1 is significant** | [DOC §8, PAPER P2/P3]; P3's power concern recorded as limitation |
| Sen-slope CI | Not derived in corpus | Classical ordered-rank CI (Sen 1968; Gilbert 1987) | [DOC §7.4 gap → EXT] |
| Multi-cell significance | Not in corpus (§11 "essential gap") | Benjamini–Hochberg FDR; field significance **not** implemented | [EXT Benjamini & Hochberg 1995; Wilks 2016] / [OPEN] |
| Runoff closure | §13.1 says infiltration–runoff equations are absent and must not be invented | SCS-CN taken from **cited external standard** (USDA-NRCS), labelled external, uncalibrated | [EXT] — flagged, not silently resolved |
| Forecasting | Corpus contains no forecasting methods | Benchmark-first protocol (FPP3), rolling-origin evaluation (Tashman 2000), empirical intervals (Lei et al. 2018) | [EXT] |
| ML vs simple models | P8 warns of equifinality / "fit for wrong reasons" | ML candidates allowed only if they beat baselines on *calibration* data; selection never uses test data | [PAPER P8 caveat + ENG] |
| MODIS LST QC over the city | Strict QA=00 (first acquisition) vs QA 00 + QA 01 with ≤2 K error | Two-tier rule; tier kept per pixel-day so strict-only analysis remains possible | [EXT MOD11 UG + ENG]; strict-only left the urban core empty (0 valid days) |
| Change points | P2 homogeneity battery vs P4 CPD algorithms; neither gives location CIs | **Not implemented** — Pettitt equations not in corpus | [OPEN] |

## 6. What is NOT claimed
No neighbourhood-scale air-temperature or rainfall prediction; no flood prediction; no climate projection;
no causal attribution of LST patterns; no hotspot labels (no threshold defined in the methodology).
