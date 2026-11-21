#!/usr/bin/env node
'use strict';
/**
 * check-firstview.js — gate: the hero must stay legible on every phone size.
 *
 * preview-firstview.js composites the real first viewport from kgs.css; this
 * runs it across the sizes that actually walk through the door (a 320px
 * iPhone SE through a 430px Pro Max, plus the desktop breakpoints) and fails
 * if any size drops below WCAG AA where the copy sits.
 *
 * This exists because the hero has already shipped broken twice: once with the
 * photograph erased by its own scrim, once with the brand name breaking
 * mid-word on desktop. Neither was catchable by asserting CSS properties.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SIZES = [
  [320, 568, 'iPhone SE (1st gen / small Android)'],
  [360, 640, 'common budget Android, short'],
  [375, 667, 'iPhone 8'],
  [390, 844, 'iPhone 13/14/15'],
  [414, 896, 'iPhone 11 Pro Max'],
  [430, 932, 'iPhone 15 Pro Max'],
  [900, 700, 'smallest desktop / landscape tablet'],
  [1280, 800, 'laptop'],
  [1440, 900, 'desktop'],
];

const script = path.join(__dirname, 'preview-firstview.js');
let failed = 0;

console.log(`\nfirst-view legibility — ${SIZES.length} viewports`);

for (const [w, h, label] of SIZES) {
  let out = '';
  let ok = true;
  try {
    out = execFileSync(process.execPath, [script, String(w), String(h), `/tmp/kgs-firstview-${w}x${h}.png`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    ok = false;
    out = (err.stdout || '') + (err.stderr || '');
  }

  const lines = out.split('\n').filter((l) => /[✓✗]/.test(l));
  const worst = lines
    .map((l) => /([0-9.]+):1/.exec(l))
    .filter(Boolean)
    .map((m) => parseFloat(m[1]))
    .reduce((a, b) => Math.min(a, b), Infinity);

  const wrapNote = /layout/.test(out) ? '' : '';
  if (ok) {
    console.log(`  ✓ ${String(w).padStart(4)}x${h}  worst ${worst.toFixed(2)}:1  ${label}${wrapNote}`);
  } else {
    failed++;
    console.log(`  ✗ ${String(w).padStart(4)}x${h}  ${label}`);
    for (const l of lines) console.log('      ' + l.trim());
  }
}

if (failed) {
  console.log(`\n✗ ${failed} viewport(s) below AA where the hero copy sits`);
  process.exit(1);
}
console.log('\n✓ hero copy meets WCAG AA on every tested viewport');
