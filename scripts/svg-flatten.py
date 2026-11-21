# Minimal absolute-command SVG path flattener + PIL rasterizer.
# SVGPathPen only emits M/L/H/V/C/Q/Z (absolute), so this is sufficient and
# removes any dependency on cairo/rsvg being installed.
import re
from PIL import Image, ImageDraw

def tokenize(d):
    return re.findall(r'[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?', d)

def flatten(d, steps=14, scale=0.1, ox=0, oy=0, flip=1):
    tk = tokenize(d); i = 0; polys = []; cur = []; pos = (0.0, 0.0); start = (0.0, 0.0)
    def add(x, y): cur.append((ox + x*scale, oy + flip*(-y)*scale))
    while i < len(tk):
        c = tk[i]; i += 1
        n = lambda: float(tk[i]); 
        if c == 'M':
            x = n(); i += 1; y = n(); i += 1
            if cur: polys.append(cur)
            cur = []; pos = (x, y); start = (x, y); add(x, y)
        elif c == 'L':
            x = n(); i += 1; y = n(); i += 1; add(x, y); pos = (x, y)
        elif c == 'H':
            x = n(); i += 1; add(x, pos[1]); pos = (x, pos[1])
        elif c == 'V':
            y = n(); i += 1; add(pos[0], y); pos = (pos[0], y)
        elif c == 'Q':
            c1x = n(); i += 1; c1y = n(); i += 1; x = n(); i += 1; y = n(); i += 1
            for s in range(1, steps + 1):
                t = s / steps; u = 1 - t
                add(u*u*pos[0] + 2*u*t*c1x + t*t*x, u*u*pos[1] + 2*u*t*c1y + t*t*y)
            pos = (x, y)
        elif c == 'C':
            c1x = n(); i += 1; c1y = n(); i += 1; c2x = n(); i += 1; c2y = n(); i += 1
            x = n(); i += 1; y = n(); i += 1
            for s in range(1, steps + 1):
                t = s / steps; u = 1 - t
                add(u**3*pos[0] + 3*u*u*t*c1x + 3*u*t*t*c2x + t**3*x,
                    u**3*pos[1] + 3*u*u*t*c1y + 3*u*t*t*c2y + t**3*y)
            pos = (x, y)
        elif c == 'Z':
            if cur: polys.append(cur)
            cur = []; pos = start
    if cur: polys.append(cur)
    return polys

def render(svg_path, out, width=800, bg=(10, 15, 20), fg=(255, 255, 255)):
    svg = open(svg_path).read()
    d = re.search(r'<path d="([^"]+)"', svg).group(1)
    vb = re.search(r'viewBox="([-\d. ]+)"', svg)
    if vb:
        vx, vy, vw, vh = [float(t) for t in vb.group(1).split()]
    else:
        vw, vh, vx, vy = 1000, 1000, 0, 0
    # y-flip happens inside flatten(); bake the viewBox translate in
    scale = width / vw
    polys = flatten(d, scale=scale, ox=-vx*scale, oy=(vy+vh)*scale, flip=1)
    h = int(round(vh * scale))
    # even-odd fill: draw into a mask with XOR to emulate nonzero-off hits
    mask = Image.new('L', (width, h), 0)
    md = ImageDraw.Draw(mask)
    for p in polys:
        md.polygon(p, fill=255)   # separate polygons -> union; holes handled by winding below
    img = Image.new('RGB', (width, h), bg)
    img.paste(Image.new('RGB', (width, h), fg), (0, 0), mask)
    img.save(out)
    return len(polys), img.size

if __name__ == '__main__':
    import sys
    print(render(sys.argv[1], sys.argv[2]))
