/* ==========================================================================
   الاتجاه ١ — محرك الطباعة
   Single rAF loop. Nothing is animated by timers, so scrolling up is the exact
   mathematical inverse of scrolling down (no drift, no "history" of reveals).
   ========================================================================== */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const wiped = [...document.querySelectorAll('[data-ink]')];
  const squeegee = document.querySelector('.squeegee');
  const inkEl = document.getElementById('inkLevel');
  const pctEl = document.getElementById('inkPct');

  // Arabic-Indic digits for the progress readout
  const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

  // Hand over to the engine only after styles are in place, so nothing flashes
  // invisible and nothing is left hidden if JS dies early.
  if (!reduce) root.classList.add('ink-ready');

  let ticking = false;
  let lastPct = -1;

  /** progress of an element through the lower→middle band of the viewport */
  function elementProgress(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    // start wiping when the element top hits 94% of the viewport,
    // fully printed when it reaches 50% — reads as a slow pull, not a pop.
    const start = vh * 0.94;
    const end = vh * 0.5;
    return Math.min(1, Math.max(0, (start - r.top) / (start - end)));
  }

  function frame() {
    ticking = false;

    if (!reduce) {
      for (const el of wiped) {
        const p = elementProgress(el);
        // quantise so we don't trigger a style recalculation per sub-pixel
        el.style.setProperty('--p', (Math.round(p * 500) / 500).toFixed(3));
      }
    }

    const doc = root;
    const max = doc.scrollHeight - window.innerHeight;
    const y = window.scrollY || window.pageYOffset;
    const ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

    if (inkEl) inkEl.style.height = (ratio * 100).toFixed(2) + '%';
    if (squeegee) squeegee.style.setProperty('--progress', ratio.toFixed(4));

    const pct = Math.round(ratio * 100);
    if (pctEl && pct !== lastPct) {
      pctEl.textContent = ar(pct) + '٪';
      lastPct = pct;
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('orientationchange', onScroll);
  onScroll();

  // in-page anchors that respect the fixed bar
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  const yr = document.getElementById('yr');
  if (yr) yr.textContent = ar(new Date().getFullYear());
})();
