#!/usr/bin/env python3
"""
og-image.py — builds public/assets/img/og.jpg (1200x630 social card).

Why Python: Arabic needs real shaping (contextual joining + ligatures). Pillow
alone can only shape through libraqm, which isn't guaranteed everywhere, so we
run HarfBuzz (uharfbuzz) ourselves and draw the shaped glyph runs with FreeType.
That gives a pixel-accurate brand card with zero dependency on a headless
browser, which makes it reproducible in CI.

Run: npm run og
"""
import os
import sys

import numpy as np
import uharfbuzz as hb
import freetype
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT900 = os.path.join(ROOT, "public/assets/fonts/alexandria-arabic-900-normal.ttf")
FONT700 = os.path.join(ROOT, "public/assets/fonts/alexandria-arabic-700-normal.ttf")
FONT400 = os.path.join(ROOT, "public/assets/fonts/alexandria-arabic-400-normal.ttf")
FONT400_LAT = os.path.join(ROOT, "public/assets/fonts/alexandria-latin-400-normal.ttf")
MARK_SVG = os.path.join(ROOT, "assets-src", "logo", "mark.svg")
SRC = os.path.join(ROOT, "assets-src/img/slide-1-pull.png")
OUT = os.path.join(ROOT, "public/assets/img/og.jpg")

W, H = 1200, 630
PAPER = (238, 243, 241, 255)
DIM = (166, 189, 184, 255)
ACCENT = (255, 143, 94, 255)
INK = (4, 7, 10)


class Text:
    """A shaped, measurable Arabic/English run.

    This class only *measures* and shapes; rasterisation lives in
    draw_shaped() below, which takes one of these and paints it. (An earlier
    Text.draw() stub raised NotImplementedError because it never learned to
    cache glyph bitmaps — it has been removed rather than left as a trap.)
    """

    def __init__(self, font_path, size):
        self.size = size
        self.blob = hb.Blob.from_file_path(font_path)
        self.face = hb.Face(self.blob)
        self.font = hb.Font(self.face)
        self.upem = self.face.upem
        self.scale = size / self.upem
        self.font.scale = (self.upem, self.upem)
        self.ft = freetype.Face(font_path)
        self.ft.set_char_size(int(size * 64))

    def shape(self, text):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.font, buf, {"kern": True, "liga": True, "calt": True})
        return buf.glyph_infos, buf.glyph_positions

    def measure(self, text):
        infos, pos = self.shape(text)
        return sum(p.x_advance for p in pos) * self.scale, self.size



def mark_image(svg_path, size):
    """Rasterise the brand mark SVG to an RGBA tile at `size` px.

    Reuses the project's own flattener (scripts/svgflat.py) instead of a second
    renderer, so the OG card and the favicon can never disagree about the logo.
    """
    import re as _re
    import sys as _sys

    _sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from svgflat import flatten

    doc = open(svg_path, encoding="utf-8").read()
    vb = _re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', doc)
    vw = float(vb.group(1)) if vb else 48.0
    sc = size / vw
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    for m in _re.finditer(r'<path d="([^"]+)" fill="([^"]+)"', doc):
        dm, fm = m.group(1), m.group(2)
        h = fm.lstrip("#")
        col = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
        for poly in flatten(dm, steps=20, scale=sc, ox=0, oy=0, flip=1):
            if len(poly) >= 3:
                d.polygon(poly, fill=col)
    return img


def shaped_runs(text_obj, text):
    """Return list of (glyph_id, x_offset, y_offset, x_advance) in px, LTR order."""
    infos, poss = text_obj.shape(text)
    runs, pen = [], 0
    for info, p in zip(infos, poss):
        runs.append((info.codepoint, pen + p.x_offset, p.y_offset, p.x_advance))
        pen += p.x_advance
    total = pen * text_obj.scale
    return runs, total


def draw_shaped(img, text_obj, text, x_right, baseline, fill, anchor="right"):
    """Render a shaped run onto an RGBA image with FreeType outlines."""
    ft = text_obj.ft
    infos, poss = text_obj.shape(text)
    total_w = sum(p.x_advance for p in poss) * text_obj.scale
    start_x = (x_right - total_w) if anchor == "right" else x_right
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pen_x = start_x
    for info, p in zip(infos, poss):
        gid = info.codepoint
        ox = pen_x + p.x_offset * text_obj.scale
        oy = baseline - p.y_offset * text_obj.scale
        ft.load_glyph(gid, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
        g = ft.glyph
        bmp = g.bitmap
        if bmp.width and bmp.rows:
            arr = np.array(bmp.buffer, dtype=np.uint8).reshape(bmp.rows, bmp.width)
            # freetype gives an 8-bit coverage mask; compose in the fill colour
            play = Image.fromarray(arr, mode="L")
            play = play.point(lambda v: v)
            gx = int(round(ox + g.bitmap_left))
            gy = int(round(oy - g.bitmap_top))
            stamp = Image.new("RGBA", (bmp.width, bmp.rows), fill[:3] + (0,))
            stamp.putalpha(play.point(lambda v: int(v * (fill[3] / 255))))
            layer.alpha_composite(stamp, (gx, gy))
        pen_x += p.x_advance * text_obj.scale
    img.alpha_composite(layer)
    return total_w


def rounded_pill(img, box, radius=99, outline=(238, 243, 241, 60), width=1):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius, outline=outline, width=width)


