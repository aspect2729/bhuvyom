# 03 · Screens

Mock-ups: `mockups/png/0N-*.png` (360 × 780 dp at 3×). Every screen draws edge-to-edge on black: content goes under the transparent status bar, and the bottom navigation sits above the gesture inset.

---

## S1 · Welcome (`01-welcome.png`). First launch only

**Purpose:** set the tone. Interactive Earth plus one call to action.

Layout, top to bottom:
1. Interactive Earth (doc 06), centred on India with the Bengaluru marker, upper half of the screen, partly off the right edge. Drag spins it, there's no auto-spin while dragging, and it fades in once the textures are on the GPU.
2. Eyebrow "NASA EARTH DATA" (`rgba(242,242,242,.8)`, 0.4 em).
3. displayHero "READ / THE CITY / FROM SPACE" (three lines).
4. A 56 × 2 dp amber rule.
5. Body: one sentence on what the app shows.
6. Primary button "Get started" → Today (shared-axis forward transition).
7. Footer row (Jura 10 sp, 0.24 em): "12.97° N · 77.59° E · ≈ 920 M · DRAG TO SPIN" (the last item in amber).

States: textures loading (black with the stars only; the button is usable immediately); reduced motion (still render instead of the live globe).

---

## S2 · Today (`02-today.png`)

**Purpose:** "what is it like right now at Bengaluru?"

