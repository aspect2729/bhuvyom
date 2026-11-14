# METHODOLOGY_REFERENCE.md

**NASA Space Apps Challenge — Be An Earth System Trend Detective!**  
Scientific methodology, mathematical foundations, confidence intervals, and implementation reference

**Document status:** Research-backed reference for future analytical development.  
**Scope of this stage:** Scientific and mathematical documentation only. No application code, UI, APIs, or software architecture.

**Citation convention:** Page numbers refer to the printed / PDF page of each source unless noted. Extract markers `===== PAGE N =====` were used during harvest; where PDF layout garbled an equation, that is stated explicitly. Content labeled **Additional research needed** is *not* claimed to be supported by the supplied papers.

---

## 1. Project scientific objectives and analytical scope

### 1.1 Challenge-aligned questions

The platform must help users investigate environmental and Earth-system change using observational and geospatial datasets, answering:

| Question | Analytical intent |
|---|---|
| What is changing? | Identify environmental variables with detectable temporal structure |
| Where is it changing? | Localise change in space (stations, regions, or grid cells) |
| How much is it changing? | Estimate trend magnitude (rate per unit time) |
| Is the change statistically significant? | Hypothesis testing for monotonic trend or related structure |
| How certain is the estimate? | Uncertainty quantification (intervals, power, serial dependence) |
| Are there spatial patterns or clusters? | Spatial dependence / clustering of values or of trend estimates |
| Did abrupt change occur? | Change-point / homogeneity analysis distinct from gradual trend |
| Are variables associated? | Correlation / regression with dependence caveats |
| Can relationships be explored via simulation? | Physically motivated, assumption-declared exploration — not validated prediction |

### 1.2 Quantity taxonomy (mandatory)

Every displayed quantity must be tagged as one of:

1. **Observed** — sensor / gauge / retrieval presented as a measurement product  
2. **Statistically estimated** — slopes, test statistics, p-values, correlation coefficients  
3. **Model-derived** — reanalysis, land-surface model output, ML-filled fluxes  
4. **Simulated** — outputs of a simplified physical or exploratory simulator  

Do **not** present correlation as causation, or statistical significance as proof of environmental importance (Wang et al. 2020; Tuia et al. 2024/2025; Mahecha et al. 2020).

### 1.3 Analytical philosophy for this project

A smaller set of correctly understood methods with justified uncertainty is preferred over a large catalogue of unverified algorithms. Where the supplied literature is incomplete, gaps are listed in §19 rather than filled with invented equations.

---

## 2. Research paper inventory and source reliability

| ID | File | Bibliographic identity | Reliability role |
|---|---|---|---|
| P1 | `sens_slope.pdf` | Aditya, F., Gusmayanti, E., Sudrajat, J. (2021). Rainfall trend analysis using Mann-Kendall and Sen’s slope estimator test in West Kalimantan. *IOP Conf. Ser.: Earth Environ. Sci.* **893**, 012006. | **Primary** — MK \(S\), \(\mathrm{Var}(S)\), \(Z\); Sen pairwise slopes and median |
| P2 | `sci-03-00017.pdf` | Gadedjisso-Tossou, A., Adjegan, K.I., Kablan, A.K.M. (2021). Rainfall and Temperature Trend Analysis by Mann–Kendall Test… *Sci* **3**, 17. | **Primary** — H0/Ha wording; lag-1 \(r_1\); TFPW named; homogeneity battery; regression associations |
| P3 | `feart-08-00014.pdf` | Wang, F. et al. (2020). Re-evaluation of the Power of the Mann-Kendall Test… *Front. Earth Sci.* **8**, 14. | **Primary** — MK formulas; AR(1); Type I/II; power; PW/TFPW debate |
| P4 | `change_point_detection.pdf` | van den Burg, G.J.J. & Williams, C.K.I. (2022). An Evaluation of Change Point Detection Algorithms. arXiv:2003.06222v3. | **Primary for CPD landscape** — cost/penalty framework; 14 algorithms; evaluation metrics; **no location CIs** |
| P5 | `spatial_autocoerrelation.pdf` | Parvathy, G., Sarasamma, J.D., Vijayamma, S.A. (2026). Integrating Geospatial Techniques and Spatial Autocorrelation… *Curr. World Environ.* **21**(2), 570–589. | **Limited** — Global Moran’s I usage/interpretation; inverse-distance weights; ANN; kernel density. Point-pattern ecology, **not** gridded climate trends |
| P6 | `earth_system_cube.pdf` | Mahecha, M.D. et al. (2020). Earth system data cubes unravel global multivariate dynamics. *Earth Syst. Dynam.* **11**, 201–234. | **Conceptual primary** — cube formalism; provenance; remapping caveats |
| P7 | `rsta.2020.0089.pdf` | Geer, A.J. (2021). Learning earth system models from observations: machine learning or data assimilation? *Phil. Trans. R. Soc. A* **379**, 20200089. | **Conceptual primary** — Bayesian DA/ML uncertainty framing |
| P8 | `Artificial_Intelligence_….pdf` | Tuia, D. et al. (2024/2025). Artificial Intelligence to Advance Earth Observation… *IEEE GRSM*. | **Secondary context** — AI4EO; XAI≠causation; uncertainty reporting duty |
| P9 | `temporal_aggregation.pdf` | Kim, J. & Park, S. (2026). ReTAMamba: Reliability-Aware Temporal Aggregation… (clinical ICU ML). | **Misaligned** — clinical irregular time series, not environmental aggregation |
| P10 | `hallucinations.pdf` | Kholov, Sh.Y. et al. (2026). Hallucination Mitigation in LLMs via Hybrid RAG… *Polytechnic Bulletin* 2(74). | **Misaligned** — LLM QA verification; not Earth-system methods |

### 2.1 Source-use rules

- Prefer equations as printed in P1 and P3 for MK; treat P2 as workflow/application (black-box via R `modifiedmk`).  
- Do not cite P9 or P10 in core statistical sections.  
- Separate **paper-supported** content from **Additional research needed**.

---

## 3. Data characteristics and preprocessing

### 3.1 Temporal series used in the primary applied papers

- **P1 (Aditya):** monthly rainfall 2000–2019 at 12 BMKG stations; annual totals formed by accumulation; SNHT homogeneity via R `Climatol` (P1, p. 3–4).  
- **P2 (Sci):** monthly/annual rainfall, \(T_{\max}\), \(T_{\min}\) at four northern Togo stations, 1977–2012 (\(n=36\)); cereal yields 1990–2012 for association analysis (P2, §2).

### 3.2 Earth-system data cube perspective (P6)

Mahecha et al. define a cube as a triplet \(C=(L,G,X)\) where \(L\) is a set of dimension labels (e.g. \(\{\mathrm{lat},\mathrm{long},\mathrm{time},\mathrm{var}\}\)), \(G\) collects grids with ≥2 points per axis, and \(X\in\mathbb{R}^{NA}=\mathbb{R}\cup\{\mathrm{NA}\}\) so missingness is explicit (P6, p. 203).

