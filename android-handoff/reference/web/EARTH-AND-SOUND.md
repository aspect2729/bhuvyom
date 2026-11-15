# The Earth and the space sound

## Earth renderer (`js/earth-globe.js` + `shaders/earth.frag`)

### Why it looks sharp
- **No sphere mesh.** A single full-screen triangle is drawn, and the fragment shader ray-traces a perfect sphere per pixel. The silhouette has no polygon facets at any size, and the edge is anti-aliased analytically (`aa = clamp((1-r)*R + 0.5, 0, 1)`).
- **Native pixel density.** The canvas backing store is `cssSize × min(devicePixelRatio, 2)`.
- **8K maps** with trilinear mipmaps and up to 16× anisotropic filtering. At 1440 px CSS width on a retina screen this is roughly one texel per screen pixel.
- **No seam:** longitude wraps without a seam line by choosing between two UV parameterisations per pixel (`uvA`/`uvB`) and sampling with `textureGrad`.

### Render passes (per frame)
1. **Stars** (`uMode = 0`, full canvas, opaque): a hashed grid with one bright star per ~58 px cell at 10% probability, and a fainter layer on a 21 px grid at 2.5%. Slow twinkle, warm/cool tint. Background stays pure black.
2. **Globe** (`uMode = 1`, scissored to the globe's box, premultiplied alpha blend `ONE, ONE_MINUS_SRC_ALPHA`). Shading order:
   1. day albedo (sRGB texture, linear in hardware) × N·L with bump-mapped normal on land
   2. cloud shadows (clouds sampled slightly offset toward the sun)
   3. ocean-only specular glint: `pow(N·H,120)*1.6 + pow(N·H,18)*0.1`, × ocean mask × no-cloud
   4. clouds: coverage `smoothstep(0.06,0.85,c)`, lit with a soft wrap
   5. city lights on the night side: `(1,0.66,0.34) * lights^1.3 * 2.4`, dimmed under cloud
   6. a warm band at the terminator
   7. atmosphere: Fresnel blend toward `uAtm` near the limb and a thin outer glow (alpha 0, additive)
   8. Bengaluru marker: a dot plus an expanding ring every 2.5 s plus a fixed ring, coloured `uMarkCol`
   9. ACES tone map, then gamma 2.2

### Parameters used in the final page (`js/page.js`)

| Parameter | Value | Meaning |
|---|---|---|
| Hero height | 960 px | Canvas height and clip bottom |
| Radius (desktop) | `min(0.37 × width, 580)` px | 533 px at 1440 wide |
| Centre (desktop) | x = 74% of width, y = 500 px | Globe sits right, cropped by the right edge |
| Radius / centre (< 900 px) | `max(200, 0.62 × width)`; x = 62%, y = 960 − 0.55R | Rises from the bottom on phones |
| `lat` | 0.24 rad | Camera looks from ~14° N |
| `startLon` | 1.3542 + 0.5 rad | Starts just east of India, India rotates into view |
| `spin` | 1 → 0.03 rad/s | One revolution ≈ 3.5 min |
| `sun` (view space) | (−0.72, 0.32, 0.62) | Lit from the upper left; night side and city lights on the right |
| `atmosphere` | (0.36, 0.56, 0.95) | Limb / glow colour (linear RGB) |
| `markerColor` | (0.92, 0.63, 0.35) | Amber pulse on Bengaluru |
| Marker position | lat 0.2264, lon 1.3542 rad | 12.97° N, 77.59° E |
| Cloud drift | `t × 0.0008` in u | Clouds slide slowly over the ground |
| Fade-in | 1.8 s after day + cloud maps are on the GPU | Black disc with glow until then |

### Textures (all equirectangular, −180° at the left edge, north at the top)

| File | Size | GPU format | Role |
|---|---|---|---|
| `earth_day_8k.jpg` | 8192×4096 | `SRGB8_ALPHA8` | Surface colour |
| `earth_lights_8k.jpg` | 8192×4096 | `R8` | City lights (base removed) |
| `earth_clouds_8k.jpg` | 8192×4096 | `R8` | Cloud coverage |
| `earth_ocean_mask_4k.jpg` | 4096×2048 | `R8` | 1 = water (specular), 0 = land (bump) |
| `earth_bump_4k.jpg` | 4096×2048 | `R8` | Elevation for relief shading |

**Memory:** the textures use about 290 MB of GPU memory with mipmaps. On GPUs whose `MAX_TEXTURE_SIZE` is below 8192, textures are downscaled automatically.

### Porting notes
- **React:** create in `useEffect(() => { const g = new EarthGlobe(ref.current, opts); return () => g.destroy(); }, [])`. Keep `opts.layout` stable.
- **three.js / R3F:** possible, but it loses the analytic edge unless you use a high-segment sphere and MSAA. If you go that way, keep the same shading terms and texture set.
- **Hosting:** textures must be same-origin or served with CORS (`img.crossOrigin = 'anonymous'` is set).
- **Low-end devices:** consider 4K variants (resize the same files) when `navigator.deviceMemory < 4` or on small screens.
- **Reduced motion:** honour `prefers-reduced-motion: reduce` with `spin: 0`.

## Space ambience (`js/space-ambience.js`)

Everything is synthesised live with the Web Audio API; there are no audio files.

```
brown noise (14 s stereo loop) → low-pass 260 Hz → gain 0.55 ─┐
white noise (8 s stereo loop) → band-pass 2.2 kHz Q0.45 → 0.016┤
     ↑ LFO 0.045 Hz × 900 Hz on the band-pass frequency       ├→ master gain → compressor → speakers
sines 55 / 82.41 / 110.2 / 164.8 Hz (detuned ±4–5 cents,      │
     gains 0.5, 0.25, 0.167, 0.125) → low-pass 500 Hz → 0.05 ─┘
     ↑ 0.07 Hz swell (±0.025) on the drone gain
```

- **Loops:** noise loops are cross-faded for 0.5 s at the seam, so they never click.
- **On:** `master → 0.9` with a 0.8 s time constant (about 2 s to full volume).
- **Off:** `master → 0` with a 0.3 s time constant.
- **Autoplay:** browsers block audio before a user gesture, so build the graph inside the click handler. The UI starts in "Sound off".
- **Swapping in a recording:** to use a recorded ambience instead, play it through the same master gain. Any royalty-free 2–5 minute loop works; NASA's sound library is public domain: https://www.nasa.gov/audio-and-ringtones/.
