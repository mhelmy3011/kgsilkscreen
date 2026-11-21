#!/usr/bin/env node
'use strict';

/**
 * `npm run export` → dist/
 * ---------------------------------------------------------------------------
 * Hostinger shared hosting has two viable deployment shapes:
 *
 *   A) Node.js app  (hPanel → Advanced → Node.js)  → `npm install && npm start`
 *      Use this if your plan lists Node.js. The server sends compression + cache
 *      headers, and you keep /api/health for uptime checks.
 *
 *   B) Static upload → public_html
 *      Use this if Node.js is not offered on your plan. This script copies the
 *      exact same files plus .htaccess into dist/; upload the *contents* of
 *      dist/ into public_html. Nothing is lost — the landing page is already
 *      plain HTML/CSS/JS with no build step.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function bytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? bytes(p) : fs.statSync(p).size;
  }
  return total;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

rmrf(OUT);
copyDir(SRC, OUT);

/* Static hosting has no server to rewrite "/" → home.html, so the pre-rendered
   document becomes index.html and the source stays as home.html (the loader
   stub in public/index.html is a client-side redirect, which we don't want as
   the real entry point here). */
/* The prototype concepts are development references, not part of the site.
   Shipping them means shipping three extra pages into Google's index and
   three sets of near-duplicate meta tags competing with the real one. */
const DEV_ONLY = ['concept-1', 'concept-2', 'concept-3', 'hub.html'];
for (const name of DEV_ONLY) {
  const target = path.join(OUT, name);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[export] excluded /${name} (development reference only)`);
  }
}

const SSG = path.join(OUT, '_ssg', 'home.html');
const SSG_SRC = path.join(ROOT, 'public', '_ssg', 'home.html');
if (fs.existsSync(SSG_SRC)) {
  fs.copyFileSync(SSG_SRC, path.join(OUT, 'index.html'));
  fs.copyFileSync(SSG_SRC, path.join(OUT, 'home.html'));
  fs.rmSync(path.join(OUT, '_ssg'), { recursive: true, force: true });
  console.log('[export] index.html = pre-rendered landing page (SSG)');
} else {
  console.warn('[export] no SSG build found — run `npm run ssg` first for the full page');
}

/* .htaccess used to live at the repository root, and this step copied it over
 * the one that `copyDir(public/)` had already placed in dist/ — so edits to
 * public/.htaccess were silently discarded on every export. There is now one
 * file, public/.htaccess, and it travels with the rest of public/.
 *
 * The regression is asserted below rather than trusted. */
const htaccess = path.join(OUT, '.htaccess');
if (!fs.existsSync(htaccess)) {
  console.error('[export] dist/.htaccess is missing — Apache would serve the site uncompressed');
  process.exitCode = 1;
} else {
  console.log(`[export] .htaccess shipped (${fs.statSync(htaccess).size} B)`);
}

const files = walk(OUT).map((f) => path.relative(OUT, f));
const totalKb = (bytes(OUT) / 1024).toFixed(1);

console.log(`\n[export] dist/ built — ${files.length} files, ${totalKb} KB total`);
for (const f of files.sort()) console.log('  · ' + f);
console.log('\n[export] ارفع محتويات dist/ داخل public_html على هوستنجر.');
console.log('[export] Upload the *contents* of dist/ into public_html.\n');