**Provenance (P6, Table A1):** products may be satellite retrievals, reanalysis (e.g. ERA-Interim \(T_{2m}\) in Table A1), ML-trained fluxes, or process-model output (e.g. GLEAM). Text elsewhere mentions ERA5 for meteorology while Table A1 lists ERA-Interim — **preserve this inconsistency as a reliability note** when citing P6 products.

**Remapping caveat (P6, p. 216):** remapping to a common grid can violate physical assumptions; mass balances and flux integrals should be prioritised; authors accept certain simplifications.

### 3.3 Observation uncertainty framing (P7, P8)

- Observations are uncertain, sparsely sampled, and often only indirectly sensitive to processes of interest (P7).  
- Retrieved EO quantities may depend on forward/inverse physical models and simulated training pairs (P8, ~p. 130).  
- Gap-filled or ML-reconstructed fields are **model-derived**, not raw observations (P8).

### 3.4 Preprocessing checklist before trend tests (from P1–P3)

1. Record temporal resolution and aggregation method.  
2. Assess homogeneity / breakpoints (P2 battery; P1 SNHT).  
3. Assess lag-1 serial correlation before MK (P2; P3).  
4. Document missing values; MK is often described as robust to missing values when ranks are used (P3 cites Hirsch & Slack 1984) — but CPD tools often **do not** support missing values (P4).  
5. Tag product provenance (P6).

---

## 4. Temporal aggregation methodology

### 4.1 What the supplied corpus actually supports

**P9 (`temporal_aggregation.pdf`) is not environmental aggregation theory.** It proposes ReTAMamba for irregular *clinical* ICU time series (reliability-weighted multi-scale token pooling for mortality prediction). It must **not** be used as the scientific basis for daily→monthly→annual climate aggregation.

**What P1 and P2 do in practice:**

- Analyse **monthly** series and **annual** totals separately (P1, P2).  
- P1 forms annual rainfall by accumulating monthly data (P1, p. 4).  
- Month-by-month MK is **not** Seasonal Mann–Kendall; it is twelve separate tests (P1, P2).

### 4.2 Aggregation principles for the project (partly inferred; partly gap)

| Practice | Support | Notes |
|---|---|---|
| Aggregate to monthly/annual for trend testing | P1, P2 applied practice | Common for hydrometeorology; WMO recommendation cited for MK/Sen (P1) |
| Aggregation always beneficial | **Not supported** | Can hide intra-period extremes and change sampling variance |
| Irregular sampling / informative missingness weights | Only in P9 (clinical) | **Additional research needed** for climate products |
| Seasonal confounding of parameter estimates | P6 SCAPE/Q10 illustration | Seasonality can confound rate parameters if not separated (P6, pp. 213–214) |

### 4.3 Information that may be lost by aggregation

- Sub-monthly extremes and short dry/wet spells.  
- Timing of onset/cessation of rainy seasons (discussed qualitatively in P2 introduction).  
- Change in variance or intermittency that may matter more than the mean.

### 4.4 Additional research needed (temporal aggregation)

Authoritative hydrology/climatology guidance on: choice of aggregation operator (sum vs mean), incomplete-month rules, leap years, and bias from irregular satellite overpass — **not derived in the supplied papers**.

---

## 5. Trend detection methodology

### 5.1 Method name

Mann–Kendall (MK) non-parametric test for monotonic trend (Mann 1945; Kendall 1975), as formulated in **P1** and **P3**.

### 5.2 Purpose

Detect whether a time series shows a **monotonic** upward or downward tendency, without requiring normality (P1, P2, P3).

### 5.3 Hypotheses

- **P3 (p. 3):** \(H_0\): series independently distributed; \(H_1\): monotonic trend exists.  
- **P2 (§2.2.2):** \(H_0\): no trend — data independent and randomly ordered; \(H_a\): a trend exists.

### 5.4 Mathematical formulation

For series \(X_i\), \(i=1,\ldots,n\) (P3 Eqs. 1–2; consistent with P1 Eq. 1):

\[
S=\sum_{i=1}^{n-1}\sum_{j=i+1}^{n}\mathrm{sgn}(X_j-X_i)
\]

\[
\mathrm{sgn}(\theta)=\begin{cases}
+1 & \theta>0\\
0 & \theta=0\\
-1 & \theta<0
\end{cases}
\]

**Interpretation of \(S\):** positive \(S\) → upward tendency; negative \(S\) → downward (P1, p. 5).

**Null moments (P3 Eqs. 3–4):**

\[
E(S)=0
\]

\[
V(S)=\frac{n(n-1)(2n+5)-\sum_{i=1}^{m}T_i\,i(i-1)(2i+5)}{18}
\]

**Source integrity note:** P3’s PDF extract garbles the tie sum. **P1 Eq. 2** states the clearer standard form:

\[
\mathrm{Var}(S)=\frac{n(n-1)(2n+5)-\displaystyle\sum_{i=1}^{m}t_i(t_i-1)(2t_i+5)}{18}
\]

where \(m\) is the number of tied groups and \(t_i\) (or \(T_i\)) is the size of tied group \(i\). **Prefer P1’s tie formula for implementation.** P3 states \(S\) is approximately normal for \(n\ge 8\).

**Standardized statistic (P1 Eq. 3; P3 Eq. 5):**

\[
Z=\begin{cases}
\dfrac{S-1}{\sqrt{\mathrm{Var}(S)}} & S>0\\[1em]
0 & S=0\\[0.5em]
\dfrac{S+1}{\sqrt{\mathrm{Var}(S)}} & S<0
\end{cases}
\]

Reject \(H_0\) if \(|Z|>Z_{1-\alpha/2}\) (two-tailed) or \(Z>Z_{1-\alpha}\) (one-tailed) (P3, p. 3).

### 5.5 Variable definitions

| Symbol | Meaning |
|---|---|
| \(X_i,X_j\) | Observations at times/indices \(i,j\) |
| \(n\) | Sample length |
| \(S\) | MK score (sum of pairwise signs) |
| \(t_i\) / \(T_i\) | Size of tied group \(i\) |
| \(m\) | Number of tied groups |
| \(Z\) | Continuity-corrected normal statistic |
| \(\alpha\) | Significance level |

### 5.6 Assumptions

- Independence under \(H_0\) (P3). **Not robust to serial correlation** (P3).  
- No normality requirement (P1, P2, P3).  
- Rank-based → relatively insensitive to outliers / useful with censored or missing values as discussed in literature cited by P3 (Hirsch & Slack 1984).  
- Detects **monotonic** trend, not necessarily linear (linearity is assumed later for Sen magnitude).

### 5.7 Output interpretation

- Significant \(Z\) → evidence against no-trend null at chosen \(\alpha\).  
- Sign of \(Z\) / \(S\) → direction.  
- **Does not** estimate magnitude (use Sen’s slope, §6).  
- **Does not** prove environmental importance or causation.

### 5.8 Limitations (from P3 especially)

