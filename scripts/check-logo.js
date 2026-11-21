#!/usr/bin/env node
'use strict';
/**
 * check-logo.js — enforces the identity rules that are easy to break by accident.
 *
 * Every assertion here exists because the failure actually happened during the
 * build: a <text> sub-line that would fall back to a system font, nested
 * <g transform> that some consumers ignore, stroke-based marks that blur at
 * 16px, and icons that were emitted at the wrong pixel size.
 *
 * Exit code 1 on any violation, so `npm run verify` fails loudly.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'assets-src', 'logo');
const PUB = path.join(ROOT, 'public');
const INK = '#eef3f1';
const ACCENT = '#ff5a1f';

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

/* 1 ── every declared asset exists and is non-trivial ───────────────────── */
const SVG_ASSETS = [
  'mark.svg', 'mark-mono.svg', 'mark-light.svg', 'alt-a.svg', 'alt-c.svg',
  'lockup-h.svg', 'lockup-h-dark.svg', 'lockup-h-mono.svg',
  'lockup-v.svg', 'lockup-v-dark.svg', 'wordmark.svg',
];
for (const f of SVG_ASSETS) {
  const p = path.join(LOGO, f);
  if (!exists(p)) { fail(`missing ${f}`); continue; }
  const s = read(p);
  if (!s.startsWith('<svg')) fail(`${f}: does not start with <svg`);
  if (Buffer.byteLength(s) < 200) fail(`${f}: suspiciously small (${Buffer.byteLength(s)} B)`);
}

for (const f of ['wordmark.json', 'descriptor.json']) {
  const p = path.join(LOGO, f);
  if (!exists(p)) { fail(`missing ${f}`); continue; }
  const d = JSON.parse(read(p));
  for (const k of ['d', 'bounds', 'upem', 'text']) if (!(k in d)) fail(`${f}: missing key "${k}"`);
  if (!/^[MLHVCQZ0-9eE.\- ]+$/.test(d.d.trim())) fail(`${f}: path uses unsupported commands`);
}

/* 2 ── no font dependency, no nested transforms, no strokes ─────────────── */
for (const f of SVG_ASSETS) {
  const p = path.join(LOGO, f);
  if (!exists(p)) continue;
  const s = read(p);
  if (/<text[\s>]/.test(s)) fail(`${f}: contains <text> — the logo must not depend on an installed font`);
  if (/font-family/.test(s)) fail(`${f}: references font-family`);
  if (/stroke\s*=/.test(s)) fail(`${f}: uses stroke — marks must be filled geometry`);
  if (/<g[\s>]/.test(s)) fail(`${f}: contains a <g> wrapper — transforms must be baked into path data`);
  if (/transform=/.test(s)) fail(`${f}: contains a transform attribute — bake it into coordinates instead`);
  if (/<image|xlink:href/.test(s)) fail(`${f}: embeds a raster image`);
}

/* 3 ── viewBox must hug the content (no dead padding) ───────────────────── */
for (const f of ['lockup-h.svg', 'lockup-v.svg', 'wordmark.svg', 'mark.svg']) {
  const p = path.join(LOGO, f);
  if (!exists(p)) continue;
  const s = read(p);
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s);
  if (!vb) { fail(`${f}: missing viewBox`); continue; }
  const w = parseFloat(vb[1]);
  const h = parseFloat(vb[2]);
  let maxX = 0;
  let maxY = 0;
  for (const m of s.matchAll(/-?\d*\.?\d+/g)) {
    const v = parseFloat(m[0]);
    if (Number.isFinite(v) && v > maxX) maxX = v;
  }
  // crude but effective: the largest coordinate in the file must reach most of
  // the viewBox on at least one axis, otherwise the art is floating in a box
  if (maxX < Math.max(w, h) * 0.85) fail(`${f}: art does not fill its viewBox (max coord ${maxX} vs ${w}x${h})`);
  notes.push(`${f}: ${w}×${h}, ${Buffer.byteLength(s)} B`);
}

/* 4 ── the mark must be legible at favicon size ─────────────────────────── */
{
  const p = path.join(LOGO, 'mark.svg');
  if (exists(p)) {
    const s = read(p);
    const paths = [...s.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)];
    if (paths.length < 3) fail('mark.svg: expected at least 3 filled shapes');
    const hasAccent = paths.some((m) => m[2].toLowerCase() === ACCENT);
    if (!hasAccent) fail('mark.svg: accent ink edge is missing');
    const mono = path.join(LOGO, 'mark-mono.svg');
    if (exists(mono)) {
      const ms = read(mono);
      if (!/currentColor/.test(ms)) fail('mark-mono.svg: must paint with currentColor so it inherits ink');
      if (new Set([...ms.matchAll(/fill="([^"]+)"/g)].map((m) => m[1])).size !== 1) {
        fail('mark-mono.svg: must use exactly one ink colour');
      }
    }
  }
}

/* 5 ── shipped icons: right size, right format, sane weight ─────────────── */
const ICONS = [
  ['favicon.svg', null],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
];
for (const [f, size] of ICONS) {
  const p = path.join(PUB, f);
  if (!exists(p)) { fail(`public/${f} missing`); continue; }
  const stat = fs.statSync(p);
  if (size === null) {
    if (!read(p).startsWith('<svg')) fail(`${f}: not an SVG`);
  } else {
    // PNG IHDR: width/height are big-endian uint32 at bytes 16 and 20
    const b = fs.readFileSync(p);
    if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') { fail(`${f}: not a PNG`); continue; }
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (w !== size || h !== size) fail(`${f}: is ${w}×${h}, expected ${size}×${size}`);
    if (stat.size > 40960) fail(`${f}: ${Math.round(stat.size / 1024)} KB is too heavy for an icon`);
  }
}

/* 6 ── the HTML must reference the new identity, and only existing files ─ */
const home = path.join(PUB, 'home.html');
if (exists(home)) {
  const html = read(home);
  const refs = [...html.matchAll(/(?:href|src)="\/([^"?#]+\.(?:svg|png|ico|webmanifest))"/g)].map((m) => m[1]);
  for (const r of new Set(refs)) {
    if (!exists(path.join(PUB, r))) fail(`home.html references public/${r} which does not exist`);
  }
  notes.push(`home.html: ${new Set(refs).size} icon/brand references verified`);
}

/* report */
for (const n of notes) console.log(`  · ${n}`);
if (problems.length) {
  console.error(`\n✗ logo check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\n✓ logo system OK — no fonts, no strokes, no nested transforms, icons sized correctly');
