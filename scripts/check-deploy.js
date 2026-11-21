#!/usr/bin/env node
'use strict';
/**
 * check-deploy.js — verifies `dist/` is actually shippable to Hostinger.
 *
 * Static shared hosting fails differently from a Node server: no compression
 * unless Apache is told, no 404 unless declared, no MIME type for AVIF on many
 * hosts, and no rewrite from `/` to a file. Each assertion below is a failure
 * that would be invisible locally and expensive in production.
 *
 * Run after `npm run export`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('[deploy] dist/ not found — run: node scripts/export-static.js');
  process.exit(1);
}

let fail = 0;
const bad = (m) => { fail++; console.log(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);
const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1);

console.log('\ndeploy — required files');
for (const f of ['index.html', '404.html', 'favicon.svg', 'site.webmanifest', 'robots.txt', 'sitemap.xml',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'assets/css/kgs.min.css', 'assets/js/kgs-hero.js', 'assets/js/kgs-quote.js', 'assets/js/kgs-motion.js',
  'assets/img/slide-1-pull-360.avif', 'assets/img/og.jpg', '.htaccess']) {
  if (fs.existsSync(path.join(DIST, f))) good(f);
  else bad(`missing ${f}`);
}

console.log('\ndeploy — entry point');
const index = path.join(DIST, 'index.html');
if (fs.existsSync(index)) {
  const html = fs.readFileSync(index, 'utf8');
  if (/id="critical"/.test(html)) good(`critical CSS is inlined (${kb(index)} KB)`);
  else bad('index.html has no inline critical CSS — first paint waits on a stylesheet');

  if (/data-quote-builder/.test(html)) good('quote builder is server-rendered');
  else bad('quote builder missing from the static document');

  if ((html.match(/class="hero__slide/g) || []).length === 3) good('three hero slides are in the HTML');
  else bad('hero slides missing from the static document');

  if (!/aggregateRating/.test(html)) good('no fabricated rating markup');
  else bad('aggregateRating is back in the document');

  // every local reference must resolve inside dist/
  const refs = new Set([...html.matchAll(/(?:href|src)="(\/[^"?#]+\.(?:css|js|avif|webp|jpg|png|svg|woff2|webmanifest))"/g)].map((m) => m[1]));
  const missing = [...refs].filter((r) => !fs.existsSync(path.join(DIST, r)));
  if (missing.length) bad(`${missing.length} reference(s) 404 on a static host: ${missing.slice(0, 4).join(', ')}`);
  else good(`${refs.size} local references all resolve inside dist/`);
}

console.log('\ndeploy — server config');
const ht = path.join(DIST, '.htaccess');
if (fs.existsSync(ht)) {
  const conf = fs.readFileSync(ht, 'utf8');
  const wants = [
    [/mod_brotli|mod_deflate/, 'compression is enabled'],
    [/ExpiresByType text\/html/, 'HTML caching is declared'],
    [/Header set Cache-Control "public, max-age=31536000/, 'static assets are immutable'],
    [/ErrorDocument 404/, '404 page is wired'],
    [/AddType image\/avif/, 'AVIF MIME type is declared (hosts often lack it)'],
    [/font\/woff2/, 'woff2 MIME type is declared'],
    [/Content-Security-Policy/, 'CSP is set'],
    [/RewriteCond %\{HTTPS\} !=on/, 'https is forced'],
    [/Require all denied/, 'source files are not publicly served'],
  ];
  for (const [re, label] of wants) (re.test(conf) ? good : bad)(label);
} else bad('.htaccess missing');

console.log('\ndeploy — nothing private');
for (const leak of ['package.json', 'server.js', 'data', 'node_modules', '_ssg']) {
  if (fs.existsSync(path.join(DIST, leak))) bad(`${leak} leaked into dist/`);
}
if (!['package.json', 'server.js', 'data', 'node_modules', '_ssg'].some((l) => fs.existsSync(path.join(DIST, l)))) {
  good('no build sources, server code or node_modules in dist/');
}

// prototypes must not ship
const shipped = ['concept-1', 'concept-2', 'concept-3', 'hub.html'].filter((p) => fs.existsSync(path.join(DIST, p)));
if (shipped.length) bad(`development prototypes shipped: ${shipped.join(', ')}`);
else good('development prototypes are excluded');

console.log(fail ? `\n✗ ${fail} deploy check(s) failed` : `\n✓ dist/ is shippable to Hostinger (${kb(index)} KB entry document)`);
process.exit(fail ? 1 : 0);
