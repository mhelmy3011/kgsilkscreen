/* ==========================================================================
   kgs-page.js — توصيل المحرك بالصفحة
   ---------------------------------------------------------------------------
   Boots the WebGL ink, wires engine → shader, adds the small interactions
   (card glow, sticky CTA, active nav link) and reports Core Web Vitals so you
   can see the real numbers instead of guessing.
   ========================================================================== */
(() => {
  'use strict';

  const KGS = (window.KGS = window.KGS || {});
  const doc = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('ink-canvas');
  const aurora = document.getElementById('aurora');

  /* ------------------------- 1. تشغيل الحبر ------------------------------- */
  let ink = null;

  function startInk() {
    if (!canvas || reduce || !KGS.ink) return;
    // respect the perf guard: if the engine already dropped us below canvas
    // quality, don't even create a GL context
    if (doc.dataset.perf === 'canvas-off') return;

    ink = KGS.ink.create(canvas, {
      onFrame() {
        // the canvas is only honest when it actually painted
        if (!doc.classList.contains('ink-live')) {
          doc.classList.add('ink-live');
          // hand visuals over from the CSS aurora to the shader
          if (aurora) {
            aurora.style.transition = 'opacity 1.1s ease';
            aurora.style.opacity = '0.14';
          }
        }
      },
    });

    if (!ink.ok) {
      // no WebGL: the CSS aurora stays as the background. Journey intact.
      doc.classList.add('ink-fallback');
      if (canvas) canvas.style.display = 'none';
      KGS.engine && KGS.engine.setQuality('css-only');
      return;
    }

    KGS.onFrame = (state) => {
      ink.draw({
        time: state.time,
        depth: state.depth,
        vel: Math.max(-1, Math.min(1, state.velocity / 26)),
      });
    };

    let rt = 0;
    window.addEventListener(
      'resize',
      () => {
        clearTimeout(rt);
        rt = setTimeout(() => ink.resize(), 160);
      },
      { passive: true }
    );
  }

  // if the perf guard says the GPU can't keep up, halve the drawable first,
  // then stop drawing entirely (CSS aurora takes over).
  window.addEventListener('kgs:degrade', (e) => {
    const step = e.detail.step;
    if (!ink) return;
    if (step === 1) ink.setQuality(0.62);
    if (step === 3) {
      KGS.onFrame = null;
      ink.destroy();
      doc.classList.add('ink-fallback');
      if (canvas) canvas.style.display = 'none';
      if (aurora) aurora.style.opacity = '1';
    }
  });

  /* ------------------------- 2. تفاعلات صغيرة ---------------------------- */
  /* Real 3D tilt, not a hover scale: the pointer position sets two rotation
     customs on the card, which CSS composes into one translate3d+rotate3d.
     Pointer only, hover-capable devices only, and the write is coalesced into
     one rAF — a fast mouse can fire hundreds of pointermove events per frame
     and style invalidation, not GPU, is what would cost. */
  function setupCardTilt() {
    if (reduce || !window.matchMedia('(hover: hover)').matches) return;
    for (const card of document.querySelectorAll('[data-tilt]')) {
      let queued = 0;
      let nx = 0;
      let ny = 0;

      const reset = () => {
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      };

      card.addEventListener('pointerenter', () => card.classList.add('is-tilting'), { passive: true });
      card.addEventListener(
        'pointermove',
        (e) => {
          const r = card.getBoundingClientRect();
          if (!r.width) return;
          nx = (e.clientX - r.left) / r.width - 0.5;
          ny = (e.clientY - r.top) / r.height - 0.5;
          card.style.setProperty('--mx', `${(nx + 0.5) * 100}%`);
          card.style.setProperty('--my', `${(ny + 0.5) * 100}%`);
          if (queued) return;
          queued = requestAnimationFrame(() => {
            queued = 0;
            card.style.setProperty('--ry', `${(nx * 7).toFixed(2)}deg`);
            card.style.setProperty('--rx', `${(-ny * 7).toFixed(2)}deg`);
          });
        },
        { passive: true }
      );
      card.addEventListener('pointerleave', reset, { passive: true });
      card.addEventListener('blur', reset, true);
    }
  }

  /* The hero plate sits a few pixels deeper than the copy. Pointer-driven, on
     hover devices only; transform on the <picture> so the existing 8s Ken Burns
     zoom on the <img> is untouched. */
  function setupHeroDepth() {
    const hero = document.querySelector('.hero');
    if (!hero || reduce || !window.matchMedia('(hover: hover)').matches) return;
    let queued = false;
    let x = 0;
    let y = 0;

    const commit = () => {
      queued = false;
      hero.style.setProperty('--hx', x.toFixed(3));
      hero.style.setProperty('--hy', y.toFixed(3));
    };

    hero.addEventListener(
      'pointermove',
      (e) => {
        const r = hero.getBoundingClientRect();
        if (!r.width) return;
        x = (e.clientX - r.left) / r.width - 0.5;
        y = (e.clientY - r.top) / r.height - 0.5;
        if (!queued) {
          queued = true;
          requestAnimationFrame(commit);
        }
      },
      { passive: true }
    );

    hero.addEventListener('pointerleave', () => {
      x = 0;
      y = 0;
      commit();
    }, { passive: true });
  }

  function setupDock() {
    const dock = document.getElementById('dock');
    if (!dock) return;

    // Show the bar once the reader is past the hero (which carries its own
    // full-width WhatsApp button), and retract it when they scroll UP — a
    // thumb-covering bar is fine while descending, wrong while re-reading.
    //
    // The original version retracted on ANY upward movement, so a 2px bounce
    // made it flicker. Now the direction has to be deliberate: a 60px run, and
    // a 12px hysteresis band so small reversals change nothing.
    const SHOW_AFTER = 520;
    const RUN = 60;
    const DEADBAND = 12;

    let lastY = window.scrollY || 0;
    let anchorY = lastY;   // scroll position at the last direction change
    let shown = false;

    const apply = (next) => {
      if (next === shown) return;
      shown = next;
      dock.style.setProperty('--show', next ? '1' : '0');
      // keep it out of the a11y tree while it is hidden and off-screen
      dock.setAttribute('aria-hidden', next ? 'false' : 'true');
      dock.querySelectorAll('a').forEach((a) => {
        if (next) a.removeAttribute('tabindex');
        else a.setAttribute('tabindex', '-1');
      });
    };

    const onScroll = () => {
      const y = Math.max(0, window.scrollY || 0);
      const dy = y - lastY;

      if (Math.abs(dy) < DEADBAND) return;      // ignore rubber-banding
      lastY = y;

      const movedSinceTurn = y - anchorY;
      if (Math.abs(movedSinceTurn) >= RUN) {
        // a deliberate run in one direction
        apply(y > SHOW_AFTER && movedSinceTurn > 0);
        anchorY = y;
      } else if (y <= SHOW_AFTER) {
        apply(false);                            // always hidden near the top
        anchorY = y;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    apply(false);
  }

  function setupActiveNav() {
    if (!('IntersectionObserver' in window)) return;
    const links = [...document.querySelectorAll('.nav__links a')];
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
            a.style.background = 'rgba(238,243,241,0.07)';
            a.style.color = 'var(--paper)';
          } else {
            a.style.background = '';
            a.style.color = '';
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    map.forEach((_, sec) => io.observe(sec));
  }

  /* ------------------------- 3. Web Vitals -------------------------------- */
  // Lightweight, no dependency. Sends nothing anywhere; exposes the numbers on
  // window.KGS.vitals so you can read them in the console after a test.
  function setupVitals() {
    const vitals = { lcp: 0, cls: 0, inp: 0, ttfb: 0 };
    KGS.vitals = vitals;

    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) vitals.ttfb = Math.round(nav.responseStart - nav.requestStart);

      if ('PerformanceObserver' in window) {
        new PerformanceObserver((list) => {
          const e = list.getEntries().pop();
          if (e) vitals.lcp = Math.round(e.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (!e.hadRecentInput) vitals.cls = +(vitals.cls + e.value).toFixed(4);
          }
        }).observe({ type: 'layout-shift', buffered: true });

        new PerformanceObserver((list) => {
          const e = list.getEntries().pop();
          if (e) vitals.inp = Math.round(e.startTime - e.processingStart);
        }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
      }
    } catch {
      /* older browsers: skip silently */
    }
  }

  /* ------------------------- 4. تشغيل ------------------------------------ */
  function boot() {
    startInk();
    setupCardTilt();
    setupHeroDepth();
    setupDock();
    setupActiveNav();
    setupVitals();

    const yr = document.getElementById('yr');
    if (yr) yr.textContent = KGS.engine ? KGS.engine.ar(new Date().getFullYear()) : new Date().getFullYear();

    // smooth anchor scroll that respects the fixed bar and reduced motion
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        const id = a.getAttribute('href');
        if (!id || id.length < 2) return;
        const target = document.querySelector(id);
        if (!target) return;
        ev.preventDefault();
        const offset = KGS.engine ? KGS.engine.anchorOffset() : 70;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
        history.replaceState(null, '', id);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
