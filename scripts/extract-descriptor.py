#!/usr/bin/env python3
"""
extract-descriptor.py — outlines the Latin descriptor "SILK SCREEN" (letter-spaced).

Same reasoning as the Arabic wordmark: a lockup must not reflow or fall back to
a system font, ever. Monospace + explicit tracking is shaped here once and
shipped as paths, so the sub-line is pixel-identical on every machine.

Output: assets-src/logo/descriptor.json
"""
import json
import os
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "public/assets/fonts/ibm-plex-mono-latin-500-normal.ttf")
OUT = os.path.join(ROOT, "assets-src/logo/descriptor.json")
TEXT = "SILK SCREEN"
TRACK = 0.34  # em — the wide tracking an expert brand uses at small sizes


def main():
    if not os.path.exists(FONT):
        sys.exit("missing plex ttf — run: node scripts/build-fonts.js --ttf")

    blob = hb.Blob.from_file_path(FONT)
    face = hb.Face(blob)
    font = hb.Font(face)
    font.scale = (face.upem, face.upem)

    buf = hb.Buffer()
    buf.add_str(TEXT)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True})

    tt = TTFont(FONT)
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()

    commands = []
    pen_x = 0.0
    x_min, y_min, x_max, y_max = 10**9, 10**9, -10**9, -10**9
    tracking = TRACK * face.upem
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        bp = BoundsPen(glyph_set)
        glyph_set[name].draw(bp)
        if bp.bounds:
            bx0, by0, bx1, by1 = bp.bounds
            x_min = min(x_min, bx0 + pen_x)
            x_max = max(x_max, bx1 + pen_x)
            y_min = min(y_min, by0)
            y_max = max(y_max, by1)
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(TransformPen(pen, Transform(1, 0, 0, 1, pen_x, 0)))
        d = pen.getCommands()
        if d:
            commands.append(d)
        pen_x += pos.x_advance + (0 if info.codepoint == 32 else tracking)
        if info.codepoint == 32:
            pen_x += tracking

    d_all = " ".join(commands)
    doc = {"text": TEXT, "font": "IBM Plex Mono 500 (SIL OFL)", "upem": face.upem,
           "tracking": TRACK, "bounds": [x_min, y_min, x_max, y_max], "d": d_all}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False)
    print(f"[descriptor] {TEXT} · bounds {x_min:.0f},{y_min:.0f} → {x_max:.0f},{y_max:.0f} · {len(d_all)} B")


if __name__ == "__main__":
    main()
