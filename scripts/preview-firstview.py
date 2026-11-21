#!/usr/bin/env python3
"""Composites the first viewport from values parsed out of kgs.css.

Receives JSON on stdin from preview-firstview.js. PNG output only — this is a
QA artifact, never shipped.
"""
import json, sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svgflat import flatten                       # noqa: E402
import uharfbuzz as hb                            # noqa: E402
from fontTools.pens.svgPathPen import SVGPathPen  # noqa: E402
from fontTools.pens.transformPen import TransformPen  # noqa: E402
from fontTools.misc.transform import Transform    # noqa: E402
from fontTools.ttLib import TTFont                # noqa: E402

cfg = json.load(sys.stdin)
W, H, OUT = cfg['W'], cfg['H'], cfg['OUT']
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = lambda n: os.path.join(ROOT, 'public/assets/fonts', n)
F9, F7, F4 = (F('alexandria-arabic-900-normal.ttf'),
              F('alexandria-arabic-700-normal.ttf'),
              F('alexandria-arabic-400-normal.ttf'))

_cache = {}
def shaped(img, s, path, size, x, y, colour, anchor='right'):
    if path not in _cache:
        _cache[path] = (hb.Face(hb.Blob.from_file_path(path)), TTFont(path))
    face, tt = _cache[path]
    font = hb.Font(face); font.scale = (face.upem, face.upem)
    buf = hb.Buffer(); buf.add_str(s); buf.guess_segment_properties()
    hb.shape(font, buf)
    gs, order = tt.getGlyphSet(), tt.getGlyphOrder()
    sc = size / face.upem
    total = sum(p.x_advance for p in buf.glyph_positions) * sc
    penx = x - total if anchor == 'right' else x
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); dd = ImageDraw.Draw(layer)
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(gs)
        gs[order[info.codepoint]].draw(TransformPen(
            pen, Transform(sc, 0, 0, -sc, penx + pos.x_offset * sc, y)))
        for poly in flatten(pen.getCommands(), steps=12, scale=1, ox=0, oy=0, flip=1):
            if len(poly) >= 3:
                dd.polygon(poly, fill=colour)
        penx += pos.x_advance * sc
    img.alpha_composite(layer)
    return total

# --- the slide-1 art, with the stylesheet's object-fit/position and opacity ---
name = 'slide-1-pull-360.avif' if W <= 420 else ('slide-1-pull-540.avif' if W <= 640 else 'slide-1-pull-720.avif')
art_path = os.path.join(ROOT, 'public/assets/img', name)
if not os.path.exists(art_path):
    alt = sorted(f for f in os.listdir(os.path.join(ROOT, 'public/assets/img')) if f.startswith('slide-1-pull') and f.endswith('.avif'))
    art_path = os.path.join(ROOT, 'public/assets/img', alt[0])
art = Image.open(art_path).convert('RGB')
sc = max(W / art.width, H / art.height)                 # object-fit: cover
art = art.resize((max(W, int(art.width * sc)), max(H, int(art.height * sc))), Image.LANCZOS)
# object-position: px% py% — 0% = left/top aligned, 100% = right/bottom
left = int((art.width - W) * cfg['posX'] / 100)
top = int((art.height - H) * cfg['posY'] / 100)
canvas = art.crop((left, top, left + W, top + H)).convert('RGBA')

# the image's own opacity, over the page's ink background
if cfg['artOpacity'] < 1:
    base = Image.new('RGBA', (W, H), (7, 13, 18, 255))
    canvas = Image.blend(base, canvas, cfg['artOpacity'])

# --- the shade: every linear-gradient in the list, painted in CSS order ---
def sample(stops, g):
    """g runs 0..1 along the gradient's own axis (0 = the 'to' edge)."""
    pts = sorted(stops, key=lambda x: x['t'])
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        if a['t'] <= g <= b['t']:
            f = 0.0 if b['t'] == a['t'] else (g - a['t']) / (b['t'] - a['t'])
            # 'transparent' takes the neighbour's colour (premultiplied interp)
            ra = a['rgb'] if a['rgb'] else (b['rgb'] or [0, 0, 0])
            rb = b['rgb'] if b['rgb'] else (a['rgb'] or [0, 0, 0])
            rgb = [round(ra[k] + (rb[k] - ra[k]) * f) for k in range(3)]
            return rgb, round((a['a'] + (b['a'] - a['a']) * f) * 255)
    e = pts[0] if g <= pts[0]['t'] else pts[-1]
    return (e['rgb'] or [0, 0, 0]), round(e['a'] * 255)

