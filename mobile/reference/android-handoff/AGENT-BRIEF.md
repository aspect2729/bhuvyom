# Brief for the coding agent

You are building the **Android app** of *Bengaluru From Orbit*: a dark, data-honest view of Bengaluru and Karnataka from orbit. A complete web version exists. Your job is to turn it into a native Android app that **looks exactly like the web theme but feels like an Android app.**

Everything you need is in this package. Read it in this order:

1. `mockups/png/00-overview.png`, then each `mockups/png/0N-*.png`. This is what you are building.
2. `docs/01-product.md`: scope, navigation, flows.
3. `docs/02-design-system.md` + `design-tokens/tokens.json`: build the theme first.
4. `docs/03-screens.md`: every screen, state and interaction.
5. `docs/04-data-and-apis.md`: every API call, exactly.
6. `docs/05-map-and-layers.md` + `design-tokens/layers.json`: the map and the six layer effects.
7. `docs/06-earth-globe.md`: the Earth.
8. `docs/07-motion-and-haptics.md`, `docs/08-architecture.md`, `docs/09-accessibility-and-qa.md`.
9. `reference/web/`: when a behaviour is unclear, the web code is the source of truth for **behaviour**, never for structure.

## Hard rules (do not break)

1. **Dark only.** Background `#000000` everywhere, never a gradient. No light theme, no dynamic colour (Material You must not recolour the app).
2. **Native, not web.** Kotlin + Jetpack Compose (recommended). Use a bottom navigation bar, bottom sheets, full-bleed maps, edge-to-edge drawing, gesture navigation, predictive back and haptics. **No WebView** for app screens.
3. **The theme is exact.** Use the colours, fonts (Jura + Poppins, bundled) and sizes in `tokens.json`. Big numbers are Jura Light with tabular figures.
4. **Flat and quiet.** No shadows, no elevation tint, no glow, no ripple glow on cards. Separate things with black space and 1 dp hairlines. Material ripples are allowed, but tint them `#F2F2F2` at low alpha.
5. **Gradients only in three places:** the big read-out number on the map screen, the timeline fill, and the selected segment of segmented toggles. Everywhere else, use solid colours.
6. **Real data only.** Never fabricate, interpolate *across time*, or pad missing values. Show "No record", "No projection" or "Not connected yet" plainly. Label sources.
7. **Layer picker = owner-approved design** (mock-up S4: round conic swatch per layer, name, unit, source line, selected row tinted with a ring). Copy it exactly.
8. **Maps open on Day.** Night is a toggle.
9. **Rainfall layer = clouds only.** No falling rain streaks.
10. **Respect reduced motion** (system "Remove animations"): no particles moving, no drifting clouds, no staggered entrances. Show still frames instead.
11. **Mind the free API limits** (Open-Meteo about 600 weighted calls a minute, 10,000 a day). Cache aggressively (rules in `04-data-and-apis.md`). Past days never change, so store them permanently.

## Milestones (build and verify in this order)

| # | Milestone | Done when |
|---|---|---|
| M1 | **Theme and shell.** Fonts, colour/type/shape tokens, edge-to-edge, 5-tab bottom navigation, empty screens, About screen with credits | App opens on black with the nav bar matching the mock-ups. Tabs switch with the motion in doc 07 |
| M2 | **Data layer.** Open-Meteo live grid for both regions, ERA5 archive (record + past day), air quality, caching, rate-limit backoff, offline states | Unit tests prove the request URLs match doc 04 exactly. Cache hits make no network call |
| M3 | **Interpolation and boundaries.** Regular-grid bicubic interpolation, boundary mask, colour ramps, fitted ranges | Golden test: raster values at the grid points equal the inputs; the mask matches the GeoJSON |
| M4 | **Simulate screen.** Map (Day/Night basemaps), outline, colour field, read-out sheet, layer picker, region switch, tap-to-read | Matches mock-ups S3/S4. Tapping a point shows the interpolated value and the nearest place |
| M5 | **Layer effects.** Isotherms, thermal dots and scan, clouds, mist, wind particles, haze and particulates (doc 05) | 30–60 fps on a mid-range phone, under 10% battery per 10 minutes on screen. Pauses when not visible |
| M6 | **Timeline.** 1980–2025 record (ERA5 annual), live, 2027–2100 AR6 scenarios (temperature only), play | Honest labels in every state. Scenarios only active after the live year |
| M7 | **Compare.** Vertical split (past on top), synced pan/zoom, shared scale, timeline moves the top map, presets, change sentence, layer table, opt-in static all-16 grid | Matches S5/S6. Unavailable data is labelled, never blank |
| M8 | **Forecast.** Engine output (bundled JSON), chart with 80/95% bands, horizon-skill list, ERA5 reality check, scenario table, still Earth per tab | Matches S7. Numbers equal the JSON exactly |
| M9 | **Today + Systems + Earth.** Today list, 16-system list and detail, interactive Earth on Welcome (drag to spin) | Matches S1/S2/S8/S9 |
| M10 | **Polish and QA.** Motion, haptics, accessibility, performance, offline, the acceptance checklist in doc 09 | Every checklist item passes |

## Definition of done

- Every screen matches its mock-up at 360 dp and scales to 412 dp phones and to tablets (doc 03, "Adaptive layout").
- Every visible number has a source, a timestamp or "as of", and a missing-data state.
- The app works offline with cached data and says so ("Showing data from 13:45, offline").
- TalkBack reads every number with its unit and context.
- No shadows, no glow, no light surfaces, no web views.

When something is genuinely ambiguous, prefer **less**: less decoration, fewer words, more black space. If a decision changes what the user sees, ask the owner rather than guessing.
