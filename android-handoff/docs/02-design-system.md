# 02 · Design system

Exact values are in `design-tokens/tokens.json`. This document explains how to use them and how they map to Android (Material 3).

## 1. Character

Black, quiet, precise. Like looking at Earth from the edge of space: deep black, one bright subject, thin white lines, cool cyan light, one warm amber spark (Bengaluru). Text is sparse and plain-spoken.

## 2. Colour

| Role | Token | Hex | Notes |
|---|---|---|---|
| Background | `background` | `#000000` | Every screen. Status bar and navigation bar are also black |
| Surface | `surface` | `#050506` | Bottom sheets, cards, tiles |
| Raised surface | `surfaceRaised` | `#08080A` | Variable cards (System detail) |
| Glass | `glass` | `rgba(5,5,6,.82)` | Controls floating over maps. Use a 12 dp blur on Android 12+ (`RenderEffect`), else solid `#0B0B0D` |
| Primary text | `onBackground` | `#F2F2F2` | Big numbers, titles |
| Secondary text | `onSurfaceVariant` | `#C9C9CE` | Inactive controls |
| Body | `body` | `#B4B4BC` | Paragraphs |
| Muted | `muted` | `#A0A0A8` | Captions, labels (4.5:1 on black) |
| Faint | `faint` | `#6E6E76` | Credits, axis ticks, ≥ 11 sp only |
| Hairline | `outline` | white 7% | Dividers |
| Control border | `outlineStrong` | white 16% | Chips, glass controls, map frame |
| Accent (now / primary) | `cyan` | `#7FE0F0` | Eyebrows, selected states, primary buttons, "NOW" |
| Accent (Bengaluru / past / change) | `amber` | `#E9A15A` | Bengaluru marker, "PAST", deltas, warnings |
| Spectrum | `blue` `mauve` | `#5B8CFF` `#9A86B8` | Only inside the spectrum gradient |

**Gradient rule:** the spectrum `#7FE0F0 → #5B8CFF → #9A86B8` is allowed only on (1) the big read-out number on Simulate, (2) the timeline fill, (3) the selected segment of segmented toggles (`#7FE0F0 → #5B8CFF`, text black). The owner explicitly rejected "gradientism and neonism" elsewhere.

**System accents (16 Systems):** one solid colour per system, in `data/systems-16.json` (`accents[n][0]`). Use it for the dot, eyebrow, top line on cards, unit chip text with a 12% fill, and the value text. Never a gradient, never a glow.

**Layer colour ramps:** in `design-tokens/layers.json`. They're used for map fields, legends, the swatch in the layer picker and the Today row icons.

**Material 3 mapping (dark scheme, static, dynamic colour OFF):**
`primary=#7FE0F0, onPrimary=#000000, secondary=#E9A15A, onSecondary=#000000, background=#000000, surface=#050506, surfaceContainer*=#050506, surfaceVariant=#08080A, onSurface=#F2F2F2, onSurfaceVariant=#C9C9CE, outline=white16%, outlineVariant=white7%, error=#E9A15A` (amber is used for warnings; there is no red in the theme). Disable tonal elevation (`surfaceTint` = surface colour).

## 3. Typography

Bundle both families (`assets/fonts`). **Jura** (variable; use weights 300 and 400) is for display, numbers and labels. **Poppins** (300/400/500) is for reading text and controls.

| Style | Font | Size / line | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| displayHero | Jura | 44 sp / 1.0 | 300 | 0.05 em | UPPERCASE. Welcome title |
| headline | Jura | 30 sp / 1.08 | 300 | 0.04 em | Screen and section titles. Uppercase for top-level titles |
| metricXL | Jura | 72 sp / 0.95 | 300 | 0.01 em | The one big number per screen. Tabular figures. Unit at 26 sp |
| metricL | Jura | 44 sp | 300 | — | Secondary numbers |
| metricM | Jura | 28 sp | 300 | — | Table and tile values |
| eyebrow | Jura | 12 sp | 400 | 0.30 em | UPPERCASE, cyan (amber for "past") |
| label | Jura | 11 sp | 400 | 0.20 em | UPPERCASE, muted |
| titleM | Poppins | 16 sp / 1.35 | 500 | 0 | List titles, card titles |
| body | Poppins | 15 sp / 1.65 | 400 | 0 | Paragraphs, colour `body` |
| bodySmall | Poppins | 13 sp / 1.6 | 400 | 0 | Secondary paragraphs |
| caption | Poppins | 11 sp / 1.55 | 400 | 0 | Credits, footnotes |
| button | Poppins | 14 sp | 500 | 0 | |
| chip | Poppins | 13 sp | 400 | 0 | 500 when selected |
| navLabel | Poppins | 12 sp | 500 | 0 | |

Use Compose `TextStyle(letterSpacing = x.em)` and `fontFeatureSettings = "tnum"` for metrics. Support font scaling to 200%: big numbers may shrink to fit one line (`autoSize` down to 44 sp) but never wrap mid-number.

## 4. Space, shape, size

