# Bengaluru From Orbit — Expo (iOS + Android)

React Native / Expo port of the mobile UI handoff **`bengaluru-from-orbit-app`**.

Do **not** invent UI. Sources of truth, in order:

1. `/Users/advik/Downloads/bengaluru-from-orbit-app/` — copied to `reference/bengaluru-from-orbit-app/` (`README`, `screens/*.dc.html`, `assets/`, `data/`)
2. `data/systems.json` — the 16-system catalogue from the handoff
3. `assets/app-handoff/` — `earth-clouds.jpg`, `earth-clear.jpg`
4. `/Users/advik/Downloads/android-handoff` — design tokens and IA clarity only (no Kotlin is built)

Phone design width is ~390. Tokens (`theme/tokens.ts`): bg `#050506`, text `#F2F2F2`, cyan `#7FE0F0`, amber `#E9A15A`, muted `#A0A0A8`.

## Navigation

Bottom tabs (5), custom `tabBar` = `components/BottomNav` (active tab = cyan icon in a cyan-tinted pill):

| Tab | Route | Handoff screen |
|---|---|---|
| Home | `app/(tabs)/index.tsx` | `Main.dc.html` |
| Systems | `app/(tabs)/systems.tsx` | `Systems.dc.html` |
| Simulate | `app/(tabs)/simulate.tsx` | `Simulate.dc.html` |
| Compare | `app/(tabs)/compare.tsx` | `Compare.dc.html` |
| Forecast | `app/(tabs)/forecast.tsx` | `Forecast.dc.html` |

Stack screens, pushed from Home (header back arrow):

| Route | Handoff screen |
|---|---|
| `app/layers.tsx` | `Layers.dc.html` |
| `app/data.tsx` | `Data.dc.html` |
| `app/pipeline.tsx` | `Pipeline.dc.html` |

Root `app/_layout.tsx` is a `Stack` with `(tabs)`, `layers`, `data`, `pipeline`. The header (`components/AppHeader`) shows the app mark + title + Sound OFF toggle, or a back arrow on pushed screens. The sound toggle is UI-only (no audio is bundled).

## Run

```bash
cd mobile
npm start          # Expo Go / simulator
npm run ios
npm run android
npx tsc --noEmit   # type-check
```

## Structure

```
app/            _layout (Stack) · layers · data · pipeline · (tabs)/ index systems simulate compare forecast
components/     AppHeader, BottomNav, Icons (handoff SVGs), ui (Screen + primitives), LiveHeatMap, Timeline, GlassPill (unused)
theme/tokens.ts colours, surfaces, fonts, em() / cssAngle() helpers
lib/            api, useApi, forecastLive (live) · layers, geo, systems, images, sound (static handoff data)
data/           systems.json, simgeo.json, cmpgeo.json, engine_all.json (from the handoff)
reference/      full handoff copy
```

## Live API

Screens call BhuVyom on `:8001` via `lib/api.ts` (Expo host → `http://<lan-ip>:8001`), cached by `lib/useApi.ts`.

| Screen | Endpoint | Used for |
|---|---|---|
| Home | `GET /api/site/summary` (`api.site()`) | Probe card readings; falls back to `systems.json` reference values, labelled **Reference** |
| Simulate | `GET /api/site/sim/live?region=ka\|blr` | `LiveHeatMap` + readout (Bengaluru = last grid value) |
| Simulate / Compare | `GET /api/site/sim/record` | Past-year readout and the Compare "past" pane / deltas |
| Compare | `sim/live` + `sim/record` + `site.compare` | Now pane, what-changed card, all-layers tiles, real-series chart |
| Forecast | `GET /api/prediction/forecast?var=T2M\|PRECTOTCORR&horizon_months=12` + `lib/forecastLive.ts` | Headline, chart, horizon-skill table, notes |

Start API: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8001`
Optional override: `EXPO_PUBLIC_API_URL=http://192.168.x.x:8001`

## Honesty rules

- Never fabricate numbers. `null` → "No record" / empty heat map.
- `surf` (land-surface temp) and `pm25` may be empty — the live engine returns null for them. Air and land-surface temperature are never mixed.
- Rain "change" is not computed (30-day live window vs annual record).
- Future-year temperature uses published IPCC AR6 central warming estimates (`lib/layers.ts`), only on temperature layers, and is labelled as not engine output.
- The map is the live grid cell-by-cell clipped to the handoff outline (no smoothing, no tiles); zoom is scale only.
