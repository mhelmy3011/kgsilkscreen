#!/usr/bin/env node
'use strict';
/**
 * check-a11y.js — structural accessibility audit of the delivered document.
 *
 * Runs against the served page (so it checks what the browser actually gets,
 * after SSG, minification and script injection), and asserts the things that
 * are cheap to break and expensive to notice:
 *
 *   landmarks · single h1 · heading order · alt text · visible labels ·
 *   duplicate ids · empty links · aria misuse · lang/dir · focusable
 *   elements inside inert regions · link text that says "here"
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = 0;
const bad = (m) => { fail++; console.log(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/getContext/.test(e.message)) errors.push(e.message); });

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
      Object.defineProperty(win.HTMLElement.prototype, 'scrollWidth', { get() { return 0; }, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get() { return 0; }, configurable: true });
      win.HTMLElement.prototype.scrollTo = function () {};
    },
  });
  await sleep(700);

  const doc = dom.window.document;

  console.log('\na11y — document');
  good(`lang="${doc.documentElement.lang}" dir="${doc.documentElement.dir}"`);
  if (!/^ar/.test(doc.documentElement.lang || '')) bad('html lang is not Arabic');
  if (doc.documentElement.dir !== 'rtl') bad('html dir is not rtl');
  if (!doc.title || doc.title.length < 10) bad('missing or too-short <title>');

  console.log('\na11y — landmarks & headings');
  const main = doc.querySelectorAll('main');
  main.length === 1 ? good('exactly one <main>') : bad(`${main.length} <main> landmarks`);
  doc.querySelector('header') ? good('has <header>') : bad('no <header>');
  doc.querySelector('footer') ? good('has <footer>') : bad('no <footer>');

  const h1 = doc.querySelectorAll('h1');
  h1.length === 1 ? good('exactly one h1') : bad(`${h1.length} h1 elements`);

  const heads = [...doc.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]);
  let skips = 0;
  for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) skips++;
  if (skips) bad(`${skips} heading level skip(s): ${heads.join(',')}`);
  else good(`heading order is clean (${heads.length} headings)`);

  const emptyHeads = [...doc.querySelectorAll('h1,h2,h3,h4')].filter((h) => !h.textContent.trim());
  if (emptyHeads.length) bad(`${emptyHeads.length} empty heading(s)`);
  else good('no empty headings');

  console.log('\na11y — images & icons');
  const imgs = [...doc.querySelectorAll('img')];
  const noAlt = imgs.filter((i) => !i.hasAttribute('alt'));
  if (noAlt.length) bad(`${noAlt.length} <img> without alt`);
  else good(`all ${imgs.length} images have alt (empty alt allowed for decorative)`);

  // A decorative svg is fine if it is aria-hidden itself, OR sits inside a
  // region that is already hidden from assistive tech (the icon wrappers), OR
  // is inside a control that carries its own accessible name.
  const decorativeOk = [...doc.querySelectorAll('svg')].every(
    (s) =>
      s.getAttribute('aria-hidden') === 'true' ||
      s.getAttribute('role') === 'img' ||
      s.closest('[aria-hidden="true"]') ||
      s.closest('a[aria-label],button[aria-label],a')
  );
  decorativeOk ? good('inline svg is either aria-hidden or inside a labelled control') : bad('an inline svg has no accessible treatment');

  console.log('\na11y — controls');
  const links = [...doc.querySelectorAll('a[href]')];
  const emptyLinks = links.filter((a) => !a.textContent.trim() && !a.getAttribute('aria-label'));
  if (emptyLinks.length) bad(`${emptyLinks.length} link(s) with no text and no aria-label`);
  else good(`all ${links.length} links have an accessible name`);

  const vague = links.filter((a) => /^(هنا|اضغط هنا|المزيد|اقرأ المزيد|here|more)$/i.test(a.textContent.trim()));
  if (vague.length) bad(`${vague.length} link(s) with vague text ("هنا" / "المزيد")`);
  else good('no vague link text');

  const btns = [...doc.querySelectorAll('button')];
  const selfNamed = btns.filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'));
  if (selfNamed.length) bad(`${selfNamed.length} button(s) with no accessible name`);
  else good(`all ${btns.length} buttons have an accessible name`);

  // form controls (the quote builder)
  const fields = [...doc.querySelectorAll('input, select, textarea')];
  const unlabelled = fields.filter((f) => {
    if (f.type === 'hidden') return false;
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) return false;
    return !f.closest('label');
  });
  if (unlabelled.length) bad(`${unlabelled.length} form control(s) without a label`);
  else good(`all ${fields.length} form controls are labelled`);

  const fieldsets = [...doc.querySelectorAll('fieldset')];
  const noLegend = fieldsets.filter((f) => !f.querySelector('legend'));
  if (noLegend.length) bad(`${noLegend.length} fieldset(s) without a legend`);
  else good(`${fieldsets.length} fieldsets each have a legend`);

  console.log('\na11y — ids & aria');
  const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  dupes.length ? bad(`duplicate id(s): ${[...new Set(dupes)].join(', ')}`) : good(`${ids.length} ids, all unique`);

  // every aria-controls / aria-labelledby / aria-describedby must resolve
  let dangling = 0;
  for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean)) {
        if (!doc.getElementById(id)) dangling++;
      }
    }
  }
  dangling ? bad(`${dangling} aria reference(s) point at missing ids`) : good('every aria id reference resolves');

  // NB: finding links inside an `inert` element is the *point* — inert is what
  // makes them unreachable, and jsdom has no layout/focus model to prove it.
  // So assert the mechanism is present and applied consistently instead.
  const inertEls = [...doc.querySelectorAll('[inert]')];
  const hiddenSlides = [...doc.querySelectorAll('.hero__slide')].filter((s) => s.getAttribute('aria-hidden') === 'true');
  const both = hiddenSlides.every((s) => s.hasAttribute('inert'));
  if (!inertEls.length) bad('no inert regions found on the hidden slides');
  else if (!both) bad('a slide is aria-hidden but not inert (its links stay tabbable)');
  else good(`${inertEls.length} inert region(s); every aria-hidden slide is also inert`);

  console.log('\na11y — live regions');
  const live = doc.querySelectorAll('[aria-live]');
  live.length ? good(`${live.length} live region(s) declared`) : bad('no live region for the quote summary');
  const noRolePoliteness = [...live].filter((l) => !l.getAttribute('aria-live'));
  if (noRolePoliteness.length) bad('live region missing its politeness value');
  else good('live regions declare politeness');

  if (errors.length) { fail++; console.log('\n  ✗ runtime errors:\n    ' + errors.join('\n    ')); }
  console.log(fail ? `\n✗ ${fail} a11y check(s) failed` : '\n✓ accessibility audit clean');
  process.exit(fail ? 1 : 0);
})();
