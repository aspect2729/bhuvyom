# Bengaluru From Orbit — Android app handoff package

Everything a coding agent needs to build the **native Android app** version of *Bengaluru From Orbit* (the URANUS web project). It must keep the web build's exact look but behave like an Android app, not a web page.

This package holds **guidelines, specs, tokens, data contracts, assets and visual mock-ups. It is not app code.** The `reference/web/` folder contains the working web implementation, so you can check *behaviour* there. Don't port it line by line; build natively.

> **Coding agent: start with [`AGENT-BRIEF.md`](AGENT-BRIEF.md).** It gives the order to read things in, the build milestones and the rules you must not break.

---

## What the app is

A dark, quiet, data-honest window onto Bengaluru and Karnataka from orbit:

| Tab | What it does |
|---|---|
| **Today** | Live conditions at Bengaluru: one big number plus every live layer as a calm list |
| **Simulate** | Full-screen live map of Karnataka or Bengaluru with six weather layers. Each layer has its own visual effect (contours, thermal dots, clouds, mist, wind particles, haze). A 1980–2100 timeline runs from the record, through live, into IPCC warming scenarios |
| **Compare** | Then against now: a day in the past beside live conditions, split view, one shared colour scale. Optional static "all 16 systems" grid |
| **Forecast** | 12-month forecasts from the BhuVyom prediction engine, with ranges, skill by horizon and a still Earth that follows the tab |
| **Systems** | The 16 environmental systems and their variables, each with its own solid accent colour |

All live numbers come from real, free, public data (Open-Meteo / ECMWF / ERA5 / Copernicus CAMS, NASA GIBS, NASA POWER via the BhuVyom engine). **The app never invents a value.** Missing data is shown as missing.

## Package map

```
README.md                 ← you are here
AGENT-BRIEF.md            ← copy-paste brief for the coding agent (read order, milestones, rules)
docs/
  01-product.md           ← scope, navigation map, user flows, what's out of scope
  02-design-system.md     ← colour, type, spacing, shape, components, Android (Material 3) mapping
  03-screens.md           ← every screen: layout, components, states, interactions
  04-data-and-apis.md     ← every endpoint with exact parameters, grids, caching, rate limits, honesty rules
  05-map-and-layers.md    ← map stack, boundary clipping, interpolation, the six layer effects (with algorithms)
  06-earth-globe.md       ← the photoreal Earth: shader port to OpenGL ES / AGSL, textures, still renders
  07-motion-and-haptics.md← motion system (native equivalents of the web's Lenis/GSAP), haptics, reduced motion
  08-architecture.md      ← recommended stack and structure (guidance, not mandates), performance budgets
  09-accessibility-and-qa.md ← accessibility rules and the acceptance checklist
design-tokens/
  tokens.json             ← machine-readable colours, type scale, spacing, radii, sizes, motion
  layers.json             ← the six live layers: labels, units, ramps, sources, effect specs
data/
  regions/                ← Karnataka + Bengaluru Urban boundaries (GeoJSON), place names for read-outs
  systems-16.json         ← the 16 systems, their variables and accent colours
  ar6-warming.json        ← IPCC AR6 scenario table used for 2027–2100
  prediction-engine-results.json ← BhuVyom prediction-engine output (forecast + ranges + validation)
assets/
  fonts/                  ← Jura (variable) + Poppins 300/400/500 TTF, with OFL licences
  icons/                  ← layer and UI icons (SVG) + README
  earth/                  ← 4K Earth textures (day, lights, clouds, ocean mask, bump) + 2 still renders
  app-icon/               ← adaptive launcher icon: foreground, background, monochrome (SVG) + preview
mockups/
  screens.html            ← source of the mock-ups (static HTML; open in a browser)
  png/                    ← 9 Android screens at 1080 × 2340 (360 × 780 dp @3x) + 00-overview.png
reference/
  web/                    ← the working web implementation (JS/CSS/shader) for behaviour reference
  screenshots/            ← screenshots of the web build: every layer effect, compare, forecast
```

## Non-negotiables (summary; full list in AGENT-BRIEF.md)

1. **Dark only.** Pure black `#000000` background on every screen. No light theme.
2. **Native Android, not a web page:** bottom navigation, bottom sheets, full-bleed maps, edge-to-edge, gesture navigation, predictive back, haptics. No WebView screens.
3. **Flat and quiet.** No drop shadows, no glow, no hover/press glow. The spectrum gradient appears only on the big map read-out number, the timeline fill and the active toggle segment.
4. **Real data only.** Every number traces to a source in `docs/04-data-and-apis.md`. If data is missing, say so ("No record", "No projection", "Not connected yet").
5. **The layer picker (swatch list) is an owner-approved design.** Copy it exactly (mock-up S4).
6. **Maps open on the Day basemap.** Night is one tap away.
7. **Rainfall shows clouds, not falling rain streaks** (removed at the owner's request).

## Credits that must ship in the app (About screen)

NASA Blue Marble, Black Marble (VIIRS) and cloud imagery · NASA GIBS · NASA POWER (via the BhuVyom prediction engine) · Open-Meteo (ECMWF IFS, NCEP GFS, ERA5 / ERA5-Land reanalysis, Copernicus CAMS) · Esri World Imagery (Esri, Maxar, Earthstar Geographics) · geoBoundaries / DataMeet / Election Commission of India (CC BY 2.5 IN) · IPCC AR6 WGI · Jura and Poppins fonts (SIL OFL 1.1).
