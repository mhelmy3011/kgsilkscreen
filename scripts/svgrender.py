#!/usr/bin/env python3
"""
svgrender.py — a real (if small) SVG rasteriser for verification.

Why this exists: the sandbox has no cairo and no rsvg delegate, so ImageMagick
cannot render SVG here. A naive polygon-by-polygon PIL fill *cannot* represent
a glyph counter (ع/م/ج holes) or a ring's inner radius — it fills them solid,
which is exactly how a broken logo ships unnoticed.

So: flatten to polygons, then scanline-fill each row using the SVG winding rule
(nonzero by default, evenodd supported) with 4x supersampled anti-aliasing.
This reproduces what a browser draws closely enough to judge legibility.

Usage (library):   render_svg(svg_text, out_png, width)
"""
import re
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from svgflat import flatten  # noqa: E402

SS = 4  # supersampling factor


def _num(s):
    return f"{s:.4f}".rstrip("0").rstrip(".")


def parse_color(c, default=(238, 243, 241)):
    if not c or c in ("none", "currentColor"):
        return None if c == "none" else default
    c = c.strip()
    if c.startswith("#"):
        h = c[1:]
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        if len(h) >= 6:
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.match(r"rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)", c)
    if m:
        return tuple(int(float(v)) for v in m.groups())
    return default


def winding_fill(polys, w, h, rule="nonzero"):
    """Return a float coverage array (0..1) of shape (h, w) in supersampled space."""
    cover = np.zeros((h, w), dtype=np.uint8)
    # gather edges
    edges = []
    for poly in polys:
        if len(poly) < 3:
            continue
        pts = poly + [poly[0]]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if y0 != y1:
                edges.append((x0, y0, x1, y1))
    if not edges:
        return cover
    ys = np.arange(h) + 0.5
    for row, y in enumerate(ys):
        xs = []
        dirs = []
        for (x0, y0, x1, y1) in edges:
            if y0 <= y < y1:
                t = (y - y0) / (y1 - y0)
                xs.append(x0 + t * (x1 - x0))
                dirs.append(1)
            elif y1 <= y < y0:
                t = (y - y1) / (y0 - y1)
                xs.append(x1 + t * (x0 - x1))
                dirs.append(-1)
        if not xs:
            continue
        order = np.argsort(xs)
        xs = np.array(xs)[order]
        ds = np.array(dirs)[order]
        if rule == "evenodd":
            # fill between crossing pairs
            for i in range(0, len(xs) - 1, 2):
                a = max(0, int(np.floor(xs[i])))
                b = min(w, int(np.ceil(xs[i + 1])))
                if b > a:
                    cover[row, a:b] = 1
        else:
            wind = np.cumsum(ds)
            inside = wind != 0
            for i in np.nonzero(inside)[0]:
                a = max(0, int(np.floor(xs[i])))
                b = min(w, int(np.ceil(xs[i + 1] if i + 1 < len(xs) else xs[i] + 1)))
                if b > a:
                    cover[row, a:b] = 1
    return cover


def _bake_transform(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def flatten_transform(t):
    """Parse translate(a b) scale(s) [rotate] chains into a 2x3 matrix."""
    m = (1, 0, 0, 1, 0, 0)
    for name, args in re.findall(r"(translate|scale|rotate)\s*\(([^)]*)\)", t or ""):
        v = [float(a) for a in re.split(r"[ ,]+", args.strip()) if a]
        if name == "translate":
            tx, ty = v[0], (v[1] if len(v) > 1 else 0)
            n = (1, 0, 0, 1, tx, ty)
        elif name == "scale":
            sx = v[0]
            sy = v[1] if len(v) > 1 else sx
            n = (sx, 0, 0, sy, 0, 0)
        else:
            import math
            a = math.radians(v[0])
            ca, sa = math.cos(a), math.sin(a)
            n = (ca, sa, -sa, ca, 0, 0)
        m = (
            m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
        )
    return m


def render_svg(svg, out_path=None, width=None, bg=(255, 255, 255), ss=SS):
    vb = re.search(r'viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"', svg)
    vx, vy, vw, vh = (float(g) for g in vb.groups()) if vb else (0, 0, 48, 48)
    W = width or int(vw)
    H = int(round(vh * W / vw))
    Ws, Hs = W * ss, H * ss
    s = W / vw
    canvas = np.zeros((Hs, Ws), dtype=bool)

    # walk the document in order, tracking the enclosing <g transform>
    body = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    body = re.sub(r"</svg>.*$", "", body, flags=re.S)

    stack = []
    color_layer = None
    for m in re.finditer(r"<g\b([^>]*)>|<path\b([^>]*)/?>|</g>", body, flags=re.S):
        if m.group(0) == "</g>":
            if stack:
                stack.pop()
            continue
        if m.group(1) is not None:
            tm = re.search(r'transform="([^"]*)"', m.group(1))
            stack.append((1, 0, 0, 1, 0, 0) if not tm else flatten_transform(tm.group(1)))
            continue
        attrs = m.group(2) or ""
        dm = re.search(r'\sd="([^"]+)"', attrs)
        if not dm:
            continue
        fill_m = re.search(r'fill="([^"]+)"', attrs)
        col = parse_color(fill_m.group(1) if fill_m else "#eef3f1")
        if col is None:
            continue
        rule_m = re.search(r'fill-rule="([^"]+)"', attrs)
        rule = rule_m.group(1) if rule_m else "nonzero"
        tm = re.search(r'transform="([^"]*)"', attrs)
        local = flatten_transform(tm.group(1)) if tm else (1, 0, 0, 1, 0, 0)
        chain = local
        for t in reversed(stack):
            chain = (
                t[0] * chain[0] + t[2] * chain[1], t[1] * chain[0] + t[3] * chain[1],
                t[0] * chain[2] + t[2] * chain[3], t[1] * chain[2] + t[3] * chain[3],
                t[0] * chain[4] + t[2] * chain[5] + t[4], t[1] * chain[4] + t[3] * chain[5] + t[5],
            )
        polys = []
        for p in flatten(dm.group(1), steps=24, scale=1.0, ox=0, oy=0, flip=1):
            polys.append([( (x - vx) * s * ss, (y - vy) * s * ss) for (x, y) in p])
        # apply the transform chain in viewBox space
        tp = []
        for p in polys:
            tp.append([( (xx / (s * ss) + vx) , (yy / (s * ss) + vy)) for (xx, yy) in p])
        polys2 = []
        for p in tp:
            polys2.append([((_bake_transform(chain, x, y)[0] - vx) * s * ss,
                            (_bake_transform(chain, x, y)[1] - vy) * s * ss) for (x, y) in p])
        cov = winding_fill(polys2, Ws, Hs, rule)
        canvas |= cov.astype(bool)
        color_layer = color_layer or {}
        color_layer[col] = color_layer.get(col, np.zeros((Hs, Ws), dtype=bool)) | cov.astype(bool)

    img = Image.new("RGB", (W, H), bg)
    if color_layer:
        acc = np.zeros((Hs, Ws, 3), dtype=np.float64)
        for col, mask in color_layer.items():
            acc[mask] = col
        small = Image.fromarray(acc.astype(np.uint8)).resize((W, H), Image.LANCZOS)
        img = Image.blend(img, small, 1.0) if False else small
    if out_path:
        img.save(out_path)
    return img


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else None
    bgarg = sys.argv[4] if len(sys.argv) > 4 else "#060c10"
    bgc = parse_color(bgarg, (6, 12, 16))
    im = render_svg(open(src, encoding="utf-8").read(), out, w, bg=bgc)
    print(f"[render] {out} {im.size}")
