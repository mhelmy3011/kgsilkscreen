/* ==========================================================================
   kgs-engine.js — قلب الحركة
   ---------------------------------------------------------------------------
   ONE requestAnimationFrame loop for the whole page. It owns:

     1. depth       — smoothed 0..1 scroll progress (the "how deep am I")
     2. velocity    — signed, smoothed; feeds bubble turbulence
     3. reveals     — [data-reveal] elements get --p from their own geometry,
                      so scrolling up rewinds them exactly
     4. counters    — count up once, never re-triggered
     5. perf guard  — measures frame time; if the device can't hold ~50fps we
                      drop the canvas resolution, then the blur effects, then
                      give up on the heavy layer entirely. The page keeps
                      working at every step.

   Everything is frame-rate independent: smoothing uses
   k = 1 - pow(base, dt/16.67) so 30fps and 120fps feel identical.

   Public API: window.KGS.engine
   ========================================================================== */
(() => {
  'use strict';

  const KGS = (window.KGS = window.KGS || {});
  const doc = document.documentElement;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = reduceQuery.matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const slowNet = Boolean(navigator.connection && /2g/.test(navigator.connection.effectiveType || ''));

  /* ------------------------------- state ---------------------------------- */
  const state = {
    depth: 0,          // smoothed
    depthTarget: 0,
    velocity: 0,       // px/frame smoothed
    scrollY: 0,
    dt: 16.67,
    max: 1,
    time: 0,
    quality: saveData || slowNet ? 'low' : 'auto', // low | auto | reduced | off
    fps: 60,
    reduce,
  };

  const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  const staggerParents = [...document.querySelectorAll('[data-stagger-group]')];
  const counterEls = [...document.querySelectorAll('[data-count]')];
  const depthReadout = document.querySelector('[data-depth-readout]');
  const depthRail = document.querySelector('[data-depth-rail]');
  const progressBar = document.querySelector('[data-progress]');
  const nav = document.querySelector('[data-nav]');
  const docBody = document.body;
  /* Optional per-frame subscribers. The whole page shares ONE rAF loop; a
     module that needs scroll maths registers here instead of starting its own
     loop, so two animated sections can never double the frame budget. */
  const frameHooks = [];

  /* ------------------------------ perf guard ------------------------------ */
  const perf = {
    samples: [],
    degraded: 0,
    sample(dt) {
      if (state.reduce || state.quality === 'off') return;
      this.samples.push(dt);
      if (this.samples.length < 90) return;
      const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      this.samples.length = 0;
      state.fps = Math.round(1000 / avg);
      // 3 strikes and we degrade one step (never oscillates back up, so no
      // flicker between quality levels mid-scroll)
      if (state.fps < 45 && this.degraded < 3) {
        this.degraded++;
        doc.dataset.perf = ['canvas-half', 'no-blur', 'canvas-off'][this.degraded - 1] || 'off';
        window.dispatchEvent(new CustomEvent('kgs:degrade', { detail: { step: this.degraded, fps: state.fps } }));
      }
    },
  };

  /* -------------------------------- reveal -------------------------------- */
  // Progress of an element through the viewport. Because it is recomputed from
  // getBoundingClientRect every frame there is no stored history: scrolling up
  // rewinds it to the same numbers it had on the way down.
  function elementProgress(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const start = vh * 0.92;
    const end = vh * 0.55;
    return clamp01((start - r.top) / (start - end));
  }

  let lastTime = 0;
  let rafId = 0;

  function frame(now) {
    const dt = lastTime ? Math.min(64, now - lastTime) : 16.67;
    lastTime = now;
    state.time += dt * 0.001;
    state.dt = dt;

    const y = window.scrollY || window.pageYOffset || 0;
    const rawVel = y - state.scrollY;
    state.scrollY = y;
    state.velocity = lerp(state.velocity, rawVel, 0.16);

    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    state.max = max;
    state.depthTarget = clamp01(y / max);
    const k = 1 - Math.pow(0.87, dt / 16.67);
    state.depth = lerp(state.depth, state.depthTarget, k);

    /* reveals */
    if (!state.reduce) {
      for (const el of revealEls) {
        const p = elementProgress(el);
        // 1/200 quantisation: fewer style invalidations, visually identical
        const q = Math.round(p * 200) / 200;
        if (el._p !== q) {
          el._p = q;
          el.style.setProperty('--p', q.toFixed(3));
        }
      }
    }

    /* staggered child reveals: [data-reveal-child] children of a --p element
       inherit a slightly delayed copy, so headlines unroll word by word */
    if (!state.reduce && staggerParents.length) {
      for (const parent of staggerParents) {
        const base = parent._p || 0;
        const kids = parent._kids || (parent._kids = [...parent.querySelectorAll('[data-stagger]')]);
        const n = kids.length || 1;
        kids.forEach((k, i) => {
          const offset = (i / n) * 0.45;
          const v = Math.max(0, Math.min(1, (base - offset) / (1 - 0.45 + 0.45 / n)));
          const q = Math.round(v * 200) / 200;
          if (k._p !== q) {
            k._p = q;
            k.style.setProperty('--p', q.toFixed(3));
          }
        });
      }
    }

    /* depth readout + rail + top progress */
    if (depthReadout) {
      const m = Math.round(state.depth * 72);
      if (depthReadout._v !== m) {
        depthReadout._v = m;
        depthReadout.textContent = ar(m);
      }
    }
    if (depthRail) depthRail.style.setProperty('--d', state.depth.toFixed(4));
    if (progressBar) progressBar.style.setProperty('--d', state.depth.toFixed(4));

    /* nav: compact after leaving the hero, hide when scrolling down fast */
    if (nav) {
      const compact = y > 80;
      if (nav._compact !== compact) {
        nav._compact = compact;
        nav.classList.toggle('is-compact', compact);
      }
    }
    /* depth tint on the CSS aurora layer */
    if (docBody) {
      const q = Math.round(state.depth * 200) / 200;
      if (docBody._d !== q) {
        docBody._d = q;
        docBody.style.setProperty('--d', q.toFixed(3));
      }
    }

    if (window.KGS.onFrame) window.KGS.onFrame(state);
    for (let i = 0; i < frameHooks.length; i++) frameHooks[i](state);
    perf.sample(dt);

    rafId = requestAnimationFrame(frame);
  }

  /* ------------------------------- counters -------------------------------- */
  function setupCounters() {
    if (!counterEls.length) return;
    const run = (el) => {
      if (el._done) return;
      el._done = true;
      const target = Number(el.dataset.count) || 0;
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      if (state.reduce) {
        el.textContent = prefix + ar(target) + suffix;
        return;
      }
      const dur = 1100;
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + ar(Math.round(target * eased)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      counterEls.forEach(run);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            run(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    );
    counterEls.forEach((el) => io.observe(el));
  }

  /* -------------------------------- start ---------------------------------- */
  function start() {
    if (reduce) {
      doc.classList.add('no-motion');
      revealEls.forEach((el) => el.style.setProperty('--p', '1'));
    }
    doc.classList.add('js-ready');
    setupCounters();
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId) {
      lastTime = 0; // don't integrate the paused time in one jump
      rafId = requestAnimationFrame(frame);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  KGS.engine = {
    state,
    start,
    setQuality(q) {
      state.quality = q;
    },
    ar,
    addFrame(fn) {
      if (typeof fn === 'function' && !frameHooks.includes(fn)) frameHooks.push(fn);
      return () => {
        const i = frameHooks.indexOf(fn);
        if (i > -1) frameHooks.splice(i, 1);
      };
    },
    // header height helper for anchor offsets
    anchorOffset: () => (nav ? nav.offsetHeight : 64) + 8,
  };
})();
