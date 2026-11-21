#!/usr/bin/env python3
"""
raster-icon.py — rasterises a logo SVG to PNG with PIL.

This project has no cairo/rsvg in CI, and ImageMagick's built-in SVG renderer
drops path fills silently. Rather than accept a broken icon, we flatten the
paths ourselves (see scripts/svgflat.py) — which also means the PNGs shipped as
apple-touch-icon / PWA icons are byte-for-byte reproducible.

Usage: raster-icon.py in.svg out.png size
"""
import os
import re
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svgflat import flatten  # noqa: E402


def hexc(c):
    if not c or c in ("none", "currentColor"):
        return None
    c = c.strip()
    if not c.startswith("#"):
        return None
    h = c[1:]
    if len(h) == 3:
        h = "".join(x * 2 for x in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def raster(svg_text, size):
    vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg_text)
    vw, vh = (float(vb.group(1)), float(vb.group(2))) if vb else (48.0, 48.0)
    # start from the largest background rect if one is present
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    bg = re.search(r'<rect width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"', svg_text)
    if bg:
        img.paste(Image.new("RGBA", (size, size), hexc(bg.group(3)) + (255,)), (0, 0))
    # honour a single wrapping transform (translate + scale) if present
    sc = size / vw
    tx = ty = 0.0
    tr = re.search(r'<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)">', svg_text)
    if tr:
        tx, ty, mul = float(tr.group(1)), float(tr.group(2)), float(tr.group(3))
        sc = mul * (size / vw)
    for m in re.finditer(r'<path\s+d="([^"]+)"\s*(?:fill="([^"]+)")?', svg_text):
        dm, fm = m.group(1), m.group(2)
        colour = hexc(fm or "#eef3f1")
        if colour is None:
            continue
        for poly in flatten(dm, steps=20, scale=sc, ox=tx * (size / vw), oy=ty * (size / vw), flip=1):
            if len(poly) >= 3:
                d.polygon(poly, fill=colour + (255,))
    return img


if __name__ == "__main__":
    src, out, px = sys.argv[1], sys.argv[2], int(sys.argv[3])
    im = raster(open(src, encoding="utf-8").read(), px)
    im.save(out)
    print(f"[icon] {out} · {px}x{px} · {os.path.getsize(out)} bytes")