- Positive serial correlation inflates Type I error (over-rejection of \(H_0\)) (P3).  
- Power declines with larger noise variance (PSD) and rises with slope magnitude and sample length (P3).  
- “The power of the MK test is not as strong as it seems, especially for limited sample length and large sample variance” (P3, p. 11).  
- Seasonal MK (Hirsch & Slack 1984) is **cited** in P3’s reference list but **not derived or evaluated** in the paper body.

### 5.9 Author anomaly (P1)

P1 states “The variance of the rainfall is calculated to obtain the \(Z\) value” while presenting \(\mathrm{Var}(S)\). **Analyst note:** this is a mislabeling; implement \(\mathrm{Var}(S)\), not the sample variance of rainfall.

---

## 6. Trend magnitude estimation

### 6.1 Method name

Sen’s slope estimator / Theil–Sen approach (Sen 1968; Theil 1950), as given in **P1** and used (without formula) in **P2** and **P3**.

### 6.2 Purpose

Quantify the **rate of change per unit time** assuming an approximately linear trend (P1, p. 5). Distinct from MK’s detection of monotonicity.

### 6.3 Mathematical formulation (P1 Eqs. 4–5)

For all pairs with \(j>i\):

\[
Q_i=\frac{x_j-x_i}{j-i},\qquad i=1,2,\ldots,N
\]

with

\[
N=\frac{n(n-1)}{2}
\]

Sort the \(Q_i\). Sen’s slope is the median \(Q_{\mathrm{med}}\):

\[
Q_{\mathrm{med}}=\begin{cases}
Q_{\left[\frac{N+1}{2}\right]} & N\text{ odd}\\[1em]
\dfrac{Q_{\left[\frac{N}{2}\right]}+Q_{\left[\frac{N+1}{2}\right]}}{2} & N\text{ even}
\end{cases}
\]

as printed in P1 Eq. 5.

**Human verification required:** for even \(N\), many textbooks use \(\bigl(Q_{[N/2]}+Q_{[N/2+1]}\bigr)/2\) with \(N/2+1=(N+2)/2\). P1 prints the second index as \((N+1)/2\). Before coding, verify against the intended Sen (1968) indexing (and against floating-point vs integer rank conventions).

### 6.4 Variable definitions

| Symbol | Meaning |
|---|---|
| \(x_i,x_j\) | Values at times/indices \(i,j\) (\(j>i\)) |
| \(j-i\) | Index difference (P1 uses index time steps, not necessarily calendar elapsed time) |
| \(Q_i\) | Pairwise slope |
| \(N\) | Number of pairwise slopes |
| \(Q_{\mathrm{med}}\) | Sen’s slope (median pairwise slope) |

### 6.5 Units and reporting

- P1 reports mm/year for rainfall.  
- P2 reports change per year and multiplies by 10 for per-decade change (P2 §2.2.3).  
- Keep units explicit; do not mix index-step slopes with calendar-year slopes without converting timestamps.

### 6.6 Assumptions and claimed advantages (P1)

- Trend assumed linear.  
- Claimed more robust to outliers/data errors than ordinary linear regression.  
- WMO-recommended as part of hydrometeorological trend detection (P1 citing WMO guidance via ref. [24]).

### 6.7 Distinctions (mandatory)

| Concept | Role |
|---|---|
| MK / \(Z\) / p-value | Hypothesis test for monotonic trend |
| \(Q_{\mathrm{med}}\) | Point estimate of magnitude |
| Confidence interval for \(Q_{\mathrm{med}}\) | Uncertainty of magnitude (§7) |
| Practical environmental importance | Domain judgment — **not** automatic from significance |

---

## 7. Confidence intervals for trend estimates

### 7.1 What P1 claims

“A two-tailed test estimated the value of \(Q_{\mathrm{med}}\) at a confidence interval of 90% and 95%” (P1, p. 5).  
**No formula** for those intervals appears in P1: no \(C_\alpha\), no rank indices \(M_1,M_2\), no mapping from \(\mathrm{Var}(S)\) to ordered pairwise slopes. Results figures show significance flags and slope values, not interval endpoints.

### 7.2 What P3 means by “confidence interval”

P3’s Figure 2 discussion of confidence interval size vs power refers to the **acceptance region of the MK hypothesis test**, not a CI for Sen’s slope (P3, p. 3–4). Do not conflate these.

### 7.3 Ten-point CI template — Sen’s slope (corpus status)

| # | Item | Corpus status |
|---|---|---|
| 1 | Quantity estimated | \(Q_{\mathrm{med}}\) (rate per unit time) — **supported (P1)** |
| 2 | Uncertainty measure | Claimed 90%/95% CI — **formula not in corpus** |
| 3 | Mathematical formulation | **Additional research needed** (Sen 1968; Gilbert; Helsel & Hirsch) |
| 4 | Confidence level | 90%, 95% mentioned (P1); 99% not developed in corpus |
| 5 | Assumptions | Linear trend; independence assumptions underlying MK variance typically used in classical Sen CI — **verify in external source** |
| 6 | Calculation procedure | **Not in supplied papers** |
| 7 | Interpretation | Frequentist CI: long-run coverage of the procedure for a fixed parameter — **not** “95% probability the true slope lies in this realized interval” |
| 8 | Limitations | Autocorrelation can invalidate nominal coverage if independence assumed; short \(n\) → wide intervals; CI excluding 0 is related to but **not automatically identical** to every MK significance outcome under all corrections |
| 9 | Implementation | Need sorted \(Q_i\), critical values tied to \(\mathrm{Var}(S)\), careful index arithmetic |
| 10 | Research source | Claim: P1 p. 5; **procedure: additional research** |

### 7.4 Classical Sen CI procedure — Additional research needed (labeled external)

The widely used construction (to be taken from Sen 1968 / standard hydrology texts, **not** claimed as extracted from P1) orders pairwise slopes \(Q_{(1)}\le\cdots\le Q_{(N)}\) and selects ranks using a critical value derived from the null distribution of the MK statistic (often via \(C_\alpha=Z_{1-\alpha/2}\sqrt{\mathrm{Var}(S)}\) and \(M_1,M_2\) indices).  

**Do not implement from memory without verifying the external reference page-for-page during coding.**

### 7.5 Frequentist CI interpretation (project rule)

A 95% confidence interval does **not** mean there is a 95% probability that a fixed parameter lies inside one realized interval. Coverage is a property of the *procedure* under stated assumptions. Narrow intervals do not imply unbiasedness. Statistical significance can coexist with negligible practical effect (and vice versa when power is low — P3).

### 7.6 MK test “uncertainty” (not a slope CI)

| Item | Content |
|---|---|
| Quantity | Evidence against no-trend null |
| Measure | \(Z\), comparison to normal critical values; optional p-value |
| Source | P1, P3 |
| Not | Interval for \(Q_{\mathrm{med}}\) |

---

## 8. Autocorrelation and statistical corrections

### 8.1 Lag-1 serial correlation test (P2 Eqs. 1–2, §2.2.2)

\[
r_1=\frac{\sum_{i=1}^{n-1}(X_i-\bar X)(X_{i+1}-\bar X)}{\sum_{i=1}^{n}(X_i-\bar X)^2}
\]

