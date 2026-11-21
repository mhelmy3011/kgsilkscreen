#!/usr/bin/env python3
"""
logo-sheet.py — renders the logo candidates at real sizes for review and for the
automated legibility check.

Rasterises filled SVG geometry with PIL (no cairo/rsvg needed in CI). Used by
scripts/check-logo.js to assert the mark still reads at 16px.
"""
import os
import re
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svgflat import flatten  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def hexc(c, alpha=255):
    if c is None:
        return None
    if c in ("none", "currentColor"):
        return None
    if c.startswith("#"):
        h = c[1:]
        if len(h) == 3:
            h = "".join(x * 2 for x in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (alpha,)
    return None


def render(svg_path, size, bg=(6, 12, 16), fg_override=None):
    svg = open(svg_path, encoding="utf-8").read()
    # In a raw string, backslash-d is a digit. The pattern below
    # previously escaped it twice, matching a literal backslash, so it
    # never fired: non-square SVGs fell back to 48x48 and rendered stretched.
    vb = re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', svg)
    vw, vh = (float(vb.group(1)), float(vb.group(2))) if vb else (48.0, 48.0)
    sc = size / vw
    img = Image.new("RGB", (size, max(1, int(round(vh * sc)))), bg)
    d = ImageDraw.Draw(img, "RGBA")

    for m in re.finditer(r"<path\s+([^>]+?)/>", svg):
        attrs = m.group(1)
        dm = re.search(r'd="([^"]*)"', attrs)
        if not dm:
            continue
        fill = re.search(r'fill="([^"]*)"', attrs)
        op = re.search(r'opacity="([\\d.]+)"', attrs)
        colour = hexc(fill.group(1) if fill else None)
        if colour is None:
            colour = hexc(fg_override or "#eef3f1")
        a = int(255 * float(op.group(1))) if op else 255
        colour = colour[:3] + (a,)
        for poly in flatten(dm.group(1), steps=16, scale=sc, ox=0, oy=0, flip=1):
            if len(poly) >= 3:
                d.polygon(poly, fill=colour)
    return img


def sheet(out="/tmp/logo-sheet.jpg"):
    files = [("FINAL · The Pull", "assets-src/logo/mark.svg"),
             ("alt A · framed", "assets-src/logo/alt-a.svg"),
             ("alt C · halftone", "assets-src/logo/alt-c.svg")]
    W, RH = 900, 210
    big = 150
    page = Image.new("RGB", (W, RH * len(files) + 20), (6, 12, 16))
    d = ImageDraw.Draw(page)
    for i, (label, rel) in enumerate(files):
        y = 10 + i * RH
        p = os.path.join(ROOT, rel)
        page.paste(render(p, big), (24, y + 26))
        d.text((24, y + 6), label, fill=(150, 170, 166))
        x = 210
        for s in (64, 32, 24, 16):
            page.paste(render(p, s), (x, y + 26))
            d.text((x, y + 26 + s + 6), f"{s}px", fill=(110, 130, 126))
            x += s + 70
    page.save(out, quality=92)
    return out


if __name__ == "__main__":
    print(sheet())
