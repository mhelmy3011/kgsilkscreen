#!/usr/bin/env node
'use strict';
/**
 * inline-brand.js — keeps the nav/footer brand mark in sync with the logo build
 * and writes it in a compact, request-free form.
 *
 * Why inline at all: the brand mark must be painted in the very first frame of
 * the nav. An <img src="/favicon.svg"> would be a separate request racing the
 * first paint, and it would flash a gap on a slow 4G connection.
 *
 * Why compact: the Arabic wordmark alone is 3.2 KB of path data, and the
 * document budget is 17 KB gzip. The compact form drops two decimal places
 * (invisible at 36px) and collapses the ink colour so it is painted once on the
 * wrapper instead of on every path.
 *
 * Idempotent: it rewrites the <svg> inside `.nav__mark` wherever it appears, so
 * re-running after `npm run logo` never duplicates markup.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public', 'home.html');
const MARK = path.join(ROOT, 'assets-src', 'logo', 'mark.svg');

// Integer precision at 36px. The mark is drawn in a 48-unit box and rendered
// at 36-64px, so one unit is well under a device pixel; two decimals cost ~200
// bytes of the document budget for detail that cannot survive rasterisation.
const round0 = (d) =>
  d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n))));

const src = fs.readFileSync(MARK, 'utf8');
const paths = [...src.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].map((m) => ({
  d: round0(m[1]),
  fill: m[2],
}));

const INK = '#eef3f1';
const ACCENT = '#ff5a1f';

/** full-colour mark: inline ink and pigment, one path per ink group */
function colourMark() {
  const ink = paths.filter((p) => p.fill === INK).map((p) => `<path d="${p.d}"/>`).join('');
  const accent = paths.filter((p) => p.fill === ACCENT).map((p) => `<path d="${p.d}"/>`).join('');
  return (
    `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">` +
    `<g fill="${INK}">${ink}</g><g fill="${ACCENT}">${accent}</g></svg>`
  );
}

/** mono mark for the footer: one colour, inherited from the wrapper */
function monoMark() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${paths
    .map((p) => `<path d="${p.d}" fill="currentColor"/>`)
    .join('')}</svg>`;
}

let html = fs.readFileSync(HTML, 'utf8');

// replace the FIRST mark (nav, full colour) and the SECOND (footer, mono)
const MARK_RE = /(<span class="nav__mark" aria-hidden="true">)([\s\S]*?)(<\/span>\s*\n?\s*)/g;
let n = 0;
html = html.replace(MARK_RE, (m, open, inner, close) => {
  n++;
  return open + (n === 1 ? colourMark() : monoMark()) + close;
});

if (n !== 2) {
  console.error(`[brand] expected 2 brand marks in home.html, found ${n}`);
  process.exit(1);
}

fs.writeFileSync(HTML, html);
console.log(`[brand] nav mark ${colourMark().length} B · footer mark ${monoMark().length} B`);
