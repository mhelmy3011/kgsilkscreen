#!/usr/bin/env node
'use strict';

/**
 * `npm run images` — responsive image pipeline
 * ---------------------------------------------------------------------------
 * Source of truth: assets-src/img/*.{png,jpg} (generated, committed)
 *   · .png  — concept art / flat graphics
 *   · .jpg  — photographic plates (the 2026 shoot). JPEG at q92 4:4:4 is the
 *            master: it is 5x smaller than the PNG and is never palette-reduced,
 *            because 256 colours visibly band a photograph at this size.
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

const sources = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

let made = 0;
let after = 0;
const manifest = {};

for (const file of sources) {
  const name = path.basename(file, path.extname(file));
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

/* Keep the repository small: PNG sources are ~2-2.5 MB each.
 *
 * This step MUST be idempotent. An earlier version palette-reduced every source
 * on every run, which (a) degraded the image a little further each build and
 * (b) left the tree dirty after a no-op build. So it now only touches a source
 * that is not already reduced, and it detects that from the file itself — a
 * palette PNG has a single PLTE chunk — rather than from a side-car stamp that
 * could go stale.
 */
const ARCHIVE = path.join(ROOT, 'assets-src', 'original');

function isPalettePng(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(64 * 1024);
  const read = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return buf.slice(0, read).includes('PLTE');
}

fs.mkdirSync(ARCHIVE, { recursive: true });
let saved = 0;
let touched = 0;
for (const file of sources) {
  if (!/\.png$/i.test(file)) continue;   // photographic JPEGs are already masters
  const src = path.join(SRC, file);
  const before = fs.statSync(src).size;
  if (before < 600 * 1024) continue;      // already small enough
  if (isPalettePng(src)) continue;        // already reduced — leave it alone

  const orig = path.join(ARCHIVE, file);
  if (!fs.existsSync(orig)) fs.copyFileSync(src, orig);

  execFileSync('convert', [src, '-strip', '-define', 'png:compression-level=9',
    '-colors', '256', '-dither', 'FloydSteinberg', src + '.tmp.png']);
  const reduced = fs.statSync(src + '.tmp.png').size;
  if (reduced < before) {
    fs.renameSync(src + '.tmp.png', src);
    saved += before - reduced;
    touched++;
  } else {
    fs.unlinkSync(src + '.tmp.png');
  }
}
if (touched) console.log(`[images] ${touched} source(s) reduced · saved ${(saved / 1024).toFixed(0)} KB in git`);

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 0));
console.log(`[images] ${sources.length} sources → ${made} files · encoded total ${kb(after)} (all variants)`);
console.log(`[images] output: ${path.relative(ROOT, OUT)}`);
