# Reference: the working web build

Use these files to answer **"how exactly does it behave?"**. Don't use them to decide how to structure the Android code: build natively, as described in `docs/`.

| File | What it shows |
|---|---|
| `web/js/simulation.js` | Simulate: regions and grids, the live/record/AR6 data calls, bicubic interpolation, mask, fitted ranges, the six layer effects (`EFFECTS` section), timeline logic (`yearState`), the swatch layer menu |
| `web/js/compare.js` | Compare: synced split maps, past-day archive calls, AR6 projection side, the timeline driving the left/top map, change sentence, layer table, all-16 static grid, caching and 429 back-off |
| `web/js/predictions.js` | Forecast: reading the engine JSON, chart, horizon table, ERA5 reality check, scenario table, still Earth per tab |
| `web/js/motion.js` | Motion intent (Lenis + GSAP on the web): curves, durations, what animates and what never does |
| `web/js/earth-globe.js`, `web/earth.frag`, `web/js/earth-shader.js` | The ray-traced Earth (port to OpenGL ES 3.0) |
| `web/js/space-ambience.js`, `web/EARTH-AND-SOUND.md` | The synthesised ambient sound and the full Earth parameter list |
| `web/css/*.css` | Exact web styling (spacing, glass controls, timeline, layer sheet, tables) |
| `web/data/engine-results.js` | The engine output as loaded by the web build (same content as `data/prediction-engine-results.json`) |
| `screenshots/web-*.png` | Every effect and screen as shipped on the web (desktop). Use them for the *character* of each effect |

Known web issue **not** to copy: on Simulate, record years shift the map by *annual mean − instantaneous live value*. The app should shift by the **anomaly** against the 2016–2025 mean (`docs/04-data-and-apis.md` §4).
