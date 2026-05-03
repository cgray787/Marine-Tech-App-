#!/usr/bin/env python3
"""
Generate the JBY-Marine Tech app icon.

Design: deep navy field (#060a12), centered gold (#C9A96E) anchor.
Reads at all sizes down to ~60px (App Store search results).
Output is 1024x1024 PNG, NO alpha channel (Apple rejects transparent icons).
"""

from math import cos, sin, pi
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
BG_TOP = (12, 18, 32)
BG_BOTTOM = (6, 10, 18)
GOLD = (201, 169, 110)
GOLD_HI = (220, 192, 138)


def make_canvas() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), BG_BOTTOM)
    px = img.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = int(BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t)
        for x in range(SIZE):
            px[x, y] = (r, g, b)
    return img


def add_vignette(img: Image.Image) -> Image.Image:
    overlay = Image.new("L", (SIZE, SIZE), 0)
    od = ImageDraw.Draw(overlay)
    cx, cy = SIZE // 2, SIZE // 2
    max_r = int((cx ** 2 + cy ** 2) ** 0.5)
    for r in range(0, max_r, 4):
        od.ellipse([cx - r, cy - r, cx + r, cy + r],
                   outline=int(70 * (r / max_r) ** 1.6))
    overlay = overlay.filter(ImageFilter.GaussianBlur(20))
    black = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    return Image.composite(black, img, overlay)


def draw_inner_border(d: ImageDraw.ImageDraw):
    inset = 28
    for w, color in [(4, (60, 70, 90)), (2, (90, 90, 110))]:
        d.rounded_rectangle(
            [inset, inset, SIZE - inset, SIZE - inset],
            radius=120, outline=color, width=w,
        )


def draw_anchor(d: ImageDraw.ImageDraw):
    """
    Anchor occupies roughly y ≈ 180..860, centered horizontally.
    PIL uses y-down coords; angle 0 = right (3 o'clock), 90 = down (6 o'clock).
    So the bottom half of a circle is angles 0 → 180 (right → down → left).
    """
    cx = SIZE // 2

    # --- top ring ---
    ring_cy = 230
    ring_r_outer = 88
    ring_r_inner = 52
    d.ellipse([cx - ring_r_outer, ring_cy - ring_r_outer,
               cx + ring_r_outer, ring_cy + ring_r_outer], fill=GOLD)
    d.ellipse([cx - ring_r_inner, ring_cy - ring_r_inner,
               cx + ring_r_inner, ring_cy + ring_r_inner], fill=BG_BOTTOM)

    # --- shaft ---
    shaft_top = ring_cy + ring_r_outer - 8
    shaft_bottom = 600
    shaft_w = 56
    d.rounded_rectangle(
        [cx - shaft_w // 2, shaft_top, cx + shaft_w // 2, shaft_bottom],
        radius=14, fill=GOLD,
    )
    # Subtle highlight stripe
    d.rounded_rectangle(
        [cx - 14, shaft_top + 14, cx - 6, shaft_bottom - 14],
        radius=4, fill=GOLD_HI,
    )

    # --- crossbar (stock) near the top ---
    cross_y = ring_cy + 175
    cross_w = 360
    cross_h = 42
    d.rounded_rectangle(
        [cx - cross_w // 2, cross_y - cross_h // 2,
         cx + cross_w // 2, cross_y + cross_h // 2],
        radius=20, fill=GOLD,
    )
    cap_r = 30
    d.ellipse([cx - cross_w // 2 - cap_r + 4, cross_y - cap_r,
               cx - cross_w // 2 + cap_r + 4, cross_y + cap_r], fill=GOLD)
    d.ellipse([cx + cross_w // 2 - cap_r - 4, cross_y - cap_r,
               cx + cross_w // 2 + cap_r - 4, cross_y + cap_r], fill=GOLD)

    # --- bottom U-arc ---
    # Annular sector polygon, bottom half (0° → 180°).
    arc_cx = cx
    arc_cy = 600
    r_outer = 240
    r_inner = 188
    start_deg = 0      # right side
    end_deg = 180      # left side, sweeping through the bottom

    pts_outer, pts_inner = [], []
    steps = 64
    for i in range(steps + 1):
        deg = start_deg + (end_deg - start_deg) * (i / steps)
        rad = pi * deg / 180
        pts_outer.append((arc_cx + r_outer * cos(rad), arc_cy + r_outer * sin(rad)))
        pts_inner.append((arc_cx + r_inner * cos(rad), arc_cy + r_inner * sin(rad)))
    d.polygon(pts_outer + list(reversed(pts_inner)), fill=GOLD)

    # --- flukes (broad spades pointing up-and-outward from each U end) ---
    def fluke(side_sign):
        end_x = arc_cx + side_sign * r_outer   # outer corner of U on this side
        in_x = arc_cx + side_sign * r_inner    # inner corner of U on this side
        end_y = arc_cy
        # Outer tip: out and up at ~45°
        tip_x = end_x + side_sign * 105
        tip_y = end_y - 130
        # Top-inner corner (above the inner edge of the U, slightly out)
        top_x = in_x + side_sign * 28
        top_y = end_y - 115
        d.polygon(
            [(in_x, end_y), (end_x, end_y), (tip_x, tip_y), (top_x, top_y)],
            fill=GOLD,
        )

    fluke(+1)
    fluke(-1)


def main():
    img = make_canvas()
    img = add_vignette(img)
    d = ImageDraw.Draw(img)
    draw_inner_border(d)
    draw_anchor(d)

    img.save("assets/images/icon.png", "PNG", optimize=True)
    print(f"✓ wrote assets/images/icon.png ({img.size[0]}x{img.size[1]}, mode={img.mode})")

    img.save("assets/images/splash-icon.png", "PNG", optimize=True)
    print("✓ wrote assets/images/splash-icon.png")

    img.resize((48, 48), Image.LANCZOS).save(
        "assets/images/favicon.png", "PNG", optimize=True
    )
    print("✓ wrote assets/images/favicon.png (48x48)")


if __name__ == "__main__":
    main()
