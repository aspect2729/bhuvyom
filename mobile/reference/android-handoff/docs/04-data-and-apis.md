# 04 · Data and APIs

Every number in the app comes from one of the sources below. All are free and public, and **none need a key**. Request parameters are given exactly as the web build uses them (see `reference/web/js/simulation.js`, `compare.js`, `predictions.js`).

## 1. Regions and grids

Data is fetched on a **regular lat/lon grid** for the region, plus one exact Bengaluru point appended at the end (index `rows*cols`).

| Region | Bounds (S, N, W, E) | Simulate grid | Compare grid | Boundary file |
|---|---|---|---|---|
| Karnataka | 11.5, 18.5, 74.0, 78.6 | 11 rows × 9 cols (+1) = 100 points | 9 × 7 (+1) = 64 | `data/regions/karnataka.geojson` |
| Bengaluru | 12.62, 13.27, 77.28, 77.87 | 9 × 9 (+1) = 82 points | 6 × 6 (+1) = 37 | `data/regions/bengaluru-urban.geojson` |

Grid point (i, j): `lat = S + i·(N−S)/(rows−1)`, `lon = W + j·(E−W)/(cols−1)`, rounded to 4 decimals. Bengaluru point: `12.9716, 77.5946`. Multi-location calls pass comma-separated `latitude=` and `longitude=` lists in that order, and the response is an array in the same order.

The Compare grid is leaner on purpose: one Compare load makes **five** grid calls (doc §6).

## 2. Live conditions (Open-Meteo forecast API: ECMWF IFS / NCEP GFS "best match")

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=<list>&longitude=<list>
  &current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_temperature_0_to_7cm,cloud_cover
  &daily=precipitation_sum&past_days=30&forecast_days=1
  &wind_speed_unit=ms&timezone=Asia%2FKolkata
```

| Layer | Value per point |
|---|---|
| Air temperature (°C) | `current.temperature_2m` |
| Ground temperature (°C) | `current.soil_temperature_0_to_7cm`. **Use 0–7 cm everywhere** so live and past compare like for like (the web Simulate page used `soil_temperature_0cm`; the app standardises on 0–7 cm) |
| Rainfall, last 30 days (mm) | sum of `daily.precipitation_sum[0..29]` (the 30 past days; index 30 is today and is excluded) |
| Humidity (%) | `current.relative_humidity_2m` |
| Wind (m/s) + direction (°) | `current.wind_speed_10m`, `current.wind_direction_10m` (meteorological: the direction the wind blows **from**) |
| Cloud cover (%) | `current.cloud_cover` (drives the rainfall-layer clouds) |
| Timestamp | `current.time` of the Bengaluru point (show as "hh:mm IST") |

**PM2.5 (Copernicus CAMS):**
```
GET https://air-quality-api.open-meteo.com/v1/air-quality?latitude=<list>&longitude=<list>&current=pm2_5
```
If this call fails, PM2.5 is "unavailable"; don't fail the whole screen.

## 3. A past day (Compare top map). ERA5 / ERA5-Land reanalysis

For the chosen date `D` at the **same IST hour `H` as now**:
```
GET https://archive-api.open-meteo.com/v1/archive?latitude=<list>&longitude=<list>
  &start_date=D&end_date=D
  &hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,soil_temperature_0_to_7cm
  &wind_speed_unit=ms&timezone=Asia%2FKolkata              → take hourly[k][H]

GET https://archive-api.open-meteo.com/v1/archive?latitude=<list>&longitude=<list>
  &start_date=D−30d&end_date=D−1d&daily=precipitation_sum&timezone=Asia%2FKolkata   → sum (needs ≥ 28 values)

GET https://air-quality-api.open-meteo.com/v1/air-quality?latitude=<list>&longitude=<list>
  &start_date=D&end_date=D&hourly=pm2_5&timezone=Asia%2FKolkata                     → hourly.pm2_5[H]
```
- Valid dates: **1980-01-01 → today − 7 days** (ERA5 lags real time).
- **PM2.5 history starts in September 2022.** For earlier dates, skip the call entirely and show "No PM2.5 record before September 2022".
- Feb 29 on a non-leap year becomes Feb 28.

## 4. The annual record (timeline 1980 → last year, Bengaluru point only)

```
GET https://archive-api.open-meteo.com/v1/archive?latitude=12.9716&longitude=77.5946
  &start_date=1980-01-01&end_date=<last year>-12-31
  &daily=temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_mean
  &wind_speed_unit=ms&timezone=Asia%2FKolkata
