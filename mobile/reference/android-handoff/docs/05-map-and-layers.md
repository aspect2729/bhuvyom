# 05 · Map and the six layer effects

The map is the product. This document describes **what to draw and why**; the implementation is up to you (Compose `Canvas`, `AndroidView` + custom `View`, OpenGL ES or AGSL shaders). The reference implementation is `reference/web/js/simulation.js` (`EFFECTS` section) and `compare.js`. Screenshots of every effect are in `reference/screenshots/web-sim-*.png`.

## 1. Map stack (recommended)

- **MapLibre Native for Android** with two raster sources (Day: Esri; Night: NASA GIBS Black Marble; URLs in doc 04). Hide attribution chips in the map itself; credit on the About screen and in a small caption under the read-out.
- Above the basemap, in this order:
  1. the **colour field** (a raster image overlay georeferenced to the region bounds; opacity = `fieldOpacity` in layers.json)
  2. the **effect layer**: a transparent overlay you draw every frame in screen space, clipped to the region outline
  3. the **region outline** (`#F2F2F2` at 85%, 1.2 dp)
  4. the **Bengaluru marker** (amber dot + pulse)
  5. the tap crosshair
- Interaction: pan, pinch and double-tap zoom. No rotation and no tilt (north up). Min/max zoom as in doc 03. `fitBounds(outline, padding: top 84 dp, bottom = sheet peek + 16 dp, sides 24 dp)`.
- **Never transform the map views** for animation (no translate or scale on reveal); read-outs depend on exact screen ↔ geo projection.

## 2. Interpolation (raster from the grid)

