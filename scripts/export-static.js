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

// Root .htaccess is kept in the repo root and must travel with the static build.
const htaccess = path.join(ROOT, '.htaccess');
if (fs.existsSync(htaccess)) fs.copyFileSync(htaccess, path.join(OUT, '.htaccess'));

const files = walk(OUT).map((f) => path.relative(OUT, f));
const totalKb = (bytes(OUT) / 1024).toFixed(1);

console.log(`\n[export] dist/ built — ${files.length} files, ${totalKb} KB total`);
for (const f of files.sort()) console.log('  · ' + f);
console.log('\n[export] ارفع محتويات dist/ داخل public_html على هوستنجر.');
console.log('[export] Upload the *contents* of dist/ into public_html.\n');
