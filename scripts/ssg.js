#!/usr/bin/env node
'use strict';

/**
 * `npm run ssg` — pre-render the landing page to a fully static document.
 * ---------------------------------------------------------------------------
 * Why: the page is already server-sent HTML (no React), but this step makes the
 * deploy bulletproof:
 *
 *  - writes `public/_ssg/home.html` with the markup exactly as the browser
 *    gets it, so crawlers that don't run JS still see 100% of the copy
 *  - inlines the *critical* CSS (design tokens + above-the-fold rules) so the
 *    first paint doesn't wait on the stylesheet
 *  - adds a `<noscript>` safety net that reveals every animated block
 *  - leaves the rest of the stylesheet as a normal, cacheable request
 *
 * The output is what `server.js` prefers for `/` when it exists, falling back to
 * home.html when it doesn't (so a fresh clone works with zero build steps).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'home.html');
const CSS_FULL = path.join(ROOT, 'public', 'assets', 'css', 'kgs.css');
const CSS_MIN = path.join(ROOT, 'public', 'assets', 'css', 'kgs.min.css');
// prefer the minified build when it exists (npm run css produces it)
const CSS = CSS_FULL;   // always split the annotated source, then minify
const CSS_HREF = fs.existsSync(CSS_MIN) ? '/assets/css/kgs.min.css' : '/assets/css/kgs.css';
const { minify } = require('./minify-css.js');
const OUT_DIR = path.join(ROOT, 'public', '_ssg');
const OUT = path.join(OUT_DIR, 'home.html');

if (!fs.existsSync(SRC)) {
  console.error('[ssg] public/home.html not found');
  process.exit(1);
}

let html = fs.readFileSync(SRC, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');

/* ------------------------- 1. split critical CSS -------------------------- */
// Everything up to the "services" section is above the fold on a phone, plus
// tokens/fonts/nav/hero. Splitting on section markers keeps this honest.
const MARKERS = [
  '/* ------------------------------- 9. الخدمات',
  '/* ------------------------------- 10.',
];
let cut = css.length;
for (const m of MARKERS) {
  const i = css.indexOf(m);
  if (i > 0) cut = Math.min(cut, i);
}
// minify each half with the same, verified minifier
const critical = minify(css.slice(0, cut));
const deferred = css.slice(cut);

/* ------------------------- 2. inject into the doc ------------------------- */
/* The critical block is INLINED and the rest of the sheet loads with
   media="print" + onload swap. That is one request instead of two competing
   render blockers, and the inlined part is only what the first screen needs. */
const criticalTag = `<style id="critical">${critical.replace(/<\/style>/gi, '<\\/style>')}</style>`;

const preload = `<link rel="preload" href="${CSS_HREF}" as="style" />`;
const asyncSheet = `<link rel="stylesheet" href="${CSS_HREF}" media="print" onload="this.media='all'" />`;
const noJsSheet = `<noscript><link rel="stylesheet" href="${CSS_HREF}" /></noscript>`;

html = html
  .replace('<link rel="stylesheet" href="/assets/css/kgs.css" />', `${preload}\n${criticalTag}\n${asyncSheet}\n${noJsSheet}`)
  .replace('<link rel="preload" href="/assets/css/kgs.css" as="style" />', '')
  .replace('<link rel="preload" href="/assets/css/kgs.min.css" as="style" />', '');

// noscript: if JS never runs, everything is visible and the shader area is calm
const noscript = `<noscript><style>
[data-reveal]{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important}
#ink-canvas{display:none}
.hero-in{animation:none!important;opacity:1!important}
.dock{opacity:1;transform:none}
</style></noscript>`;
html = html.replace('</head>', noscript + '\n</head>');

// drop the module-level defer attrs? no: scripts stay deferred for speed.
// But make the "js-ready" class available immediately so reveals start hidden
// only when JS is actually live (prevents a flash of un-animated content).
html = html.replace('<body>', '<body>\n<script>document.documentElement.classList.add("js-pending");</script>');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (b) => (b / 1024).toFixed(1) + ' KB';
console.log(`[ssg] ${path.relative(ROOT, OUT)}`);
const docKb = Buffer.byteLength(html);
console.log(`[ssg] document ${kb(docKb)} (uncompressed) · critical css inlined ${kb(critical.length)}`);
console.log(`[ssg] full sheet ${kb(Buffer.byteLength(deferred) + Buffer.byteLength(critical))} loads async after first paint`);
console.log(`[ssg] deploy: server.js serves / from this file when present`);
