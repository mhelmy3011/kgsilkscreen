/* ==========================================================================
   kgs-motion.js — طبقة الحركة (بديل محرك الحبر القديم)
   ---------------------------------------------------------------------------
   Goals, in order:
     1. Zero continuous work. No WebGL, no canvas, no blurred layers, no
        requestAnimationFrame loop running while the page is idle.
     2. One rAF frame per scroll burst. Reads are batched, writes happen once.
     3. Everything animated is opacity / transform. The compositor does the
        work; the main thread stays free during scroll.
     4. Progressive: without this file the page is fully readable and every
        link still works. `.js` is only set when JS is alive, and the inline
        bootstrap removes it again if this file never lands.
   Public surface: window.KGS (engine.ar / anchorOffset, vitals)
   ========================================================================== */
(() => {
  'use strict';

  const KGS = (window.KGS = window.KGS || {});
  const doc = document.documentElement;
  const body = document.body;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = reduceQuery.matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wide = window.matchMedia('(min-width: 900px)');
  const conn = navigator.connection || {};
  const saveData = Boolean(conn.saveData) || /2g/.test(conn.effectiveType || '');

  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (n) => String(n).replace(/\d/g, (d) => AR[+d]);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));

  const nav = document.querySelector('[data-nav]');
  const jump = document.querySelector('.nav__jump');
  const progress = document.querySelector('[data-progress]');
  const dock = document.getElementById('dock');
  const contact = document.getElementById('contact');
  let contactNear = false;
  const hero = document.getElementById('top');
  const readout = document.querySelector('[data-depth-readout]');
  const railReadout = document.querySelector('[data-depth-rail]');

  /* ------------------------------------------------------------------ reveal
     IntersectionObserver reveals with a per-sibling stagger. The element is
     unobserved after it lands, so nothing runs again on scroll-up. */
  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  const stagger = new Map();
  for (const el of revealEls) {
    const parent = el.parentElement;
    const n = (stagger.get(parent) || 0);
    el.style.setProperty('--i', String(Math.min(n, 6)));
    stagger.set(parent, n + 1);
  }

  const showAll = () => {
    for (const el of revealEls) el.classList.add('is-in');
    doc.classList.add('no-motion');
  };

  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    for (const el of revealEls) io.observe(el);
  }

  /* ----------------------------------------------------------------- counters
     Runs once, on entry. Arabic-Indic digits, no decimal jitter. */
  function setupCounters() {
    const els = [...document.querySelectorAll('[data-count]')];
    if (!els.length) return;

    const run = (el) => {
      if (el.dataset.done) return;
      el.dataset.done = '1';
      const target = Number(el.dataset.count) || 0;
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      if (reduce || saveData || !target) {
        el.textContent = prefix + ar(target) + suffix;
        return;
      }
      const dur = 950;
      const t0 = performance.now();
      const tick = (t) => {
        const p = clamp((t - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + ar(Math.round(target * eased)) + suffix;
        if (p < 1) raf(tick);
      };
      raf(tick);
    };

    if (!('IntersectionObserver' in window)) {
      els.forEach(run);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          run(e.target);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------- scroll-linked work
     One passive listener sets a dirty flag; one rAF frame does all reads then
     all writes. Nothing is scheduled when the page is still. */
  let dirty = false;
  let lastY = 0;
  let dirAnchor = 0;
  let dockShown = false;
  const SHOW_AFTER = 560;
  const RUN = 64;
  const DEADBAND = 12;

  const navOffset = () =>
    (nav ? nav.offsetHeight : 64) + (jump && jump.offsetParent !== null ? jump.offsetHeight : 0) + 10;

  function setDock(next) {
    if (!dock || next === dockShown) return;
    if (next && contactNear) next = false;
    dockShown = next;
    dock.classList.toggle('is-shown', next);
    dock.setAttribute('aria-hidden', next ? 'false' : 'true');
    dock.querySelectorAll('a').forEach((a) => {
      if (next) a.removeAttribute('tabindex');
      else a.setAttribute('tabindex', '-1');
    });
  }

  function frame() {
    dirty = false;
    const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const p = clamp(y / max, 0, 1);

    if (progress) progress.style.setProperty('--d', p.toFixed(4));
    if (railReadout) railReadout.style.setProperty('--d', p.toFixed(4));
    if (readout) {
      const pct = Math.round(p * 100);
      if (readout._v !== pct) {
        readout._v = pct;
        readout.textContent = ar(pct);
      }
    }
    if (nav) {
      const compact = y > 80;
      if (nav._compact !== compact) {
        nav._compact = compact;
        nav.classList.toggle('is-compact', compact);
      }
    }

    /* hero art parallax: ±12px only, desktop only, never while reduced */
    if (hero && !reduce && wide.matches) {
      const shift = clamp(-y * 0.05, -12, 12);
      if (hero._py !== shift) {
        hero._py = shift;
        hero.style.setProperty('--py', shift.toFixed(2) + 'px');
      }
    }

    /* dock: deliberate downward run shows it, a run upward retracts it */
    if (dock) {
      const dy = y - lastY;
      if (Math.abs(dy) >= DEADBAND) {
        lastY = y;
        const moved = y - dirAnchor;
        if (Math.abs(moved) >= RUN) {
          setDock(y > SHOW_AFTER && moved > 0 && !contactNear);
          dirAnchor = y;
        } else if (y <= SHOW_AFTER) {
          setDock(false);
          dirAnchor = y;
        }
      }
    }
  }

  function onScroll() {
    if (dirty) return;
    dirty = true;
    raf(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('orientationchange', onScroll, { passive: true });

  /* when the conversion panel is on screen it already carries two large CTAs,
     so the floating dock steps aside instead of covering the form */
  if (contact && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        contactNear = entries[entries.length - 1].isIntersecting;
        if (contactNear) setDock(false);
      },
      { rootMargin: '-15% 0px -15% 0px' }
    ).observe(contact);
  }

  /* --------------------------------------------------------------- active nav */
  function setupActiveNav() {
    if (!('IntersectionObserver' in window) || !nav) return;
    const links = [...nav.querySelectorAll('.nav__links a')];
    if (!links.length) return;
    const map = new Map();
    for (const a of links) {
      const sec = document.querySelector(a.getAttribute('href'));
      if (sec) map.set(sec, a);
    }
    if (!map.size) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const a = map.get(e.target);
          if (!a) continue;
          if (e.isIntersecting) {
            links.forEach((l) => l.removeAttribute('aria-current'));
            a.setAttribute('aria-current', 'true');
          } else {
            a.removeAttribute('aria-current');
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    map.forEach((_, sec) => io.observe(sec));
  }

  /* ------------------------------------------------------- pointer polish
     Spotlight + subtle tilt, only on precise pointers, only on devices that
     did not ask for less data. No listeners are attached on touch. */
  function setupPointer() {
    if (!finePointer || reduce || saveData) return;

    for (const card of document.querySelectorAll('[data-tilt]')) {
      let queued = false;
      let mx = 50;
      let my = 0;
      card.addEventListener(
        'pointermove',
        (e) => {
          const r = card.getBoundingClientRect();
          mx = ((e.clientX - r.left) / r.width) * 100;
          my = ((e.clientY - r.top) / r.height) * 100;
          if (queued) return;
          queued = true;
          raf(() => {
            queued = false;
            card.style.setProperty('--mx', mx.toFixed(1) + '%');
            card.style.setProperty('--my', my.toFixed(1) + '%');
            /* ±3° of physical tilt; the card's own transform does the work and
               the CSS transition smooths the pointer stream */
            card.style.setProperty('--ry', ((mx - 50) * 0.06).toFixed(2) + 'deg');
            card.style.setProperty('--rx', ((my - 50) * -0.05).toFixed(2) + 'deg');
          });
        },
        { passive: true }
      );
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    }

    const magnetic = [...document.querySelectorAll('.hero .btn--primary')];
    for (const el of magnetic) {
      el.addEventListener(
        'pointermove',
        (e) => {
          const r = el.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width - 0.5) * 8;
          const y = ((e.clientY - r.top) / r.height - 0.5) * 6;
          el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        },
        { passive: true }
      );
      el.addEventListener('pointerleave', () => {
        el.style.translate = '';
      });
    }
  }

  /* ------------------------------------------------------------ smooth anchors */
  function setupAnchors() {
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - navOffset();
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  }

  /* ------------------------------------------------------------------- boot */
  function boot() {
    doc.classList.remove('js-pending');
    doc.classList.add('js-ready');
    setupCounters();
    setupActiveNav();
    setupPointer();
    setupAnchors();

    const yr = document.getElementById('yr');
    if (yr) yr.textContent = ar(new Date().getFullYear());

    // evaluate the first screen immediately so the dock/progress are correct
    // even when the page is opened on an anchor (scrollY > 0, no scroll event).
    frame();

    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener('change', (e) => {
        if (e.matches) showAll();
      });
    }
  }

  KGS.engine = {
    ar,
    anchorOffset: navOffset,
    refresh: onScroll,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
