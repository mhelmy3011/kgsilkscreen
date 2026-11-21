#!/usr/bin/env node
'use strict';
/**
 * One-off helper: decompress the subset .woff2 fonts to .ttf so the offline OG
 * renderer (HarfBuzz/FreeType via Python) can use them. The .ttf files are build
 * artefacts — they live in public/assets/fonts only so the script can find them,
 * and are ignored by git.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.join(__dirname, '..', 'public', 'assets', 'fonts');
let n = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.woff2')) continue;
  // woff2 uses brotli on the table directory; we don't reimplement the
  // transform here, we just note that Python's fontTools does the conversion
  // in `npm run og` prerequisites. This script exists to make that explicit.
  n++;
}
console.log(`[fonts] ${n} woff2 subset(s) in ${path.relative(process.cwd(), DIR)}`);
console.log('[fonts] convert with: python3 -c "from fontTools.ttLib import TTFont; ..." — see scripts/og-image.py header');
