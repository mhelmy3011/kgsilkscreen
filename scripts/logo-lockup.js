#!/usr/bin/env node
'use strict';
/**
 * logo-lockup.js — assembles the identity system from three verified sources:
 *
 *   1. mark geometry     — scripts/logo-mark.js  (filled M/L/Z only)
 *   2. Arabic wordmark   — assets-src/logo/wordmark.json   (HarfBuzz outlines)
 *   3. Latin descriptor  — assets-src/logo/descriptor.json (HarfBuzz outlines)
 *
 * Hard rules this file enforces (each one is a mistake that has bitten this
 * project before):
 *   · No <text> anywhere. A logo that falls back to a system font is not a logo.
 *   · No nested <g transform>. Every transform is baked into the path
 *     coordinates, so the SVG renders identically in emails, PDFs and viewers
 *     that only support flat paths.
 *   · No stroke. Filled geometry only — strokes blur at favicon size.
 *
 * Emits the lockups (light + mono, horizontal + vertical), a bare wordmark, and
 * the raster icon set that iOS/Android actually read.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { transformPath } = require('./svg-transform.js');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'assets-src', 'logo');
const PUB = path.join(ROOT, 'public');

const INK = '#eef3f1';
const ACCENT = '#ff5a1f';
const INK_DARK = '#04070a';
const ACCENT_DARK = '#c22f0a';

const wordmark = JSON.parse(fs.readFileSync(path.join(LOGO, 'wordmark.json'), 'utf8'));
const descriptor = JSON.parse(fs.readFileSync(path.join(LOGO, 'descriptor.json'), 'utf8'));

/** geometry straight from the mark generator — single source of truth */
function markPaths({ fg = INK, accent = ACCENT } = {}) {
  const src = fs.readFileSync(path.join(LOGO, 'mark.svg'), 'utf8');
  return [...src.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].map((m) => ({
    d: m[1],
    fill: m[2] === INK ? fg : m[2] === ACCENT ? accent : m[2],
  }));
}

const MARK_BOX = 48; // viewBox of mark.svg

/**
 * Place outlined text into a box.
 * Glyph space is y-up; the target frame is y-down, so the vertical scale is
 * negated. `y` is the TOP of the ink box (not the baseline) — that is what
 * makes optical alignment between the mark and the wordmark possible.
 */
function placeText(doc, { height, x = 0, y = 0, color = INK }) {
  const [bx0, by0, bx1, by1] = doc.bounds;
  const s = height / (by1 - by0);
  const m = { a: s, b: 0, c: 0, d: -s, e: x - bx0 * s, f: y + by1 * s };
  return { d: transformPath(doc.d, m), width: (bx1 - bx0) * s, height };
}

/** path-string join for one colour group, to keep the file small */
const emit = (paths) => paths.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('');