- **4 dp grid.** Screen edge padding 20 dp. Section gaps 40 dp (56 dp before major sections). List rows are 56 dp min height with 1 dp hairlines between them.
- **Radii:** chips and pills 18 dp, glass controls 24–26 dp, cards 20 dp, tiles 16 dp, mini maps 12 dp, bottom sheets 28 dp (top corners), map edges 0 (maps are full-bleed or sharp-edged).
- **Touch targets** ≥ 48 dp. Glass icon buttons are 44 dp visible in a 48 dp hit box.
- **Sizes:** navigation bar 72 dp + gesture inset; top app bar 60–64 dp; chip height 36 dp; primary button 52 dp; timeline row 44 dp.

## 5. Components

| Component | Spec |
|---|---|
| **Top app bar** | Transparent black, no elevation. Title in Jura 17–20 sp uppercase (letter-spacing 0.1 em); the Today screen uses the logo "BENGALURU FROM ORBIT" (Jura 13 sp, 0.22 em) followed by a 5 dp amber dot. Actions are bare icon buttons in `#C9C9CE` |
| **Bottom navigation** | Material 3 `NavigationBar` on black, top hairline. 5 items with outline icons (22 dp) and labels. Selected: icon and label cyan, indicator pill 56×30 dp with cyan at 16% |
| **Primary button** | 52 dp pill, fill cyan, text black Poppins 500, trailing chevron. One per screen at most |
| **Text button / link** | Poppins 500 `#F2F2F2` with a 2 dp amber underline 44 dp long under the label. The underline grows to full width on press |
| **Chip** | 36 dp pill, 1 dp `outlineStrong`, text `#C9C9CE`. Selected: cyan fill, black text. "Past" presets select in amber |
| **Segmented toggle** | Glass pill (4 dp inner padding) holding 36 dp segments. Selected segment uses the `toggleActive` gradient with black text |
| **Glass control** | `glass` fill, 1 dp `outlineStrong`, radius 24–26 dp. Used for every control floating over a map |
| **Layer button** | Glass, 52 dp: swatch (24 dp) + "LAYER" label (Jura 9 sp cyan, 0.28 em) over the layer name (Poppins 500 14 sp) + chevron. Opens the layer sheet |
| **Layer sheet** (approved) | Modal bottom sheet. Rows have a 30 dp conic swatch, name (Poppins 15 sp), unit (Jura 12 sp, right) and source (Poppins 11 sp, faint). Selected row: cyan 16% → 3% horizontal tint, 2 dp ring around the swatch, unit in cyan |
| **Read-out** | Eyebrow ("AIR TEMPERATURE · LIVE 13:45 IST") → metricXL number → amber-dot place line (Jura 12 sp, 0.18 em) → one muted sentence |
| **Timeline** | Play button (44 dp outline circle), year (Jura 24 sp), 2 dp track (white 12%), spectrum fill up to the thumb, 10 dp amber tick at the live year, 16 dp thumb (black fill, 2 dp white ring), labels "1980 · RECORD / LIVE / 2050 / 2100" (Jura 9–11 sp). Scenario chips below are disabled (35% alpha) unless the year is after the live year |
| **List row** | 56 dp, hairline top. Leading swatch or dot, label (Poppins 14 sp `#C9C9CE`), trailing value (Jura 20 sp) with unit (12 sp muted) |
| **Variable card** (System detail) | `surfaceRaised`, radius 18 dp, 1 dp border in the accent at 16%. A 2 dp accent line along the top (inset 18 dp), title, unit chip, description, then source and value on a hairline footer. No press glow, no lift |
| **Map chip** | Small glass pill on maps ("PAST · 15 Nov 2016 · 13:00"). Label word in Jura 10 sp 0.26 em: amber for past, cyan for now, amber "FUTURE" for scenarios |
| **Legend** | Label (Poppins 12 sp) over a 4 dp bar of the ramp, min and max in Jura 12 sp, then a one-line note on what the effect shows |
| **Empty / missing state** | Jura 11 sp label ("NOT CONNECTED YET", "NO RECORD", "NO PROJECTION") + one sentence on why and what would fix it |

## 6. Iconography

Thin outline icons (1.8 dp stroke, round caps), 20–22 dp, in `#C9C9CE` (cyan when selected). See `assets/icons/` for the layer icons and `mockups/screens.html` for the nav icons (Today = planet, Simulate = layers, Compare = split square, Forecast = trend arrow, Systems = 2×2 grid). Material Symbols *Outlined* at weight 300 are an acceptable substitute when an icon is missing.

## 7. Imagery

- **Earth:** natural colours only, never tinted. Interactive on Welcome; still renders in `assets/earth/still-earth-*.jpg` elsewhere.
- **Maps:** Esri World Imagery (Day), NASA Black Marble (Night). Field overlays are drawn at their documented opacity (layers.json `fieldOpacity`).
- **Bengaluru marker:** 12 dp amber dot with a slow pulse ring (amber 25% → 0). It's static under reduced motion.
