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

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'home.html');
const CSS_FULL = path.join(ROOT, 'public', 'assets', 'css', 'kgs.css');
const CSS_MIN = path.join(ROOT, 'public', 'assets', 'css', 'kgs.min.css');
// prefer the minified build when it exists (npm run css produces it)
const CSS = CSS_FULL;   // always split the annotated source, then minify
/* Content-hashed filename.

   The .htaccess serves css/js for a YEAR with `immutable`. That is only safe if
   the URL changes when the bytes change — otherwise a returning visitor keeps
   the old sheet for twelve months. And it is not hypothetical: the very first
   build of this site (0fc3c9b) drew the logo as a small mark inside an orange
   rounded tile, and three redesigns later browsers were still showing that
   tile because the filename never changed.

   So the href carries a short hash of the file contents. The canonical file is
   still written (kgs.min.css) for anything that references it directly; the
   hashed copy is what the document points at. */
const cssFile = fs.existsSync(CSS_MIN) ? CSS_MIN : CSS_FULL;
const cssBytes = fs.readFileSync(cssFile);
const cssHash = crypto.createHash('sha256').update(cssBytes).digest('hex').slice(0, 10);
const CSS_HASHED = path.join(path.dirname(cssFile),
  path.basename(cssFile, '.css') + '.' + cssHash + '.css');
fs.writeFileSync(CSS_HASHED, cssBytes);
const CSS_HREF = '/assets/css/' + path.basename(CSS_HASHED);
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
/*
 * The inline block is the render-blocking part of the document, so it has to
 * earn every byte. It contains ONLY what can appear in the first viewport:
 *
 *   tokens · reset · fonts · motion primitives · nav · buttons · shared atoms
 *   · hero (the 3-slide rail) · the sticky dock
 *
 * Everything below the fold — services, process, why, commitments, the quote
 * builder, FAQ, footer, print — is deliberately NOT inlined. It loads with the
 * cacheable stylesheet a moment later, which costs nothing perceptually because
 * it is off-screen. Inlining it was costing ~5 KB of gzip on every page view,
 * including a repeat visit that had the stylesheet cached already.
 */
const CRITICAL_START = '/* ------------------------------- 1. الخطوط';
const DEFERRED_START = '/* ------------------------------- 9. الخدمات';
const DOCK_START = '/* ------------------------------- 16. زر واتساب عائم';
const TUNING_START = '/* ------------------------------- 17. تقليل الحركة';
const PRINT_START = '/* ------------------------------- 18. طباعة';

function slice(from, to) {
  const a = css.indexOf(from);
  const b = to ? css.indexOf(to) : css.length;
  if (a < 0) return '';
  return css.slice(a, b > a ? b : css.length);
}

/* The dock is `position: fixed` and visible on the first screen, so its rules
   must be inline even though they sit near the end of the sheet. Same for the
   reduced-motion and hover guards, which apply to inline rules. */
const head = slice(CRITICAL_START, DEFERRED_START);          // 1-8  tokens, nav, hero
const belowFold = slice(DEFERRED_START, DOCK_START);        // 9-15 off-screen sections
const dock = slice(DOCK_START, TUNING_START);               // 16   fixed, on-screen
const guards = slice(TUNING_START, PRINT_START);            // 17   reduced motion
const rest = slice(TUNING_START);                            // 17-20 expansions

const criticalSrc = head + dock + guards;
/* Everything else, plus the reduced-motion block again so the deferred sheet
   stands on its own even if the inline block is stripped by a proxy. */
const deferred = css.slice(0, CSS.indexOf(CRITICAL_START)) + belowFold + rest;

const critical = squeezeCss(minify(criticalSrc));

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

/* ---------------------------------------------------------------- js hashes
   Same reasoning as the stylesheet: the .htaccess marks .js immutable for a
   year, so the URL must change when the bytes do. Each script is copied to a
   hashed name and the reference rewritten. */
/* remove previously hashed copies — otherwise every content change leaves its
   predecessor behind and dist/ grows forever with dead weight */
