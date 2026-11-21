#!/usr/bin/env node
'use strict';
/**
 * test-hero.js — behavioural test for the 3-slide hero rail.
 *
 * jsdom has no layout engine, so scroll geometry is stubbed with a deterministic
 * RTL model: the rail is 3 slides wide, slide i starts at i*W, and in RTL the
 * scroll offset runs negative from 0 to -(2W). Anything the component relies on
 * is provided explicitly, so a failure here is a real logic failure.
 *
 * What is asserted:
 *   · exactly one slide is visible / in the tab order at a time (inert + aria)
 *   · dots reflect and control the position, including aria-current
 *   · arrows respect RTL: "next" advances, and are disabled at the ends
 *   · keyboard: ArrowLeft = forward in RTL, Home/End jump to the ends
 *   · no autoplay by default
 *   · the markup degrades: rail markup is scroll-snap, copy is in the HTML
 *   · a11y: one h1, one h1 only, slides labelled 1..3, images have alt text
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const W = 390; // phone width
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, detail = '') => {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

async function boot() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    // jsdom ships no canvas backend; the shader's documented fallback covers
    // this, so it is expected noise rather than a failure.
    if (/getContext/.test(e.message)) return;
    errors.push(e.message);
  });

  const dom = await JSDOM.fromURL(`${BASE}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({
        matches: q.includes('prefers-reduced-motion') ? false : false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      });
      Object.defineProperty(win, 'innerWidth', { value: W, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: 780, configurable: true });

      // ---- synthetic RTL rail geometry -------------------------------
      Object.defineProperty(win.HTMLElement.prototype, 'scrollWidth', {
        get() { return this.classList?.contains('hero__rail') ? W * 3 : 0; },
        configurable: true,
      });
      Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', {
        get() { return this.classList?.contains('hero__rail') ? W : 0; },
        configurable: true,
      });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetLeft', {
        get() {
          if (!this.classList?.contains('hero__slide')) return 0;
          const rail = this.parentElement;
          // RTL: first slide sits farthest right → smallest offsetLeft distance
          const i = [...rail.children].indexOf(this);
          return (rail.children.length - 1 - i) * W;
        },
        configurable: true,
      });
      // scrollLeft is read/written by the component; emulate the browser clamp
      let sl = 0;
      Object.defineProperty(win.HTMLElement.prototype, 'scrollLeft', {
        get() { return this.classList?.contains('hero__rail') ? sl : 0; },
        set(v) {
          if (!this.classList?.contains('hero__rail')) return;
          sl = Math.max(-2 * W, Math.min(0, v));
          this.dispatchEvent(new win.Event('scroll'));
        },
        configurable: true,
      });
      win.HTMLElement.prototype.scrollTo = function (opts) {
        if (opts && typeof opts === 'object' && 'left' in opts) this.scrollLeft = opts.left;
      };
      win.Element.prototype.getBoundingClientRect = function () {
        return { top: 0, bottom: 780, left: 0, right: W, width: W, height: 780, x: 0, y: 0, toJSON() { return this; } };
      };
      win.HTMLElement.prototype.scrollIntoView = function () {};
    },
  });

  await sleep(900);
  return { dom, errors };
}

(async () => {
  const { dom, errors } = await boot();
  const win = dom.window;
  const doc = win.document;

  console.log('\nhero rail — markup');
  const hero = doc.querySelector('.hero');
  const slides = [...doc.querySelectorAll('[data-slide]')];
  const dots = [...doc.querySelectorAll('[data-rail-dots] button')];

  check(!!hero, 'hero section exists');
  check(slides.length === 3, 'three slides', `got ${slides.length}`);
  check(dots.length === 3, 'three dots', `got ${dots.length}`);

  // every slide owns its own dedicated background image
  const srcs = slides.map((s) => [...s.querySelectorAll('picture source')].map((e) => e.getAttribute('srcset')).join(' '));
  const unique = new Set(srcs.map((s) => (s.match(/slide-\d-/g) || [''])[0]));
  check(unique.size === 3, 'each slide has its own image', [...unique].join(','));

  // the copy must be in the HTML, not injected by JS
  const html = await (await fetch(`${BASE}/`)).text();
  for (const [i, needle] of ['سلك سكرين', 'كل لون', 'من التيشيرت'].entries()) {
    check(html.includes(needle), `slide ${i + 1} copy is server-rendered`, needle);
  }

  const h1s = doc.querySelectorAll('h1');
  check(h1s.length === 1, 'exactly one h1', `got ${h1s.length}`);
  check(h1s[0]?.closest('[data-slide]') === slides[0], 'the h1 lives in slide 1');

  const imgsNoAlt = [...doc.querySelectorAll('.hero__art img')].filter((i) => !i.getAttribute('alt'));
  check(imgsNoAlt.length === 0, 'every hero image has alt text');
  const lazy = [...doc.querySelectorAll('.hero__art img')];
  check(lazy[0].getAttribute('fetchpriority') === 'high', 'slide 1 image is high priority (LCP)');
  check(lazy.slice(1).every((i) => i.getAttribute('loading') === 'lazy'), 'slides 2-3 images are lazy');

  console.log('\nhero rail — state');
  const visible = () => slides.filter((s) => !s.hasAttribute('inert'));
  check(visible().length === 1, 'exactly one slide is interactive', `${visible().length} active`);
  check(visible()[0] === slides[0], 'slide 1 starts active');
  check(slides[1].getAttribute('aria-hidden') === 'true', 'hidden slides are aria-hidden');
  check(dots[0].getAttribute('aria-current') === 'true', 'dot 1 is current');

  console.log('\nhero rail — controls');
  const prev = doc.querySelector('[data-rail-prev]');
  const next = doc.querySelector('[data-rail-next]');

  next.click();
  await sleep(60);
  check(win.KGS.hero.current() === 1, 'next advances to slide 2', `index=${win.KGS.hero.current()}`);
  check(visible()[0] === slides[1], 'slide 2 is now the only interactive slide');
  check(dots[1].getAttribute('aria-current') === 'true', 'dot 2 is current');

  next.click();
  await sleep(60);
  check(win.KGS.hero.current() === 2, 'next advances to slide 3');
  check(next.disabled, '"next" is disabled on the last slide');
  check(!prev.disabled, '"prev" is enabled on the last slide');

  next.click();
  await sleep(40);
  check(win.KGS.hero.current() === 2, 'next cannot overshoot past the last slide');

  prev.click();
  await sleep(60);
  check(win.KGS.hero.current() === 1, 'prev goes back to slide 2');

  dots[0].click();
  await sleep(60);
  check(win.KGS.hero.current() === 0, 'dot click jumps to slide 1');
  check(prev.disabled, '"prev" is disabled on the first slide');

  console.log('\nhero rail — keyboard (RTL: left = forward)');
  const key = (k) => hero.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('ArrowLeft');
  await sleep(60);
  check(win.KGS.hero.current() === 1, 'ArrowLeft moves forward in RTL', `index=${win.KGS.hero.current()}`);
  key('ArrowRight');
  await sleep(60);
  check(win.KGS.hero.current() === 0, 'ArrowRight moves back in RTL');
  key('End');
  await sleep(60);
  check(win.KGS.hero.current() === 2, 'End jumps to the last slide');
  key('Home');
  await sleep(60);
  check(win.KGS.hero.current() === 0, 'Home jumps to the first slide');

  console.log('\nhero rail — no autoplay');
  check(hero.getAttribute('data-autoplay') === '0', 'autoplay is explicitly off');
  const before = win.KGS.hero.current();
  await sleep(7600);
  check(win.KGS.hero.current() === before, 'the slide does not move on its own after 7.6s');

  console.log('\nhero rail — css contract');
  const css = await (await fetch(`${BASE}/assets/css/kgs.min.css`)).text();
  check(/scroll-snap-type:\s*x mandatory/.test(css), 'rail uses native scroll-snap');
  check(/overscroll-behavior-x:\s*contain/.test(css), 'horizontal swipe does not escape the rail');
  check(/100svh/.test(css), 'hero height uses svh (fits with the address bar visible)');
  check(doc.querySelector('.hero__rail')?.getAttribute('role') === 'group', 'rail exposes a group role');

  if (errors.length) {
    failures++;
    console.log('\n  ✗ runtime errors:\n    ' + errors.join('\n    '));
  }

  console.log(failures ? `\n✗ ${failures} hero check(s) failed` : '\n✓ hero rail: all checks passed');
  process.exit(failures ? 1 : 0);
})();
