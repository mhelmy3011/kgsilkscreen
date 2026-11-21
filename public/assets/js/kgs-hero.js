/**
 * kgs-hero.js — the 3-slide hero rail.
 *
 * Design contract, in order of priority:
 *
 * 1. The slider MUST work with this file absent. The rail is native CSS
 *    scroll-snap, so swiping, keyboard scrolling and screen-reader order are
 *    already correct before any JS runs. Everything here is enhancement.
 * 2. Never fight the platform. We do not emulate momentum, we do not intercept
 *    touch, we do not use setInterval. A swipe is a scroll; we only observe it.
 * 3. No autoplay. Rotating hero slides measurably reduces clicks on slides 2+
 *    and punishes `prefers-reduced-motion` users; `data-autoplay="1"` on the
 *    section turns it on if that decision is ever reversed.
 * 4. RTL is not an afterthought: in an RTL rail, "next" is to the LEFT, which
 *    is negative scrollLeft progress. Keys and arrows follow reading order.
 *
 * Accessibility: inactive slides get `inert` + aria-hidden so a screen reader
 * and the tab order only ever see the visible slide.
 */
(function () {
  'use strict';

  const KGS = (window.KGS = window.KGS || {});

  function setupHeroRail() {
    const hero = document.querySelector('.hero[data-rail]') || document.querySelector('.hero');
    if (!hero) return;

    const rail = hero.querySelector('[data-rail]');
    if (!rail) return;

    const slides = [...rail.querySelectorAll('[data-slide]')];
    if (slides.length < 2) return;

    const dots = [...hero.querySelectorAll('[data-rail-dots] button')];
    const prev = hero.querySelector('[data-rail-prev]');
    const next = hero.querySelector('[data-rail-next]');
    const railEl = rail;

    let index = 0;
    let locked = false;

    /* ---- helpers ------------------------------------------------------- */

    // RTL: at the start, scrollLeft is 0 and gets more NEGATIVE as you advance.
    const maxScroll = () => Math.abs(railEl.scrollWidth - railEl.clientWidth);
    const position = () => Math.abs(railEl.scrollLeft);

    function slideStart(i) {
      // Measure from slide 0 (inline-start edge in both LTR and RTL).
      // In RTL Chrome/Firefox/Safari, scrollLeft=0 is slide 0 (farthest right)
      // and slides 1, 2 move negatively (-W, -2W).
      if (slides[0] && slides[i]) {
        const dist = Math.abs(slides[i].offsetLeft - slides[0].offsetLeft);
        if (dist > 0 || i === 0) return dist;
      }
      return i * railEl.clientWidth;
    }

    function goTo(i, { smooth = true } = {}) {
      const clamped = Math.max(0, Math.min(slides.length - 1, i));
      if (clamped === index && smooth) return;
      index = clamped;
      const dir = getComputedStyle(railEl).direction === 'rtl' ? -1 : 1;
      railEl.scrollTo({ left: dir * slideStart(clamped), behavior: smooth ? 'smooth' : 'auto' });
      paint();
    }

    function currentIndex() {
      const target = position();
      let best = 0;
      let bestDist = Infinity;
      slides.forEach((_, i) => {
        const d = Math.abs(slideStart(i) - target);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    }

    /* ---- visual state -------------------------------------------------- */

    function paint() {
      dots.forEach((d, i) => {
        const on = i === index;
        d.classList.toggle('is-active', on);
        if (on) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });

      slides.forEach((s, i) => {
        const on = i === index;
        s.classList.toggle('is-active', on);
        // Keep non-visible slides out of the tab order and the a11y tree.
        if (on) {
          s.removeAttribute('aria-hidden');
          s.removeAttribute('inert');
        } else {
          s.setAttribute('aria-hidden', 'true');
          s.setAttribute('inert', '');
        }
      });

      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === slides.length - 1;

      hero.setAttribute('data-slide-index', String(index));
      KGS.heroIndex = index;
    }

    /* ---- observation, not interception --------------------------------- */

    // Scroll listener (rAF-throttled) rather than IntersectionObserver: with
    // scroll-snap the meaningful signal is "which slide is nearest the centre",
    // and a plain rAF read gives that with no threshold hysteresis.
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const i = currentIndex();
        if (i !== index) {
          index = i;
          paint();
        }
      });
    }
    railEl.addEventListener('scroll', onScroll, { passive: true });

    /* ---- controls ------------------------------------------------------ */

    dots.forEach((d, i) => {
      d.addEventListener('click', () => goTo(i));
    });

    // RTL reading order: the "next" arrow is on the visual left and advances.
    if (prev) prev.addEventListener('click', () => goTo(index - 1));
    if (next) next.addEventListener('click', () => goTo(index + 1));

    hero.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        // in RTL, left = forward
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(slides.length - 1);
      }
    });

    // Once the user drives the rail by hand, stop any programmatic lock.
    railEl.addEventListener('pointerdown', () => { locked = false; }, { passive: true });

    /* ---- optional autoplay (off by default, see header) ---------------- */
    if (hero.dataset.autoplay === '1' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let timer = null;
      const startTimer = () => {
        clearInterval(timer);
        timer = setInterval(() => goTo((index + 1) % slides.length), 7000);
      };
      hero.addEventListener('pointerenter', () => clearInterval(timer));
      hero.addEventListener('pointerleave', startTimer);
      hero.addEventListener('focusin', () => clearInterval(timer));
      startTimer();
    }

    /* ---- keep the rail aligned when the viewport changes ---------------- */
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const target = slideStart(index);
        if (Math.abs(position() - target) > 2) goTo(index, { smooth: false });
      }, 150);
    }, { passive: true });

    // A slide whose image is still lazy must not shift the rail once it lands.
    paint();

    KGS.hero = { goTo, current: () => index, count: slides.length };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupHeroRail);
  } else {
    setupHeroRail();
  }
})();
