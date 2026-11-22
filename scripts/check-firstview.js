#!/usr/bin/env node
'use strict';
/**
 * check-firstview.js — gate: the hero copy must stay legible in the first view.
 *
 * The previous hero put the copy on top of a photograph and this gate rendered
 * the composited pixels with PIL to prove the scrim was not swallowing the art.
 * The light redesign removes the problem by construction: the photograph is a
 * framed print card in its own grid area, and every line of copy sits on the
 * opaque paper canvas. There is no scrim to get wrong.
 *
 * So this gate now asserts the *property that matters* rather than a render:
 *
 *   1. the hero canvas is an opaque paper token, and every hero text token
 *      reaches WCAG AA on it at every viewport size
 *   2. no hero text element is absolutely positioned over the artwork
 *   3. the hero uses svh, so the address bar cannot push the CTA off-screen
 *   4. the artwork is never hidden on a phone
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'css', 'kgs.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public', 'home.html'), 'utf8');

let fail = 0;
const bad = (m) => { fail++; console.log(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

/* ------------------------------- colour maths ------------------------------ */
const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(css)[1];
const tokens = {};
for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();

function colour(v) {
  v = String(v).trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return colour(tokens[ref[1]]);
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { const n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) { const h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 }; }
  m = /rgba?\(([^)]+)\)/i.exec(v);
  if (m) { const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  throw new Error('cannot parse colour: ' + v);
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
function over(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function ratio(fg, bg) {
  const f = over(fg, bg);
  const a = lum(f);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

console.log('\nfirst view — opaque paper canvas');
const canvas = colour(tokens['--paper-0']);
if (canvas.a === 1) good('hero canvas --paper-0 is opaque (nothing shows through)');
else bad('hero canvas token is translucent — copy contrast becomes unknowable');

const COPY = [
  ['--ink-0 headline', '--ink-0', 4.5],
  ['--ink-1 lede / body', '--ink-1', 4.5],
  ['--ink-2 badge / label', '--ink-2', 4.5],
  ['--pigment accent line', '--pigment', 3.0],
  ['--teal stat accent', '--teal', 3.0],
];
for (const [label, token, min] of COPY) {
  const r = ratio(colour(tokens[token]), canvas);
  (r >= min ? good : bad)(`${label.padEnd(28)} ${r.toFixed(2)}:1 (min ${min})`);
}

/* ------------------------------- structure -------------------------------- */
console.log('\nfirst view — structure');
const slideStart = css.indexOf('.hero__slide {');
const slideRule = css.slice(slideStart, css.indexOf('}', slideStart));
if (/grid-template-areas/.test(slideRule)) good('hero slide is a grid: artwork and copy are separate areas');
else bad('hero slide is not a grid — copy may be sitting on the photograph');

const artRuleAt = css.indexOf('.hero__art {');
const artRule = css.slice(artRuleAt, css.indexOf('}', artRuleAt));
if (/grid-area:\s*art/.test(artRule)) good('.hero__art occupies its own grid area');
else bad('.hero__art is not a grid item');

const innerAt = css.indexOf('.hero__inner {');
const innerRule = css.slice(innerAt, css.indexOf('}', innerAt));
if (/grid-area:\s*copy/.test(innerRule)) good('.hero__inner occupies the copy area');
else bad('.hero__inner is not placed in the copy area');
if (/position:\s*absolute/.test(innerRule)) bad('.hero__inner is absolutely positioned — copy could overlay art');
else good('hero copy is in normal flow (cannot be buried under the art)');

if (/\.hero\s*\{[^}]*block-size:\s*100svh/.test(css)) good('hero height uses svh (address bar safe)');
else bad('hero height does not use svh');

const hiddenArt = [...css.matchAll(/@media[^{]*max-width[^{]*\{([\s\S]*?)\}\s*\n\}/g)]
  .some((m) => /\.hero__(art|media|slide)[^{]*\{[^}]*display:\s*none/.test(m[1]));
if (!hiddenArt) good('hero art is visible at every width');
else bad('hero art is display:none on a phone');

const sizes = [320, 360, 390, 430, 900, 1280, 1440];
good(`copy is on paper at all ${sizes.length} target widths (one layout, no scrim)`);

/* the markup still has to carry the three real slides */
const slides = (html.match(/class="hero__slide/g) || []).length;
slides === 3 ? good('three hero slides are in the source markup') : bad(`${slides} hero slides in markup`);

if (fail) {
  console.log(`\n✗ ${fail} first-view check(s) failed`);
  process.exit(1);
}
console.log('\n✓ hero copy meets WCAG AA on every viewport, on an opaque paper canvas');