const svgDoc = (w, h, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" role="img" aria-label="${label}">\n${body}\n</svg>\n`;

/* -------------------------------------------------------------------------
 * Horizontal lockup — RTL: wordmark right, mark left, descriptor beneath.
 * The mark is deliberately larger than the Arabic cap height so it reads as
 * the "stamp" of the brand rather than an inline glyph.
 * ----------------------------------------------------------------------- */
function lockupH({ fg = INK, accent = ACCENT, sub = true } = {}) {
  const markSize = 78;
  const wmH = 40;
  const descH = 9.5;

  const wm = placeText(wordmark, { height: wmH, x: 0, y: 0, color: fg });
  const desc = sub ? placeText(descriptor, { height: descH, x: 0, y: 0, color: accent }) : null;

  const gap = 26;
  const padX = 14;
  const subGap = 15;

  const blockW = Math.max(wm.width, desc ? desc.width : 0);
  const totalW = padX + markSize + gap + blockW + padX;
  const textH = wmH + (desc ? subGap + descH : 0);
  const totalH = Math.max(markSize, textH);

  const markY = (totalH - markSize) / 2;
  const textTop = (totalH - textH) / 2;

  const markX = padX;
  // RTL: the text block is right-aligned against the right padding
  const blockX = totalW - padX - blockW;

  const s = markSize / MARK_BOX;
  const markM = { a: s, b: 0, c: 0, d: s, e: markX, f: markY };
  const markBody = markPaths({ fg, accent })
    .map((p) => `<path d="${transformPath(p.d, markM)}" fill="${p.fill}"/>`)
    .join('');

  const wmBody = `<path d="${transformPath(wm.d, { a: 1, b: 0, c: 0, d: 1, e: blockX + (blockW - wm.width), f: textTop })}" fill="${fg}"/>`;
  const descBody = desc
    ? `<path d="${transformPath(desc.d, { a: 1, b: 0, c: 0, d: 1, e: blockX + (blockW - desc.width), f: textTop + wmH + subGap })}" fill="${accent}"/>`
    : '';

  return svgDoc(totalW, totalH, 'كمال جادو — سلك سكرين', markBody + wmBody + descBody);
}

/* -------------------------------------------------------------------------
 * Vertical lockup — signage, catalogue cover, social avatar context.
 * ----------------------------------------------------------------------- */
function lockupV({ fg = INK, accent = ACCENT, sub = true } = {}) {
  const markSize = 96;
  const wmH = 26;
  const descH = 7.5;
  const gapY = 18;
  const subGap = 11;
  const pad = 12;

  const wm = placeText(wordmark, { height: wmH, x: 0, y: 0, color: fg });
  const desc = sub ? placeText(descriptor, { height: descH, x: 0, y: 0, color: accent }) : null;
  const blockW = Math.max(wm.width, desc ? desc.width : 0);
  const totalW = Math.max(markSize, blockW) + pad * 2;
  const totalH = markSize + gapY + wmH + (desc ? subGap + descH : 0);

  const s = markSize / MARK_BOX;
  const markM = { a: s, b: 0, c: 0, d: s, e: (totalW - markSize) / 2, f: 0 };
  const markBody = markPaths({ fg, accent })
    .map((p) => `<path d="${transformPath(p.d, markM)}" fill="${p.fill}"/>`)
    .join('');

  const wmY = markSize + gapY;
  const wmBody = `<path d="${transformPath(wm.d, { a: 1, b: 0, c: 0, d: 1, e: (totalW - wm.width) / 2, f: wmY })}" fill="${fg}"/>`;
  const descBody = desc
    ? `<path d="${transformPath(desc.d, { a: 1, b: 0, c: 0, d: 1, e: (totalW - desc.width) / 2, f: wmY + wmH + subGap })}" fill="${accent}"/>`
    : '';
  return svgDoc(totalW, totalH, 'كمال جادو — سلك سكرين', markBody + wmBody + descBody);
}

function wordmarkOnly({ fg = INK } = {}) {
  const h = 100;
  const wm = placeText(wordmark, { height: h, x: 0, y: 0, color: fg });
  return svgDoc(wm.width, h, 'كمال جادو', `<path d="${wm.d}" fill="${fg}"/>`);
}

/* -------------------------------------------------------------------------
 * Write the assets
 * ----------------------------------------------------------------------- */
const files = {
  'lockup-h.svg': lockupH(),
  'lockup-h-dark.svg': lockupH({ fg: INK_DARK, accent: ACCENT_DARK }),
  'lockup-h-mono.svg': lockupH({ fg: 'currentColor', accent: 'currentColor', sub: false }),
  'lockup-v.svg': lockupV(),
  'lockup-v-dark.svg': lockupV({ fg: INK_DARK, accent: ACCENT_DARK }),
  'wordmark.svg': wordmarkOnly(),
};
for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(LOGO, name), content);
  console.log(`[logo] assets-src/logo/${name} · ${Buffer.byteLength(content)} B`);
}

fs.copyFileSync(path.join(LOGO, 'mark.svg'), path.join(PUB, 'favicon.svg'));

/* -------------------------------------------------------------------------
 * Raster icon set. Rasterised with scripts/raster-icon.py because this
 * environment has no working SVG delegate — and because the result is
 * reproducible from the committed geometry.
 * ----------------------------------------------------------------------- */
const ICONS = [
  ['apple-touch-icon.png', 180, 20],
  ['icon-192.png', 192, 22],
  ['icon-512.png', 512, 58],
  ['icon-maskable-512.png', 512, 130], // 80% safe area for Android's mask
];
for (const [name, size, pad] of ICONS) {
  const inner = size - pad * 2;
  const doc = svgDoc(size, size, 'كمال جادو', `
  <path d="M0 0L${size} 0L${size} ${size}L0 ${size}Z" fill="${INK_DARK}"/>
  ${markPaths()
    .map((p) => `<path d="${transformPath(p.d, { a: inner / MARK_BOX, b: 0, c: 0, d: inner / MARK_BOX, e: pad, f: pad })}" fill="${p.fill}"/>`)
    .join('')}`);
  const tmp = path.join('/tmp', `kg-icon-${size}.svg`);
  fs.writeFileSync(tmp, doc);
  execFileSync('python3', [path.join(__dirname, 'raster-icon.py'), tmp, path.join(PUB, name), String(size)], { stdio: 'pipe' });
  console.log(`[logo] public/${name} · ${size}px · ${fs.statSync(path.join(PUB, name)).size} B`);
}
console.log('[logo] public/favicon.svg · The Pull');
