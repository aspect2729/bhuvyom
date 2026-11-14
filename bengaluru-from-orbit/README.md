# Bengaluru From Orbit — website handoff package

The homepage for the NASA Hackathon project: a photoreal rotating Earth hero (WebGL) over a black, starry sky, followed by six content sections in a cool-gradient theme. This folder holds **everything needed to rebuild the interface exactly**: a working reference build, the design source, every asset, its origin, the shader, the sound engine and screenshots of each section.

> **For a coding agent:** read this file, then `docs/DESIGN-SPEC.md`, `docs/EARTH-AND-SOUND.md` and `docs/ASSETS-AND-SOURCES.md`. `index.html` is the pixel reference. Match it; don't redesign it.

---

## 1. See it running (2 minutes)

WebGL refuses textures loaded from `file://`, so serve the folder:

```bash
cd bengaluru-from-orbit
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

You need a browser with **WebGL2** (Chrome, Edge, Firefox, Safari 15+). The Earth fades in once its textures (~16 MB) have loaded. Click **Sound off** to start the space ambience; browsers won't play audio until you click.

## 2. What's in the folder

```
index.html                  Working reference build (vanilla HTML/CSS/JS, no framework)
css/fonts.css               Self-hosted @font-face for Jura + Poppins
js/earth-globe.js           EarthGlobe class: WebGL2 renderer (drag to spin, pause off-screen)
js/earth-shader.js          The fragment shader as a JS string (generated)
js/space-ambience.js        SpaceAmbience class: generated space sound (Web Audio)
js/page.js                  Page wiring: globe layout, sound button, layer chips, heat grid, sliders
shaders/earth.frag          Same shader as a plain GLSL file, for reading or porting
assets/textures/            5 Earth textures used at runtime (8K/4K JPEG)
assets/textures/originals/  The full-resolution NASA source files they were made from
assets/fonts/               Jura (variable) + Poppins 300/400/500 — woff2 + ttf + OFL licences
assets/icons/               Every icon as SVG + where/how it is used
assets/reference/           The look-and-feel references: "Edge of Space" image + hero motion video and frames
design-source/              ThreeColor.dc.html — the original Claude Design canvas source (source of truth)
docs/DESIGN-SPEC.md         Tokens, typography, layout, every section and component, states, responsive rules
docs/EARTH-AND-SOUND.md     How the globe and the sound work, every parameter, porting notes
docs/ASSETS-AND-SOURCES.md  Every asset and data source with its URL, licence and credit line
screenshots/                Desktop (2x) and mobile (3x) captures of every section and interaction state
tools/render-static.mjs     Regenerates index.html + shader files from design-source/
tools/process_textures.py   Regenerates assets/textures/ from the NASA originals
```

## 3. How to build it for real

Recommended stack: **Vite + React (or Next.js) + TypeScript**. The project's map stack is **MapLibre GL JS + deck.gl** (see the project brief).

1. **Hero.** Port `js/earth-globe.js` as-is into a `<EarthHero>` component. Create it in `useEffect` on a `<canvas>` ref and call `destroy()` on unmount. Keep the shader unchanged. Serve textures from `/public/textures/`.
2. **Sound.** Wrap `js/space-ambience.js` in a hook (`useSpaceAmbience`). Only create the AudioContext inside the click handler.
3. **Sections.** Rebuild each section from `index.html` as components. The inline styles are the exact values; move them into CSS modules or Tailwind using the tokens in `docs/DESIGN-SPEC.md`.
4. **Fonts.** Use `assets/fonts` (self-hosted) or Google Fonts (`Jura:wght@300;400;500`, `Poppins:wght@300;400;500`).
5. **Data.** Everything labelled **SAMPLE** in the UI is placeholder data:
   - the heat-grid values
   - the chip readings
   - the monthly temperature chart
   - the urban-heat result

   Replace each with real values from the NASA pipeline (`docs/ASSETS-AND-SOURCES.md` §3). Keep the "Sample" badges until real data is wired in.
6. **Explorer.** The heat grid in "The Explorer" is a visual stand-in. In the product it becomes a MapLibre base map with a deck.gl `GridLayer`/`HeatmapLayer` (or a raster layer) over Bengaluru's bounding box. Keep the same chip bar, tooltip card and legend styling.

## 4. Don't change (these make the look)

- **Background:** pure black `#000` everywhere. Gradients go on elements only, never on the page background.
- **Fonts:** Jura Light (300) for headings, eyebrows and numbers, in capitals with wide tracking. Poppins for body text and UI.
- **Earth:** a ray-traced sphere, not a mesh; 8K textures; device-pixel-ratio rendering (capped at 2); sparse stars; amber Bengaluru pulse.
- **Navigation bar:** a floating glass pill with `backdrop-filter: blur(22px) saturate(170%)` and a dark gradient fill, so links stay readable over the globe.
- **Text call-to-action:** label, a 58 × 2 px amber underline, then an amber chevron. This comes from the "Edge of Space" reference.
- **Hero colours:** only black, `#F2F2F2` and amber `#E9A15A`. The sections below use the cool spectrum (`#7FE0F0 → #5B8CFF → #9A86B8`, plus amber `#E0905A`).

## 5. Known gaps to finish

- **Mobile navigation:** under ~760 px the nav links wrap inside the glass pill and push into the hero eyebrow (`screenshots/09-hero-mobile.png`). Collapse them into a menu button below 760 px. Keep the glass pill, the logo and the Sound button visible.
- **Placeholder models:** the urban-heat result uses a placeholder formula (`js/page.js`), only so the UI responds. "Rain runoff" and "Air flow" are illustrations; the models aren't built yet.
- **Unconfirmed data sources:** the data sources are candidates. Confirm them against the existing precipitation/temperature pipeline before showing them as final.
- **Anchor links:** "Get Started" and the nav links jump to sections on this page. Point them at the real explorer route when it exists.

## 6. Credits (must appear on the site)

Earth imagery: NASA Earth Observatory / NASA Visible Earth (Blue Marble Next Generation, Black Marble 2016, Blue Marble clouds). Fonts: Jura and Poppins, SIL Open Font License. Full list: `docs/ASSETS-AND-SOURCES.md`.
