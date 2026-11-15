# 01 · Product

## Purpose

Show, honestly and beautifully, what the atmosphere over Bengaluru and Karnataka is doing now, what it did on any day since 1980, and what it may do next. It's for curious citizens, students, journalists and the NASA Space Apps judges. They are not meteorologists, so every number needs plain words around it.

## Principles

1. **One primary thing per screen.** Usually a big number or a full-bleed map. Everything else supports it.
2. **Black space over boxes.** Content floats on pure black. Surfaces are rare and flat.
3. **Data honesty.** Every value has a source and a time. Missing data is said out loud. Projections are labelled as scenarios, never forecasts.
4. **Native feel.** Thumb-reachable controls, bottom sheets, haptics, fast. It must never feel like a scrolled web page.

## Navigation map

```
Launch ─► Welcome (first run only) ─► Today
Bottom navigation (always visible except full-screen modal sheets):
  Today      – live summary at Bengaluru; rows deep-link to Simulate with that layer
  Simulate   – full-screen map + read-out sheet + timeline
      └─ Layer picker (modal bottom sheet)
      └─ Point read-out (tap anywhere inside the outline)
  Compare    – split view (past | now) + change + layer table
      └─ All 16 systems (toggle in the app bar; static grid)
      └─ Date picker (Material date picker, 1980-01-01 → today−7 days)
  Forecast   – prediction engine: air temperature | rainfall, place picker
      └─ Horizon detail (bottom sheet: model chosen per horizon, error, coverage)
  Systems    – list of 16 ─► System detail (variables)
App bar overflow (on Today) ─► About & data sources · Settings (units of time display, sound, reduced motion respects system)
```

Back behaviour: system back (with predictive-back animation) closes sheets first, then returns to the previous tab's root, then exits. Each tab keeps its own back stack and scroll position.

## Feature scope (v1)

| Area | In v1 |
|---|---|
| Regions | Karnataka (state) and Bengaluru Urban district. The switch keeps the layer and the time |
| Live layers | Air temperature, ground temperature (0–7 cm soil), rainfall (last 30 days), relative humidity, wind speed and direction, PM2.5 |
| Time | Live; any past day 1980 → about 7 days ago (same hour as now); annual record 1980–2025 (Bengaluru point); 2027–2100 IPCC AR6 scenarios (temperature only) |
| Forecast | Bundled BhuVyom engine output (12 months from Dec 2025, 25 cells around Bengaluru); ERA5 reality check fetched live |
| Systems | 16 systems with variables and reference values (clearly marked "REFERENCE", not live) |
| Earth | Interactive photoreal Earth on Welcome; still renders on Forecast |
| Sound | Optional ambient space sound (see `reference/web/js/space-ambience.js`), off by default, toggle in the app bar |
| Offline | Last good data per region/layer is shown with an "as of" stamp |

## Out of scope (v1). Do not build

- Accounts, sign-in, push notifications, widgets (they're good v2 candidates: a home-screen widget with the Today number).
- A light theme.
- Any data source not listed in doc 04 (for example Supabase: its tables are not readable by the public key yet).
- 3D terrain view (discussed, not approved).
- Falling-rain animation.

## Key user flows

1. **"How hot is it right now, and where?"** Today shows 29.2 °C at Bengaluru. The user taps the air row, Simulate opens on Air temperature, and tapping the coast shows "Near Mangaluru · 31.4 °C".
2. **"Was it hotter 10 years ago?"** On Compare (preset 10 years), the top map shows 15 Nov 2016 and the bottom map shows live. The sentence reads "1.2 °C cooler than 10 years ago" with the caveat about weather versus climate.
3. **"What about 2050?"** On Simulate the user drags the timeline to 2050 and picks High emissions. The number becomes the projected value, labelled "2050 · projection · IPCC AR6", and non-temperature layers say "No projection".
4. **"Should I trust next month's forecast?"** Forecast shows December 2026 at 20.1 °C (80% range 19.3–21.6). The horizon list shows skill only up to 4 months, so the screen states that the forecast falls back to the monthly average.