```
Aggregate by year (only years with > 300 valid days): temperature, humidity and wind are annual **means**; rainfall is the annual **total**. About 520 KB, so fetch it once, store it permanently and refresh once a year. Ground temperature and PM2.5 have no annual record: say so.

**Timeline values (Simulate)** for the Bengaluru read-out in year `Y`:
- `Y < live year`: the record value for `Y`; the "vs 2016–2025 average" delta. The map field is the live field shifted by `record(Y) − live(Bengaluru)` for mean layers, and unchanged for rainfall. **Known issue in the web build to fix in the app:** the web shifts by *annual mean − instantaneous live*, which mixes daily-cycle and climate signals. In the app, **shift by the anomaly** `record(Y) − mean(record 2016–2025)` instead.
- `Y = live year`: live.
- `Y > live year`: temperature layers only: `value = base + (AR6(Y) − AR6(base year))`, where for air temperature `base` = the 2016–2025 record mean (base year 2020.5) and for ground temperature `base` = the live value (base year = live year). Other layers: "No scenario projection for <layer>".

## 5. Scenarios (IPCC AR6), forecast engine and boundaries (bundled)

- `data/ar6-warming.json`: piecewise-linear interpolation of global warming per SSP. Label it "IPCC AR6 · <scenario>". It is a scenario, not a forecast.
- `data/prediction-engine-results.json`: BhuVyom engine output (aspect2729/bhuvyom, `backend/engines/prediction`). For each variable (`T2M`, `PRECTOTCORR`): 25 cells (0.5° × 0.625°), `times` 2022-01…2026-12, fields `observed | forecast | pi80_low | pi80_high | pi95_low | pi95_high | climatology` per cell, plus `model_by_h`, `skill_by_h`, `mae_by_h`, `cov80_by_h`, findings, assumptions, limitations. Rainfall is mm/day; multiply by the days in the month for display. **Bundle it in the APK.** A future version may fetch an updated file from the repo; design the loader to accept a newer file with the same schema.
- **ERA5 reality check** for a Forecast cell: archive daily `temperature_2m_mean,precipitation_sum` from Jan 1 of the forecast year to today − 6 days; keep only **complete** months; monthly mean temperature or monthly total rainfall; compare with the forecast and the 80% range.

## 6. Map tiles

| Basemap | URL template | Notes |
|---|---|---|
| Day | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Note the `{y}/{x}` order. Max zoom 12 in-app. Attribution: "Esri, Maxar, Earthstar Geographics" |
| Night | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png` | Native max zoom 8 (overzoom beyond, so it's blurry at city zoom; that's expected). Attribution: NASA Black Marble (VIIRS) via GIBS |

Check Esri's terms before any commercial release; for a non-commercial hackathon app with attribution it's used the same way as on the web build.

## 7. Caching and rate limits

Open-Meteo free tier: about **600 calls per minute, 5,000 per hour, 10,000 per day**. Each *location* in a multi-location request counts, and requests with more than 10 variables or more than 2 weeks of data count extra (`past_days=30` ≈ 2.2×).

| Data | Cache key | Lifetime |
|---|---|---|
| Live grid | region | 20 minutes (also respect the API's `current.interval` of 900 s) |
| Past day | region + date + hour | **forever** (immutable) |
| Annual record | Bengaluru point | 1 year |
| ERA5 reality check | cell + month | until the month changes |
| Tiles | standard HTTP cache + disk LRU about 150 MB | per server headers |

- **Backoff:** on HTTP 429, wait 15 s, retry up to 2 times, and show "Too many requests. Trying again…". Never hammer.
- **Compare play** steps by decades and waits for each load. Never prefetch a whole timeline of past days.
- **Budget per cold start:** Simulate (Karnataka) about 420 weighted calls; Compare about 470. Show cached data first and refresh in the background.

## 8. Honesty rules (enforced in UI copy)

- Every number shows its **time** ("Live · 13:45 IST", "15 Nov 2016 · 13:00 IST", "2050 · projection") and, nearby, its **source**.
- Missing ≠ zero. Use "No record", "No projection", "Unavailable" or "Not connected yet". Never draw a blank field silently.
- Projections say "IPCC AR6 central estimate … not a forecast of that day's weather".
- A single day compared with another day always carries the weather-versus-climate caveat.
- The 16-system variable values are **reference figures** (badge "REFERENCE"), not live.
- Grid resolution is coarse (about 9–25 km models; about 40 km for CAMS). Don't claim neighbourhood precision; read-outs say "Near <place>".
