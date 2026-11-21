'use strict';
/**
 * svg-transform.js — bakes an affine transform into absolute SVG path data.
 *
 * Why: emitting `<g transform="scale(...) translate(...)">` means every
 * consumer has to support nested transforms — email clients, some PDF
 * pipelines and older tooling do not. Since we generate the geometry anyway,
 * we flatten the transform into the coordinates and ship a single, dependency
 * free path. It also lets our own rasteriser verify the exact bytes we ship.
 *
 * Supports the absolute commands we emit: M L H V C Q Z.
 */

const mul = (m, n) => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});

const apply = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

const n2 = (v) => (Math.round(v * 100) / 100).toString();

function tokenize(d) {
  return d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
}

function transformPath(d, m) {
  const tk = tokenize(d);
  const out = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  while (i < tk.length) {
    const cmd = tk[i].toUpperCase();
    i++;
    const num = () => parseFloat(tk[i++]);
    switch (cmd) {
      case 'M': {
        cx = num(); cy = num(); sx = cx; sy = cy;
        const [x, y] = apply(m, cx, cy);
        out.push(`M${n2(x)} ${n2(y)}`);
        break;
      }
      case 'L': {
        cx = num(); cy = num();
        const [x, y] = apply(m, cx, cy);
        out.push(`L${n2(x)} ${n2(y)}`);
        break;
      }
      case 'H': {
        cx = num();
        const [x, y] = apply(m, cx, cy);
        out.push(`L${n2(x)} ${n2(y)}`);
        break;
      }
      case 'V': {
        cy = num();
        const [x, y] = apply(m, cx, cy);
        out.push(`L${n2(x)} ${n2(y)}`);
        break;
      }
      case 'C': {
        const c1x = num(), c1y = num(), c2x = num(), c2y = num();
        cx = num(); cy = num();
        const [a1, b1] = apply(m, c1x, c1y);
        const [a2, b2] = apply(m, c2x, c2y);
        const [a3, b3] = apply(m, cx, cy);
        out.push(`C${n2(a1)} ${n2(b1)} ${n2(a2)} ${n2(b2)} ${n2(a3)} ${n2(b3)}`);
        break;
      }
      case 'Q': {
        const c1x = num(), c1y = num();
        cx = num(); cy = num();
        const [a1, b1] = apply(m, c1x, c1y);
        const [a2, b2] = apply(m, cx, cy);
        out.push(`Q${n2(a1)} ${n2(b1)} ${n2(a2)} ${n2(b2)}`);
        break;
      }
      case 'Z':
        out.push('Z');
        cx = sx; cy = sy;
        break;
      default:
        // unknown/number-only continuation: skip defensively
        break;
    }
  }
  return out.join('');
}

module.exports = { transformPath, mul };
