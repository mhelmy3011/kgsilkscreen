#!/usr/bin/env python3
"""
brand-sheet.py — render every logo asset into one review sheet.

Why: the logo files live in assets-src/logo/ as SVG, which no phone, editor or
GitHub preview shows as a *set*. Asking "where is the logo?" should have an
answer you can look at.

Also doubles as a legibility proof: the mark is drawn at 16/32/48/64/128px in
the same sheet, which is where a mark actually fails.

  python3 scripts/brand-sheet.py            → docs/logo-preview.png
"""
import importlib.util
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uharfbuzz as hb
from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw

from svgflat import flatten

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# the rasteriser already used by check-logo, loaded by path (the file name has
# a hyphen, so it is not importable as a module)
_spec = importlib.util.spec_from_file_location('logo_sheet', os.path.join(ROOT, 'scripts/logo-sheet.py'))
logo_sheet = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(logo_sheet)

BG = (7, 13, 18)
PAPER = (238, 243, 241)
PIGMENT = (255, 90, 31)
DIM = (146, 158, 164)
FAINT = (255, 255, 255, 26)

F = lambda n: os.path.join(ROOT, 'public/assets/fonts', n)
AR4, AR7 = F('alexandria-arabic-400-normal.ttf'), F('alexandria-arabic-700-normal.ttf')
LAT4, MONO = F('alexandria-latin-400-normal.ttf'), F('ibm-plex-mono-latin-400-normal.ttf')

_faces = {}


def _face(path):
    if path not in _faces:
        _faces[path] = (hb.Face(hb.Blob.from_file_path(path)), TTFont(path))
    return _faces[path]


def _runs(text):
    """Split into Arabic / Latin runs.

    The shipped Arabic subset has no Latin glyphs and the Latin/mono subsets
    have no Arabic, so a mixed label must be shaped in pieces — otherwise the
    'other' script renders as tofu boxes. This exact mistake is what the first
    version of this sheet did.
    """
    out = []
    for ch in text:
        cp = ord(ch)
        arabic = 0x0600 <= cp <= 0x06FF or 0x0750 <= cp <= 0x077F or 0xFB50 <= cp <= 0xFEFF
        key = 'ar' if arabic else 'lat'
        if out and out[-1][0] == key:
            out[-1][1] += ch
        else:
            out.append([key, ch])
    return [(k, t) for k, t in out]


def measure(text, size, ar=AR4, lat=LAT4):
    total = 0.0
    for kind, chunk in _runs(text):
        face, _ = _face(ar if kind == 'ar' else lat)
        font = hb.Font(face)
        font.scale = (face.upem, face.upem)
        buf = hb.Buffer()
        buf.add_str(chunk)
        buf.guess_segment_properties()
        hb.shape(font, buf)
        total += sum(p.x_advance for p in buf.glyph_positions) * size / face.upem
    return total


def draw(canvas, text, size, x, y, colour, ar=AR4, lat=LAT4):
    """Draw left-to-right from x. Returns the advance width."""
    cx = x
    for kind, chunk in _runs(text):
        path = ar if kind == 'ar' else lat
        face, tt = _face(path)
        font = hb.Font(face)
        font.scale = (face.upem, face.upem)
        buf = hb.Buffer()
        buf.add_str(chunk)
        buf.guess_segment_properties()
        hb.shape(font, buf)
        glyphs, order = tt.getGlyphSet(), tt.getGlyphOrder()
        sc = size / face.upem
        layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        pen_draw = ImageDraw.Draw(layer)
        px = cx
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            pen = SVGPathPen(glyphs)
            glyphs[order[info.codepoint]].draw(
                TransformPen(pen, Transform(sc, 0, 0, -sc, px + pos.x_offset * sc, y)))
            for poly in flatten(pen.getCommands(), steps=12, scale=1, ox=0, oy=0, flip=1):
                if len(poly) >= 3:
                    pen_draw.polygon(poly, fill=colour)
            px += pos.x_advance * sc
        canvas.alpha_composite(layer)
        cx = px
    return cx - x


def right(canvas, text, size, edge, y, colour, **kw):
    draw(canvas, text, size, edge - measure(text, size, **kw), y, colour, **kw)


