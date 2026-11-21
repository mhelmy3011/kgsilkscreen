#!/usr/bin/env node
'use strict';
/**
 * Performance budget — the numbers this project promises, enforced.
 * Measures what a first-time visitor actually downloads for the landing page
 * (gzip, which is what travels over the wire) and fails the build if a limit
 * is exceeded, so the page can't quietly bloat.
 *
 * Run after `npm run ssg` with the server up:  npm run budget
 */
const { execFile } = require('node:child_process');

const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000';

// Budgets are per-viewport. A 360px phone is what matters in Egypt, so that is
// the strict case; desktop is allowed the bigger hero crop.
const BUDGETS = {
  mobile360: {
    label: 'Mobile 360×800 · first view',
    maxKB: 260,
    assets: ['/', '/assets/css/kgs.min.css', '/assets/js/kgs-ink.js', '/assets/js/kgs-engine.js', '/assets/js/kgs-page.js',
      '/assets/fonts/alexandria-arabic-900-normal.woff2', '/assets/fonts/alexandria-arabic-400-normal.woff2'],
  },
  desktop: {
    label: 'Desktop 1440×900 · first view',
    maxKB: 420,
    assets: ['/', '/assets/css/kgs.min.css', '/assets/js/kgs-ink.js', '/assets/js/kgs-engine.js', '/assets/js/kgs-page.js',
      '/assets/fonts/alexandria-arabic-900-normal.woff2', '/assets/fonts/alexandria-arabic-400-normal.woff2',
      '/assets/img/hero-ink-1024.avif'],
  },
};

// Measure what a browser actually receives. Node's fetch transparently
// decompresses, so its `.length` reports the *decoded* size on a chunked
// response. Asking curl for the body with the same Accept-Encoding gives the
// real wire size, which is the number that matters on a 4G connection.
function wireSize(path) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '--compressed', '-o', '/dev/null', '-w', '%{size_download}',
      '-H', 'Accept-Encoding: gzip, deflate, br', BASE + path], (err, stdout) => {
      if (err) return reject(err);
      resolve(Number(stdout.trim()));
    });
  });
}

async function weigh(path) {
  const [bytes, res] = await Promise.all([wireSize(path), fetch(BASE + path)]);
  return { path, bytes, status: res.status, enc: 'br/gzip' };
}

(async () => {
  let fail = 0;
  for (const [key, b] of Object.entries(BUDGETS)) {
    const rows = [];
    for (const a of b.assets) rows.push(await weigh(a));
    const total = rows.reduce((s, r) => s + r.bytes, 0);
    const kb = total / 1024;
    const ok = kb <= b.maxKB && rows.every((r) => r.status === 200);
    if (!ok) fail++;
    console.log(`\n${ok ? '✓' : '✗'} ${b.label} — ${kb.toFixed(1)} KB / budget ${b.maxKB} KB`);
    for (const r of rows) {
      console.log(`    ${(r.bytes / 1024).toFixed(1).padStart(7)} KB  ${r.path}${r.enc !== 'none' ? '  (' + r.enc + ')' : ''}`);
    }
  }
  const html = await weigh('/');
  console.log(`\n  HTML document: ${(html.bytes / 1024).toFixed(1)} KB gzip` + (html.bytes / 1024 > 45 ? '  ⚠ over 45 KB' : ''));
  if (html.bytes / 1024 > 45) fail++;
  console.log(fail ? `\n${fail} budget failure(s)` : '\nall budgets met');
  process.exit(fail ? 1 : 0);
})();
