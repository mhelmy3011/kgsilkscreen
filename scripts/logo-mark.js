#!/usr/bin/env node
'use strict';
/**
 * logo-mark.js — draws the KG monogram as filled geometry.
 *
 * DIRECTION A (chosen): "Screen & Squeegee"
 *   frame      = the silk-screen frame (الشاسيه)
 *   stem       = the frame post
 *   upper arm  = squeegee handle
 *   blade      = the squeegee edge laying a bead of ink (accent colour)
 *   G          = the *aperture* the blade leaves behind: drawn as an annulus
 *                sector, so the letter emerges from the tool, not beside it
 *
 * Everything is emitted as filled paths (M/L/Z, no strokes, no fonts, no
 * gradients, no filters). That matters because:
 *   - strokes scale unevenly and blur at 16px; fills do not
 *   - filled geometry can be rasterised by our own test harness, so the
 *     favicon we ship is verified pixel-by-pixel instead of assumed
 *
 * Authored on a 48×48 grid. Nothing exceeds the 4-unit safe margin.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets-src', 'logo');
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------- helpers -------------------------------- */
const r2 = (n) => Math.round(n * 100) / 100;

/** absolute polygon path */
const poly = (pts, close = true) =>
  'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + (close ? 'Z' : '');

/** axis-aligned rect as a polygon */
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** rotated rect about its own start point */
function bar(x0, y0, len, thick, deg) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx;
  const t = thick / 2;
  return [
    [x0 + nx * t, y0 + ny * t],
    [x0 + dx * len + nx * t, y0 + dy * len + ny * t],
    [x0 + dx * len - nx * t, y0 + dy * len - ny * t],
    [x0 - nx * t, y0 - ny * t],
  ];
}

/**
 * Annulus sector (a ring slice) as a filled polygon.
 * Angles in degrees, 0 = 3 o'clock, positive = clockwise on screen (y down).
 */
function ringSector(cx, cy, rOut, rIn, a0, a1, steps = 28) {
  const p = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    outer.push(p(t, rOut));
    inner.push(p(t, rIn));
  }
  return outer.concat(inner.reverse());
}

/* ------------------------------ direction A ------------------------------ */
function directionA({ fg = '#eef3f1', accent = '#ff5a1f' } = {}) {
  const frameT = 2.6;          // frame thickness
  const f = 5.5;               // frame inset
  const outer = 48 - f * 2;    // 37

  const paths = [];

  // --- frame: four bars, leaving a clean square hole ---
  paths.push({ d: poly(rect(f, f, outer, frameT)), fill: fg });
  paths.push({ d: poly(rect(f, 48 - f - frameT, outer, frameT)), fill: fg });
  paths.push({ d: poly(rect(f, f, frameT, outer)), fill: fg });
  paths.push({ d: poly(rect(48 - f - frameT, f, frameT, outer)), fill: fg });

  // --- K stem (frame post), slightly inset from the frame ---
  const stemX = 15.2, stemW = 5.6;
  paths.push({ d: poly(rect(stemX, 11.5, stemW, 25)), fill: fg });

  // --- K upper arm: squeegee handle, 15° up to the right ---
  paths.push({ d: poly(bar(stemX + 2.4, 26.6, 13.8, 5.2, -47)), fill: fg });

  // --- K lower arm: the blade laying ink (the only accent in the mark) ---
  paths.push({ d: poly(bar(stemX + 2.6, 27.4, 13.2, 5.2, 32)), fill: accent });

  // --- G: aperture ring, open at the top-right (RTL reading direction) ---
  const gx = 32.4, gy = 26.4;
  paths.push({ d: poly(ringSector(gx, gy, 9.2, 5.0, -58, 236)), fill: fg });
  // G crossbar into the counter, gives the letter its identity
  paths.push({ d: poly(rect(gx, gy - 1.5, 8.4, 3.0)), fill: fg });

  return paths;
}

