# Every asset and source

Every file this interface uses is listed below with where it came from, how it was made and how to credit it. Nothing on the page is loaded from a third-party server at runtime: fonts, textures and icons are all local.

## 1. Earth imagery

| Shipped file | Made from (in `assets/textures/originals/`) | Official source page | Direct file (official) | Mirror actually downloaded | Licence / credit |
|---|---|---|---|---|---|
| `earth_day_8k.jpg` | `world.topo.bathy.200412.3x21600x10800.jpg` — Blue Marble Next Generation, December 2004, topography + bathymetry, 21600×10800 | https://visibleearth.nasa.gov/images/73909/december-blue-marble-next-generation-w-topography-and-bathymetry | https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg | https://raw.githubusercontent.com/stdcout1/airline3d/master/airports/world.topo.bathy.200412.3x21600x10800.jpg | NASA imagery, free to use. Credit: "NASA Earth Observatory — Reto Stöckli, Blue Marble Next Generation" |
| `earth_lights_8k.jpg` | `BlackMarble_2016_3km.jpg` — Earth at Night, Black Marble 2016 colour map, 13500×6750 | https://earthobservatory.nasa.gov/features/NightLights/page3.php (also https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps) | https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg | https://media.githubusercontent.com/media/SnowingFox/space-engine/main/assets-src/raw/nasa/BlackMarble_2016_3km.jpg | NASA, free to use. Credit: "NASA Earth Observatory — Black Marble 2016 (Suomi NPP VIIRS)" |
| `earth_clouds_8k.jpg` | `cloud_combined_8192.png` — Blue Marble cloud composite, 8192×4096 | https://visibleearth.nasa.gov/images/57747/blue-marble-clouds | https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif | https://media.githubusercontent.com/media/Prograda/Skybolt/master/Assets/Globe/Environment/Cloud/cloud_combined_8192.png | NASA, free to use. Credit: "NASA Visible Earth — Blue Marble clouds (MODIS)" |
| `earth_ocean_mask_4k.jpg` | `earth_bump_roughness_clouds_4096.jpg` (green channel = roughness/land) | three.js example textures | — | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_bump_roughness_clouds_4096.jpg | Distributed in the three.js repository (MIT); NASA-derived |
| `earth_bump_4k.jpg` | same file, red channel = elevation | same | — | same | same |

How each file was processed: `tools/process_textures.py`. Why 8K: `docs/EARTH-AND-SOUND.md`.

**Credit line used in the footer:** "Earth imagery: NASA Blue Marble, Black Marble and cloud composite".

## 2. Fonts

| Font | Files | Source | Licence |
|---|---|---|---|
| Jura (variable, 300–700; design uses 300/400/500) | `assets/fonts/Jura-Variable.woff2`, `.ttf` | https://fonts.google.com/specimen/Jura — file from https://github.com/google/fonts/tree/main/ofl/jura | SIL OFL 1.1 (`OFL-Jura.txt`) |
| Poppins 300 / 400 / 500 | `assets/fonts/Poppins-{Light,Regular,Medium}.woff2`, `.ttf` | https://fonts.google.com/specimen/Poppins — files from https://github.com/google/fonts/tree/main/ofl/poppins | SIL OFL 1.1 (`OFL-Poppins.txt`) |

The woff2 files were converted from the ttf files with fontTools (no subsetting).

## 3. Data sources (what the product will load; the page shows sample values today)

| Layer | Dataset | Variable | Where to get it | Notes |
|---|---|---|---|---|
| Air temperature (2 m) | NASA POWER | `T2M` | https://power.larc.nasa.gov/ · API: https://power.larc.nasa.gov/docs/services/api/ | Daily/monthly; ~0.5° × 0.625° (MERRA-2) |
| Relative humidity (2 m) | NASA POWER | `RH2M` | same | |
| Wind speed (2 m) | NASA POWER | `WS2M` | same | |
| Solar radiation | NASA POWER | `ALLSKY_SFC_SW_DWN` | same | kWh/m²/day (CERES) |
| Cloud cover | NASA POWER | `CLOUD_AMT` | same | % |
| Precipitation | GPM IMERG (or POWER `PRECTOTCORR`) | precipitation rate | https://gpm.nasa.gov/data/imerg · GES DISC: https://disc.gsfc.nasa.gov/ | 30-min, 0.1°; needs an Earthdata login |
| Land surface temperature | MODIS Terra MOD11A2 v061 | `LST_Day_1km`, `LST_Night_1km` | https://lpdaac.usgs.gov/products/mod11a2v061/ · AppEEARS: https://appeears.earthdatacloud.nasa.gov/ | 8-day, 1 km, Kelvin × 0.02 scale factor; needs an Earthdata login |

**Status:** these are **candidates**. The project's existing precipitation pipeline (endpoint, dataset ID) has not been checked yet; confirm against it before treating these as final. Earthdata login: https://urs.earthdata.nasa.gov/.

**Bengaluru facts used on the page:** coordinates 12.97° N, 77.59° E; elevation ≈ 920 m. The earlier V1 design also used area ≈ 741 km² (BBMP).

## 4. Map stack (for "The Explorer" in production)

| Piece | Link | Use |
|---|---|---|
| MapLibre GL JS | https://maplibre.org/maplibre-gl-js/docs/ | Base map |
| deck.gl | https://deck.gl/docs | Data layers (`GridLayer`, `HeatmapLayer`, `BitmapLayer` for rasters) |
| Dark base-map style | e.g. https://openfreemap.org/ or a MapTiler / Stadia dark style | **Not chosen yet.** Pick a near-black style to match `#000`; check the provider's attribution and terms |

## 5. Code-drawn elements (no files needed)

- **Icons:** inline SVG, exported to `assets/icons/` (see its README).
- **Star field, glow and atmosphere:** drawn in the shader.
- **Space sound:** synthesised in `js/space-ambience.js`.
- **CTA planet rim:** pure CSS gradients.
- **Simulation illustrations and the chart:** inline SVG in `index.html`.

## 6. Design references (`assets/reference/`)

| File | What it is |
|---|---|
| `edge-of-space-theme-reference.png` | The "Edge of Space" mobile screen the whole theme follows: black ground, thin geometric capitals, rim-lit planet, white text CTA with an amber underline and chevron |
| `hero-motion-reference.mov` + `hero-motion-reference-frame-01…04.jpg` | Screen recording that inspired the hero composition (Earth rising, then Earth on the right with copy on the left). Reference only; it belongs to its original authors and is not for reuse on the site |

## 7. Generated / derived files

| File | Generated by |
|---|---|
| `index.html` | `node tools/render-static.mjs` from `design-source/ThreeColor.dc.html` |
| `js/earth-shader.js`, `shaders/earth.frag` | same script |
| `assets/textures/*.jpg` | `python tools/process_textures.py` |
| `screenshots/*.png` | Playwright + Chromium against `index.html` (software WebGL; a real GPU looks the same or sharper) |
