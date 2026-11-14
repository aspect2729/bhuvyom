# Icons

All icons are hand-drawn inline SVG in the design (no icon library). Stroke icons use `currentColor`.

| File | Used in | Rendering in the design |
|---|---|---|
| layer-*.svg | "Seven signals" layer cards | 22 px, stroke **#000**, width 1.8, centred in a 48 px gradient circle (gradients listed in docs/DESIGN-SPEC.md) |
| chevron-right-cta.svg | Every "Get Started" / "Open" text CTA | 12 px, stroke #E9A15A, width 2 |

Other drawn elements (inline SVG, see index.html):
- Sound button equaliser: four 2×14 px bars, background #E9A15A, CSS keyframes `eqA/eqB/eqC` (scaleY) at 1.1 s when sound is on.
- Rain-runoff and air-flow illustrations in the Simulations cards: inline SVG with gradient strokes (ids `rg1`, `rg2`, `wg`).
- Two-temperature chart: inline SVG, paths generated from monthly sample values (gradients `gA`, `gL`, `gLf`).
- CTA planet rim: pure CSS (radial-gradient mask over a conic-gradient), no image.
