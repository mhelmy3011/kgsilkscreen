#!/usr/bin/env node
'use strict';
/**
 * check-fonts.js — every character on the page must be covered by a shipped
 * font subset, or the browser renders a tofu box.
 *
 * This is a real risk here: the Arabic and Latin subsets are split with
 * `unicode-range`, and Arabic copy mixes Arabic-Indic digits, an en dash, a
 * middle dot and the tatweel. Any one of those living outside every subset's
 * range is a missing glyph no test would otherwise catch — it only shows up on
 * a device that has no fallback font for it.
 *
 * Strategy: parse the ranges declared in each @font-face, collect the set of
 * characters actually present in served text, and assert every one is covered.
 * Whitespace and ASCII control characters are ignored.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'css', 'kgs.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public', '_ssg', 'home.html'), 'utf8');

/* ---- 1. collect the declared ranges per family ---- */
const faces = [];
for (const m of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
  const body = m[1];
  const fam = /font-family:\s*"([^"]+)"/.exec(body);
  const range = /unicode-range:\s*([^;]+);/.exec(body);
  if (!fam) continue;
  const ranges = (range ? range[1] : 'U+0-10FFFF')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const u = /^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/.exec(s);
      return u ? [parseInt(u[1], 16), parseInt(u[2] || u[1], 16)] : null;
    })
    .filter(Boolean);
  faces.push({ family: fam[1], weight: /font-weight:\s*(\d+)/.exec(body)?.[1], ranges });
}

const covered = (cp) => faces.some((f) => f.ranges.some(([a, b]) => cp >= a && cp <= b));

/* ---- 2. collect the characters that are actually rendered as text ---- */
let text = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/&#\d+;/g, ' ');

// values that JS injects into the DOM at runtime also get rendered
const jsFiles = fs.readdirSync(path.join(ROOT, 'public', 'assets', 'js')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  let src = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'js', f), 'utf8');
  // strip comments first: a shader file documents "0 → 1 scroll progress" and
  // that arrow is never rendered — counting it produced a false positive.
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  // then string literals only — enough to catch UI copy and separators like " · "
  for (const m of src.matchAll(/'([^'\\\n]{2,})'|`([^`\\]{2,})`/g)) text += ' ' + (m[1] || m[2]);
}

const chars = new Map();
for (const ch of text) {
  const cp = ch.codePointAt(0);
  if (cp < 0x20) continue;                       // control chars
  if (cp === 0x20 || cp === 0xA0) continue;      // spaces
  chars.set(ch, (chars.get(ch) || 0) + 1);
}

/* ---- 3. report ---- */
const missing = [...chars.entries()].filter(([ch]) => !covered(ch.codePointAt(0)));

console.log(`\nfonts — ${faces.length} @font-face rules, ${chars.size} distinct rendered characters`);
const arabic = [...chars.keys()].filter((c) => c.codePointAt(0) >= 0x0600 && c.codePointAt(0) <= 0x06ff).length;
const digits = [...chars.keys()].filter((c) => c.codePointAt(0) >= 0x0660 && c.codePointAt(0) <= 0x0669).length;
console.log(`        ${arabic} Arabic letters · ${digits} Arabic-Indic digits`);

if (missing.length) {
  console.log('\n  ✗ characters with no subset covering them (they will render as tofu):');
  for (const [ch, n] of missing.slice(0, 40)) {
    console.log(`      U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  "${ch}"  ×${n}`);
  }
  console.log(`\n✗ ${missing.length} uncovered character(s)`);
  process.exit(1);
}

// also assert the Arabic weights the page relies on are declared
for (const w of ['400', '500', '700', '800', '900']) {
  const has = faces.some((f) => f.family === 'Tajawal' && f.weight === w && f.ranges.some(([a]) => a === 0x0600));
  if (!has) console.log(`  ! Tajawal ${w} has no Arabic range declared`);
}

console.log('\n✓ every rendered character is covered by a shipped font subset');
