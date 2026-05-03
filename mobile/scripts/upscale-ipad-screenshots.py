#!/usr/bin/env python3
"""
Upscale iPad Pro 11" screenshots (1640 x 2360) to iPad Pro 13" (2064 x 2752)
using high-quality LANCZOS resampling. Apple's iPad 13" screenshot category
(APP_IPAD_PRO_3GEN_129) requires exactly 2064 x 2752 (or 2048 x 2732).

Reads from docs/launch/screenshots/ipad-11/*.png and writes parallel files
to docs/launch/screenshots/ipad-13/. Strips alpha channels (Apple rejects
transparent screenshots).
"""

from PIL import Image
from pathlib import Path

SRC = Path("docs/launch/screenshots/ipad-11")
DST = Path("docs/launch/screenshots/ipad-13")
TARGET_W, TARGET_H = 2064, 2752  # iPad Pro 13" (M4, 7th gen)

DST.mkdir(parents=True, exist_ok=True)

for src in sorted(SRC.glob("*.png")):
    img = Image.open(src)
    if img.mode in ("RGBA", "LA"):
        # Composite onto an opaque navy background to strip alpha
        bg = Image.new("RGB", img.size, (6, 10, 18))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Direct LANCZOS upscale — minimal artifacts at 25% increase.
    out = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    out_path = DST / src.name
    out.save(out_path, "PNG", optimize=True)
    print(f"✓ {src.name}  {img.size}  →  {out.size}  →  {out_path}")
