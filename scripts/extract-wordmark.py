#!/usr/bin/env python3
"""
extract-wordmark.py — turns the Arabic brand name into pure vector outlines.

Arabic cannot be rendered as <text> on the web without shipping a font, and a
logo that changes shape when a font fails is not a logo. So we shape the text
once with HarfBuzz (real contextual joining + ligatures) and emit the outlines.

Output: assets-src/logo/wordmark.json  { d, width, height, contours }
Run:    npm run logo:wordmark
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
FONT = os.path.join(ROOT, "public/assets/fonts/alexandria-arabic-900-normal.ttf")
OUT = os.path.join(ROOT, "assets-src/logo/wordmark.json")
TEXT = "كمال جادو"


def main():
    if not os.path.exists(FONT):
        sys.exit("missing ttf — run: node scripts/build-fonts.js --ttf")

    blob = hb.Blob.from_file_path(FONT)
    face = hb.Face(blob)
    font = hb.Font(face)
    font.scale = (face.upem, face.upem)

    buf = hb.Buffer()
    buf.add_str(TEXT)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True, "calt": True})

    tt = TTFont(FONT)
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()

    commands = []
    x_min, y_min, x_max, y_max = 10**9, 10**9, -10**9, -10**9
    pen_x = 0
    contours = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        # measure the real ink bounds of this glyph in place
        bp = BoundsPen(glyph_set)
        glyph_set[name].draw(bp)
        if bp.bounds:
            bx0, by0, bx1, by1 = bp.bounds
            x_min = min(x_min, bx0 + pen_x + pos.x_offset)
            x_max = max(x_max, bx1 + pen_x + pos.x_offset)
            y_min = min(y_min, by0 + pos.y_offset)
            y_max = max(y_max, by1 + pos.y_offset)
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(TransformPen(pen, Transform(1, 0, 0, 1, pen_x + pos.x_offset, pos.y_offset)))
        d = pen.getCommands()
        if d:
            commands.append(d)
            contours += d.count("M")
        pen_x += pos.x_advance

    d_all = " ".join(commands)
    doc = {
        "text": TEXT,
        "font": "Alexandria 900 (SIL OFL)",
        "upem": face.upem,
        "advance": pen_x,
        "bounds": [x_min, y_min, x_max, y_max],
        "contours": contours,
        "d": d_all,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False)

    print(f"[wordmark] {TEXT} · {len(commands)} glyphs · {contours} contours · "
          f"bounds {x_min:.0f},{y_min:.0f} → {x_max:.0f},{y_max:.0f} · {len(d_all)} bytes of path")


if __name__ == "__main__":
    main()