1. App bar: logo + sound toggle (an equaliser glyph in amber that animates only while sound is on).
2. Eyebrow "BENGALURU · LIVE 13:45 IST" (time from the API's `current.time`).
3. metricXL in the spectrum gradient: city-centre air temperature.
4. Amber-dot place line "CITY CENTRE · AIR TEMPERATURE" plus the source sentence.
5. List of the other five live layers: swatch + label + value. Tapping a row opens Simulate on that layer (Bengaluru region) with a shared-element transition from the swatch to the layer button.
6. "Explore" list: Simulate / Compare / Forecast with 88 × 64 dp thumbnails.

Pull-to-refresh: refetches live data, respecting the cache (doc 04). Offline: values stay, and the eyebrow becomes "BENGALURU · AS OF 13:45 · OFFLINE".

---

## S3 · Simulate (`03-simulate.png`)

**Purpose:** the live map. The heart of the app.

- **Map:** full-bleed from under the status bar (draw a solid black status-bar band so the time stays readable; no gradient scrim) down to the sheet. It fits the region outline with padding. Pinch zoom, pan and double-tap zoom are allowed, with no on-screen zoom buttons. Min zoom 5 (Karnataka) or 8 (Bengaluru), max 12.
- **Overlays (glass):** top-left the layer button (opens S4); top-right the Day/Night icon toggle (sun / moon); below it, the region segmented toggle "Karnataka | Bengaluru".
- **Field and effect:** see doc 05. The outline is drawn on top in `#F2F2F2` at 85%, 1.2 dp, with the Bengaluru marker.
- **Read-out bottom sheet** (standard, non-modal, persistent; peek about 300 dp, expandable):
  - Peek: eyebrow (layer · LIVE hh:mm IST, or "· 1998 · RECORD", or "· 2050 · PROJECTION") → metricXL (gradient) → place line ("BENGALURU" or "NEAR MANGALURU · 12.87° N 74.84° E") → one sentence (source, or the honest note for record/projection/no-data) → timeline row → scenario chips.
  - Expanded: legend (ramp, min/max, effect note), the "System" context block (system name, description, variables as tags with the current layer highlighted), regional facts (≈70% monsoon share; 3,000 vs 600 mm Ghats rain divide; 1.4 cm/yr groundwater fall) and credits.
- **Tap to read:** tapping inside the outline places a small cyan crosshair ring and updates the read-out to the interpolated value there plus the nearest place name (`data/regions/places-*.json`). Tapping outside clears it, and so does tapping the same point again. Long-press shows a tooltip. Use a light haptic tick on placement.
- **Timeline:** see doc 05 §6 for the year logic. Play advances one year every 140 ms on the record and live parts and loops 1980 → 2100. Pause on interaction. Under reduced motion, play steps once every 400 ms with no particle motion.
- **Region switch** keeps the layer and year, refits the map with a 600 ms camera ease, and reloads that region's grid (cached per region).

States: loading (shimmer-free: a glass pill "Loading live data…" centred on the map); error ("Live data unavailable" + Retry chip); rate-limited ("Too many requests. Trying again in 15 s", auto-retry); offline (cached + "as of"); no record / no projection for a year (the read-out shows "—" and explains, while the map keeps the live field).

---

## S4 · Layer picker (`04-layer-sheet.png`). Approved design, copy exactly

A modal bottom sheet over a 62% black scrim. Title "MAP LAYER" (Jura 16 sp uppercase) with "6 LIVE LAYERS" label. Six rows (doc 02 "Layer sheet"). Selecting a row: light haptic, then the sheet closes (spring, no bounce) and the effect cross-fades (300 ms). Drag to dismiss is supported. Swatches come from `layers.json` ramps.

---

## S5 · Compare (`05-compare.png`)

**Purpose:** then against now, same place, same colour scale.

- App bar: title "THEN · NOW" ("THEN" in amber, "NOW" in cyan), a compact layer chip (opens S4) and an "All 16 systems" icon toggle (grid ↔ split).
- **Split (portrait):** two maps stacked vertically, each about 206 dp high, separated by a 4 dp black gap. Top is the left/"then" map; bottom is "now". Pan and zoom are **synchronised**. Each map has a glass map chip: "PAST · 15 Nov 2016 · 13:00", or "FUTURE · 2050 · Middle road", or "LIVE · Same as now"; and "NOW · Live · 13:45".
- **Landscape and large screens:** side-by-side (two columns) with the timeline bar spanning both, as in the web build (`reference/screenshots/web-compare-*.png`).
- Read-outs under the maps: two columns, "10 YEARS AGO" (amber label) and "NOW" (cyan), each in metricM–L, then the change sentence: "**1.2 °C cooler** than 10 years ago · Karnataka average", with the amount in amber. Its wording comes from the layer (warmer/cooler, wetter/drier, more humid/drier, windier/calmer, more polluted/cleaner).
- **Timeline bar** (glass, floating above the nav): the same controls as Simulate, but it moves the **top** map: 1980 → last year = that year on the same day and hour (ERA5 archive); the live year = same as now; later years = the live field + AR6 warming (temperature layers only; other layers show "No projection" on the top map). Play steps by **10 years** (each step is a network fetch; see the rate limits). Below the bar: preset chips "1 year · 5 · 10 · 20 · 40 years" (selected in amber) and a calendar chip that opens the Material date picker (range 1980-01-01 → today − 7 days).
- **Hover-equivalent:** tapping either map places the crosshair at the same lat/lon on both and shows both values.
- **"Every layer" table** (scroll below): layer | past | now | change, region averages. Missing cells say "No record" or "No projection".
- **Caveat line, always visible under the change sentence:** "One day against another shows weather as much as climate. Move the date to see how much it swings."
- **"Two temperatures, never mixed"** explainer card (air vs ground temperature) lives at the bottom of Compare.

---

## S6 · All 16 systems (`06-compare-all-16.png`). Opt-in, static

A 2-column grid (3 on tablets). Each tile shows its number and name, then:
- **Connected systems** (1 Temperature: Air/Ground chips; 2 Precipitation; 4 Atmosphere: Humidity/Wind chips; 11 Air quality): two mini maps (past | now) drawn as static rasters with the outline (no basemap, no animation), values "30.4 | 29.2 °C" and the change line.
- **Others:** "NOT CONNECTED YET" + "Needs <source>" (from `systems-16.json`). System 16 links to Forecast.

No animation, no live effects, so this view is cheap. Leaving it returns to the split view at the same time and layer.

---

## S7 · Forecast (`07-forecast.png`)

**Purpose:** the prediction engine, explained honestly.

1. App bar "FORECAST" + place chip (25 engine cells, named by the town inside each; the default is Bengaluru, 13.0° N 77.50° E).
2. Segmented toggle "Air temperature | Rainfall".
3. Still Earth (224 dp): `still-earth-clear.jpg` for temperature, `still-earth-clouds.jpg` for rainfall, cross-fading over 600 ms. No motion otherwise.
4. Eyebrow "NEXT MONTH · DECEMBER 2026" → metricXL (solid `#F2F2F2`, unit in cyan) → "80% range … · 95% range …" + a horizon sentence ("12 months after the forecast starts (December 2025). At this distance the engine falls back to the monthly average.").
5. Two secondary numbers: "All of 2026" (mean or total, ± vs the 1981–2025 average) and "Typical miss, 1 month ahead" (MAE, coverage).
6. **Chart** (`Canvas`): 2022–2026; observed (white 1.5 dp), forecast (cyan 2 dp with 2.6 dp dots), 80% band (cyan 26%), 95% band (cyan 12%), climatology (grey dashed), amber "NOW" line, "FORECAST →" divider, and ERA5 "actual 2026" amber dots once fetched. Scrub with your finger to read a month (tooltip + light haptic per month).
7. Reality check sentence ("8 of 10 finished months landed inside the 80% range…").
8. "How far ahead": 12 rows (months ahead · model · better-than-average bar · typical error · 80% hit rate).
9. "Beyond 12 months": the AR6 scenario table (air temperature only), clearly labelled "not computed by the prediction engine".
10. "How it works": data / models / limitations, in the engine's own words (`prediction-engine-results.json`).

Rainfall is shown as mm per month (the engine gives mm/day × days in the month).

---

## S8 · Systems (`08-systems.png`) and S9 · System detail (`09-system-detail.png`)

- **List:** 16 rows: number (Jura 11 sp faint), accent dot, name, a "LIVE" badge on connected systems, variable count, chevron. Search filters by system or variable name.
- **Detail:** back arrow, eyebrow "SYSTEM 06" in the accent, a "REFERENCE" outline badge (these values are reference figures, not live), title (Jura 26 sp), the reference probe value in the accent (Jura 22 sp), then the variable cards (doc 02). Connected systems also show an "Open on map" button that goes to Simulate with that layer.
- Cards enter with a short stagger (doc 07). There are **no press-glow or lift effects** (owner request).

---

## About & data sources

Reached from the Today app bar overflow. Sections: what the app is, data sources with links and licences (README credits), "How the numbers are made" (short versions of docs 04–05), the honesty rules, version and build. Plain list rows, black.

## Adaptive layout

- **Compact (< 600 dp):** as in the mock-ups.
- **Medium (600–840 dp, foldables, small tablets):** navigation rail instead of a bottom bar. The Simulate read-out moves into a right side panel (360 dp). Compare goes side by side.
- **Expanded (> 840 dp):** navigation rail. Simulate shows the map plus a 400 dp panel. Forecast uses two columns (numbers and Earth | chart). The 16-systems grid uses 4 columns.
- **Landscape phone:** Simulate is map-first with the read-out as a collapsible side sheet; Compare is side by side.
