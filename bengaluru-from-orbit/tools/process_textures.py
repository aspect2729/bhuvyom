"""Rebuild assets/textures/*.jpg from the NASA originals in assets/textures/originals/.

    pip install pillow numpy
    python tools/process_textures.py

Exactly the steps used to make the shipped textures:
  earth_day_8k.jpg        Blue Marble Next Generation (Dec 2004, topo + bathy) 21600x10800
                          -> Lanczos to 8192x4096 -> light unsharp mask (r1.2, 45%, t2) -> JPEG q90 progressive
  earth_lights_8k.jpg     Black Marble 2016 (3 km, 13500x6750) -> greyscale -> Lanczos 8192x4096
                          -> remove the faint land/ocean base so only lights remain: v' = clamp((v-56)/199)^1.1
                          -> JPEG q90 (greyscale)
  earth_clouds_8k.jpg     NASA cloud_combined_8192.png (8192x4096 greyscale) -> JPEG q88 (greyscale)
  earth_ocean_mask_4k.jpg G channel of three.js earth_bump_roughness_clouds_4096.jpg (land = high roughness)
                          inverted and contrast-stretched: 255 = water, 0 = land
  earth_bump_4k.jpg       R channel of the same three.js texture (elevation / bump)
Why 8K: at 1440 px wide x 2 (retina) the globe's visible hemisphere spans ~4,100 texels of an
8,192-wide map, i.e. about one texel per screen pixel. Larger maps would not look sharper and
would cost far more GPU memory.
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
import numpy as np

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[1] / "assets" / "textures"
SRC = ROOT / "originals"
W, H = 8192, 4096

day = Image.open(SRC / "world.topo.bathy.200412.3x21600x10800.jpg").convert("RGB").resize((W, H), Image.LANCZOS)
day = day.filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=2))
day.save(ROOT / "earth_day_8k.jpg", quality=90, optimize=True, progressive=True)
del day

night = np.asarray(Image.open(SRC / "BlackMarble_2016_3km.jpg").convert("L").resize((W, H), Image.LANCZOS)).astype(np.float32)
lights = np.clip((night - 56) / (255 - 56), 0, 1) ** 1.1
Image.fromarray((lights * 255 + 0.5).astype(np.uint8), "L").save(ROOT / "earth_lights_8k.jpg", quality=90, optimize=True, progressive=True)

Image.open(SRC / "cloud_combined_8192.png").convert("L").save(ROOT / "earth_clouds_8k.jpg", quality=88, optimize=True, progressive=True)

r, g, _ = Image.open(SRC / "earth_bump_roughness_clouds_4096.jpg").convert("RGB").split()
ImageOps.invert(g).point(lambda v: 255 if v > 200 else (0 if v < 120 else int((v - 120) * 255 / 80))).save(ROOT / "earth_ocean_mask_4k.jpg", quality=90)
r.save(ROOT / "earth_bump_4k.jpg", quality=92)
print("textures written to", ROOT)
