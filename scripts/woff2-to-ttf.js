#!/usr/bin/env node
'use strict';
/**
 * woff2-to-ttf.js — decompresses the shipped subset .woff2 files to .ttf.
 *
 * Build-time only: the logo and OG renderers shape text with HarfBuzz, and
 * HarfBuzz/FreeType here can only read TrueType/OpenType, not WOFF2. The .ttf
 * files are artefacts and are git-ignored.
 *
 * Requires fontTools with brotli:  pip install fonttools brotli
 * Usage: node scripts/woff2-to-ttf.js [subset-name ...]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DIR = path.join(__dirname, '..', 'public', 'assets', 'fonts');
const only = process.argv.slice(2);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.woff2'));
const targets = only.length
  ? files.filter((f) => only.some((o) => f.startsWith(o)))
  : files;

let made = 0;
for (const f of targets) {
  const src = path.join(DIR, f);
  const out = src.replace(/\.woff2$/, '.ttf');
  if (fs.existsSync(out)) continue;
  execFileSync('python3', ['-c', `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
f.flavor = None
f.save(sys.argv[2])
`, src, out], { stdio: 'pipe' });
  made++;
  console.log(`[fonts] ${f} → ${path.basename(out)}`);
}
console.log(`[fonts] ${made} converted, ${targets.length - made} already present`);
