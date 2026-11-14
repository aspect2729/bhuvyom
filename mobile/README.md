# Bengaluru From Orbit — Expo (iOS + Android)

Pixel-faithful mobile port of `bengaluru-from-orbit 3` design export.

## Devices

| Target | Design frame in export | Notes |
|---|---|---|
| **iPhone 16 Pro** | 402 × 874 pt, safe 50 / 18 | Primary. Screenshots: `mobile-m-*-iphone16pro-*` |
| **Samsung S25** | *not in export* | Use fluid 360–440 width + live `safe-area` insets. Closest frames: Small Android 360×780, Pixel 8 412×915 |

Do **not** invent UI. Source of truth:

1. `/Users/advik/Downloads/bengaluru-from-orbit 3/design-source/mobile/Mobile*.dc.html`
2. `reference/m-home.html`, `m-lab.html`, `m-future.html`
3. `docs/pages/mobile.md` + `docs/DESIGN-SPEC.md`
4. Screenshots under `screenshots/mobile-*`

## Run

```bash
cd mobile
npm start          # Expo Go / simulator
npm run ios
npm run android
```

## Structure

```
app/(tabs)/     index (Home) · lab · future
components/     TopBar, GlassPill, TabIcons, CtaLink
theme/tokens.ts exact colours / glass / device refs
lib/            useDeviceLayout (screenH, safe*, compact)
```

## Hire-agent work remaining

- Finish Home sections (layers swipe, explorer 16×18, honest data, sources, how-it-works, CTA) from MobileHome.dc.html
- Finish Lab (levers sheet, results 2×2, chart, behind-the-lab) from MobileSimulationLab.dc.html
- Finish Future (drivers, metrics 2-col, trajectory, chains) from MobileFutureEarth.dc.html
- Port WebGL Earth (`lib/earth-globe.js` + 4K textures) via `expo-gl` / native GL
