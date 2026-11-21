#!/usr/bin/env node
'use strict';
/**
 * Asset integrity check — crawls the rendered page and asserts that every
 * referenced URL actually returns 200 with a sensible content-type.
 * A 404 on a <source> silently degrades to a broken image in production, and
 * that is exactly the kind of bug that only shows up on a customer's phone.
 *
 * Usage: node scripts/check-assets.js [baseUrl]
 */
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000';

const PAGES = ['/', '/concept-1/', '/concept-2/', '/concept-3/', '/hub.html'];

function urls(html) {
  const out = new Set();
  const push = (u) => {
    if (!u) return;
    if (u.startsWith('data:') || u.startsWith('http') || u.startsWith('mailto:') || u.startsWith('tel:')) return;
    if (u.startsWith('#')) return;
    out.add(u.split('#')[0]);
  };
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) push(m[1]);
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) push(part.trim().split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/imagesrcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) push(part.trim().split(/\s+/)[0]);
  }
  return [...out];
}

(async () => {
  let failures = 0;
  let checked = 0;
  for (const page of PAGES) {
    const res = await fetch(BASE + page);
    if (!res.ok) {
      console.log(`✗ page ${page} → ${res.status}`);
      failures++;
      continue;
    }
    const html = await res.text();
    const list = urls(html);
    const bad = [];
    await Promise.all(
      list.map(async (u) => {
        checked++;
        try {
          const r = await fetch(BASE + u, { method: 'GET' });
          const ct = r.headers.get('content-type') || '';
          if (!r.ok) return bad.push(`${u} → ${r.status}`);
          if (/\.(avif|webp|jpg|png|svg)$/.test(u) && !/^image\//.test(ct)) bad.push(`${u} → wrong type ${ct}`);
          if (u.endsWith('.woff2') && !/font/.test(ct)) bad.push(`${u} → wrong type ${ct}`);
          if (u.endsWith('.css') && !/text\/css/.test(ct)) bad.push(`${u} → wrong type ${ct}`);
          if (u.endsWith('.js') && !/javascript/.test(ct)) bad.push(`${u} → wrong type ${ct}`);
        } catch (e) {
          bad.push(`${u} → ${e.message}`);
        }
      })
    );
    console.log(`${bad.length ? '✗' : '✓'} ${page.padEnd(13)} ${list.length} refs`);
    bad.forEach((b) => console.log('    ' + b));
    failures += bad.length;
  }
  console.log(`\n${checked} references checked · ${failures} problem(s)`);
  process.exit(failures ? 1 : 0);
})();