def main():
    if not os.path.exists(FONT900):
        sys.exit("missing TTF — run scripts/woff2-to-ttf first")
    if not os.path.exists(OUT) and not os.path.exists(SRC):
        sys.exit("missing hero art")

    # ---- background: hero art cropped to the card, darkened for type ----
    bg = Image.open(SRC).convert("RGB")
    bg = bg.resize((W, int(W * bg.height / bg.width)), Image.LANCZOS)
    top = (bg.height - H) // 2
    bg = bg.crop((0, top, W, top + H)).convert("RGBA")

    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(wash)
    for x in range(W):
        a = int(162 * (1 - x / W) + 46)          # heavier where the type sits
        d.line([(x, 0), (x, H)], fill=(4, 7, 10, a))
    bg = Image.alpha_composite(bg, wash)

    vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dv = ImageDraw.Draw(vig)
    for y in range(H):
        a = int(max(0, y - H * 0.55) / (H * 0.45) * 105)
        dv.line([(0, y), (W, y)], fill=(2, 4, 6, a))
    bg = Image.alpha_composite(bg, vig)

    # ---- brand mark: the real K/G logo, not a letter in a coloured tile ----
    # The tile was a stand-in from before the identity existed. The actual mark
    # is two-tone filled geometry, so it is rendered from the same SVG the site
    # ships and composited directly on the photograph.
    PAD = 72
    RIGHT = W - PAD
    bg.alpha_composite(mark_image(MARK_SVG, 64), (RIGHT - 64, 62))

    # ---- venue + domain line -------------------------------------------
    # Measured problem: this line sat on the brightest part of the photograph
    # and was effectively invisible at thumbnail size. Dim type over a bright,
    # busy background always loses, so it gets its own dark plate — the same
    # decision the hero uses (a gradient scrim under the copy), applied here as
    # a soft pill so it reads as intentional rather than a band-aid.
    f_brand_lat = Text(FONT400_LAT, 21)
    f_brand_ar = Text(FONT400, 22)
    sep = Text(FONT400_LAT, 21)

    lat_w = f_brand_lat.measure("kgsilkscreen.store")[0]
    sep_w = sep.measure("·")[0]
    ar_w = f_brand_ar.measure("أبو كبير، الشرقية")[0]
    line_w = lat_w + 14 + sep_w + 14 + ar_w
    line_right = RIGHT - 78
    line_y = 66 + 37           # baseline
    plate = [line_right - line_w - 20, line_y - 26, line_right + 12, line_y + 12]
    glaze = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    ImageDraw.Draw(glaze).rounded_rectangle(plate, 14, fill=(4, 7, 10, 168))
    bg = Image.alpha_composite(bg, glaze)

    draw_shaped(bg, f_brand_lat, "kgsilkscreen.store", line_right, line_y, PAPER)
    draw_shaped(bg, sep, "·", line_right - lat_w - 14, line_y, (110, 130, 126, 255))
    draw_shaped(bg, f_brand_ar, "أبو كبير، الشرقية", line_right - lat_w - sep_w - 28, line_y, (198, 214, 210, 255))

    # ---- headline ----
    f_h1 = Text(FONT900, 100)
    y1 = 268
    draw_shaped(bg, f_h1, "كمال جادو", RIGHT, y1, PAPER)
    draw_shaped(bg, f_h1, "سلك سكرين", RIGHT, y1 + 116, ACCENT)

    # ---- subline ----
    f_sub = Text(FONT400, 26)
    draw_shaped(bg, f_sub, "طباعة يدوية على التيشيرتات واليونيفورم والأعلام والزجاج", RIGHT, y1 + 200, (198, 214, 210, 255))

    # ---- tags (measured, so they can never overflow the card) ----
    f_tag = Text(FONT400, 17)
    tags = ["تيشيرتات", "يونيفورم مدارس", "أعلام", "زجاج وكرتون"]
    x = RIGHT
    tag_y = y1 + 240
    for t in tags:
        tw = sum(p.x_advance for p in f_tag.shape(t)[1]) * f_tag.scale
        bw = tw + 34
        if x - bw < PAD:
            break
        rounded_pill(bg, [x - bw, tag_y, x, tag_y + 42])
        draw_shaped(bg, f_tag, t, x - 17, tag_y + 28, (198, 214, 210, 255))
        x -= bw + 10

    bg.convert("RGB").save(OUT, quality=88, optimize=True, progressive=True)
    kb = os.path.getsize(OUT) / 1024
    print(f"[og] {OUT} · {W}x{H} · {kb:.0f} KB")


if __name__ == "__main__":
    main()
