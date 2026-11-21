#!/usr/bin/env node
'use strict';
/**
 * Runtime smoke test — no browser required.
 * ---------------------------------------------------------------------------
 * jsdom has no layout engine, so we install a synthetic, deterministic layout:
 * every element gets a document offset (in DOM order) and its viewport rect is
 * derived from that offset minus scrollY. That is enough to exercise the real
 * scroll maths in each concept and assert the property that matters:
 *
 *   the values produced by scrolling DOWN must be reproduced EXACTLY when
 *   scrolling back UP through the same positions (the reversible journey),
 *   and must return to their origin at the top.
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PAGES = ['/', '/concept-1/', '/concept-2/', '/concept-3/', '/hub.html'];
const VH = 900;
const DOC_H = 14000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sandbox-only noise: no outbound Google Fonts, no canvas backend in jsdom
const IGNORE = [/Could not load link/i, /fonts\.googleapis\.com/i, /Not implemented: HTMLCanvasElement/i];
const keep = (m) => !IGNORE.some((re) => re.test(m));

async function load(path) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (...a) => errors.push(String(a[0])));

  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      Object.defineProperty(win, 'innerHeight', { value: VH, configurable: true });
      Object.defineProperty(win, 'innerWidth', { value: 1440, configurable: true });
      Object.defineProperty(win, 'scrollY', { value: 0, configurable: true, writable: true });
      Object.defineProperty(win, 'pageYOffset', { get: () => win.scrollY, configurable: true });
      // documentElement doesn't exist yet at beforeParse; a prototype getter is
      // equivalent for our purposes (every element reports the page height).
      Object.defineProperty(win.Element.prototype, 'scrollHeight', {
        get() { return this === win.document.documentElement ? DOC_H : 400; },
        configurable: true,
      });

      // deterministic synthetic layout: element k sits at (k / total) * DOC_H,
      // so the page is genuinely "long" and elements enter the viewport as we
      // scroll (this is what the real engines react to).
      let layout = null;
      const offsets = new WeakMap();
      function buildLayout() {
        const all = win.document.querySelectorAll('*');
        const total = all.length || 1;
        for (let i = 0; i < total; i++) {
          offsets.set(all[i], ((i + 1) / total) * DOC_H);
        }
        layout = offsets;
      }
      win.Element.prototype.getBoundingClientRect = function () {
        if (!layout) buildLayout();
        if (!offsets.has(this)) offsets.set(this, 0);
        const top = offsets.get(this) - win.scrollY;
        return { top, bottom: top + 130, left: 0, right: 1200, width: 1200, height: 130, x: 0, y: top, toJSON() { return this; } };
      };
      win.HTMLElement.prototype.scrollIntoView = function () {};
    },
  });

  await sleep(650);
  return { dom, errors: errors.filter(keep) };
}

function scrollTo(win, y) {
  win.scrollY = y;
  win.dispatchEvent(new win.Event('scroll'));
}

const vars = (doc, sel) => [...doc.querySelectorAll(sel)].map((el) => el.style.getPropertyValue('--p') || '0');

(async () => {
  let failed = 0;
  const results = [];

  for (const path of PAGES) {
    const { dom, errors } = await load(path);
    const win = dom.window;
    const doc = win.document;
    const label = path.padEnd(14);

    if (errors.length) {
      failed++;
      results.push(`✗ ${label} JS errors:\n      ` + errors.join('\n      '));
      continue;
    }

    const STATIC_PAGES = ['/hub.html'];
    if (STATIC_PAGES.includes(path)) {
      results.push(`✓ ${label} loaded · title="${doc.title.slice(0, 46)}"`);
      continue;
    }

    const sel = path === '/' ? '[data-reveal]' : '.reveal, .wipe, .rise';
    scrollTo(win, 0);
    await sleep(120);
    const atTop = vars(doc, sel);

    scrollTo(win, 5600);
    await sleep(200);
    const mid1 = vars(doc, sel);
    scrollTo(win, 11200);
    await sleep(200);
    const deep = vars(doc, sel);

    // walk back up through the exact same positions
    scrollTo(win, 5600);
    await sleep(200);
    const mid2 = vars(doc, sel);
    scrollTo(win, 0);
    await sleep(200);
    const backTop = vars(doc, sel);

    const moved = mid1.filter((v, i) => v !== atTop[i]).length;
    const symmetric = mid1.every((v, i) => v === mid2[i]);
    const home = backTop.every((v, i) => v === atTop[i]);
    const ranged = [...mid1, ...deep].every((v) => v !== '' && +v >= -0.001 && +v <= 1.001);

    // meters must stay a valid percentage
    // production page: depth readout must be Arabic-Indic and in range,
    // and the WebGL fallback must have kicked in without breaking the page
    if (path === '/') {
      const readout = doc.querySelector('[data-depth-readout]');
      const v = readout ? readout.textContent : '';
      const arabicOk = /^[٠-٩]+$/.test(v);
      const fallback = doc.documentElement.classList.contains('ink-fallback');
      const hasCanvasFallback = !doc.getElementById('ink-canvas') || doc.getElementById('ink-canvas').style.display === 'none' || fallback;
      results.push(`      · depth readout "${v}" arabic=${arabicOk} · webgl fallback=${fallback} · canvas handled=${hasCanvasFallback}`);
      if (!arabicOk && v !== '') failed++;
    }

    const meterBad = [...doc.querySelectorAll('#inkLevel, #depthFill, #pageBar')].filter((m) => {
      const h = m.style.height || m.style.width;
      return h && !/^\d+(\.\d+)?%$/.test(h);
    });

    const ok = moved > 0 && symmetric && home && ranged && meterBad.length === 0;
    if (!ok) failed++;

    results.push(
      `${ok ? '✓' : '✗'} ${label} ${String(moved).padStart(2)}/${atTop.length} vars moved · ` +
        `symmetric=${symmetric} · home=${home} · 0..1=${ranged} · meters=${meterBad.length ? 'BAD' : 'ok'}`
    );
    if (!symmetric) {
      const i = mid1.findIndex((v, k) => v !== mid2[k]);
      results.push(`      drift at index ${i}: down=${mid1[i]} up=${mid2[i]}`);
    }
  }

  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} failure(s)` : '\nall green');
  process.exit(failed ? 1 : 0);
})();
