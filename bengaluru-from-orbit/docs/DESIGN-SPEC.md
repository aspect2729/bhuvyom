# Design spec — Bengaluru From Orbit

`index.html` holds the exact markup and inline styles. This document lists the system behind them so it can be rebuilt in any framework without guesswork. Screenshots for each section are in `/screenshots`. Desktop captures are at 1440 px wide (2x); mobile captures are at 390 px (3x).

## 1. Tokens

### Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | Page background everywhere (never a gradient) |
| `--surface` | `#050506` | Cards |
| `--surface-2` | `#040405` | Explorer frame |
| `--text` | `#F2F2F2` | Primary text |
| `--text-2` | `#C9C9CE` | Secondary text, inactive chips |
| `--text-3` | `#B4B4BC` | Body copy in sections |
| `--text-4` | `#A0A0A8` | Captions, labels (passes 4.5:1 on black) |
| `--line` | `rgba(255,255,255,0.07–0.09)` | Card borders, dividers |
| `--line-strong` | `rgba(255,255,255,0.14)` | Inactive chip border |
| `--amber` | `#E9A15A` | Hero accent, CTA underline + chevron, "SAMPLE" badges, Bengaluru marker |
| `--amber-deep` | `#D9783F` | (V1 CTA underline end) |
| `--cyan` | `#7FE0F0` | Section eyebrows, gradient start |
| `--blue` | `#5B8CFF` | Gradient middle |
| `--mauve` | `#9A86B8` | Gradient end |
| `--teal` | `#5FC4D8` | Secondary gradients |
| `--orange` | `#E0905A` | Warm gradient end (surface temperature) |

**Hero palette (strict three colours):** `#000000`, `#F2F2F2`, `#E9A15A`. White at reduced opacity is allowed (e.g. `rgba(242,242,242,0.78)`). The Earth itself keeps its natural colours.

### Gradients (on elements only)

| Name | CSS | Where |
|---|---|---|
| Spectrum | `linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8)` | Slider fill, simulation result text, explorer tooltip border |
| Chip active | `linear-gradient(90deg,#7FE0F0,#5B8CFF)` | Selected layer chip (text turns `#000`) |
| Gradient border | `background: linear-gradient(<fill>,<fill>) padding-box, <gradient> border-box; border:1px solid transparent` | Tooltip card, data-source cards |
| Layer icon discs (in order) | `#7FE0F0→#5B8CFF`, `#9A86B8→#E0905A`, `#5FC4D8→#2F6BFF`, `#A9E8F5→#9A86B8`, `#C8D6FF→#5FC4D8`, `#F4C27C→#E0905A`, `#DDE6F2→#8EA2C0`, `#3A3A42→#1A1A1F` (all 135deg) | Layer cards |
| Source cards | POWER `#7FE0F0→#5B8CFF`, MODIS `#9A86B8→#E0905A`, IMERG `#5FC4D8→#2F6BFF` (135deg) | Data-source card borders |
| Pipeline rule | `linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8,#E0905A)` (2 px) | How it works |

Heat-map ramps (one per chip, from `js/page.js`):
- **Air temperature:** `rgb(24,40,90) → rgb(91,140,255) 30% → rgb(127,224,240) 60% → rgb(224,144,90) 85% → rgb(244,194,124)`
- **Land surface:** `rgb(40,30,70) → rgb(154,134,184) 35% → rgb(224,144,90) 70% → rgb(250,214,150)`
- **Precipitation:** `rgb(6,12,24) → rgb(47,107,255) 40% → rgb(127,224,240) 80% → rgb(230,250,255)`
- **Humidity:** `rgb(20,20,40) → rgb(95,196,216) 50% → rgb(200,214,255)`
- **Wind:** `rgb(20,16,40) → rgb(154,134,184) 50% → rgb(169,232,245)`

### Typography

| Role | Font | Size | Weight | Tracking | Case |
|---|---|---|---|---|---|
| Hero title | Jura | `clamp(52px, 8vw, 116px)`, line-height 0.98 | 300 | 0.05em | UPPER |
| Section title | Jura | `clamp(40px, 5.2vw, 72px)` (64px max in Compare/Data/How), lh 1 | 300 | 0.05em | UPPER |
| CTA title | Jura | `clamp(48px, 7.5vw, 112px)`, lh 1 | 300 | 0.06em | UPPER |
| Eyebrow | Jura | 14px | 400 | 0.36em (hero 0.4em) | UPPER |
| Card title (sim/source) | Jura | 24px | 400 | 0.06em | UPPER |
| Logo | Jura | 15px | 400 | 0.22em | UPPER |
| Hero coordinates row | Jura | 13px | 400 | 0.24em | UPPER |
| Body | Poppins | 15px, lh 1.7–1.75 | 400 | 0 | Sentence |
| Card body | Poppins | 13px, lh 1.6–1.65 | 400 | 0 | Sentence |
| Card heading | Poppins | 17px | 500 | 0 | Sentence |
| CTA label | Poppins | 16px | 500 | 0 | Title |
| Nav / buttons | Poppins | 13px (chips 12px) | 400 | 0 | Title |
| Caption / badge | Poppins | 10–12px | 400 | 0.06–0.1em on badges | — |