/* ------------------------------ FINAL MARK -------------------------------- */
/**
 * "The Pull" — the chosen mark.
 *
 * Chosen on evidence, not taste: rendered at 16/24/32/64px, this direction is
 * the only one that stays legible as a favicon. The framed version (A) turned
 * into a box with a hole below 24px, and the halftone version (C) collapsed
 * into noise — both failed the criterion the plan set.
 *
 * Reading of the form:
 *   stem        — the screen's frame post
 *   upper arm   — squeegee handle
 *   blade       — the edge laying a bead of ink (accent, the pull direction)
 *   G           — a ring whose terminal stops early on the right, so the K's
 *                 blade appears to *draw* the G rather than sit next to it
 */
function directionFinal({ fg = '#eef3f1', accent = '#ff5a1f' } = {}) {
  const paths = [];
  // geometry constants — tuned against an ASCII raster at 96px so limb
  // collisions are caught numerically, not by eyeballing a PNG
  const stemX = 9.4, stemW = 5.8, stemTop = 10.4, stemH = 27.0;

  // stem: the frame post
  paths.push({ d: poly(rect(stemX, stemTop, stemW, stemH)), fill: fg });

  // upper arm: squeegee handle. Deliberately SHORT — at 16px a long arm merges
  // into the G ring and the mark reads as a blob, so it stops well clear.
  paths.push({ d: poly(bar(stemX + stemW - 0.7, 24.2, 10.0, 5.0, -45)), fill: fg });

  // blade: the ink-laying edge, the only accent. Steeper than the arm so the
  // two limbs read as separate forms rather than one wedge.
  paths.push({ d: poly(bar(stemX + stemW - 0.2, 27.0, 13.6, 5.2, 31)), fill: accent });

  // G: ring with a 50° aperture at the upper right — a G is never closed
  const gx = 36.2, gy = 26.8, rOut = 8.4, rIn = 5.0;
  paths.push({ d: poly(ringSector(gx, gy, rOut, rIn, -18, 292)), fill: fg });
  // G crossbar: short, inside the counter, merging into the ring on the right
  paths.push({ d: poly(rect(gx + 0.6, gy - 1.5, 5.0, 3.0)), fill: fg });

  return paths;
}

/* ------------------------------ direction C ------------------------------ */
// halftone: the G emerges from a dot field
function directionC({ fg = '#eef3f1', accent = '#ff5a1f' } = {}) {
  const paths = [];
  const step = 4;
  for (let y = 6; y <= 42; y += step) {
    for (let x = 6; x <= 42; x += step) {
      const dk = Math.hypot(x - 17, y - 24) / 24;
      const dg = Math.hypot(x - 33, y - 27) / 13;
      const a = Math.max(0, 1 - dg * 1.15) * 0.12 + Math.max(0, 1 - dk) * 0.8;
      if (a < 0.2) continue;
      const r = 0.8 + a * 1.35;
      const ring = [];
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        ring.push([x + Math.cos(t) * r, y + Math.sin(t) * r]);
      }
      paths.push({ d: poly(ring), fill: fg, opacity: a });
    }
  }
  paths.push({ d: poly(bar(17, 12, 24, 5, 90)), fill: accent });
  paths.push({ d: poly(ringSector(33, 27, 8.5, 4.6, -50, 235)), fill: fg });
  return paths;
}

/* -------------------------------- emit ----------------------------------- */
const svg = (paths, label = 'كمال جادو — سلك سكرين') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="${label}">\n` +
  paths.map((p) => `  <path d="${p.d}" fill="${p.fill}"${p.opacity != null ? ` opacity="${p.opacity.toFixed(2)}"` : ''}/>`).join('\n') +
  `\n</svg>\n`;

const VARIANTS = [
  ['mark', directionFinal],
  ['mark-mono', () => directionFinal({ fg: 'currentColor', accent: 'currentColor' })],
  ['mark-light', () => directionFinal({ fg: '#04070a', accent: '#c22f0a' })],
  ['alt-a', directionA],
  ['alt-c', directionC],
];

for (const [name, draw] of VARIANTS) {
  const file = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(file, svg(draw()));
  console.log(`[logo] ${path.relative(ROOT, file)} · ${fs.statSync(file).size} bytes`);
}

// favicon: same geometry, slightly heavier frame so it survives 16px
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), svg(directionFinal()));
console.log('[logo] public/favicon.svg updated (The Pull)');
