#!/usr/bin/env node
'use strict';
/**
 * preview-firstview.js — render the first viewport, at phone size, from the
 * REAL stylesheet.
 *
 * Why this exists: there is no browser in this environment, so the hero was
 * validated by asserting CSS properties — and a property assertion cannot see
 * that a photograph has become a black rectangle. Compositing the actual
 * artifact is the only way to catch "the image is buried under the scrim".
 *
 * The first version of this tool hardcoded the opacity and the gradient stops,
 * so it *reproduced my intention* rather than the file, and happily confirmed a
 * fix that had never been written. Everything here is parsed out of kgs.css:
 * if the sheet says the art is at 0.66 and the scrim reaches 0.94, that is what
 * you will see.
 *
 *   node scripts/preview-firstview.js [width] [height] [out.png]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const W = Number(process.argv[2]) || 360;
const H = Number(process.argv[3]) || 760;
const OUT = process.argv[4] || '/tmp/firstview.png';

const css = fs.readFileSync(path.join(ROOT, 'public/assets/css/kgs.css'), 'utf8');
/* read the SOURCE markup, not the built page: _ssg/home.html inlines the
   critical CSS, whose first .hero__slide mention is a style block — slicing
   from there yields no markup at all. */
const html = fs.readFileSync(path.join(ROOT, 'public/home.html'), 'utf8');

/* ---------- read the values that actually govern the render ---------- */
const breakpoint = W >= 900;

