# 08 · Architecture (guidance, not a mandate)

These are recommendations that fit the design and data. Choose differently if you have good reason, but keep the behaviour in docs 03–07.

## Stack

| Concern | Recommendation |
|---|---|
| Language / UI | Kotlin, Jetpack Compose, Material 3 (static dark scheme from doc 02, dynamic colour off) |
| Min / target SDK | min 26 (Android 8.0), target the current stable SDK. AGSL effects need 33+; provide a Canvas/GLES fallback |
| Navigation | Navigation-Compose with a type-safe route per tab; adaptive `NavigationSuiteScaffold` (bar on phones, rail on tablets) |
| State | MVVM + unidirectional data flow: `ViewModel` → `StateFlow<UiState>`; one immutable UiState per screen |
| DI | Hilt (or Koin) |
| Networking | Ktor client or Retrofit + OkHttp, kotlinx.serialization. One `OpenMeteoClient` that builds the URLs in doc 04 (unit-test them) |
| Caching | Room for the live grid, past days, the record and reality-check results (key + JSON + fetchedAt). OkHttp disk cache for tiles. DataStore for settings |
| Maps | MapLibre Native Android with raster sources; custom overlay views/composables for the field, effects, outline, marker and crosshair |
| Rendering effects | GPU where possible: AGSL `RuntimeShader` (33+) for veils; Compose `Canvas` / `drawWithCache` for isotherms, dots, particles; an offscreen `Bitmap` for wind trails |
| Earth | OpenGL ES 3.0 (`GLSurfaceView` in `AndroidView`, or `AndroidExternalSurface`) running the ported fragment shader |
| Images | Coil for the Earth stills and thumbnails |
| Concurrency | Coroutines; interpolation and raster building on `Dispatchers.Default`; never on the main thread |
| Testing | JUnit + Turbine (flows), Robolectric/Compose UI tests, Paparazzi or Roborazzi screenshot tests against the mock-ups, MockWebServer for API contracts |

## Suggested module layout

```
app/                    – activity, nav graph, theme wiring
core/designsystem/      – tokens → Compose theme (Color, Typography with bundled fonts, Shapes), reusable components (Chip, SegmentedToggle, GlassControl, LayerSheet, Readout, Timeline, ListRow, MapChip, Legend)
core/data/              – OpenMeteo client, repositories (Live, Past, Record, RealityCheck), Room cache, rate limiter
core/geo/               – regions (GeoJSON loader), grid builder, bicubic interpolation, mask, colour ramps, range fitting, AR6 interpolation
core/render/            – map overlays and the six effects, noise texture, particle systems
core/earth/             – GLES globe + still fallback
feature/today/  feature/simulate/  feature/compare/  feature/forecast/  feature/systems/  feature/about/
```

`core/geo` is pure Kotlin. Port the maths from `reference/web/js/simulation.js` (gridAt, buildRaster, buildMask, fitRanges, isolines, AR6 interp) and lock it with unit tests: raster values equal the grid values at grid points, the mask agrees with the GeoJSON, fitted ranges match the web build for the same inputs.

## Data flow (Simulate)

```
Region + Layer + Year (UI intent)
   → SimulateViewModel
       → LiveRepository.grid(region)            (cache 20 min; 429 back-off)
       → RecordRepository.annual()              (cache 1 yr)          [only for past years]
       → AR6.warming(year, scenario)            (bundled)             [only for future years]
   → derive: raster(layer), mask(region), range(layer), readout(point?), yearState
   → UiState → MapOverlay + Readout + Timeline composables
```
Effects consume the immutable raster(s) and the current map projection; they own only transient animation state.

## Performance budgets

| Item | Budget |
|---|---|
| Cold start to first frame | < 1.2 s (Earth may fade in later) |
| Live map visible from a warm cache | < 300 ms |
| Raster build (200 × 300 bicubic) | < 25 ms on a mid-range phone (Default dispatcher) |
| Effect frame | < 8 ms at 30 fps; drop to 20 fps on battery saver |
| Memory | < 300 MB total; Earth textures released when leaving Welcome |
| Battery | < 10% per 10 min with the Simulate effect running |
| APK | < 40 MB (4K Earth textures ≈ 6 MB; fonts ≈ 0.6 MB) |

## Offline and errors

- Show cached data immediately with an "as of hh:mm" stamp. Refresh in the background.
- No cache and no network: a calm full-screen message ("No connection. The map needs live data once to start."), with Retry.
- Rate limited (HTTP 429): auto-retry after 15 s (×2), and say so.
- Partial failure (for example PM2.5 down): only that layer shows "Unavailable".

## Privacy

There are no accounts and no analytics by default, and the app doesn't use location. If you add a "use my location" read-out later, it must be opt-in and coarse.

## Licensing notes

- Fonts: SIL OFL 1.1 (bundle the licence texts from `assets/fonts`).
- Open-Meteo: free for non-commercial use with attribution; a commercial release needs their paid plan.
- Esri World Imagery: check the terms before commercial use.
- NASA imagery: public domain (credit NASA).
- Boundaries: CC BY 2.5 IN (credit DataMeet / Election Commission of India via geoBoundaries).
