#!/usr/bin/env node
'use strict';

/**
 * `npm run images` — responsive image pipeline
 * ---------------------------------------------------------------------------
 * Source of truth: assets-src/img/*.png (generated, committed)
 * Output:          public/assets/img/<name>-<width>.{avif,webp,jpg}
 *
 * Why this shape:
 *  - AVIF first (≈50% smaller than JPEG), WebP second, JPEG as the floor.
 *  - Three widths only. More variants cost build time and fill the CDN with
 *    files nobody requests; 640/1024/1600 covers a 360px phone through a
 *    retina laptop at the sizes these images are actually rendered.
 *  - Hero art is generated once as a flat colour wash so it costs ~30 KB and
 *    can be used as the LQIP placeholder while the real file streams in.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets-src', 'img');
const OUT = path.join(ROOT, 'public', 'assets', 'img');
const WIDTHS = [640, 1024, 1600];
const QUALITY = { avif: 52, webp: 76, jpg: 82 };

if (!fs.existsSync(SRC)) {
  console.error('[images] missing assets-src/img — nothing to do');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const sources = fs.readdirSync(SRC).filter((f) => f.endsWith('.png'));
let made = 0;
let before = 0;
let after = 0;

for (const file of sources) {
  const name = path.basename(file, '.png');
  const src = path.join(SRC, file);
  const meta = execFileSync('identify', ['-format', '%w %h', src]).toString().trim().split(' ').map(Number);
  before += fs.statSync(src).size;

  for (const w of WIDTHS) {
    if (w > meta[0]) continue;
    const base = path.join(OUT, `${name}-${w}`);

    execFileSync('convert', [src, '-resize', `${w}x`, '-strip', '-interlace', 'Plane', '-quality', String(QUALITY.jpg), `${base}.jpg`]);
    execFileSync('convert', [src, '-resize', `${w}x`, '-strip', '-quality', String(QUALITY.webp), `${base}.webp`]);
    // AVIF is the slowest encode; keep it last so a failure still leaves a usable build
    try {
      execFileSync('convert', [src, '-resize', `${w}x`, '-strip', '-quality', String(QUALITY.avif), `${base}.avif`]);
    } catch {
      console.warn(`  ! avif failed for ${name}-${w}`);
    }

    for (const ext of ['avif', 'webp', 'jpg']) {
      const p = `${base}.${ext}`;
      if (fs.existsSync(p)) {
        after += fs.statSync(p).size;
        made++;
      }
    }
  }

  // 24px wide, heavily blurred LQIP as an inline-able base64 string
  execFileSync('convert', [src, '-resize', '24x', '-strip', '-quality', '60', path.join(OUT, `${name}-lqip.jpg`)]);
  after += fs.statSync(path.join(OUT, `${name}-lqip.jpg`)).size;
  made++;
}

const kb = (b) => (b / 1024).toFixed(0) + ' KB';
console.log(`[images] ${sources.length} sources → ${made} files`);
console.log(`[images] source ${kb(before)} · encoded total ${kb(after)} (all variants)`);
console.log(`[images] output: ${path.relative(ROOT, OUT)}`);