Use `text-wrap: pretty` on paragraphs.

### Spacing, radius, layout

- Container: `max-width: 1320px; margin: 0 auto; padding: 0 32px`.
- Section rhythm: Layers `140px` top / `120px` bottom; other sections `60px` top / `120px` bottom; CTA `140px` / `80px`.
- Gaps: grids `20px`; header block to grid `56–64px`.
- Radii: cards 24px, explorer frame 28px, tooltip/legend 16px, chips 18px (pill), nav pill 34px, buttons 22px (44px tall), stat chips 16px.
- Responsive grids: `repeat(auto-fit, minmax(min(280px, 100%), 1fr))`. Minimums: layers 280px, simulations 360px, compare 420px, sources 300px, steps 200px.
- Touch targets: at least 44px.

## 2. Sections (top to bottom)

### 0 · Navigation (floating glass pill)
- **Position:** `position:absolute; top:18px; left/right 0; padding:0 20px; z-index:3`. The inner bar has `max-width:1320px; min-height:68px; border-radius:34px; padding:10px 12px 10px 28px`.
- **Glass:**
  - Background: `linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(14,16,20,0.48) 40%, rgba(6,7,10,0.64) 100%)`
  - Blur: `backdrop-filter: blur(22px) saturate(170%)`, plus the `-webkit-` prefix
  - Border: `1px solid rgba(255,255,255,0.16)`
  - Shadow: `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.05), 0 10px 40px rgba(0,0,0,0.45)`
- **Left:** "BENGALURU FROM ORBIT" (Jura 15, 0.22em) and a 6px amber dot.
- **Centre:** links Layers · Explorer · Simulations · Data (13px, `#F2F2F2`, padding 12×14).
- **Right:** the Sound button.
  - Size and shape: 44px tall, radius 22, `rgba(255,255,255,0.06)` fill, `rgba(255,255,255,0.18)` border.
  - Equaliser: four amber 2×14px bars that animate (`eqA/eqB/eqC`, scaleY, 1.1s) only while sound is on.
  - Label: "Sound off" / "Sound on", with `aria-pressed` and `aria-label` updated to match.
- **Mobile (to build):** below 760px, collapse the links into a menu button (see README §5).

### 1 · Hero (960px tall)
- **Canvas:** the WebGL canvas fills the hero (`width:100%; height:960px`, `cursor:grab`, `touch-action:pan-y`). See `docs/EARTH-AND-SOUND.md`.
- **Copy:** left column, `max-width:560px`, `padding-top:220px`. The copy layer has `pointer-events:none` so the globe can be dragged through it; the CTA turns pointer events back on.
  - Eyebrow: "NASA EARTH DATA" (`rgba(242,242,242,0.8)`)
  - H1: "READ / THE CITY / FROM SPACE"
  - A 72×2px amber rule, 34px below the title
  - Paragraph (max 440px, `rgba(242,242,242,0.78)`): "Temperature, rainfall, humidity and wind over Bengaluru — from NASA satellites and models, on one map you can explore and simulate."
  - CTA "Get Started": a 58×2px amber underline under the label, an amber chevron, and a 14px gap
- **Bottom row** (40px from bottom, Jura 13, 0.24em): `12.97° N` · `77.59° E` · `≈ 920 M` · `DRAG TO SPIN` (the last one in amber).

### 2 · Data layers — "SEVEN SIGNALS. ONE MAP."
- Eyebrow "DATA LAYERS" in `#7FE0F0`, with an intro paragraph on the right.
- **Grid of 8 cards** (`#050506`, border `rgba(255,255,255,0.08)`, radius 24, padding 28, min-height 220). Each card has:
  - a 48px gradient disc with a black stroke icon
  - the name (17/500) and a note (13px)
  - a footer separated by a hairline: source on the left, unit on the right in Jura
- **Cards in order:** Air temperature (NASA POWER · T2M, °C), Land surface temperature (MODIS · MOD11A2, °C), Precipitation (GPM IMERG, mm), Relative humidity (NASA POWER · RH2M, %), Wind speed (NASA POWER · WS2M, m/s), Solar radiation (NASA POWER · ALLSKY, kWh/m²), Cloud cover (NASA POWER · CLOUD_AMT, %), Your next layer (Coming next, —).