for grad in cfg['gradients']:
    horizontal = grad['axis'] in ('left', 'right')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dl = ImageDraw.Draw(layer)
    n = W if horizontal else H
    # i runs top→bottom (or left→right) in image space. CSS measures 0% at the
    # edge the gradient points *to*: 'to top' starts at the bottom, 'to left'
    # starts at the right.
    for i in range(n):
        f = i / n
        # 0% sits at the edge the gradient points TO: 'to top' starts at the
        # bottom, 'to left' at the right. So bottom/right measure from f.
        g = f if grad['axis'] in ('bottom', 'right') else 1 - f
        rgb, alf = sample(grad['stops'], g)
        fill = (rgb[0], rgb[1], rgb[2], alf)
        if horizontal:
            dl.line([(i, 0), (i, H)], fill=fill)
        else:
            dl.line([(0, i), (W, i)], fill=fill)
    canvas = Image.alpha_composite(canvas, layer)

# keep a text-free copy so the contrast measurement is honest
canvas_art = canvas.copy()

# --- the copy, laid out the way the CSS lays it out -------------------------
# .hero__slide is `display:grid; align-content:end` on mobile, so the block is
# glued to the bottom. The first version of this preview placed it from the top
# and reported contrast for a region where there is no text at all — measure the
# geometry too, not just the paint.
m = cfg['metrics']
M = round(m['gutter'])
PAPER = (238, 243, 241, 255)
DIM_A = 0.78                                    # --paper-dim alpha
DIM = tuple(round(PAPER[k] * DIM_A + (7, 13, 18)[k] * (1 - DIM_A)) for k in range(3)) + (255,)
PIG = (255, 90, 31, 255)

def measure(s, path, size):
    if not s:
        return 0.0
    if path not in _cache:
        _cache[path] = (hb.Face(hb.Blob.from_file_path(path)), TTFont(path))
    face, _ = _cache[path]
    font = hb.Font(face); font.scale = (face.upem, face.upem)
    buf = hb.Buffer(); buf.add_str(s); buf.guess_segment_properties(); hb.shape(font, buf)
    return sum(p.x_advance for p in buf.glyph_positions) * size / face.upem

# desktop: the container is centred at maxw, and the copy is capped at 46ch and
# aligned to the inline-start of that container — i.e. its right edge sits at
# the container's right edge, which in RTL is near the right of the viewport.
desktop = W >= 900
if desktop:
    container_r = (W + min(W, cfg['metrics']['maxw'])) / 2 - M
    # 46ch, measured with the real '0' advance from the Latin subset (the
    # Arabic subset has no digits). Alexandria's ch is ~0.71em, not the 0.5em
    # the first version assumed — that error alone made the mock wrap a title
    # the real page keeps on one line.
    latin = os.path.join(ROOT, 'public/assets/fonts/alexandria-latin-400-normal.ttf')
    ch_px = 46 * measure('0', latin, m['ledeSize'])
    copy_w = min(ch_px, (W - 2 * M) * 0.46)
    right_edge = container_r
    avail = copy_w
else:
    right_edge = W - M
    avail = W - 2 * M
def wrap(text, path, size):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if measure(t, path, size) <= avail or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

title_size = m['titleSize']; l2_size = m['l2Size']
lede_size = m['ledeSize']; badge_size = m['badgeSize']
btn_size = m['btnSize']; btn_h = m['btnMin']

lede_lines = wrap(cfg['lede'], F4, lede_size)
lede_lh = lede_size * 1.72
# @media (max-height:700px) portrait drops .hero__stats
stats_h = 0 if m.get('shortPortrait') else 74   # 14px pad + label + big number
gap_badge = 18
gap_title = 14
gap_lede = max(12, min(0.022 * H, 20))
gap_cta = max(16, min(0.03 * H, 26))
gap_stats = 0 if m.get('shortPortrait') else max(16, min(0.03 * H, 28))