const pruneHashed = (dir, keep) => {
  for (const f of fs.readdirSync(dir)) {
    if (/\.(?:min\.)?[a-f0-9]{10}\.(?:css|js)$/.test(f) && !keep.includes(f)) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
};
pruneHashed(path.dirname(cssFile), [path.basename(CSS_HASHED)]);

const JS_DIR = path.join(ROOT, 'public', 'assets', 'js');
const created = [];
for (const name of fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js') && !/\.[a-f0-9]{10}\.js$/.test(f))) {
  const src = path.join(JS_DIR, name);
  const buf = fs.readFileSync(src);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const hashed = name.replace(/\.js$/, `.${hash}.js`);
  fs.writeFileSync(path.join(JS_DIR, hashed), buf);
  html = html.split(`/assets/js/${name}`).join(`/assets/js/${hashed}`);
  created.push(hashed);
}
pruneHashed(JS_DIR, created);

// drop the module-level defer attrs? no: scripts stay deferred for speed.
// But make the "js-ready" class available immediately so reveals start hidden
// only when JS is actually live (prevents a flash of un-animated content).
html = html.replace('<body>', '<body>\n<script>document.documentElement.classList.add("js-pending");</script>');

/* ------------------- 1a. minify the inline critical CSS harder ------------- */
/*
 * `minify()` is deliberately conservative (it protects data URIs, custom
 * properties, nesting and font-family quotes) because it also processes the
 * shipping stylesheet. For the inline block we can go further with two
 * provably safe rewrites:
 *
 *   `0.5`  → `.5`      a leading zero is never required in CSS numbers
 *   ` 0 0 ` → ` 0 0 `  already covered — box-shadow shorthand is untouched
 *
 * and, above all, gzip-friendly output: the browser only needs the bytes once.
 */
function squeezeCss(c) {
  return c
    .replace(/(^|[^\w.\-])0\.(\d)/g, '$1.$2')       // 0.5rem → .5rem
    .replace(/;\}/g, '}')                              // final semicolon
    .replace(/\s*([{};:,>])\s*/g, '$1')                // structural whitespace
    .replace(/\s+/g, ' ');
}

/* ------------------------- 1b. collapse HTML whitespace ------------------ */
/*
 * The document is hand-authored with two-space indentation, which is 5.7 KB of
 * the 70 KB uncompressed payload and survives gzip less well than it looks
 * (long runs of repeated spaces are cheap, but the newlines between attributes
 * are not). HTML is whitespace-insensitive *between* tags, so collapsing runs of
 * whitespace to one space there is safe.
 *
 * Preformatted content is protected: <pre>, <textarea>, <script>, <style> and
 * comments are lifted out, the rest is collapsed, and they are put back.
 */
function collapseHtml(src) {
  const keep = [];
  const stash = (m) => `\u0000${keep.push(m) - 1}\u0000`;
  let out = src
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi, (_, json) => {
      try {
        return stash(`<script type="application/ld+json">${JSON.stringify(JSON.parse(json))}</script>`);
      } catch {
        return stash(`<script type="application/ld+json">${json}</script>`);
      }
    })
    .replace(/<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi, stash);
  out = out.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ');
  // restore in reverse so indices stay valid
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}
if (!process.env.KGS_NO_HTML_MINIFY) {
  const before = html.length;
  html = collapseHtml(html);
  console.log(`[ssg] whitespace ${before} → ${html.length} bytes`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (b) => (b / 1024).toFixed(1) + ' KB';
console.log(`[ssg] ${path.relative(ROOT, OUT)}`);
const docKb = Buffer.byteLength(html);
console.log(`[ssg] document ${kb(docKb)} (uncompressed) · critical css inlined ${kb(critical.length)}`);
console.log(`[ssg] full sheet ${kb(Buffer.byteLength(deferred) + Buffer.byteLength(critical))} loads async after first paint`);
console.log(`[ssg] deploy: server.js serves / from this file when present`);
