# Bengaluru From Orbit — mobile app UI handoff

A mobile app version of the URANUS website (`index.html`, `simulation.html`, `compare.html`, `predictions.html`). It has 8 screens and a bottom tab bar, and each website feature is its own screen.

Design canvas (live, clickable): https://claude.ai/artifact/GUNKmt5WDbQDBPtRJ1NNSL

## What's in this folder

| Path | What it is |
|---|---|
| `screens/*.dc.html` | One file per screen. The markup is the layout spec. The `<script data-dc-script>` block at the bottom holds that screen's state and logic (plain JS class, `renderVals()` returns what the template shows). |
| `screens/canvas.json` | Canvas layout and screen order (design tool file, not needed to build). |
| `assets/` | Earth globe images (900×900), from `assets/predictions/` on the site. |
| `data/systems.json` | All 16 systems, 144 variables (name, desc, source, unit, reference value). Copied from `ALL_16_SYSTEMS` in `index.html`. |
| `data/engine_all.json` | BhuVyom forecast engine output for 25 cells × 2 variables (T2M, PRECTOTCORR), 2022-01 → 2026-12, plus skill/error/coverage by horizon. Trimmed from `data/prediction/engine-results.js`. |
| `data/outlines.json` | Karnataka + Bengaluru Urban boundaries and town names `[lat, lon]`, from `data/outlines.js`. |
| `data/simgeo.json`, `data/cmpgeo.json` | Pre-projected outlines and sample map grids used by the mockup maps (see "Real vs sample"). |

The `.dc.html` files use a design-tool runtime (`support.js`), so they don't open standalone. Read them as the spec, or use the canvas link to click through.

## Navigation

- **Bottom tabs (5):** Home · Systems · Simulate · Compare · Forecast
- **Pushed from Home (back arrow, Home tab stays active):** Data layers · Data sources · Pipeline
- Header on every screen: app mark or back arrow, title, "Sound OFF" toggle.

## Screens

| # | File | Website source | Contents and interactions |
|---|---|---|---|
| 1 | `Main` | index.html hero | Hero "Read the city from space", globe, coordinate chips, Get started → Layers, 3 stat cards, 7 Explore tiles (one per section), Bengaluru probe card |
| 2 | `Layers` | index.html `#layers` | 7 primary layers, tap to select → detail card (system, source, unit), "View on the map", link card to 16 Systems |
| 3 | `Systems` | index.html `#systems` | List of 16 systems, tap one → detail (probe value, all variables with value/source/unit), prev/next, back to list |
| 4 | `Simulate` | simulation.html | Layer chips (6), Day/Night, Karnataka/Bengaluru, map with Bengaluru pin and town labels, legend, readout card, timeline 1980–2100 with play/pause, scenario picker (active only past 2026), system variables (current layer highlighted), 3 key facts, sources |
| 5 | `Compare` | compare.html | Split view / All 16 systems toggle, layer chips, region and basemap, past-date chips (1/5/10/20/40 yrs), Past vs Now maps, "What changed", legend, all-16 tiles (connected / not connected / forecast link), "Every layer" table, "Two temperatures" chart |
| 6 | `Forecast` | predictions.html | Air temp / Rainfall tabs, place picker (25 cells), next-month hero with 80/95 % ranges, 2026 total/average, typical error, 5-year chart (observed, forecast, ranges, climatology), skill-by-horizon table, SSP scenarios 2030/2050/2100, how it works + findings and limitations |
| 7 | `Data` | index.html `#data` | NASA POWER / MODIS / GPM cards (expand to show variables), "Also in the app" list, honest-data note |
| 8 | `Pipeline` | index.html `#how` + CTA | 5-step stepper (tap to expand), "Edge of the city" CTA, footer |

## Design tokens (taken from the website CSS)

- Background `#050506`, surfaces `rgba(255,255,255,0.03–0.05)` with a 1px border `rgba(255,255,255,0.08–0.12)`
- Text `#F2F2F2` · secondary `#C9C9CE` · muted `#A0A0A8` · faint `#8A8A92` (all pass 4.5:1 on the background)
- Accent cyan `#7FE0F0` (live / selected), accent amber `#E9A15A` (simulation / forecast / warming), blue `#5B8CFF` (gradient tints)
- Type: **Jura** (300 display, uppercase, 0.05em tracking; small labels 11–12px, 0.2–0.28em tracking) and **Poppins** (body 12–15px)
- Radii: cards 18–24px, pills 999px, segmented controls 14–18px. Touch targets 44px or more. Width 390.
- Colour ramps for each layer are in the `LAYERS` array of `Simulate.dc.html` / `Compare.dc.html`. They are identical to `js/compare.js` on the site.

## Real vs sample data

- **Real:** everything on Forecast (engine file), the 16 systems catalogue, the boundaries, the IPCC AR6 scenario numbers, the source and cadence details.
- **Sample (wire to live APIs when building):** the map colour fields and readouts on Simulate and Compare, and the Compare past/now values. The website gets these from Open-Meteo (ECMWF/GFS live, ERA5 archive, CAMS PM2.5). See `js/simulation.js` and `js/compare.js` for the exact endpoints and the 99-point grid.
- Rules to keep from the site: never mix air temperature with land surface temperature, show "No record" instead of 0, and apply warming scenarios to temperature layers only.

## Suggested build notes

- Each `renderVals()` maps directly to a screen component's state and derived props. The handlers (`pick`, `setKa`, `togglePlay`…) are the interactions.
- Maps: the mockup uses blurred grid cells clipped to the state outline. In the app, use a real map (MapLibre / Leaflet, as the site does) with a raster overlay.
