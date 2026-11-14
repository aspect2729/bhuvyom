# Assumptions and Limitations

## Data
* NASA POWER = MERRA-2 reanalysis, 0.5°×0.625°: model-derived, ~50 km; the whole BBMP area is one cell.
* MODIS LST: clear-sky only (≈74 % of pixel-days valid in Jan–Mar 2024: 60 % QA-good + 14 % QA-other with ≤2 K error, mostly built-up), surface skin temperature, ~1 km; retrieval error (≤1 K / ≤2 K by tier) not propagated.
* GPM IMERG Final daily: satellite–gauge merged, 0.1°; randomError field not acquired; UTC days.
* SRTM: 2000 epoch; urban structures partly in DEM.
* Acquired periods are short for satellite products (LST Jan–Mar 2024; GPM Jun–Oct 2024; NDVI pending).

## Analysis
* MK assumes monotonic change; low power for short/noisy series; BH controls FDR but spatial field significance is untested.
* No hotspot classification: the methodology defines no threshold.

## Prediction
* Monthly, city-scale (50 km) only. No daily forecasts, no projections beyond 12 months.
* Stationarity apart from linear trend; intervals under-cover in the warm 2018–2025 period.
* Forecast origin = last acquired month (Dec 2025). Months of 2026 already elapsed should be verified when acquired.

## Simulation
* SCS-CN: AMC II, each UTC day = one event, uniform land surface per 0.1° cell, no routing/drainage/lakes, no calibration.
* Impervious fractions are user scenario values (no impervious-surface product integrated).
* Prediction outputs cannot force it: monthly means ≠ event depths (refused with HTTP 422).

## Platform
* Scientific Inspector is hidden UI (Shift+I), not an access-control boundary.
* Supabase not configured; local file storage is used.