def build(out):
    W, M = 1400, 56
    sheet = Image.new('RGB', (W, 40), BG)          # placeholder, resized below
    canvas = Image.new('RGBA', (W, 1300), BG + (255,))
    d = ImageDraw.Draw(canvas)
    y = 62

    # ---- header -----------------------------------------------------------
    right(canvas, 'الهوية — كمال جادو · سلك سكرين', 27, W - M, y, PAPER, ar=AR7)
    right(canvas, 'الشعار مبني على حرفي K و G — «The Pull»', 16, W - M, y + 34, DIM)

    # ---- primary marks ----------------------------------------------------
    y = 165
    cap = y + 300
    canvas.alpha_composite(logo_sheet.render(os.path.join(ROOT, 'assets-src/logo/mark.svg'),
                                             170, bg=BG).convert('RGBA'), (M, y + 40))
    draw(canvas, 'الرمز — mark.svg', 15, M, cap, DIM)

    canvas.alpha_composite(logo_sheet.render(os.path.join(ROOT, 'assets-src/logo/lockup-h.svg'),
                                             480, bg=BG).convert('RGBA'), (300, y + 78))
    draw(canvas, 'الأفقي — lockup-h.svg', 15, 300, cap, DIM)

    canvas.alpha_composite(logo_sheet.render(os.path.join(ROOT, 'assets-src/logo/lockup-v.svg'),
                                             145, bg=BG).convert('RGBA'), (1090, y + 20))
    draw(canvas, 'الرأسي — lockup-v.svg', 15, 1090, cap, DIM)

    # ---- one-colour -------------------------------------------------------
    y = 500
    canvas.alpha_composite(logo_sheet.render(os.path.join(ROOT, 'assets-src/logo/lockup-h-mono.svg'),
                                             300, bg=BG).convert('RGBA'), (300, y))
    draw(canvas, 'نسخة لون واحد للطباعة — lockup-h-mono.svg', 15, 300, y + 92, DIM)

    # ---- icon sizes -------------------------------------------------------
    y = 660
    d.line([(M, y - 44), (W - M, y - 44)], fill=FAINT)
    right(canvas, 'الرمز على التليفون — لازم يقرأ عند ١٦px', 17, W - M, y - 26, PAPER)
    x = M
    for size in (128, 64, 48, 32, 16):
        canvas.alpha_composite(logo_sheet.render(os.path.join(ROOT, 'assets-src/logo/mark.svg'),
                                                 size, bg=BG).convert('RGBA'), (x, y + 14))
        draw(canvas, f'{size}px', 13, x, y + 145, DIM, lat=MONO)
        x += size + 54

    # ---- palette ----------------------------------------------------------
    right(canvas, 'الألوان', 17, W - M, y - 26, PAPER)
    pw = 128
    for i, (hexv, rgb, name) in enumerate([
            ('#eef3f1', (238, 243, 241), 'حبر'),
            ('#04070a', (4, 7, 10), 'أسود'),
            ('#ff5a1f', (255, 90, 31), 'بيجمنت'),
            ('#c22f0a', (194, 47, 10), 'غامق')]):
        px = 760 + i * 150
        d.rounded_rectangle([px, y + 14, px + pw, y + 99], 10, fill=rgb + (255,))
        draw(canvas, hexv, 13, px, y + 118, DIM, lat=MONO)
        draw(canvas, name, 13, px + 82, y + 118, DIM)

    # ---- where it appears -------------------------------------------------
    y = 872
    d.line([(M, y - 34), (W - M, y - 34)], fill=FAINT)
    right(canvas, 'وأين بيظهر في الموقع', 17, W - M, y - 16, PAPER)
    rows = [('الناف بار', 'SVG مضمّن، ٦١٩ بايت — بدون طلب شبكة'),
            ('الفوتر', 'SVG مضمّن، ٦٧٥ بايت'),
            ('الأيقونات', 'favicon.svg · icon-192 · icon-512 · apple-touch-icon'),
            ('أندرويد', 'maskable-512'),
            ('المشاركة', 'صورة الـ OG على واتساب وتويتر')]
    y += 18
    for lead, detail in rows:
        d.ellipse([M, y + 5, M + 6, y + 11], fill=PIGMENT)
        advance = draw(canvas, lead, 15, M + 18, y + 12, PAPER)
        draw(canvas, detail, 15, M + 18 + advance + 12, y + 12, DIM)
        y += 30

    canvas.convert('RGB').crop((0, 0, W, 1080)).save(out)
    return out


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'docs/logo-preview.png')
    print(build(target))