Approximate 95% bounds (Anderson-type form as printed):

\[
r_1(95\%)=\frac{-1\pm 1.96\sqrt{n-2}}{n-1}
\]

**Printed decision rule in P2:** series “considered serially correlated when \(r_1\) lies *between* the upper and lower limits.”  

**Analyst note:** under the usual Anderson test, correlation is indicated when \(r_1\) lies **outside** those bounds. Treat P2’s sentence as a likely wording error; verify against standard practice and the package behaviour of `modifiedmk` before implementation. In P2, 42/156 series (26.92%) were flagged serially correlated; annual rainfall at the four stations was not (P2, Table 4).

### 8.2 AR(1) model used in power study (P3 Eq. 8)

\[
X_t=\rho X_{t-1}+N_t
\]

where \(\rho\) is lag-1 autocorrelation and \(N_t\) is white noise with variance termed **PSD** (power spectral density) in P3.

### 8.3 Effects documented by P3

- Positive \(\rho\) increases Type I error (e.g. rejection rate rising toward ~0.15 at \(\rho=0.3\) for \(\alpha=0.05\) in their simulations).  
- Variance of standardized \(Z\) can inflate dramatically as \(\rho\to 0.9\).  
- Positive \(\rho\) also affects Type II error / power; effects can depend on slope vs noise regime.  
- Abstract: positive autocorrelation increases **both** Type I and Type II errors via enlargement of variance of MK statistics.

### 8.4 Correction families discussed (P3 literature review — algorithms not derived)

| Approach | What P3 states | Equations in P3? |
|---|---|---|
| Pre-whitening (PW) | Reduces Type I error but can raise Type II; trend contaminates \(\hat\rho\) | No |
| Trend-free pre-whitening (TFPW) | Yue et al. 2002b, 2003: remove trend before PW | No |
| Modified TFPWcu | Serinaldi & Kilsby 2016 | No |
| Bias correction of \(\rho\) | Hamed 2009 | No |
| Variance correction of MK | Hamed & Ramachandra Rao 1998 | No |
| Effective sample size | Bayley & Hammersley; Lettenmaier; Yue & Wang 2004 | No |

P2 **applies** TFPW via R `modifiedmk` when serial correlation is present (abstract; §2.2.2) but **does not print the algorithm**.

**P3’s stance:** debate on PW/TFPW “becomes a mathematical game” balancing significance vs power; “the only thing that matters is which error is more unacceptable in specific cases” (P3, p. 2). Yue & Wang (2002) and Bayazit & Önöz (2007) suggest avoiding PW when sample size and slope are large (as cited by P3).

### 8.5 Implications for confidence intervals

If observations are temporally dependent, nominal CIs that assume independence can be **anti-conservative** (too narrow) or otherwise miscalibrated. Do **not** apply an arbitrary multiplicative fudge factor. Preferred path for the project: (1) report \(r_1\); (2) state whether PW/TFPW/variance correction was used; (3) treat classical Sen CI coverage as provisional until dependence-aware methods (**Additional research needed**: block bootstrap) are added.

### 8.6 Power / detectable slope (P3 Eqs. 10–11)

\[
\mathrm{Power}=\frac{N_{\mathrm{rej}}}{N}
\]

Empirical boundaries for effective detection (α = 0.05 simulations), e.g.:

\[
A=\sqrt{\mathrm{PSD}}\times 10^{-1.92}\quad (n=100)
\]

(and analogous constants for \(n\in\{50,200,400\}\)). Use as a **caveat on non-significant results** for short/noisy series — **not** as a confidence interval for slope.

---

## 9. Change-point detection and uncertainty

### 9.1 Distinguishing gradual trend vs abrupt change

- MK addresses **monotonic** change over the record (P1–P3).  
- Change-point methods address **abrupt** changes in the data-generating process (P4).  
- A steady trend can be misrepresented as multiple mean-shift breaks if the CPD model is mean-only (P4 default `cpt.mean`).  
- Homogeneity breakpoints may reflect instrumentation / station changes, not climate shifts (P2 discusses data quality).

### 9.2 Homogeneity / breakpoint battery (P2 §2.2.1)

Tests at 5% level (equations **not** given in P2):

| Test | Citation in P2 |
|---|---|
| SNHT (Alexandersson) | [24] |
| Buishand Range Test (BRT) | [25] |
| Pettitt’s Test (PT) | Pettitt 1979 [26] |
| Von Neumann Ratio Test (VNRT) | [27] |

**Hypotheses:** \(H_0\) homogeneous; \(H_a\) there is a date of change.  

**Classification:** Useful (0–1 rejections), Doubtful (2), Suspect (3–4).  

**Uncertainty:** breakpoint years reported for some stations; **no confidence interval for change location** in P2.

**Pettitt math:** **Additional research needed** from Pettitt (1979); not printed in P2.

### 9.3 Offline multiple CPD optimisation (P4 Eq. 1, p. 3)

\[
\min_{\mathcal{T}}\sum_{i=1}^{n+1}\ell(y_{\tau_{i-1}:\tau_i-1})+\lambda P(n)
\]

- \(\ell(\cdot)\): segment cost (e.g. negative max log-likelihood)  
- \(\lambda\ge 0\): penalty hyperparameter  
- \(P(n)\): penalty on number of change points  
- Additive cost assumed for DP / PELT pruning  

Notation: change-point set \(\mathcal{T}=\{\tau_0,\ldots,\tau_n\}\) with \(\tau_0=1\), \(\tau_{n+1}=T+1\) offline; a change point marks the **first** observation of a new segment (P4).

### 9.4 Algorithms covered in P4 (formulas mostly qualitative)

| Algorithm | What P4 provides | CI for location? |
|---|---|---|
| CUSUM (Page 1954) | Named; threshold on corrected cumulative sum; used inside WBS | No |
| AMOC / likelihood ratio (Hinkley) | Qualitative | No |
| Binary segmentation | Greedy splits; \(O(T\log T)\) | No |
| Segment Neighborhoods | Exact, \(O(mT^2)\) | No |
| PELT (Killick et al. 2012) | DP + pruning; ~linear under conditions | No |
| WBS | CUSUM on random subsets | No |
| BOCPD | Run-length posterior; **benchmark uses MAP only** | Posterior exists in theory; **not reported as interval** |
| kcpa, ecp, cpnp, rfpop, prophet | Named / configured | No |

**Critical finding (P4):** no confidence/credible intervals on change-point locations are reported. Evaluation uses margin \(M=5\) time steps for matching annotators. BOCPD’s posterior is collapsed to MAP for comparison.

### 9.5 Evaluation metrics (P4) — useful for validation, not for user “truth”

