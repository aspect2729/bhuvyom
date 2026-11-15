# Reference access index

Checked 2026-11-15. These are authoritative web references, not downloaded papers.
Local PDF path and PDF page numbers are not applicable. Existing paper citations
in `../REFERENCES.md` remain unverified against original PDFs in this audit.

| Source / authors | Date / DOI | URL | Relevant method | Access / verification |
|---|---|---|---|---|
| Forecasting: Principles and Practice, third edition; Rob J Hyndman and George Athanasopoulos | Living online text; DOI not used | https://otexts.com/fpp3/toolbox.html#sec-tscv | Rolling forecasting origin, chronological evaluation, multi-step errors | HTTP 200; methodology section checked |
| scikit-learn contributors, Common pitfalls and recommended practices | Living documentation; DOI not used | https://scikit-learn.org/stable/common_pitfalls.html | Train-only preprocessing and leakage avoidance | HTTP 200; documentation checked |
| NASA POWER, Hourly API documentation | Living documentation; DOI not used | https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ | Hourly data availability since 2001; explicit UTC versus local solar time | HTTP 200; availability/time-standard text checked |
| NASA GPM, IMERG overview | Living documentation; DOI not used | https://gpm.nasa.gov/data/imerg | Early/Late/Final distinctions, research versus low-latency use, rate versus accumulation units | HTTP 200; product distinctions checked |

These sources support protocol design and source interpretation; none establishes
BhuVyom model performance. Empirical residual intervals are not claimed to have
conformal guarantees under temporal dependence. Specific acquisition parameters,
granule access, quotas and actual historical completeness still need pilot checks.
