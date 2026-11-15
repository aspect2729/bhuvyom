# 07 · Motion and haptics

The web build uses **Lenis** (smooth scrolling) and **GSAP** (eased reveals and staggers). On Android, don't import web libraries; recreate the *feel* with native tools. Native scrolling already has physics. The goal is calm, eased motion that never gets in the way.

## Curves and durations (tokens.json → `motion`)

| Token | Value | Use |
|---|---|---|
| `easeOut` | cubic-bezier(0.215, 0.61, 0.355, 1) (GSAP power3.out) | Everything that enters |
| `easeInOut` | cubic-bezier(0.45, 0, 0.55, 1) (power2.inOut) | Things that move from A to B (camera, crossfades, the pipeline line) |
| `durationTap` | 120 ms | Press feedback |
| `durationControl` | 200 ms | Chips, toggles, selected states |
| `durationEnter` | 450 ms | Content rising in |
| `durationScreen` | 350 ms | Tab and screen transitions |
| `durationCrossfade` | 600 ms | Earth stills, layer effect swap, basemap swap |
| `staggerItem` | 60 ms | List and card entrances |
| `enterOffsetDp` | 24 dp | Rise distance for entrances |

## Patterns

| Moment | Motion |
|---|---|
| App launch → Welcome | Nav and logo fade down 16 dp (450 ms); title lines rise in with a 90 ms stagger; the Earth fades in once its textures are ready |
| Tab switch | Material **fade-through** (350 ms). Each tab keeps its state |
| Today row → Simulate | Container transform / shared element: the row's swatch morphs into the layer button's swatch |
| Opening a sheet | Standard Material sheet spring (no bounce, damping ratio 1). The scrim fades to 62% |
| Content entering on scroll | **Once only**, as an item first becomes visible: `alpha 0 → 1`, `translationY 24 dp → 0`, 450 ms easeOut, 60 ms stagger within a group. Never re-animate when scrolling back |
| Big number change (layer/year/tap) | Fade and slide the old value up 8 dp out, new value up in (200 ms). Optionally count digits (200 ms) for the same unit only |
| Timeline drag | The number updates live; the effect updates at most every 100 ms; fetches debounce 280 ms after the thumb settles |
| Region switch | Map camera eases to the new bounds (600 ms easeInOut) while the effect fades out and back in |
| Day ↔ Night | Basemap cross-fade 600 ms |
| Earth stills (Forecast) | Cross-fade 600 ms |
| Pipeline line / progress lines | Draw left → right (scaleX 0 → 1), 1.2 s easeInOut, once |
| Predictive back | Use the system predictive-back animation for screens and sheets |

**Never animate:** map views themselves (no transforms), table rows on data refresh, or anything while the user is dragging.

## Ambient motion (always optional)

- Map effects (drift, particles, scan line, dashed isotherm flow) run at about 30 fps only while visible.
- Bengaluru marker pulse: 2.4 s loop (ring 3 → 9 dp, amber 30% → 0).
- Interactive Earth: slow spin, cloud drift, star twinkle.
- **Reduced motion** (`Settings.Global.ANIMATOR_DURATION_SCALE == 0` / "Remove animations"): no ambient loops, no entrance animations, instant transitions. Effects render one still frame. Earth uses the still render or spin 0.

## Haptics (`HapticFeedbackConstants` / Compose `LocalHapticFeedback`)

| Event | Feedback |
|---|---|
| Selecting a layer, region, toggle or chip | `CLOCK_TICK` / `SEGMENT_TICK` (light) |
| Timeline thumb crossing a decade, or the live year | `SEGMENT_FREQUENT_TICK` at decades, `CONFIRM` when it snaps to LIVE |
| Placing the tap crosshair | `CLOCK_TICK` |
| Chart scrub crossing a month (Forecast) | `SEGMENT_FREQUENT_TICK` |
| Pull-to-refresh trigger | `GESTURE_THRESHOLD_ACTIVATE` |
| Error (load failed) | `REJECT` (Android 11+), otherwise none |

Respect the system "touch feedback" setting. No haptics during play animation.

## Sound (optional, off by default)

The ambient space sound is fully synthesised (see `reference/web/js/space-ambience.js` and the parameter list in `reference/web/EARTH-AND-SOUND.md`):
- brown noise → low-pass 260 Hz
- band-passed white noise at 2.2 kHz, swept by a 0.045 Hz LFO
- four detuned sines at 55 / 82.4 / 110.2 / 164.8 Hz, low-passed at 500 Hz, with a slow swell

Recreate it with `AudioTrack` (or Oboe), or record a 2–5 minute seamless loop from the web build and play it with `MediaPlayer` (simpler). Fade in about 2 s, fade out 0.3 s. Pause when the app is backgrounded and duck for other audio (audio focus). The equaliser glyph animates only while the sound is on.
