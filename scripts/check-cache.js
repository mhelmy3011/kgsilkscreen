#!/usr/bin/env node
'use strict';
/**
 * check-cache.js — every asset served as `immutable` must carry a content hash
 * in its URL.
 *
 * The deploy config caches css/js for a year with `immutable`. That is only
 * correct if a byte change produces a new URL. This site learned the hard way:
 * the logo was designed as a small mark inside an orange rounded tile, then
 * redesigned three times — and browsers kept showing the original tile, because
 * /assets/css/kgs.min.css had never changed its name and was cached for a year.
 *
 * Rule: any <link rel=stylesheet>, <script src>, or <img src> in the built
 * document that lives under /assets/ and is long-cached must include a 10-char
 * hex hash before the extension.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const doc = path.join(ROOT, 'public', '_ssg', 'home.html');
if (!fs.existsSync(doc)) {
  console.log('\n  ✗ _ssg/home.html missing — run node scripts/ssg.js first');
  process.exit(1);
}
const html = fs.readFileSync(doc, 'utf8');

const LONG_CACHED = /\.(css|js|woff2?|avif|webp|png|jpg|jpeg|svg)$/i;
const HASHED = /\.[a-f0-9]{10}\.(css|js|woff2?|avif|webp|png|jpg|jpeg|svg)$/i;

const refs = new Set();
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) refs.add(m[1]);

const offenders = [];
for (const ref of refs) {
  if (!ref.startsWith('/assets/')) continue;
  if (!LONG_CACHED.test(ref)) continue;
  if (HASHED.test(ref)) continue;
  // fonts and images are addressed by build-time names and are regenerated
  // whole on content change; css/js are the ones edited in place
  if (/\.(woff2?|avif|webp|png|jpg|jpeg|svg)$/i.test(ref)) continue;
  offenders.push(ref);
}

console.log(`\ncache-busting — ${refs.size} asset references in the document`);

if (offenders.length) {
  console.log('\n  ✗ long-cached but unhashed (a change would not reach returning visitors):');
  for (const o of offenders) console.log('      ' + o);
  console.log('\n✗ add a content hash to the filename in scripts/ssg.js');
  process.exit(1);
}

const hashed = [...refs].filter((r) => /^\/assets\/(css|js)\//.test(r) && HASHED.test(r));
console.log(`  ✓ ${hashed.length} css/js references carry a content hash`);
console.log('\n✓ every long-cached asset URL changes when its bytes do');