- Jaccard \(J(A,A')=|A\cap A'|/|A\cup A'|\)  
- Covering metric averaging Jaccard over segments  
- \(F_1\) with precision/recall under margin \(M\)  
- Friedman + Wilcoxon + Holm for **ranking algorithms**, not for declaring environmental change points  

### 9.6 Uncertainty summary for change points

| Quantity | Supported uncertainty in corpus? |
|---|---|
| Change-point location | **No CI** in P2/P4; BOCPD posterior not exported |
| Change in mean | Model-dependent; not given as CI in P4 defaults |
| Annotator ambiguity | Explicit (P4); Earth series (CO₂, ozone) often ambiguous |

**Frequentist CI vs Bayesian credible interval:** P4 mentions both Bayesian and frequentist CPD families but does not supply interval estimators for \(\tau\). Any interval requires **additional modelling or resampling** — state that explicitly in the product.

---

## 10. Spatial analysis and spatial autocorrelation

### 10.1 What P5 actually analyses

Sacred-grove **point patterns** in Thiruvananthapuram taluk (\(n=113\)), not gridded climate trends (P5). Methods: average nearest neighbour (ANN), Global Moran’s I on grove **size**, multi-ring buffers, kernel density.

### 10.2 Four non-interchangeable spatial questions

1. Spatial autocorrelation of environmental **measurements**  
2. Spatial patterns in **estimated temporal trends** (field of \(Q_{\mathrm{med}}\) or \(Z\))  
3. Spatial clustering of **statistically significant** trends  
4. Spatial variation in **uncertainty**  

P5 addresses (1)-like structure for a static attribute (size) and location clustering via ANN — **not** (2)–(4) for climate trends.

### 10.3 Global Moran’s I (P5)

**Formula:** **not printed** in P5 (ArcGIS tool outputs listed: Moran’s Index, Expected Index, variance, z-score, p-value).

**Interpretation as stated:** positive \(I\) → cluster pattern; negative \(I\) → dispersed; near-zero / non-significant → random arrangement of attribute values.

**Weights used (P5):** inverse distance, Euclidean distance, **row standardisation**. Attribute = grove size.

**Result example:** \(I=-0.039850\), \(z=-0.594152\), \(p=0.552410\) → similar sizes randomly arranged (P5).

**Uncertainty:** z and p only; **no CI** for \(I\); no permutation count / null model stated.

**Additional research needed:** classical Moran formula

\[
I=\frac{n}{\sum_i\sum_j w_{ij}}\frac{\sum_i\sum_j w_{ij}(x_i-\bar x)(x_j-\bar x)}{\sum_i(x_i-\bar x)^2}
\]

(and Local Moran / LISA) from spatial statistics references — **not** from P5 text.

### 10.4 ANN and kernel density (P5)

- ANN index \(R\): P5 states \(R<1\) clustered, \(R=0\) random, \(R>1\) dispersed. **Analyst note:** conventional random benchmark is \(R=1\); P5’s \(R=0\) statement is doubtful. Reported \(R\approx 0.839\), \(p\approx 0.001\) for locations.  
- Kernel density: hotspot visualisation **without** significance test (not Getis-Ord). Equations missing/garbled in extract.

### 10.5 Project implication

For maps of cellwise MK significance, P5 is **insufficient**. Need Local Indicators of Spatial Association and multiplicity control (§11) from additional literature.

---

## 11. Multiple testing and statistical significance

### 11.1 Problem

Testing thousands of grid cells (or many stations × months) independently produces many false positives even under a global null. Significance maps can look spatially coherent simply because neighbouring cells share climate drivers and serial/spatial dependence.

### 11.2 What the corpus provides

| Source | Multiple-testing content |
|---|---|
| P1 | None across 12 stations × 12 months |
| P2 | None across 156 series |
| P3 | Single-series Type I/II focus |
| P4 | Holm correction for **algorithm ranking**, not spatial fields |
| P5 | None |

### 11.3 Distinctions (must not be conflated)

| Concept | Meaning |
|---|---|
| Pointwise CI / test | Valid for one pre-specified series/cell under assumptions |
| Simultaneous confidence bands | Joint coverage for a whole curve/field |
| Multiplicity-adjusted p-values (e.g. BH-FDR) | Control error rates among many tests — **not automatically** simultaneous CIs |
| Field significance | Climate-specific assessment of whether a map of local tests is globally unusual |

**Benjamini–Hochberg FDR, spatial FDR, and climate field significance:** **Additional research needed** — not derived in supplied papers. Classify as **essential** before publishing multi-cell “significant trend” maps (§19).

### 11.4 Practical significance vs statistical significance

P3 emphasises power and noise magnitude: a significant result can be tiny; a non-significant result may reflect low power, not “no change.” Always report \(Q_{\mathrm{med}}\) with units alongside \(Z\)/p.

---

## 12. Confidence intervals in regression and correlation

### 12.1 Association model in P2 (Eq. 3)

\[
\ln Y=\alpha+aR+bR^2+cT+dT^2+e(R\cdot T)+\mu
\]

| Symbol | Meaning (P2) |
|---|---|
| \(Y\) | Crop yield (kg ha⁻¹) |
| \(R\) | Growing-season rainfall (May–Oct) |
| \(T\) | Growing-season average temperature |
| \(\alpha,a,\ldots,e\) | Coefficients |
| \(\mu\) | Error / omitted variables |

**Preprocessing:** log yield; first-difference to reduce long-term trend influence; VIF for multicollinearity (cutoff 10 cited from Alauddin & Nghiem). Significance via t-statistic probabilities.

### 12.2 Uncertainty support in P2

- Reports significance stars / p-style thresholds for coefficients.  
- **Does not** derive classical coefficient CIs, prediction intervals, or sandwich estimators for serial dependence.  
- Authors note omitted edaphic/socio-economic drivers and doubtful climate series (P2 limitations).

### 12.3 Correlation methods

Pearson / Spearman / cross-correlation CIs: **not formulated in the supplied papers**.  

**Additional research needed** for:

- Fisher \(z\) CI for Pearson correlation under independence  
- Dependence-aware intervals (block bootstrap) when series are autocorrelated  

### 12.4 Association ≠ causation

- P2 regression assesses association with yield, not causal attribution.  
- P6 bivariate GPP–soil moisture histograms show coupling with mechanistic *plausibility*, not causal identification (P6, pp. 215–216; causal inference listed as future work).  
- P8: XAI explains what the model learned, which can be “correct for wrong reasons”; ML fits functions without clear causal understanding.

### 12.5 Ten-point template — regression coefficients (corpus)

Point estimates and null tests: partially supported (P2). Standard errors / CIs under dependence: **gap**. Prediction intervals: **gap**. Do not treat \(p<0.05\) on a coefficient as a CI.

---

## 13. Physical relationships and simulation foundations

### 13.1 What is **not** in the supplied papers

Closed-form, project-ready equations for:

- Vapour pressure deficit from \(T\) and RH  
- Penman–Monteith / Priestley–Taylor ET (beyond naming Priestley–Taylor inside GLEAM provenance in P6 Table A1)  
- Infiltration–runoff closures  
- Full surface energy balance solvers  

**Do not invent these equations in code or UI copy.**

### 13.2 What *is* supported conceptually

| Source | Relevant content |
|---|---|
| P6 | Multivariate Earth-system variables; Q10 respiration sensitivity as **example** of seasonality confounding a physical rate; GLEAM/process models as **model-derived** products |
| P7 | Forward map \(y=h(x,w)\); Bayesian updating of state/parameters; observation error \(\sigma_y\) vs state/parameter priors |
| P8 | RTM/EM forward simulation to train retrievals; emulators; physics-aware ML; equifinality warning |

### 13.3 Simulator communication rules (project)

A future exploratory simulator must display:

1. Equations and assumptions (and label empirical vs physical)  
2. Input constraints and units  
3. Whether outputs are **simulated**  
4. Uncertainty / sensitivity statement (even if qualitative until §14 methods exist)  
5. Clear separation from observed NASA products  

---

## 14. Uncertainty propagation and sensitivity analysis

### 14.1 Uncertainty types (P7)

From the Gaussian DA/ML cost (P7 Eqs. 2.3–2.5):

\[
y=h(x,w)
\]

\[
P(x,w\mid y)=\frac{P(y\mid x,w)\,P(x,w)}{P(y)}
\]

\[
J(x,w)=\underbrace{\frac{(y-h(x,w))^2}{(\sigma_y)^2}}_{J_y}+\underbrace{\frac{(x_b-x)^2}{(\sigma_x)^2}}_{J_x}+\underbrace{\frac{(w_b-w)^2}{(\sigma_w)^2}}_{J_w}
\]

| Term | Meaning |
|---|---|
| \(\sigma_y\) | Observation (label) error SD |
| \(\sigma_x\) | Background/state prior SD |
| \(\sigma_w\) | Parameter/weight prior SD |
| \(J_y\) | Data misfit (ML squared loss ≈ \(\sigma_y=1\)) |
| \(J_x\) | State prior (often absent in pure ML) |
| \(J_w\) | Parameter regularisation / Tikhonov |

**Assumptions stated:** Gaussian errors; often \(P(x,w)=P(x)P(w)\) (P7 notes this may be insufficient). Full Bayesian solution often computationally infeasible; MCMC mentioned as typically impractical for large DA.

### 14.2 Distinctions (mandatory)

| Concept | Do not confuse with |
|---|---|
| Measurement / retrieval uncertainty | Sampling variability of a trend estimator |
| Parameter uncertainty | Model structural uncertainty |
| Confidence interval | Prediction interval; Bayesian credible interval |
| Narrow CI | Proof of unbiasedness or importance |

### 14.3 Methods largely absent from corpus

| Method | Status |
|---|---|
| Analytical error propagation through nonlinear physical formulas | **Additional research needed** |
| Monte Carlo uncertainty propagation | Named in spirit by P3’s Monte Carlo *power* study — not product UQ |
| Bootstrap CI | Not developed |
| Block bootstrap for autocorrelated series | Not developed — **recommended** before dependence-aware CIs |
| Ensemble dimension for product uncertainty in cubes | P6: uncertainty “open aspect”; not merged as cube dimension (p. 207) |

### 14.4 Sensitivity

- P3: MK power sensitive to slope \(A\), PSD, \(n\), \(\rho\).  
- P6 SCAPE: physical parameter (\(Q_{10}\)) sensitive to seasonal confounding.  
- P8: equifinality — many models fit for wrong reasons.

---

## 15. Method selection framework

| Scientific question | Potential method | Required inputs | Uncertainty considerations | Corpus support |
|---|---|---|---|---|
| Is there a monotonic trend? | Mann–Kendall | Ordered time series | Serial correlation; power vs noise; multiplicity if many series | P1, P3 (math); P2 (application) |
| How fast is it changing? | Sen’s slope \(Q_{\mathrm{med}}\) | Values + time indices | Point estimate only in corpus; CI procedure external | P1 (math); P2/P3 (use) |
| How uncertain is the slope? | Sen CI / bootstrap | Sorted pairwise slopes; assumptions | **CI formula not in corpus** | Claim in P1; **gap** |
| Is lag-1 dependence present? | \(r_1\) + bounds | Series | Interpret bounds carefully (P2 wording anomaly) | P2 |
| Should MK be adjusted for dependence? | TFPW / PW / variance correction | Series + policy on Type I vs II | Algorithms cited, not derived | P2 applies; P3 discusses |
| Was there an abrupt shift / inhomogeneity? | SNHT, BRT, Pettitt, VNRT; or CPD (PELT, binseg, BOCPD, …) | Series; CPD model class | Break year without CI in P2; P4 has no location CI | P2, P4 |
| Are nearby values spatially clustered? | Global Moran’s I; ANN | Locations + attribute + weights | z/p only; weights sensitive; not trend-field analysis | P5 (limited) |
| Are mapped cellwise trends reliable as a field? | FDR / field significance | Grid of local tests + dependence model | **Not in corpus — essential gap** | Gap |
| Are two variables associated? | Regression / correlation | Paired series | Association≠causation; dependence undermines classical CIs | P2; caveats P6/P8 |
| How to organise multivariate EO? | Earth system data cube | Co-registered grids | Provenance; remapping; NA | P6 |
| How to think about observation vs model uncertainty? | Bayesian DA/ML cost \(J\) | Priors + forward model | Conceptual; not a trend CI | P7 |

---

## 16. Mathematical equation reference

### 16.1 Mann–Kendall (P1 Eqs. 1–3; P3 Eqs. 1–5)

\[
S=\sum_{i=1}^{n-1}\sum_{j=i+1}^{n}\mathrm{sgn}(X_j-X_i),\quad
\mathrm{Var}(S)=\frac{n(n-1)(2n+5)-\sum_{i=1}^{m}t_i(t_i-1)(2t_i+5)}{18}
\]

\[
Z=\frac{S-\mathrm{sign}(S)}{\sqrt{\mathrm{Var}(S)}}\quad(S\neq 0);\quad Z=0\ (S=0)
\]

### 16.2 Sen’s slope (P1 Eqs. 4–5)

\[
Q_i=\frac{x_j-x_i}{j-i},\quad
Q_{\mathrm{med}}=\mathrm{median}\{Q_i\}
\]

### 16.3 Lag-1 autocorrelation (P2 Eqs. 1–2)

\[
r_1=\frac{\sum_{i=1}^{n-1}(X_i-\bar X)(X_{i+1}-\bar X)}{\sum_{i=1}^{n}(X_i-\bar X)^2},\quad
r_1(95\%)=\frac{-1\pm 1.96\sqrt{n-2}}{n-1}
\]

### 16.4 AR(1) and synthetic trend (P3)

\[
X_t=\rho X_{t-1}+N_t,\quad Y_t=At+B+N_t,\quad \mathrm{Power}=N_{\mathrm{rej}}/N
\]

### 16.5 CPD penalised segmentation (P4 Eq. 1)

\[
\min_{\mathcal{T}}\sum_{i=1}^{n+1}\ell(y_{\tau_{i-1}:\tau_i-1})+\lambda P(n)
\]

### 16.6 Yield association (P2 Eq. 3)

\[
\ln Y=\alpha+aR+bR^2+cT+dT^2+e(R\cdot T)+\mu
\]

### 16.7 DA/ML Bayesian cost (P7 Eqs. 2.1–2.5)

\[
y=h(x,w),\quad
J=J_y+J_x+J_w
\]

### 16.8 Data cube (P6)

\[
C=(L,G,X),\quad X\in\mathbb{R}\cup\{\mathrm{NA}\}
\]

Operations include reducing, cropping, slicing, expansion (spectral), and multi-cube regression returning parameters + residual cube (P6 Eqs. 1–8, pp. 204–206).

---

## 17. Implementation guidance (for a future development agent)

**No software architecture is prescribed here.** Guidance is mathematical/operational.

### 17.1 Required input structures

| Analysis | Minimum inputs |
|---|---|
| MK / Sen | 1-D series values; ordered time index or timestamps; units; missing-value mask |
| Autocorrelation screen | Same series; \(n\) large enough for \(r_1\) bounds |
| Homogeneity battery | Series + chosen α; record which tests fire |
| CPD | Series; cost model; penalty; whether mean/variance/trend shifts are in scope |
| Moran | Coordinates; attribute field; weight definition (method, standardisation) |
| Regression association | Paired observations; covariates; provenance tags |
| Cube workflows | Dimensions \(L\); grids \(G\); NA policy; product provenance |

### 17.2 Per-cell vs field operations

- MK, Sen, \(r_1\), SNHT/Pettitt, univariate CPD: **independent per series/cell** (embarrassingly parallel) but **statistically dependent** across space.  
- Moran, field significance, simultaneous inference: **across the spatial field**.  
- Never present a map of per-cell p<0.05 as “the significant region” without §11 controls.

### 17.3 Edge cases and numerical notes

- \(n\) small: P3 uses normal approx for \(n\ge 8\); P1 mentions ties treatment for \(n>10\). Short satellite eras → low power (P3).  
- All ties → \(S=0\), \(\mathrm{Var}(S)\) careful with empty tie sum.  
- Division by zero in Sen if duplicate times — require strictly increasing time index or use actual \(\Delta t\) consistently.  
- Index time vs calendar time: document which denominator \(j-i\) vs \(t_j-t_i\) was used.  
- Missing data: define omission rules; do not silently interpolate before MK without disclosure.  
- CPD: many libraries reject NA (P4); standardise only if documented (P4 did).  

### 17.4 Expected outputs (per series)

| Output | Type tag |
|---|---|
| \(S\), \(\mathrm{Var}(S)\), \(Z\), p-value, \(\alpha\) | Statistically estimated |
| \(Q_{\mathrm{med}}\) + units | Statistically estimated |
| Slope CI (when implemented from external ref) | Statistically estimated |
| \(r_1\), dependence flag, correction used | Statistically estimated / metadata |
| Breakpoint year(s), CPD \(\hat\tau\) | Statistically estimated |
| Moran \(I\), z, p | Statistically estimated |
| Provenance string | Metadata |
| Assumptions & limitations text | Required UX copy |

### 17.5 Validation requirements

- Reproduce P1/P3 MK on synthetic monotonic series.  
- Check Sen median against a known hand-calculated toy series.  
- Confirm \(r_1\) bounds numerically for given \(n\).  
- For CPD, report algorithm + penalty + whether default beat a “no change” baseline (P4 warning).  
- Never validate “truth” of Earth change points solely against non-expert annotators without domain review (P4 limitation).

### 17.6 Common implementation mistakes

1. Ignoring autocorrelation and over-painting significance.  
2. Treating MK p-value as Sen CI.  
3. Using month-wise MK and calling it Seasonal MK.  
4. Equating CPD mean shifts with climate trends.  
5. Applying Moran to values and claiming “significant trends cluster.”  
6. Publishing grid significance maps without multiplicity / field control.  
7. Presenting reanalysis/ML fluxes as raw observations.  
8. Inventing VPD/ET equations without citation.  
9. Decorating charts with error bars that are SD across seeds or visual padding, not defined CIs.  
10. Silent “fixes” of author anomalies (P1 variance wording; P2 \(r_1\) rule; P5 \(R=0\)).

---

## 18. Limitations and scientific caveats

1. **Independence:** classical MK assumes independence; environmental series often violate this (P3).  
2. **Power:** non-significance ≠ no change when \(n\) is small or variance large (P3).  
3. **Record length:** P1 uses ~20 years; ENSO/IOD variability can dominate (P1 discussion).  
4. **Data quality:** P2 labels some temperature series Doubtful; errors may be human/instrument/entry.  
5. **Homogeneity vs climate:** breakpoints may be non-climatic.  
6. **CPD defaults:** mean-shift models mis-handle trends/seasonality; default algorithms may not beat “no changepoints” (P4).  
7. **Spatial paper mismatch:** P5 is not a climate-trend spatial methods source.  
8. **Aggregation:** P9 does not justify climate aggregation choices.  
9. **Causation:** associations (P2, P6, P8) are not causal proofs.  
10. **AI text:** if LLMs draft scientific claims, verify against sources (P8 ethics; P10 at most a weak generic pointer — do not cite its % rates as Earth-science error rates; abstract vs table figures in P10 do not reconcile cleanly in the extract).  
11. **CI gaps:** slope CIs, change-point CIs, Moran CIs, and dependence-aware correlation CIs are incompletely supported by the corpus.  
12. **Practical vs statistical significance** must remain distinct in user communication.

---

## 19. Methodological gaps and additional references required

| Missing concept | Why it matters | Component affected | Priority | Type of reference needed |
|---|---|---|---|---|
| Complete Sen’s slope CI (ordered slopes + MK critical ranks) | Core “how certain?” for magnitude | Trend magnitude UX | **Essential** | Sen 1968; Gilbert; Helsel & Hirsch |
| TFPW / PW / Hamed–Rao algorithms | Correct Type I under AR(1) | Preprocessing | **Essential** | Yue et al. 2002b; Hamed & Rao 1998 |
| Seasonal Mann–Kendall | Seasonality in monthly series | Trend detection | **Recommended** | Hirsch & Slack 1984 |
| Pettitt (and SNHT/BRT) full math | Transparent breakpoints | Homogeneity | **Recommended** | Pettitt 1979; Alexandersson 1986; Buishand 1982 |
| CPD location uncertainty (CI/credible) | Abrupt-change confidence | Change-point UX | **Recommended** | CPD uncertainty literature beyond P4 |
| Global/Local Moran formulas + permutation inference | Defensible spatial stats | Spatial module | **Essential** for spatial maps | Cliff & Ord / Anselin LISA |
| FDR / BH / field significance | Avoid spurious significance maps | Grid analysis | **Essential** | Benjamini & Hochberg; Livezey & Chen / climate field-significance lit. |
| Block bootstrap | Dependence-aware CIs | CI framework | **Recommended** | Time-series bootstrap refs |
| Environmental temporal aggregation guidance | Honest monthly/annual products | Preprocessing | **Essential** | WMO / hydrological practice manuals |
| Physical simulator equations + UQ | Safe exploratory physics | Simulator | **Essential** if shipped | Standard micrometeorology (VPD, PM ET, energy balance) |
| Satellite product uncertainty ingestion | Don’t overclaim precision | Data layer | **Recommended** | Product ATBDs; P6 uncertainty dimension still “open” |
| Validation vs ground observations | Credibility | All claims | **Essential** for science claims | In situ networks; P8 reference-data caveats |
| Cross-variable lagged relationships with valid CIs | “Associated?” question | Multivariate | **Optional→Recommended** | Time-series cross-correlation under dependence |

---

## 20. Research paper traceability matrix

| Method / claim | Paper | Section / page | Uncertainty support |
|---|---|---|---|
| MK \(S\), \(\mathrm{sgn}\) | P1, P3 | P1 p. 5 Eqs. 1; P3 p. 3 Eqs. 1–2 | Test statistic |
| \(\mathrm{Var}(S)\) with ties | P1 (clear), P3 (garbled ties) | P1 Eq. 2; P3 Eq. 4 | SE of \(S\) under \(H_0\) |
| Continuity-corrected \(Z\) | P1, P3 | P1 Eq. 3; P3 Eq. 5 | Normal reference for test |
| Sen pairwise slopes + median | P1 | p. 5 Eqs. 4–5 | Point estimate |
| Sen 90/95% CI claim | P1 | p. 5 text | **Claim only — no formula** |
| MK H0/Ha wording | P2, P3 | P2 §2.2.2; P3 p. 3 | Hypothesis test |
| Lag-1 \(r_1\) + 95% bounds | P2 | §2.2.2 Eqs. 1–2 | Interval for screening \(r_1\) |
| TFPW applied | P2 | §2.2.2; abstract | Correction named, not derived |
| PW/TFPW/variance-correction debate | P3 | Introduction p. 2 | Qualitative trade-off |
| AR(1), power, Type I/II | P3 | Methodology + results | Power curves; not slope CI |
| Theil–Sen used to detrend | P3 | Results / methods | Point slope for simulation |
| SNHT/BRT/Pettitt/VNRT workflow | P2 | §2.2.1 | Break years; no location CI |
| SNHT only (homogeneous) | P1 | p. 4 | Pass/fail |
| CPD cost+penalty | P4 | Eq. 1 p. 3 | Hyperparameter-sensitive |
| CPD algorithm zoo + MAP BOCPD | P4 | §§2,5 | No location CI |
| Covering / F1 / margin \(M=5\) | P4 | §§3–4 | Evaluation uncertainty only |
| Holm for algorithm ranks | P4 | p. 12–13 | Not spatial FDR |
| Moran’s I usage (no formula) | P5 | Methods / results | z, p only |
| Inverse-distance row-std weights | P5 | Methods | Weight choice undocumented sensitivity |
| Cube \(C=(L,G,X)\), NA, ops | P6 | pp. 203–206 | Structural |
| Provenance Table A1 | P6 | pp. 221–225 | Product class tags |
| Remapping / mass-balance caveat | P6 | p. 216 | Qualitative |
| SCAPE / Q10 seasonal confounding | P6 | pp. 213–214 | Illustration only |
| Bayesian \(J_y+J_x+J_w\) | P7 | Eqs. 2.1–2.5 pp. 3–6 | Conceptual posterior |
| Yield regression association | P2 | Eq. 3 §2.3 | t-style significance |
| AI4EO / XAI≠causation / UQ duty | P8 | ~pp. 127–133 | Normative |
| Clinical temporal aggregation | P9 | entire | **Out of scope** |
| LLM RAG verification rates | P10 | abstract/Table 1 | **Do not use for Earth UQ** |

---

## Final quality-control report

### 1. Papers successfully reviewed

P1 Aditya et al. 2021; P2 Gadedjisso-Tossou et al. 2021; P3 Wang et al. 2020; P4 van den Burg & Williams 2022; P5 Parvathy et al. 2026; P6 Mahecha et al. 2020; P7 Geer 2021; P8 Tuia et al. 2024/2025; P9 Kim & Park 2026 (relevance check); P10 Kholov et al. 2026 (relevance check).

### 2. Papers / passages that could not be adequately interpreted as method sources

- **P9** — clinical ML; excluded from environmental aggregation methodology.  
- **P10** — LLM hallucination pipeline; excluded from Earth methods; internal % figures do not reconcile cleanly in the extract.  
- **P5** — Moran/ANN/kernel **equations missing or garbled**; interpretation anomalies (\(R=0\) for random).  
- **P3 Eq. 4 tie term** and **P1 Eq. 5 even-\(N\) index** — PDF/layout ambiguity; **human verification required** before coding.  
- **P2** — internal inconsistencies across abstract/text/tables for some significance calls; MK/Sen/TFPW black-boxed.

### 3. Methodologies with strong mathematical support in-corpus

- Mann–Kendall \(S\), \(\mathrm{Var}(S)\) (prefer P1 ties), continuity-corrected \(Z\) (P1, P3).  
- Sen pairwise slopes and median point estimate (P1).  
- Lag-1 autocorrelation coefficient and Anderson-style bounds (P2).  
- AR(1) + MK power / Type I–II characterisation (P3).  
- Penalised CPD objective and evaluation metrics (P4).  
- Bayesian DA/ML cost decomposition (P7).  
- Earth-system data cube formalism and provenance tagging (P6).

### 4. Confidence-interval methods with strong mathematical support in-corpus

- **Limited.** Screening interval for \(r_1\) (P2).  
- Conceptual Gaussian posterior / variational cost (P7) — not a trend CI.  
- **Sen slope CI procedure: not supported by supplied math** despite P1’s verbal claim.  
- Change-point location CI: **not supported** (P4 collapses BOCPD to MAP).  
- Moran CI: **not supported**.

### 5. Methodologies requiring additional references

Sen CI; TFPW/PW/Hamed–Rao algorithms; Seasonal MK; Pettitt/SNHT/BRT equations; Local Moran; FDR/field significance; block bootstrap; environmental aggregation standards; physical VPD/ET/energy-balance equations; product-level satellite uncertainty propagation.

### 6. Important scientific uncertainties

Serial correlation bias of MK; low power for short noisy records; homogeneity breakpoints vs climate; CPD model mismatch (mean shift vs trend/seasonality); spatial multiplicity; product provenance (observed vs reanalysis vs ML); remapping mass-balance; seasonal confounding of physical parameters; AI/XAI causal overclaim risk.

### 7. Equations or assumptions requiring human verification

1. P1 even-\(N\) median index vs standard Sen indexing.  
2. P3 printed tie formula vs P1 / Kendall standard.  
3. P2 written rule “\(r_1\) between bounds ⇒ correlated” vs standard Anderson test.  
4. P5 ANN random benchmark \(R=0\) vs conventional \(R=1\).  
5. External Sen CI rank formulae before any CI implementation.  
6. P6 ERA5 vs ERA-Interim product naming inconsistency when citing temperatures.

---

*End of METHODOLOGY_REFERENCE.md*  
*Standard applied: scientific defensibility over breadth. Unsupported methods are flagged, not fabricated.*