title_lh = 0.94 if desktop else 1.02       # .hero__title line-height, desktop override
# the title wraps inside the copy column like any other block of text — without
# this the mock paints a 480px word into a 390px column and measures contrast
# over art the real page does not put type on
title_lines = wrap(cfg['title'], F9, title_size)
total = (30 + gap_badge + len(title_lines) * title_size * title_lh + l2_size * 1.15 + gap_title
         + len(lede_lines) * lede_lh + gap_lede
         + btn_h + gap_cta + stats_h + gap_stats)
# mobile: align-content:end → glued to the bottom padding.
# desktop (>=900px): align-content:center → the block is centred in the slide.
y = (H - total) / 2 if desktop else H - m['padBottom'] - total

d = ImageDraw.Draw(canvas)
# badge pill
bw = measure(cfg['badge'], F4, badge_size) + 40
d.rounded_rectangle([right_edge - bw, y, right_edge, y + 30], 15,
                    fill=(4, 7, 10, 140), outline=(226, 240, 238, 70))
shaped(canvas, cfg['badge'], F4, badge_size, right_edge - 14, y + 21, DIM)
y += 30 + gap_badge

for tl in title_lines:
    shaped(canvas, tl, F9, title_size, right_edge, y + title_size * 0.80, PAPER)
    y += title_size * title_lh
shaped(canvas, cfg['title2'] or 'سلك سكرين', F7, l2_size, right_edge, y + l2_size * 0.85, PIG)
y += l2_size * 1.15 + gap_title

for line in lede_lines:
    shaped(canvas, line, F4, lede_size, right_edge, y + lede_size * 0.85, DIM)
    y += lede_lh
y += gap_lede

# the CTA stacks full-width on phones; on desktop it is an inline pill
btn_w = min(avail, measure(cfg['cta'], F7, btn_size) + 56) if desktop else avail
btn_x = right_edge - btn_w
d.rounded_rectangle([btn_x, y, right_edge, y + btn_h], btn_h / 2, fill=PIG)
cta_w = measure(cfg['cta'], F7, btn_size)
shaped(canvas, cfg['cta'], F7, btn_size,
       right_edge - (btn_w - cta_w) / 2, y + btn_h * 0.64, (14, 5, 1, 255))
y += btn_h + gap_cta

# the hairline + three stats
if stats_h:
    d.line([(right_edge - avail, y), (right_edge, y)], fill=(226, 240, 238, 40))
    y += 14
colw = avail / 3
for i, (lab, val) in (enumerate([('سنين في الشغل', '+١٥'), ('قطعة كل شهر', '+٢٠٠٠٠'), ('التسليم', '٢–٥')]) if stats_h else []):
    cx = right_edge - i * colw
    shaped(canvas, lab, F4, max(11, badge_size - 1), cx, y + 12, (238, 243, 241, 150))
    shaped(canvas, val, F9, 21, cx, y + 40, PAPER)

canvas.convert('RGB').save(OUT)
print(f'  layout copy block y={round(y)}..{round(y + total)}px in a {H}px viewport')

# --- contrast, measured on the glyphs that were actually painted ------------
def lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2])

def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

rows = {'upper': [], 'lower': []}
for y in range(H):
    for x in range(W):
        if canvas.getpixel((x, y))[:3] != canvas_art.getpixel((x, y))[:3]:
            rows['lower' if y > H * 0.45 else 'upper'].append((x, y))

print('  contrast of the copy against what is actually behind it:')
worst = 99.0
for where, pts in rows.items():
    if not pts:
        continue
    for label, colour, need in (('display', (238, 243, 241), 3.0), ('body', DIM[:3], 4.5)):
        w, at = 99.0, None
        for (x, y) in pts[::5]:
            r = ratio(lum(colour), lum(canvas_art.getpixel((x, y))[:3]))
            if r < w:
                w, at = r, (x, y)
        print(f'    {"✓" if w >= need else "✗"} {where:5s} / {label:7s} {w:5.2f}:1  needs {need}  worst {at}')
        worst = min(worst, w)
if worst < 3.0:
    print('  ✗ the scrim is too thin where the type sits')
    sys.exit(1)