function ruleBody(selector, media) {
  // find the block for `selector`, ignoring @media wrappers unless asked
  const src = media
    ? (css.match(/@media[^{]*min-width:\s*900px[^{]*\{[\s\S]*?\n\}/) || [''])[0]
    : css.replace(/@media[^{]*min-width:\s*900px[^{]*\{[\s\S]*?\n\}/g, '');
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = re.exec(src);
  return m ? m[1] : '';
}

/* art opacity: the active-slide rule overrides the base rule */
const baseRule = ruleBody('.hero__art img');
const activeRule = ruleBody('.hero__slide.is-active .hero__art img');
const opacityOf = (body, fallback) => {
  const m = /opacity:\s*([0-9.]+)/.exec(body);
  return m ? parseFloat(m[1]) : fallback;
};
const artOpacity = opacityOf(activeRule, opacityOf(baseRule, 1));

/* object-position */
const posM = /object-position:\s*([0-9.]+)%\s+([0-9.]+)%/.exec(
  (breakpoint ? ruleBody('.hero__art img', true) : '') || baseRule
);
const posX = posM ? parseFloat(posM[1]) : 50;
const posY = posM ? parseFloat(posM[2]) : 50;

/* the shade is a background LIST — e.g. desktop stacks a horizontal scrim and
   a vertical one. Parse and return every linear-gradient, in CSS paint order
   (first = nearest the top), and let the renderer composite them. */
const shadeRule = (breakpoint ? ruleBody('.hero__shade', true) : '') || ruleBody('.hero__shade');

const splitTopLevel = (str) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};

const parseGradients = (rule) => {
  const grads = [];
  let from = 0;
  for (;;) {
    const start = rule.indexOf('linear-gradient(', from);
    if (start < 0) break;
    let i = start + 'linear-gradient('.length;
    let depth = 1;
    let end = -1;
    for (; i < rule.length; i++) {
      if (rule[i] === '(') depth++;
      else if (rule[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('unbalanced parens in .hero__shade');
    const parts = splitTopLevel(rule.slice(start + 'linear-gradient('.length, end));
    const dir = parts[0].trim();
    if (!/^to\s/.test(dir)) throw new Error('expected a direction first: ' + dir);
    const stops = parts.slice(1).map((chunk) => {
      const c = chunk.trim();
      const pct = /(-?[0-9.]+)%/.exec(c);
      const t = pct ? parseFloat(pct[1]) / 100 : null;
      if (/^transparent\b/.test(c)) {
        // CSS interpolates gradients in premultiplied space; transparent
        // therefore means "same colour, alpha 0", not "black"
        return { t, rgb: null, a: 0 };
      }
      const rgba = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/.exec(c);
      if (!rgba) throw new Error('unparseable gradient stop: ' + c);
      return {
        t,
        rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
        a: rgba[4] === undefined ? 1 : parseFloat(rgba[4]),
      };
    });
    // unnamed positions get spread evenly
    stops.forEach((st, k) => {
      if (st.t === null) st.t = stops.length === 1 ? 0 : k / (stops.length - 1);
    });
    grads.push({ axis: dir.replace(/^to\s+/, '').trim(), stops });
    from = end + 1;
  }
  if (!grads.length) throw new Error('no linear-gradient found in .hero__shade');
  return grads;
};

const gradients = parseGradients(shadeRule);

/* ---------- type metrics, read from the sheet ---------- */
/* every number below comes out of kgs.css; nothing is eyeballed */
const px = (v, fallback) => {
  const m = /^([0-9.]+)px$/.exec(v.trim());
  return m ? parseFloat(m[1]) : fallback;
};
const toPx = (num, unit) => (unit === 'rem' ? parseFloat(num) * 16 : parseFloat(num));
const clampPx = (v, vw, fallback) => {
  // min and max may be either rem or px; the preferred value is the middle term
  const m = /clamp\(\s*([0-9.]+)(rem|px)\s*,\s*([0-9.]+)(vw|rem|px)\s*,\s*([0-9.]+)(rem|px)\s*\)/.exec(v);
  if (!m) return fallback;
  const min = toPx(m[1], m[2]);
  const pref = m[4] === 'vw' ? (parseFloat(m[3]) / 100) * vw : toPx(m[3], m[4]);
  const max = toPx(m[5], m[6]);
  return Math.max(min, Math.min(pref, max));
};

const titleRule = breakpoint ? ruleBody('.hero__title', true) : ruleBody('.hero__title');
const titleSize = clampPx(/font-size:\s*([^;]+);/.exec(titleRule)?.[1] || '', W, 40);
const l2Rule = (breakpoint ? ruleBody('.hero__title .l2', true) : '') || ruleBody('.hero__title .l2');
const l2Em = parseFloat(/font-size:\s*([0-9.]+)em/.exec(l2Rule)?.[1] || '0.52');

const ledeRule = breakpoint ? ruleBody('.hero__lede', true) : ruleBody('.hero__lede');
const ledeSize = parseFloat(/font-size:\s*([0-9.]+)(rem|px)/.exec(ledeRule)?.[1] || '1') * (/rem/.test(/font-size:\s*([^;]+);/.exec(ledeRule)?.[1] || '') ? 16 : 1);

const badgeRule = ruleBody('.hero__badge');
const badgeSize = parseFloat(/font-size:\s*([0-9.]+)px/.exec(badgeRule)?.[1] || '13');

const btnSize = parseFloat(/font-size:\s*([0-9.]+)px/.exec(ruleBody('.btn--lg'))?.[1] || '16');
const btnMin = parseFloat(/min-block-size:\s*([0-9.]+)px/.exec(ruleBody('.btn--lg'))?.[1] || '52');

/* vertical rhythm, also from the sheet */
const gutterPx = px(/--gutter:\s*clamp\(([0-9.]+)px[^)]*\)/.exec(css)?.[0] || '', 18);
const navH = parseFloat((/--nav-h:\s*([0-9.]+)px/.exec(css) || [])[1] || 60);

/* short portrait phones drop the stats row — mirror that, or the preview
   measures a layout the sheet no longer produces */
const shortPortrait = H <= 700 && H > W;

/* desktop: .hero__slide is align-content:center, the copy is a grid column at
   inline-start of a centred max-width container (so it hugs the RIGHT edge in
   RTL), capped at 46ch, and the CTA is inline rather than full-width. */
const maxw = parseFloat((/--maxw:\s*([0-9.]+)px/.exec(css) || [])[1] || 1340);

const metrics = {
  shortPortrait, maxw,
  titleSize, l2Size: titleSize * l2Em, ledeSize, badgeSize, btnSize, btnMin,
  gutter: clampPx((/--gutter:\s*([^;]+);/.exec(css) || [])[1] || '', W, 18),
  navH,
  /* .hero__inner mobile: calc(nav + 12px) top, clamp(22px,4vh,46px) bottom */
  padTop: navH + 12,
  padBottom: Math.max(22, Math.min(0.04 * H, 46)),
};
console.log(`  type   title ${titleSize.toFixed(0)}px / l2 ${(titleSize * l2Em).toFixed(0)}px / lede ${ledeSize.toFixed(0)}px / badge ${badgeSize}px`);
console.log(`  box    gutter ${metrics.gutter.toFixed(0)}px · pad ${metrics.padTop}px top, ${metrics.padBottom}px bottom · nav ${navH}px`);

/* ---------- the copy, pulled from the markup ---------- */
/* pull the parts of slide 1 out of the markup, in order */
// the active slide carries an extra class, so match on the bare token
const heroStart = html.search(/class="hero__slide\b/);
if (heroStart < 0) throw new Error('cannot find the first hero slide in home.html');
// up to the second slide (or the end of the hero block)
const nextSlide = html.indexOf('data-slide', html.indexOf('>', heroStart));
const slide1 = html.slice(heroStart, nextSlide > heroStart ? nextSlide : html.indexOf('</section>', heroStart));
const pick = (cls) => {
  // match the element's whole body, then strip tags: the badge's first child is
  // the decorative <i> dot, so stopping at the first "</" returns markup only
  const open = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(slide1);
  if (!open) return '';
  const from = open.index + open[0].length;
  const tag = /^<([a-z0-9]+)/i.exec(open[0]);
  const close = tag ? slide1.indexOf(`</${tag[1]}>`, from) : slide1.indexOf('</p>', from);
  const body = slide1.slice(from, close < 0 ? slide1.length : close);
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};
const badge = pick('hero__badge');
const titleLines = [...slide1.matchAll(/<span class="l[12]">([^<]*)<\/span>/g)].map((m) => m[1].trim());
const title = titleLines[0] || 'كمال جادو';
const title2 = titleLines[1] || '';
const lede = pick('hero__lede');
const cta = (slide1.match(/<a class="btn btn--primary[^>]*>([\s\S]*?)<\/a>/) || [])[1]
  ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'اطلب عرض سعر';

console.log(`preview-firstview — ${W}x${H}`);
console.log(`  art  opacity ${artOpacity} · object-position ${posX}% ${posY}%`);
for (const g of gradients) {
  console.log(`  shade to ${g.axis}: ${g.stops.map((s) => `${Math.round(s.t * 100)}%:${s.a}`).join(' ')}`);
}
console.log(`  copy   "${title} / ${title2}" · lede ${lede.length} chars · cta "${cta}"`);

/* ---------- hand the parsed values to PIL ---------- */
const payload = { W, H, OUT, artOpacity, posX, posY, gradients, metrics, badge, title, title2, lede, cta };
execFileSync('python3', [path.join(__dirname, 'preview-firstview.py')], {
  input: JSON.stringify(payload),
  stdio: ['pipe', 'inherit', 'inherit'],
});
console.log(`  → ${OUT}`);
