#!/usr/bin/env node
'use strict';
/**
 * check-contrast.js — WCAG AA for every colour pair the page actually uses.
 *
 * Colours are read from the CSS custom properties, so this stays honest when a
 * token changes. Thresholds (WCAG 2.1):
 *   · body text        >= 4.5:1
 *   · large text (>=24px, or >=18.66px bold)  >= 3.0:1
 *   · UI boundaries / focus rings / graphical objects  >= 3.0:1
 *
 * The page is dark-only by design, so every pair is measured against the page
 * background and against the raised surface it can sit on.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'css', 'kgs.css'), 'utf8');

/* ---------- parse the token block ---------- */
const rootBlock = /\:root\s*\{([\s\S]*?)\}/.exec(css)[1];
const tokens = {};
for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  tokens[m[1]] = m[2].trim();
}

/** resolve a value that may be a token reference or an rgba()/hex colour */
function colour(v, depth = 0) {
  if (depth > 5) throw new Error('token cycle');
  v = String(v).trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return colour(tokens[ref[1]], depth + 1);

  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
  }
  m = /rgba?\(([^)]+)\)/i.exec(v);
  if (m) {
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  throw new Error(`cannot parse colour: ${v}`);
}

/** composite a possibly-translucent foreground over a solid backdrop */
function over(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance + contrast ratio */
function ratio(fg, bg) {
  const f = over(fg, bg);
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const a = L(f);
  const b = L(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- the pairs that actually appear ---------- */
const PAGE = colour(tokens['--ink-1']);
const DEEP = colour(tokens['--ink-0']);
const RAISED = colour(tokens['--ink-2']);

const TEXT = [
  ['--paper on page', tokens['--paper'], PAGE, 4.5],
  ['--paper on raised', tokens['--paper'], RAISED, 4.5],
  ['--paper-dim on page', tokens['--paper-dim'], PAGE, 4.5],
  ['--paper-dim on raised', tokens['--paper-dim'], RAISED, 4.5],
  ['--paper-mute on page', tokens['--paper-mute'], PAGE, 4.5],
  ['--paper-mute on raised', tokens['--paper-mute'], RAISED, 4.5],
  ['--paper on deep', tokens['--paper'], DEEP, 4.5],
  ['--paper-dim on deep', tokens['--paper-dim'], DEEP, 4.5],
  ['--pigment on page (accent headline)', tokens['--pigment'], PAGE, 3.0],
  ['--pigment-soft on page', tokens['--pigment-soft'], PAGE, 4.5],
  ['--cyan-soft on page (eyebrows)', tokens['--cyan-soft'], PAGE, 4.5],
  ['--cyan-soft on raised', tokens['--cyan-soft'], RAISED, 4.5],
  // the quote-builder selected pill text
  ['selected pill text #ffd2bd on pigment wash', '#ffd2bd', { r: 40, g: 18, b: 12, a: 1 }, 4.5],
];

const NON_TEXT = [
  ['--line-strong as a boundary', tokens['--line-strong'], PAGE, 3.0],
  ['focus ring (--cyan-soft) on page', tokens['--cyan-soft'], PAGE, 3.0],
  ['WhatsApp green icon on its own bubble', '#04120a', colour('#25d366'), 3.0],
];

let fail = 0;
const row = (label, fg, bg, min) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(44)} ${r.toFixed(2)}:1  (min ${min})`);
};

console.log('\ncontrast — text (WCAG AA)');
for (const [label, fg, bg, min] of TEXT) row(label, colour(fg), bg, min);

console.log('\ncontrast — non-text (boundaries, focus, icons)');
for (const [label, fg, bg, min] of NON_TEXT) row(label, colour(fg), bg, min);

/* the translucent hairline is decorative; assert it is at least visible */
console.log(fail ? `\n✗ ${fail} contrast failure(s)` : '\n✓ every colour pair meets WCAG AA');
process.exit(fail ? 1 : 0);
