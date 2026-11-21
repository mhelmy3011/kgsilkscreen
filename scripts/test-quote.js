#!/usr/bin/env node
'use strict';
/**
 * test-quote.js — behavioural test for the 3-tap quote builder.
 *
 * The acceptance criteria from the plan, each asserted:
 *   1. Three taps are enough to reach a sendable message.
 *   2. The message is complete and specific (type, quantity, timing).
 *   3. The WhatsApp href is rewritten on every change, correctly encoded.
 *   4. The form is real: three fieldsets, radio inputs, a real default href, so
 *      it still works if the script never runs (progressive enhancement).
 *   5. Nothing is persisted: no localStorage/sessionStorage writes.
 *   6. Arabic-Indic numerals and Arabic text survive encoding round-trip.
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, detail = '') => {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/getContext/.test(e.message)) errors.push(e.message); });

  const stored = [];
  const dom = await JSDOM.fromURL(`${BASE}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: 780, configurable: true });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.Element.prototype.getBoundingClientRect = function () {
        return { top: 0, bottom: 100, left: 0, right: 390, width: 390, height: 100, x: 0, y: 0, toJSON() { return this; } };
      };
      // catch any attempt to persist state
      win.localStorage.setItem = function (k) { stored.push('localStorage:' + k); };
      win.sessionStorage.setItem = function (k) { stored.push('sessionStorage:' + k); };
    },
  });

  await sleep(800);
  const win = dom.window;
  const doc = win.document;

  console.log('\nquote builder — structure');
  const form = doc.querySelector('[data-quote-builder]');
  check(!!form, 'form is server-rendered');
  const sets = [...doc.querySelectorAll('.qb__step')];
  check(sets.length === 3, 'three steps', `got ${sets.length}`);
  const send = doc.querySelector('[data-qb-send]');
  check(!!send, 'send button exists');
  check(/^https:\/\/wa\.me\/201000000000\?text=/.test(send.getAttribute('href') || ''),
    'button has a working default WhatsApp href before any JS');

  for (const n of ['kind', 'qty', 'when']) {
    const opts = doc.querySelectorAll(`input[name="${n}"]`);
    check(opts.length >= 3, `${n}: has ${opts.length} options`);
    check([...opts].every((o) => o.type === 'radio'), `${n}: options are real radio inputs`);
    check([...opts].some((o) => o.checked), `${n}: has a default so the form is never empty`);
  }
  const labels = [...doc.querySelectorAll('.qb__opt')];
  check(labels.every((l) => l.querySelector('input') && l.textContent.trim()), 'every option is wrapped in a label (tap target = whole pill)');

  console.log('\nquote builder — behaviour');
  check(!!win.KGS.quote, 'KGS.quote API is exposed');

  const pick = (name, value) => {
    const el = [...doc.querySelectorAll(`input[name="${name}"]`)].find((o) => o.value === value);
    el.checked = true;
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };

  // three taps
  pick('kind', 'يونيفورم مدارس أو شركات');
  pick('qty', '١٠٠–٥٠٠ قطعة');
  pick('when', 'خلال أسبوع');
  await sleep(30);

  const href = send.getAttribute('href');
  const text = decodeURIComponent(href.split('text=')[1] || '');

  check(href.startsWith('https://wa.me/201000000000?text='), 'href still points at the workshop WhatsApp number');
  check(text.includes('يونيفورم مدارس أو شركات'), 'message carries the chosen product type');
  check(text.includes('١٠٠–٥٠٠ قطعة'), 'message carries the chosen quantity in Arabic-Indic numerals');
  check(text.includes('خلال أسبوع'), 'message carries the chosen timing');
  check(text.startsWith('السلام عليكم كمال جادو'), 'message opens with the workshop greeting');
  check(text.split('\n').length >= 5, 'message is a structured multi-line brief', `${text.split('\n').length} lines`);
  check(!/undefined|null|NaN/.test(text), 'no placeholder junk in the message');

  const summary = doc.querySelector('[data-qb-summary]');
  check(
    !!summary && summary.textContent.includes('يونيفورم'),
    'live summary reflects the choices',
    summary ? summary.textContent.trim().slice(0, 60) : 'no summary element'
  );
  check(summary.getAttribute('aria-live') === 'polite', 'summary is announced politely to screen readers');

  // changing one choice must fully rewrite, not append
  pick('qty', '٢٥–٥٠ قطعة');
  await sleep(30);
  const text2 = decodeURIComponent(send.getAttribute('href').split('text=')[1]);
  check(text2.includes('٢٥–٥٠ قطعة') && !text2.includes('١٠٠–٥٠٠ قطعة'), 'changing a choice replaces the old value');

  // encoding round-trip
  check(encodeURIComponent(decodeURIComponent(href.split('text=')[1])) === href.split('text=')[1], 'percent-encoding round-trips cleanly');

  console.log('\nquote builder — privacy');
  check(stored.length === 0, 'nothing written to local/session storage', stored.join(','));

  // submits must not reload the page
  const ev = new win.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  check(ev.defaultPrevented, 'form submission is intercepted (no page reload)');

  if (errors.length) { failures++; console.log('\n  ✗ runtime errors:\n    ' + errors.join('\n    ')); }
  console.log(failures ? `\n✗ ${failures} quote-builder check(s) failed` : '\n✓ quote builder: all checks passed');
  process.exit(failures ? 1 : 0);
})();