### 3 · The Explorer — "READ THE HEAT, STREET BY STREET"
- **Frame:** radius 28, `#040405` fill.
- **Toolbar:** 5 chips (Air temperature · Land surface · Precipitation · Humidity · Wind). Active chip uses the cyan→blue gradient fill with black text; inactive chips are transparent with a `rgba(255,255,255,0.14)` border. On the right: "Oct 2026 · Monthly mean" and an amber-outlined **SAMPLE** badge.
- **Heat grid:** 24 × 13 square cells, gap 3, radius 4. Cell colour comes from the active chip's ramp; alpha fades to 0.05 outside the city ellipse.
- **Tooltip card:** at 46% / 30%, gradient border. Shows "SHIVAJINAGAR", "12.99° N · 77.60° E", then the active layer's label and value.
- **Legend:** bottom-left, black 85% fill, radius 16. Shows the layer label, an 8px ramp bar and min/max values.
- **States:** clicking a chip recolours the cells and updates the tooltip, legend and `aria-pressed` (see `screenshots/03b-*`).
- **Production:** replace the grid with MapLibre + deck.gl over Bengaluru's bbox and keep this frame, toolbar, tooltip and legend.

### 4 · Simulations — "ASK THE CITY “WHAT IF?”"
Three cards: radius 24, padding 30, each with a "SAMPLE" badge.
- **Urban heat:** three range sliders — Tree canopy cover, Cool roofs, Built-up growth.
  - Track: 4px `#16161A` with a Spectrum-gradient fill.
  - Thumb: 16px black disc with a 2px `#F2F2F2` ring.
  - The real `<input type=range>` is overlaid at opacity 0 (keyboard-accessible, with a `<label for>`).
  - Result: "Mean surface temperature change" in Jura 40px with gradient-clipped text (default "−1.3 °C").
- **Rain runoff:** text plus an inline SVG illustration (rain lines, flow curves, two lake ellipses). Footer: "Storm input · GPM IMERG rainfall".
- **Air flow:** text plus an inline SVG of streamlines with a dashed amber circle. Footer: "Wind input · NASA POWER · WS2M".

### 5 · Honest data — "TWO TEMPERATURES. NEVER MIXED."
- Two columns: explanatory copy on the left, chart card on the right.
- **Chart (SVG 560×240):**
  - Air temperature: a line with a `#5B8CFF→#7FE0F0` gradient.
  - Land surface: a line with a `#9A86B8→#E0905A` gradient, plus an area fill from mauve at 25% opacity down to 0.
  - Axes and labels: month initials J–D; "SAMPLE VALUES" tag.
- **Sample series (°C):**
  - Air: 22, 24, 26, 27, 26, 24, 23, 23, 23, 23, 22, 21
  - Land surface: 30, 33, 36, 37, 34, 29, 27, 27, 28, 28, 27, 28

### 6 · Data sources — "BUILT ON NASA"
- Three gradient-bordered cards, each with name, description, Cadence and Resolution: NASA POWER (Daily · monthly, 0.5° × 0.625°), MODIS · MOD11A2 (8-day composite, 1 km), GPM IMERG (30 minutes, 0.1°).
- Caption: "Candidate sources — to be confirmed against the project’s existing data pipeline."

### 7 · How it works — "FROM ORBIT TO STREET"
- A 2px pipeline gradient rule, then 5 steps (01 Retrieve, 02 Process, 03 Visualise, 04 Simulate, 05 Validate).
- Step numbers in Jura cyan; title 17/500; body 13px.

### 8 · CTA + footer — "EDGE / OF THE / CITY"
- **Planet rim:** CSS only, top-right and partly off-canvas, a 640px circle.
  - `radial-gradient(circle at 342px 298px, #000 0 304px, rgba(0,0,0,.55) 311px, transparent 320px)` over `conic-gradient(from 0deg, #000 0deg, #E0905A 80deg, #9A86B8 125deg, #5FC4D8 175deg, #DDF3F7 215deg, #5B8CFF 250deg, #1B2240 285deg, #000 320deg)`
  - Finished with `blur(0.6px)`.
- Copy line and the "Get Started" CTA.
- **Footer:** top hairline, three items — project name, imagery credit, footer nav.

## 3. Interaction summary

| Element | Behaviour |
|---|---|
| Earth | Auto-rotates west→east (0.03 rad/s × spin). Drag horizontally to spin. Fades in when textures are ready. Pauses off-screen. |
| Sound button | First click builds the audio graph and fades in over ~2s. Second click fades out over ~1s. Updates label, `aria-pressed` and the equaliser animation. |
| Layer chips | Single-select. Recolour the grid, update tooltip, legend and min/max. |
| Sliders | Update fill, thumb and value label live (`input` event), and recompute the result (placeholder formula). |
| Nav / CTA links | Smooth-scroll to section ids `#layers #explorer #simulations #data #how`. |

## 4. Accessibility checklist (already in the reference)
- Real `<button>`, `<a href>` and `<input type=range>` + `<label>` elements. Icon-only or ambiguous controls have `aria-label`.
- The canvas has `role="img"` and a descriptive `aria-label`. Decorative SVGs are `aria-hidden`.
- Section `aria-labelledby` points at each section's heading.
- Contrast: body copy is `#B4B4BC` or brighter on black. Captions are `#A0A0A8` (≥4.5:1).
- To add in production: respect `prefers-reduced-motion` (set spin to 0 and stop the equaliser animation).
