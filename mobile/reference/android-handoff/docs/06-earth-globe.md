# 06 · The Earth

The photoreal Earth is the brand. Two forms:

| Where | Form |
|---|---|
| Welcome (S1) | **Interactive**: ray-traced globe, drag to spin, slow auto-rotation, Bengaluru marker pulse, clouds drifting, star field |
| Forecast (S7), About, share cards | **Still renders**: `assets/earth/still-earth-clear.jpg` (temperature) and `still-earth-clouds.jpg` (rainfall), 1400 px, on black. Display them with a "lighten" or "screen" blend so the black background disappears into the page |

## Interactive renderer

The reference is `reference/web/js/earth-globe.js` + `reference/web/earth.frag` (GLSL ES 3.0). It ports almost directly to **OpenGL ES 3.0** on Android (a `GLSurfaceView`/`TextureView` with a full-screen triangle, or `AndroidExternalSurface` in Compose). **AGSL** (Android 13+) can't sample multiple textures with mip control as easily, so prefer GLES.

### How it works (keep this)
- **No sphere mesh.** One full-screen triangle; the fragment shader ray-traces a perfect sphere per pixel, giving a razor-sharp analytic edge at any density (`aa = clamp((1 − r)·R + 0.5, 0, 1)`).
- **Seamless longitude:** two UV parameterisations per pixel, sampled with explicit gradients.
- **Shading order:** day albedo (sRGB) × N·L with bump on land → cloud shadows (offset toward the sun) → ocean-only specular `pow(N·H,120)·1.6 + pow(N·H,18)·0.1` × ocean mask × (1 − cloud) → clouds `smoothstep(0.06, 0.85, c)` with soft wrap lighting → night city lights `(1, 0.66, 0.34) × lights^1.3 × 2.4`, dimmed by cloud → warm terminator band → Fresnel atmosphere to `(0.36, 0.56, 0.95)` + thin outer glow → Bengaluru marker (dot + 2.5 s expanding ring) in `(0.92, 0.63, 0.35)` → ACES tone map → gamma 2.2.
- **Star field pass:** hashed sparse stars (one per about 58 px cell at 10%, plus a faint 21 px layer at 2.5%), slow twinkle, pure black background.

### Parameters for the app

| Parameter | Value |
|---|---|
| Centre longitude at start | 1.3542 rad (Bengaluru, 77.59° E) − 0.06 for composition |
| Camera latitude tilt | 0.26 rad |
| Sun direction (view space) | (−0.52, 0.34, 0.78): front-lit from the upper left, terminator at the right edge |
| Auto-spin | 0.03 rad/s (one turn ≈ 3.5 min); off while dragging; **off under reduced motion** |
| Drag | horizontal drag rotates `lon −= dx / radius` with a little inertia (decay 0.92 per frame) |
| Marker | lat 0.2264, lon 1.3542 rad |
| Cloud drift | `t × 0.0008` in u |
| Fade-in | 1.8 s after the day and cloud textures are uploaded |
| Layout (phone) | radius ≈ 0.62 × screen width, centre x = 62%, globe rising from behind the title area (see mock-up S1) |

### Textures (in `assets/earth/`, equirectangular, −180° at the left edge)

| File | Size | Format |
|---|---|---|
| `earth_day_4k.jpg` | 4096 × 2048 | sRGB (`GL_SRGB8_ALPHA8`) |
| `earth_lights_4k.jpg` | 4096 × 2048 | single channel (`GL_R8`) |
| `earth_clouds_4k.jpg` | 4096 × 2048 | `GL_R8` (JPEG q65: fine at phone sizes) |
| `earth_ocean_4k.jpg` | 2048 × 1024 | `GL_R8` |
| `earth_bump_4k.jpg` | 2048 × 1024 | `GL_R8` |

The 8K originals are in the web project (`assets/textures/`) if a tablet build wants them. Use mipmaps plus anisotropic filtering where available. Decode off the main thread. Release the GL resources when Welcome closes. Budget: about 70 MB GPU at 4K with mipmaps. Use ETC2/ASTC compression if memory is tight.

**Fallback:** if GLES 3 is unavailable or the device is low-RAM, show `still-earth-clear.jpg`.

## Still renders

The two stills were rendered from the same shader, frozen (spin 0, centre 1.3542 − 0.06, tilt 0.26, sun (−0.52, 0.34, 0.78), marker on). "Clear" uses a black cloud texture. Re-render them the same way if you change the look; don't edit them in an image editor.
