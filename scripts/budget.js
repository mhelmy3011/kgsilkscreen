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

// Budgets are per-viewport, and per-resource so a regression is traceable to
// the file that caused it. A first view is: the document, the CSS that gates
// paint, the two Arabic faces that render above the fold, the JS that is
// deferred, and the ONE image the browser is told to prioritise.
//
// Slides 2 and 3 are absent on purpose — they are `loading=lazy`, so they are
// not part of the first view on either device. If they ever appear here, it
// means someone removed the lazy attribute and broke the LCP budget.
const BUDGETS = {
  mobile360: {
    label: 'Mobile 360x800 · first view',
    maxKB: 110,
    perAsset: {
      // The light redesign deletes the WebGL ink engine entirely: three scripts
      // (~26 KB raw) are replaced by one IntersectionObserver/rAF module. The
      // only motion left is opacity/transform. The aggregate budget stays at
      // 110 KB, and the first view now carries fewer bytes than before.
      '/': 18,
      '/assets/css/kgs.min.css': 9,
      '/assets/js/kgs-hero.js': 2.5,
      '/assets/js/kgs-motion.js': 4,
      '/assets/js/kgs-quote.js': 2,
      '/assets/fonts/tajawal-arabic-900-normal.woff2': 13,
      '/assets/fonts/tajawal-arabic-700-normal.woff2': 13,
      '/assets/fonts/tajawal-arabic-400-normal.woff2': 13,
      // the LCP image at 360w AVIF — plan target was <= 42 KB
      '/assets/img/slide-1-pull-360.avif': 42,
    },
    assets: ['/', '/assets/css/kgs.min.css', '/assets/js/kgs-hero.js',
      '/assets/js/kgs-motion.js', '/assets/js/kgs-quote.js',
      '/assets/fonts/tajawal-arabic-900-normal.woff2',
      '/assets/fonts/tajawal-arabic-700-normal.woff2',
      '/assets/fonts/tajawal-arabic-400-normal.woff2',
      '/assets/img/slide-1-pull-360.avif'],
  },
  desktop: {
    label: 'Desktop 1440x900 · first view',
    maxKB: 190,
    perAsset: { '/assets/img/slide-1-pull-720.avif': 60 },
    assets: ['/', '/assets/css/kgs.min.css', '/assets/js/kgs-hero.js',
      '/assets/js/kgs-motion.js', '/assets/js/kgs-quote.js',
      '/assets/fonts/tajawal-arabic-900-normal.woff2',
      '/assets/fonts/tajawal-arabic-700-normal.woff2',
      '/assets/fonts/tajawal-arabic-400-normal.woff2',
      '/assets/img/slide-1-pull-720.avif'],
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
    const over = rows.filter((r) => b.perAsset?.[r.path] && r.bytes / 1024 > b.perAsset[r.path]);
    const ok = kb <= b.maxKB && rows.every((r) => r.status === 200) && !over.length;
    if (!ok) fail++;
    if (over.length) {
      for (const r of over) {
        console.log(`  ! ${r.path} is ${(r.bytes / 1024).toFixed(1)} KB (limit ${b.perAsset[r.path]} KB)`);
      }
    }
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
