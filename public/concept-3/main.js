/* ==========================================================================
   الاتجاه ٣ — سكربت خفيف جدًا
   الستاكينج بيحصل بالـ CSS (position: sticky) — المتصفح هو اللي بيعمل الشغل،
   والسكرول العكسي بيرجع بحاله. الإحداثيات هنا للـ meter والـ reveals فقط.
   ========================================================================== */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const reveals = [...document.querySelectorAll('.reveal')];
  const bar = document.getElementById('pageBar');
  const book = document.querySelector('.book');
  const pages = [...document.querySelectorAll('.page')];

  const root = document.documentElement;
  if (!reduce) root.classList.add('ink-ready');

  let ticking = false;

  function frame() {
    ticking = false;
    const vh = window.innerHeight;

    if (!reduce) {
      for (const el of reveals) {
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (vh * 0.95 - r.top) / (vh * 0.32)));
        el.style.setProperty('--p', p.toFixed(3));
      }
    }

    if (bar && book) {
      const r = book.getBoundingClientRect();
      const total = r.height - vh;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      bar.style.width = (p * 100).toFixed(1) + '%';

      // page counter in the cover meter
      const idx = Math.min(pages.length, 1 + Math.floor(p * pages.length));
      const label = document.querySelector('.cover__meter span');
      if (label) {
        const next = ar(idx) + ' / ' + ar(pages.length) + ' صفحات';
        if (label.textContent !== next) label.textContent = next;
      }
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
  onScroll();

  // in-page anchors, offset for the fixed bar
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      ev.preventDefault();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  const yr = document.getElementById('yr');
  if (yr) yr.textContent = ar(new Date().getFullYear());
})();
