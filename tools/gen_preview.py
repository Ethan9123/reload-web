#!/usr/bin/env python
# tools/gen_preview.py — draw the repo / link social-preview image (1280x640) with Pillow.
# 100% original art (hex motifs + text), no game assets. Output: preview.png at repo root.
import math
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 640
BG = (12, 14, 18)
GOLD = (244, 180, 0)
INK = (230, 232, 236)
SUB = (150, 158, 170)
TERR = {  # the in-game terrain palette
    "jungle": (31, 122, 61), "plains": (138, 168, 75), "mountain": (107, 111, 118),
    "village": (176, 137, 72), "tower": (58, 110, 165), "solar": (217, 179, 16),
    "maze": (106, 79, 138),
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_font(size, bold=True):
    candidates = (["arialbd.ttf", "Arialbd.ttf", "ariblk.ttf", "segoeuib.ttf", "impact.ttf"] if bold
                  else ["arial.ttf", "segoeui.ttf"])
    paths = [os.path.join(r"C:\Windows\Fonts", c) for c in candidates] + candidates
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def hexagon(cx, cy, r):
    return [(cx + r * math.cos(math.radians(60 * i)), cy + r * math.sin(math.radians(60 * i))) for i in range(6)]


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img, "RGBA")

    # subtle vertical gradient
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(12 + 6 * t), int(14 + 7 * t), int(18 + 10 * t)))

    # decorative hex cluster on the right (flat-top), in terrain colors
    R = 60
    dx, dy = R * 1.5, R * math.sqrt(3)
    cells = [(0, 0, "tower"), (1, 0, "jungle"), (1, -1, "plains"), (0, -1, "mountain"),
             (-1, 0, "village"), (0, 1, "solar"), (1, 1, "jungle"), (-1, 1, "plains"),
             (-1, -1, "maze"), (2, 0, "mountain"), (2, -1, "village")]
    ox, oy = 970, 320
    for q, r, terr in cells:
        cx = ox + dx * q
        cy = oy + dy * (r + q / 2)
        col = TERR[terr]
        d.polygon(hexagon(cx, cy, R - 3), fill=col + (255,), outline=(12, 14, 18, 255))
        d.polygon(hexagon(cx, cy, R - 3), outline=(255, 255, 255, 28))
    # a gold "tower" accent dot at center hex
    d.ellipse([ox - 12, oy - 12, ox + 12, oy + 12], fill=GOLD + (235,))

    # title
    title = load_font(150, bold=True)
    d.text((78, 150), "RELOAD", font=title, fill=GOLD)
    # accent rule
    d.rectangle([84, 330, 84 + 360, 338], fill=(227, 66, 75, 255))
    # subtitle lines
    s1 = load_font(40, bold=True)
    s2 = load_font(30, bold=False)
    d.text((84, 360), "Battle-royale tactical dice — web port", font=s1, fill=INK)
    d.text((84, 416), "Open-source fan project · vanilla JS · ZH / EN / FR / ES", font=s2, fill=SUB)
    # play url chip
    url = "ethan9123.github.io/reload-web"
    uf = load_font(30, bold=True)
    bb = d.textbbox((0, 0), url, font=uf)
    pad = 16
    d.rounded_rectangle([84, 500, 84 + (bb[2] - bb[0]) + pad * 2, 500 + (bb[3] - bb[1]) + pad * 2],
                        radius=10, fill=(255, 255, 255, 18), outline=GOLD + (180,), width=2)
    d.text((84 + pad, 500 + pad - bb[1]), url, font=uf, fill=GOLD)

    out = os.path.join(ROOT, "preview.png")
    img.save(out, "PNG")
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
