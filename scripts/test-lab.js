#!/usr/bin/env node
'use strict';
/**
 * test-lab.js — behaviour gate for the CSS-3D material lab.
 *
 * The ring is entirely CSS; the only JS is the angle state machine. That makes
 * it testable without a browser: jsdom + a stubbed IntersectionObserver is
 * enough to assert the things that would actually break a customer:
 *
 *   · the section is promoted to 3D only when the platform supports it
 *   · chips, next/prev and arrow keys all land on the same angle/caption
 *   · the caption is correct Arabic and the aria-pressed state follows it
 *   · reduced motion jumps instantly instead of easing
 *   · without preserve-3d the grid fallback is kept, but the caption still works
 *
 * Run against the served page: node scripts/test-lab.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  fail++;
  console.log(`  ✗ ${m}`);
};
const check = (cond, m) => (cond ? ok(m) : bad(m));

async function load({ reduce = false, supports3d = true } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  // The light page has no canvas/WebGL; anything jsdom reports here is real.
  vc.on('jsdomError', (e) => {
    if (!/Not implemented: HTMLCanvasElement/.test(e.message)) errors.push(e.message);
  });

  const dom = await JSDOM.fromURL(`${BASE}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (query) => ({
        matches: /prefers-reduced-motion/.test(query) ? reduce : /hover: hover/.test(query),
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      });
      win.CSS = win.CSS || {};
      win.CSS.supports = () => supports3d;
      // the real page gets a real observer; here everything starts on screen.
      win.IntersectionObserver = class {
        constructor(cb, opts) {
          this.cb = cb;
          this.opts = opts;
        }
        observe(el) {
          this.cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], this);
        }
        unobserve() {}
        disconnect() {}
      };
      Object.defineProperty(win, 'innerWidth', { value: 1440, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: 900, configurable: true });
      win.HTMLElement.prototype.scrollTo = function () {};
    },
  });

  await sleep(450);
  return { dom, doc: dom.window.document, errors };
}

const angle = (spin) => parseFloat(spin.style.getPropertyValue('--spin')) || 0;

(async () => {
  console.log('\nlab — 3D ring');

  const { dom, doc, errors } = await load();
  const lab = doc.querySelector('.lab');
  const spin = doc.querySelector('[data-lab-spin]');
  const chips = [...doc.querySelectorAll('[data-lab-goto]')];
  const name = doc.querySelector('[data-lab-read]');
  const spec = doc.querySelector('[data-lab-spec]');

  check(Boolean(lab && spin), 'section and spin rig exist in the served document');
  check(lab.classList.contains('is-live'), 'promoted to 3D when preserve-3d is supported');
  check(chips.length === 6, 'six material chips');
  check(chips[0].getAttribute('aria-pressed') === 'true', 'first chip starts selected');

  // --- chip → angle + caption -------------------------------------------
  chips[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(500);
  const a2 = angle(spin);
  check(a2 < -110 && a2 > -130, `chip 3 rotates the ring to the third card (${a2.toFixed(1)}°)`);
  check(name.textContent.trim() === 'زجاج برطمانات', 'caption names the selected material');
  check(spec.textContent.includes('إيبوكسي'), 'caption carries the ink/spec line');
  check(chips[2].getAttribute('aria-pressed') === 'true', 'selected chip is pressed');
  check(chips[0].getAttribute('aria-pressed') === 'false', 'previous chip is un-pressed');

  // --- next → fourth card ------------------------------------------------
  doc.querySelector('[data-lab-next]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(450);
  check(name.textContent.trim() === 'كرافت ٢٥٠ جرام', 'next button advances to the fourth material');

  // --- previous → back to third -----------------------------------------
  doc.querySelector('[data-lab-prev]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(450);
  check(name.textContent.trim() === 'زجاج برطمانات', 'previous button returns to the third material');

  // --- keyboard on the chip row -----------------------------------------
  chips[2].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await sleep(450);
  check(name.textContent.trim() === 'كرافت ٢٥٠ جرام', 'ArrowLeft moves forward in reading order (RTL)');

  check(errors.length === 0, `no runtime errors (${errors.slice(0, 2).join(' | ') || 'none'})`);
  dom.window.close();

  // --- reduced motion: no easing, same destination ----------------------
  const r = await load({ reduce: true });
  const rChips = [...r.doc.querySelectorAll('[data-lab-goto]')];
  rChips[4].dispatchEvent(new r.doc.defaultView.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  const a4 = angle(r.doc.querySelector('[data-lab-spin]'));
  check(Math.abs(a4 + 240) < 0.5, `reduced motion jumps straight to the target (${a4.toFixed(1)}°)`);
  check(r.doc.querySelector('[data-lab-read]').textContent.trim() === 'ستان أعلام', 'reduced motion still updates the caption');
  r.dom.window.close();

  // --- no preserve-3d: grid fallback, caption still functional ----------
  const f = await load({ supports3d: false });
  const fLab = f.doc.querySelector('.lab');
  check(!fLab.classList.contains('is-live'), 'no 3D promotion when preserve-3d is unsupported');
  const fChips = [...f.doc.querySelectorAll('[data-lab-goto]')];
  fChips[5].dispatchEvent(new f.doc.defaultView.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  check(f.doc.querySelector('[data-lab-read]').textContent.trim() === 'حبر بلاستيسول', 'fallback caption still switches');
  f.dom.window.close();

  if (fail) {
    console.log(`\n✗ ${fail} lab check(s) failed`);
    process.exit(1);
  }
  console.log('\n✓ material lab: all checks passed\n');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
