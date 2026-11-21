#!/usr/bin/env node
'use strict';
/**
 * Copies the subset .woff2 files the page needs out of node_modules and into
 * public/assets/fonts, so the server never depends on node_modules at runtime.
 *
 * Alexandria (display + body, Arabic & Latin, 400/700/900) and IBM Plex Mono
 * (numerals + micro labels). Cairo is still used by the three concept pages.
 *
 * Also emits .ttf copies on demand for the offline OG renderer:
 *   node scripts/build-fonts.js --ttf
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public/assets/fonts');
fs.mkdirSync(OUT, { recursive: true });

const WANT = [
  ['@fontsource/alexandria', ['alexandria-arabic-{400,700,900}-normal.woff2', 'alexandria-latin-{400,700,900}-normal.woff2']],
  ['@fontsource/ibm-plex-mono', ['ibm-plex-mono-latin-{400,500}-normal.woff2']],
  ['@fontsource/cairo', ['cairo-arabic-{400,700,900}-normal.woff2', 'cairo-latin-{400,700,900}-normal.woff2']],
];

let n = 0;
for (const [pkg, patterns] of WANT) {
  const dir = path.join(ROOT, 'node_modules', pkg, 'files');
  if (!fs.existsSync(dir)) {
    console.warn(`  ! ${pkg} not installed — run npm install`);
    continue;
  }
  for (const pat of patterns) {
    // "{400,700,900}-normal.woff2" → "^(...)-(400|700|900)-normal\.woff2$"
    const re = new RegExp(
      '^' + pat.replace(/[.+]/g, '\\$&').replace('{', '(').replace('}', ')').replace(/,/g, '|') + '$'
    );
    for (const f of fs.readdirSync(dir)) {
      if (!re.test(f)) continue;
      fs.copyFileSync(path.join(dir, f), path.join(OUT, f));
      n++;
    }
  }
}
console.log(`[fonts] ${n} subset(s) copied to ${path.relative(ROOT, OUT)}`);

if (process.argv.includes('--ttf')) {
  // The OG renderer needs TTF because FreeType/HarfBuzz can't read woff2 here.
  const py = `import glob,os
from fontTools.ttLib import TTFont
for p in glob.glob("${OUT}/*-normal.woff2"):
    try:
        f=TTFont(p); f.flavor=None; f.save(p.replace(".woff2",".ttf"))
    except Exception as e: print("skip",p,e)
`;
  execFileSync('python3', ['-c', py], { stdio: 'inherit' });
  console.log('[fonts] .ttf copies written for the OG renderer');
}
