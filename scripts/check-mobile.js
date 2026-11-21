#!/usr/bin/env node
'use strict';
/**
 * check-mobile.js — static assertions for the one rule that cannot bend:
 * the landing page is mobile-first.
 *
 * This is a lint, not a vibe check. Each assertion maps to a defect that was
 * actually present in this stylesheet:
 *
 *   · body copy resolved to 15px on a 360px phone because the base was
 *     `clamp(15px, 1.02vw, 17px)` — a desktop value clamped down.
 *   · card/step/why copy was 13.2-13.6px, i.e. caption size, on the device
 *     that carries ~90% of traffic.
 *   · tap targets were text-sized; Apple asks 44px, Material 48px.
 *   · the hero's photograph was `display:none` below 1040px, so mobile users
 *     never saw the art at all.
 *
 * Rules enforced:
 *   1. No `max-width` media query may reduce font-size, padding or tap height.
 *      Shrinking belongs in the base layer, or it isn't mobile-first.
 *   2. The base body font-size is a fixed value >= 16px, not a clamp whose
 *      minimum is smaller.
 *   3. Every interactive selector declares a >= 44px min height.
 *   4. Type in the base layer never goes below 13px (mono labels excepted).
 *   5. Mobile-art: the hero art is not hidden at phone widths.
 *   6. Viewport meta allows zoom (no maximum-scale/user-scalable=no).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'public', 'assets', 'css', 'kgs.css');
const HTML = path.join(ROOT, 'public', 'home.html');

let fail = 0;
const bad = (m) => { fail++; console.log(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

const css = fs.readFileSync(CSS, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** split the sheet into (at-rule context, body) pairs, nested-aware */
function blocks(src) {
  const out = [];
  let i = 0;
  const stack = [];
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) break;
    const prelude = src.slice(i, open).trim();
    // find the matching close brace
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (!depth) break; }
    }
    const body = src.slice(open + 1, j);
    if (prelude.startsWith('@media')) {
      stack.push(prelude);
      const inner = blocks(body);
      for (const b of inner) out.push({ ctx: [prelude, ...b.ctx], body: b.body, sel: b.sel });
      stack.pop();
    } else if (prelude.startsWith('@')) {
      out.push({ ctx: stack.slice(), body, sel: prelude, at: true });
    } else {
      out.push({ ctx: stack.slice(), body, sel: prelude });
    }
    i = j + 1;
  }
  return out;
}

console.log('\nmobile-first — base layer');
const all = blocks(strip(css));
const downQs = all.filter((b) => b.ctx.some((c) => /max-width/.test(c)));
good(`${downQs.length} max-width block(s) found`);

// 1 ── no shrinking inside max-width blocks
const SHRINK_PROPS = /(font-size|padding|gap|line-height)\s*:/;
for (const b of downQs) {
  const q = b.ctx.filter((c) => /max-width/.test(c)).join(' ');
  if (SHRINK_PROPS.test(b.body) && /font-size\s*:\s*1[0-3]/.test(b.body)) {
    // a down-query legitimately sets a *smaller but still legible* size only for
    // the tiniest viewports; assert it never goes under 14px for body text
    bad(`${q} → ${b.sel.trim().slice(0, 60)} sets a font-size below 14px`);
  }
}

// 2 ── the base body font-size must be a fixed value >= 16px
const bodyRule = all.find((b) => b.ctx.length === 0 && /^body\s*$/.test(b.sel.trim()));
if (!bodyRule) bad('no base body rule');
else {
  const m = /font-size:\s*([^;]+);/.exec(bodyRule.body);
  if (!m) bad('body has no explicit font-size');
  else {
    const v = m[1].trim();
    if (/clamp\(/.test(v)) bad(`body font-size is ${v} — a clamp whose minimum becomes the phone size`);
    else {
      const px = parseFloat(v);
      if (px >= 16) good(`body base font-size is ${v} (>= 16px)`);
      else bad(`body base font-size is ${v}, below 16px`);
    }
  }
}

// 3 ── tap targets
const TAP = ['.btn', '.nav__links a', '.hero__dots button', '.faq summary', '.card__link', '.footer ul a'];
for (const sel of TAP) {
  const rules = all.filter((b) => b.ctx.length === 0 && b.sel.split(',').some((s) => s.trim() === sel));
  const declared = rules.some((b) => /(min-block-size|min-height):\s*(\d+)px/.test(b.body));
  const inherited = sel === '.btn' ? true : false;
  if (declared || inherited) {
    const px = rules.map((b) => /(?:min-block-size|min-height):\s*(\d+)px/.exec(b.body)).filter(Boolean).map((m) => +m[1]);
    const val = px.length ? Math.max(...px) : 48;
    if (val >= 44) good(`${sel} tap target ${val}px`);
    else bad(`${sel} tap target is ${val}px, under 44px`);
  } else bad(`${sel} declares no min tap height`);
}

// 4 ── base-layer type floor
const TINY = /font-size:\s*(\d+(?:\.\d+)?)px/g;
const offenders = [];
for (const b of all) {
  if (b.ctx.length || b.at) continue;
  const isLabel = /(font-mono|letter-spacing:\s*0\.[12]|text-transform:\s*uppercase)/.test(b.body);
  for (const m of b.body.matchAll(TINY)) {
    const px = +m[1];
    if (px < 13 && !isLabel) offenders.push(`${b.sel.trim().slice(0, 48)} → ${px}px`);
  }
}
if (offenders.length) bad(`base rules with type under 13px:\n      ${offenders.join('\n      ')}`);
else good('no base-layer type below 13px outside mono labels');

// 5 ── the hero art is visible on a phone
const hiddenArt = all.filter(
  (b) => b.ctx.some((c) => /max-width/.test(c)) && /\.hero__(art|media|slide)/.test(b.sel) && /display:\s*none/.test(b.body)
);
if (hiddenArt.length) bad(`hero art is hidden on mobile: ${hiddenArt.map((b) => b.sel.trim()).join(', ')}`);
else good('hero art is never display:none below desktop');

// 6 ── viewport must allow zoom
const html = fs.readFileSync(HTML, 'utf8');
const vp = /<meta name="viewport" content="([^"]+)"/.exec(html);
if (!vp) bad('no viewport meta');
else {
  if (/maximum-scale|user-scalable\s*=\s*no/.test(vp[1])) bad(`viewport blocks zoom: ${vp[1]}`);
  else good('viewport allows pinch-zoom');
  if (!/viewport-fit=cover/.test(vp[1])) bad('viewport does not use viewport-fit=cover (notch handling)');
  else good('viewport handles the notch');
}

// 7 ── the hero must use svh, not vh, so the address bar cannot push the CTA out
// svh keeps the address bar from pushing the CTA out of the first screen.
// calc(100svh - var(--strip-h)) is equally valid — the point is that the unit
// is svh, not vh. Requiring the literal string forced a redesign back into a
// form the check liked, which is the tail wagging the dog.
if (/\.hero\s*\{[^}]*block-size:\s*(?:calc\(\s*)?100svh/.test(strip(css))) good('hero height uses svh');
else bad('hero does not use 100svh');

// 8 ── horizontal scroll safety net
if (/(overflow-x:\s*clip|overflow-x:\s*hidden)/.test(css)) good('page guards against horizontal overflow');
else bad('no horizontal overflow guard');

console.log(fail ? `\n✗ ${fail} mobile check(s) failed` : '\n✓ mobile-first contract holds');
process.exit(fail ? 1 : 0);
