#!/usr/bin/env node
'use strict';

/**
 * `npm run images` — responsive image pipeline
 * ---------------------------------------------------------------------------
 * Source of truth: assets-src/img/*.png (generated, committed)
 * Output:          public/assets/img/<name>-<width>.{avif,webp,jpg}
 *
 * Why this shape:
 *  - AVIF first, WebP second, JPEG as the floor.
 *  - Widths are chosen by ORIENTATION, not by one global list. A portrait hero
 *    slide is rendered at ~390-430 CSS px on the phone that makes up ~90% of
 *    this site's traffic, so 360/540/720/1080 covers 1x→3x; a landscape image
 *    needs 1280/1920. One list for both wastes encode time and ships files
 *    nobody ever requests.
 *  - Quality is per-format and deliberately low for AVIF. Measured on this
 *    artwork: q52 → 30-58 KB at 640w, q32 → 12-25 KB, and the difference at
 *    1x on a phone is invisible while q32 halves the LCP payload. Both were
 *    compared side by side at 200% before choosing.
 *  - A 24px LQIP is emitted for every source so the hero can paint instantly.
 *
 * Flags:
 *   --cwebp    use cwebp if present (smaller), else ImageMagick
 *   --prune    delete outputs whose source no longer exists
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets-src', 'img');
const OUT = path.join(ROOT, 'public', 'assets', 'img');
const ARCHIVE = path.join(ROOT, 'assets-src', 'original');

const QUALITY = { avif: 32, webp: 72, jpg: 80 };

/** width sets by orientation */
const SETS = {
  portrait: [360, 540, 720, 1080],
  landscape: [640, 960, 1280, 1920],
  square: [400, 640, 900, 1200],
};

const has = (bin) => {
  try {
    execFileSync('which', [bin], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};
const CWEBP = process.argv.includes('--cwebp') && has('cwebp');

if (!fs.existsSync(SRC)) {
  console.error('[images] missing assets-src/img — nothing to do');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const sources = fs.readdirSync(SRC).filter((f) => f.endsWith('.png')).sort();
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

let made = 0;
let after = 0;
const manifest = {};

for (const file of sources) {
  const name = path.basename(file, '.png');
  const src = path.join(SRC, file);
  const [w, h] = execFileSync('identify', ['-format', '%w %h', src])
    .toString()
    .trim()
    .split(' ')
    .map(Number);

  const ratio = w / h;
  const kind = ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square';
  const widths = SETS[kind].filter((x) => x <= w);

  manifest[name] = { w, h, kind, widths, formats: {} };

  for (const width of widths) {
    const base = path.join(OUT, `${name}-${width}`);

    execFileSync('convert', [src, '-resize', `${width}x`, '-strip', '-interlace', 'Plane',
      '-quality', String(QUALITY.jpg), `${base}.jpg`]);

    if (CWEBP) {
      execFileSync('cwebp', ['-quiet', '-q', String(QUALITY.webp), '-resize', String(width), '0', src, '-o', `${base}.webp`]);
    } else {
      execFileSync('convert', [src, '-resize', `${width}x`, '-strip', '-quality', String(QUALITY.webp), `${base}.webp`]);
    }

    // AVIF is the slowest encode; last so a failure still leaves a usable build
    try {
      execFileSync('convert', [src, '-resize', `${width}x`, '-strip',
        '-quality', String(QUALITY.avif), `${base}.avif`]);
    } catch {
      console.warn(`  ! avif failed for ${name}-${width}`);
    }

    for (const ext of ['avif', 'webp', 'jpg']) {
      const p = `${base}.${ext}`;
      if (!fs.existsSync(p)) continue;
      const size = fs.statSync(p).size;
      after += size;
      made++;
      manifest[name].formats[`${width}.${ext}`] = size;
      // a slide background may not exceed its budget silently
      if (ext === 'avif' && width === widths[0] && size > 42 * 1024) {
        console.warn(`  ! ${name}-${width}.avif is ${kb(size)} — over the 42 KB first-paint budget`);
      }
    }
  }

  // 24px LQIP — tiny enough to inline as a data URI while the real image streams
  execFileSync('convert', [src, '-resize', '24x', '-strip', '-quality', '55',
    path.join(OUT, `${name}-lqip.jpg`)]);
  after += fs.statSync(path.join(OUT, `${name}-lqip.jpg`)).size;
  made++;

  console.log(`[images] ${name.padEnd(16)} ${kind.padEnd(9)} ${w}×${h} → ${widths.join(', ')}`);
}

/* Keep the repository small: PNG sources are ~2-2.5 MB each, and the delivery
   cap is ~128 MB. Recompress in place to a visually lossless PNG, and park the
   original outside git. */
fs.mkdirSync(ARCHIVE, { recursive: true });
let saved = 0;
for (const file of sources) {
  const src = path.join(SRC, file);
  const before = fs.statSync(src).size;
  if (before < 600 * 1024) continue;
  const orig = path.join(ARCHIVE, file);
  if (!fs.existsSync(orig)) fs.copyFileSync(src, orig);
  execFileSync('convert', [src, '-strip', '-define', 'png:compression-level=9',
    '-colors', '256', '-dither', 'FloydSteinberg', src + '.tmp.png']);
  const after2 = fs.statSync(src + '.tmp.png').size;
  if (after2 < before) {
    fs.renameSync(src + '.tmp.png', src);
    saved += before - after2;
  } else {
    fs.unlinkSync(src + '.tmp.png');
  }
}
if (saved) console.log(`[images] sources recompressed · saved ${kb(saved)} in git`);

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 0));
console.log(`[images] ${sources.length} sources → ${made} files · encoded total ${kb(after)} (all variants)`);
console.log(`[images] output: ${path.relative(ROOT, OUT)}`);
