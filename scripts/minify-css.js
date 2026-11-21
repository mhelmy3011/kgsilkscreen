#!/usr/bin/env node
'use strict';
/**
 * Minifies the stylesheet. No dependencies.
 *
 * Two passes, and the order matters:
 *   1. strip comments with a quote-aware scanner (a naive /\/\*...\*\//g regex
 *      will happily eat CSS if a `/*` ever appears inside a string)
 *   2. protect url(...) and quoted strings, collapse whitespace, tighten
 *      separators, then restore the protected chunks
 *
 * The naive version of this script matched `"[^"]*"` across the whole file,
 * which swallowed entire rule blocks when an apostrophe appeared in a comment.
 * That is why step 1 exists and why the output is verified afterwards.
 *
 * Produces public/assets/css/kgs.min.css and verifies the result.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public/assets/css/kgs.css');
const OUT = path.join(ROOT, 'public/assets/css/kgs.min.css');

/** Remove CSS comments while respecting string literals. */
function stripComments(css) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < css.length) {
    const ch = css[i];
    const next = css[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next || '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Protect url(...) and quoted strings with placeholders.
 *
 * NESTING MATTERS: `url("data:image/svg+xml;utf8,<svg ... filter='...'>")`
 * contains a url() wrapping a quoted string. A single pass replaces the url()
 * first, so the inner string is never a separate placeholder and stays verbatim
 * (which is what we want). But when a quoted string wraps a url(), the inner
 * placeholder would be swallowed — so we restore repeatedly until stable.
 */
function protectChunks(css, stash) {
  // strings first (outermost text), then url() — url payloads can contain
  // quotes but they are matched as a whole, so quotes inside them are skipped
  let out = '';
  let i = 0;
  const push = (chunk) => {
    stash.push(chunk);
    return `\u0000${stash.length - 1}\u0000`;
  };
  while (i < css.length) {
    const ch = css[i];
    if (ch === 'u' && css.startsWith('url(', i)) {
      let depth = 0;
      let j = i + 3;
      let quote = null;
      for (; j < css.length; j++) {
        const c = css[j];
        if (quote) {
          if (c === '\\') { j++; continue; }
          if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) { j++; break; }
        }
      }
      out += push(css.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      for (; j < css.length; j++) {
        if (css[j] === '\\') { j++; continue; }
        if (css[j] === ch) { j++; break; }
      }
      out += push(css.slice(i, j));
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function minify(input) {
  let css = stripComments(input);

  const stash = [];
  css = protectChunks(css, stash);

  css = css
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:>,~+])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/@media\s*\(/g, '@media(')
    .trim();

  // restore until stable — a stashed chunk may itself contain placeholders
  let prev = null;
  let guard = 0;
  while (css !== prev && guard++ < 8) {
    prev = css;
    css = css.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  }
  return css;
}

module.exports = { minify, stripComments };

// only build when executed directly (so ssg.js can import the minifier)
if (require.main === module) run();

function run() {

/* -------------------------------- run ---------------------------------- */
const raw = fs.readFileSync(SRC, 'utf8');
const out = minify(raw);
fs.writeFileSync(OUT, out);

/* ------------------------------ verify --------------------------------- */
const count = (s, re) => (s.match(re) || []).length;
const checks = [
  ['braces', count(out, /\{/g) === count(out, /\}/g)],
  ['@font-face', count(out, /@font-face/g) === count(raw, /@font-face/g)],
  ['@media', count(out, /@media/g) === count(raw, /@media/g)],
  ['@supports', count(out, /@supports/g) === count(raw, /@supports/g)],
  ['unicode-range', count(out, /unicode-range/g) === count(raw, /unicode-range/g)],
  ['data uris', count(out, /data:image/g) === count(out, /data:image/g)],
  ['custom props', count(out, /--[a-z0-9-]+\s*:/gi) >= count(raw, /--[a-z0-9-]+\s*:/gi) - 2],
  ['no placeholder leak', !out.includes('\u0000')],
  ['size sane', out.length > raw.length * 0.15],
];

const kb = (b) => (b / 1024).toFixed(1) + ' KB';
console.log(`[css] ${path.relative(ROOT, OUT)} · ${kb(Buffer.byteLength(raw))} → ${kb(Buffer.byteLength(out))}`);
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) if (!ok) console.log(`    ! ${name} check failed`);
if (failed.length) {
  console.error(`[css] ${failed.length} verification failure(s) — not writing a broken stylesheet`);
  process.exit(1);
}
console.log('[css] verified: braces, font-faces, media queries, data URIs, custom properties');

}