The grid is regular, so use **Catmull-Rom bicubic interpolation** over the `rows × cols` values (not IDW; IDW makes bull's-eyes around points):

```
gi = (lat − S)/dLat ; gj = (lon − W)/dLon
i1 = clamp(floor(gi), 0, rows−2) ; j1 = clamp(floor(gj), 0, cols−2)
ti = clamp(gi − i1, 0, 1) ; tj = clamp(gj − j1, 0, 1)
for di in −1..2: row[di] = CR(g(i1+di, j1−1), g(i1+di, j1), g(i1+di, j1+1), g(i1+di, j1+2), tj)   // indices clamped to the grid
value = CR(row[−1], row[0], row[1], row[2], ti)
CR(p0,p1,p2,p3,t) = p1 + 0.5·t·(p2 − p0 + t·(2p0 − 5p1 + 4p2 − p3 + t·(3(p1 − p2) + p3 − p0)))
```
If any of the 16 samples is missing, fall back to inverse-distance weighting with power 3 over all valid points (`dx` scaled by 0.97).

**Raster size:** Karnataka 200 × 300, Bengaluru 220 × 242 cells. Rows are evenly spaced in **Web-Mercator y** (not latitude), so the image overlay lines up with the map: `lat(row) = 2·atan(exp(mN + (mS − mN)·(row + 0.5)/RH)) − π/2`, where `m(lat) = ln(tan(π/4 + lat/2))`.

**Mask:** a cell is "inside" if its centre is inside the region polygon (even-odd ray casting against the GeoJSON ring). Precompute the mask once per region. Outside cells are transparent.

**Colour:** `t = (value − lo)/(hi − lo)` → piecewise-linear interpolation of the layer ramp (layers.json). The fitted `lo/hi` rule is in layers.json (`rangeFit`). In Compare, both maps use one range fitted to **both** datasets.

**Tap read-out** uses the same bicubic function at the tapped lat/lon (only if inside the outline). The place name is the nearest entry in `places-*.json` (squared-degree distance), shown as "Near <Place>".

## 3. The effect layer: shared rules

- Drawn in **screen space** each frame, using a mapping from region-fraction coordinates to screen pixels taken from the map projection of the bounds' corners: `x = x0 + fx·dx`, `y = y0 + fy·dy`, where `fy` is the Mercator fraction. Recompute the mapping every frame (cheap), so pan and zoom stay glued.
- **Clip to the region outline** every frame (path from the GeoJSON ring projected with the same mapping).
- **About 30 fps is enough** (the web build throttles to 32 ms). Pause entirely when the screen isn't visible, the app is backgrounded, a modal sheet covers the map, or Compare is in the all-16 view.
- **Reduced motion:** render one still frame (wind: pre-advect particles 40 steps and draw the trails once).
- **Night basemap:** effects use the night tints given below.
- Clear transient state (wind trails, particles) on pan/zoom start, layer change and region change.

## 4. The six effects

### Air temperature: colour field + flowing isotherms
- Field opacity 0.62.
- Contour lines by **marching squares** on the raster (step 2 cells), at levels every `0.5 °C` (span ≤ 6), `1 °C` (≤ 14) or `2 °C`. Levels that are multiples of 2×step are **major** (1.3 dp, white 62%); others are **minor** (1 dp, white 30%, dashed 3/4 dp with the dash offset drifting at −t/90 px for a slow flowing shimmer).
- Cache the segments per range/shift; they only change when data or range changes.

### Ground temperature: thermal dot matrix + scan line
- No colour field.
- Screen-space dot grid every 9 dp. For each dot inside the outline: `t` from the raster → colour from the ramp, alpha `0.55 + 0.45t`, radius `0.9 + 3.1t` dp. Cache the dot layer per view/range.
- A soft scan band moves down the region (`y = top + (time/26 ms mod (height + 160)) − 80`): an 80 dp vertical gradient, warm `rgb(250,214,150)` peaking at 16% alpha, additive ("lighter") blend, clipped to the outline.

### Rainfall: clouds (no falling rain)
- Field opacity 0.34 (the 30-day total in blue tones under the clouds).
- **Cloud veil:** a tileable fractal value-noise texture (256², 6 + 5 octaves, two seeds) sampled in region-fraction space so clouds stay attached to the map (`u = fx·scale·256`, `v = fy·scale·256·1.4`; scale 2.2 for Karnataka, 0.88 for Bengaluru). It drifts **downwind** at `speed 0.9 × mean wind × time`.
  - Density `den = cloud_cover/100 × 0.92`; threshold `th = 1 − den`; alpha = `smoothstep(th − 0.12, th + 0.19, n) × maxA × (0.4 + 0.6·den)`.
  - Shade = `clamp(0.72 + (n − th)·0.9 − wet·0.42, 0.38, 1)`, where `wet = clamp(rain30/max(60, hi))`: clouds darken where it has been wettest.
  - Day tint `rgb(250,251,253)`, maxA 0.92. Night tint `rgb(196,204,222)`, maxA 0.8.
  - Render at ⅓ resolution and upscale with smoothing (soft edges for free). A GPU shader (AGSL `RuntimeShader` on Android 13+, GLES fallback) is the natural fit.
- **Do not add rain streaks.** The owner removed them.

### Humidity: mist
- Field opacity 0.22. The same noise veil with `scale 1.3` (×0.4 for Bengaluru), `speed 0.35`, `soft 0.34`, maxA 0.55 (night 0.42), tint `rgb(214,232,240)` (night `rgb(150,175,195)`), density `clamp((RH − 35)/65)`.

### Wind: particles on the live vector field
- Field opacity 0.14.
- `u = −speed·sin(dir)`, `v = −speed·cos(dir)` (direction = where it blows **from**). Interpolate `u` and `v` separately (unmasked rasters).
- Particle count `clamp(dx·dy/380, 900, 2400)`, seeded at random inside the mask; lifetime 60–150 frames; respawn when out of the mask or expired.
- Step per frame: `fx += u·k/dx`, `fy −= v·k/dy`, with `k = 0.85·max(0.6, dx/900)` px per m/s.
- **Trails:** keep a persistent trail bitmap. Each frame multiply its alpha by 0.955 (destination-in), then draw this frame's segments (1.5 dp, round caps), coloured by speed in 7 buckets from the wind ramp (`ramp(0.3 + 0.7·bucket/7)`, alpha 0.95). Composite the trail bitmap, clipped to the outline.
- Clear trails on pan/zoom/layer change.

### PM2.5: haze + drifting particulates
- Field opacity 0.28. Veil `scale 3.2` (×0.4 for Bengaluru), `speed 0.25`, `soft 0.4`, maxA 0.5, warm tint `rgb(196,170,140)` (night `rgb(150,120,100)`), density `clamp(PM/max(20, hi)) × 0.85`.
- About 700 specks (2 dp squares) drifting at `0.06 × wind` plus a ±0.2 px random walk; alpha `(0.3 + 0.7t)·sin(π·age/life)`; colour `ramp(0.45 + 0.55t)`.

## 5. Legend copy (under the colour bar)

| Layer | Note |
|---|---|
| Air | "Colour: temperature · lines every 1 °C" (use the actual step) |
| Ground | "Dot size and colour: ground temperature" |
| Rain | "Clouds: live cover now, darker where the last 30 days were wettest" |
| Humidity | "Mist thickens as humidity rises" |
| Wind | "Streaks flow with the live wind, coloured by speed" |
| PM2.5 | "Haze and particles thicken with PM2.5, drifting on the wind" |

## 6. Timeline states (Simulate)

| Year | Read-out number | Map | Copy |
|---|---|---|---|
| 1980 … last year | Annual record (Bengaluru) | Live field + anomaly shift (mean layers); rainfall map unchanged | "<±x> vs the 2016–2025 average · <year> annual mean · ERA5"; rainfall: "<n> mm fell on Bengaluru in <year> · 2016–2025 average <m> mm · ERA5" |
| live year | Live (or tapped point) | Live | Source sentence + "Tap the map to read any point in <region>" |
| future | AR6 projection (air, ground) | Live field + warming delta | "<±x> vs the 2016–2025 average · <scenario> · IPCC AR6"; others: "No scenario projection for <layer>, only temperature layers are projected" |
| no record | "—" | Live | "No yearly record for <layer>; try air temperature, rainfall, humidity or wind" |

Scenario chips are enabled only when a projection applies (temperature layer and future year).

## 7. Compare specifics

- Two map instances, **pan/zoom synced** (guard against feedback loops; update the follower with no animation).
- Top map data per timeline year (doc 04 §3); bottom map is always live.
- A tap places the crosshair on both maps at the same lat/lon.
- The all-16 view draws **static** mini rasters (no basemap, no effects): the colour raster at full opacity scaled into a 168 dp-wide tile at the region aspect ratio, plus the outline stroke (1.6 px, white 85%).
