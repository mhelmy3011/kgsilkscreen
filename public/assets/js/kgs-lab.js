/* ==========================================================================
   kgs-lab.js — مختبر الخامات: CSS-3D material ring
   ---------------------------------------------------------------------------
   Six photographs sit on a preserve-3d cylinder. Rotating the ring is ONE
   transform on the rig; the cards never animate individually. That keeps the
   whole section on the compositor and off the main thread.

   What this file owns:
     · spin     — target angle, driven by drag / buttons / chips, smoothed
     · tilt     — small pointer-driven X/Y, hover devices only
     · drift    — a few degrees tied to the section's progress through the view
     · caption  — name + spec mirrored into an aria-live region

   Rules it obeys:
     · no loop until the section is actually visible (IntersectionObserver)
     · no loop at all without preserve-3d → the CSS grid fallback stays
     · prefers-reduced-motion → every change is instant, no drift, no tilt
     · vertical scroll is never captured: touch-action is pan-y and we only
       take over horizontal pointer movement.
   ========================================================================== */
(() => {
  'use strict';

  const KGS = (window.KGS = window.KGS || {});
  const viewport = document.querySelector('[data-lab]');
  if (!viewport) return;

  const section = viewport.closest('.lab') || viewport;
  const rig = viewport.querySelector('[data-lab-rig]');
  const cards = [...viewport.querySelectorAll('[data-lab-card]')];
  const chips = [...document.querySelectorAll('[data-lab-goto]')];
  const prev = document.querySelector('[data-lab-prev]');
  const next = document.querySelector('[data-lab-next]');
  const readName = document.querySelector('[data-lab-read]');
  const readSpec = document.querySelector('[data-lab-spec]');
  if (!rig || cards.length < 2) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hover = window.matchMedia('(hover: hover)').matches;
  const N = cards.length;
  const STEP = 360 / N;
  const meta = cards.map((c) => ({ name: c.dataset.name || '', spec: c.dataset.spec || '' }));

  const supports3d = (() => {
    try {
      return window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d');
    } catch {
      return false;
    }
  })();

  let target = 0;          // requested angle (deg)
  let shown = 0;           // smoothed angle
  let tiltX = 0;
  let tiltY = 0;
  let index = 0;
  let visible = false;
  let running = false;
  let raf = 0;
  let last = 0;
  let drift = 0;

  /* ---------------------------- caption ---------------------------------- */
  function paintIndex() {
    const i = ((Math.round(-target / STEP) % N) + N) % N;
    if (i === index) return;
    index = i;
    const m = meta[i] || {};
    if (readName) readName.textContent = m.name;
    if (readSpec) readSpec.textContent = m.spec;
    chips.forEach((c, k) => c.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    paintDepth(i);
  }

  /* dim cards by how far they are from the front. Opacity only: one property,
     on the compositor, updated when the index changes — never per frame. */
  function paintDepth(front) {
    cards.forEach((card, k) => {
      let d = Math.abs(k - front);
      d = Math.min(d, N - d);
      card.style.setProperty('--dim', d === 0 ? '0' : Math.min(0.55, 0.18 + d * 0.12).toFixed(2));
    });
  }

  function goTo(i, { snap = false } = {}) {
    target = -i * STEP;
    if (snap) target = Math.round(target / STEP) * STEP;
    paintIndex();
    ensureLoop();
  }

  /* ------------------------------ loop ----------------------------------- */
  /*
   * On this page kgs-engine.js already owns the single rAF loop, so the ring
   * subscribes to it (KGS.engine.addFrame) and does no scheduling of its own.
   * The fallback below only exists if the engine failed to load.
   */
  let lastRy = NaN;
  let lastRx = NaN;

  function apply() {
    const ry = Math.round((shown + drift + tiltY) * 100) / 100;
    const rx = Math.round(tiltX * 100) / 100;
    // Writing a custom property invalidates style even when the value is
    // identical. The section can sit on screen for minutes while the reader
    // reads the cards, so only touch the DOM when the numbers actually moved.
    if (ry !== lastRy) {
      lastRy = ry;
      rig.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    }
    if (rx !== lastRx) {
      lastRx = rx;
      rig.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    }
  }

  function measureDrift() {
    if (reduce) { drift = 0; return; }
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
    drift = (p - 0.5) * 16;
  }

  let lastScroll = -1;

  function tick(dt, scrollY) {
    if (reduce) {
      shown = target;
      tiltX = tiltY = 0;
    } else {
      const k = 1 - Math.pow(0.84, dt / 16.67);
      shown += (target - shown) * k;
      if (Math.abs(target - shown) < 0.02) shown = target;
    }
    // only read layout when the page actually scrolled
    if (scrollY !== lastScroll || lastScroll < 0) {
      lastScroll = scrollY;
      measureDrift();
    }
    apply();
  }

  function fallbackFrame(now) {
    if (!running) return;
    const dt = last ? Math.min(64, now - last) : 16.67;
    last = now;
    tick(dt, window.scrollY || 0);
    raf = requestAnimationFrame(fallbackFrame);
  }

  function ensureLoop() {
    if (!supports3d) return;
    if (KGS.engine && KGS.engine.addFrame) return;   // engine drives us
    if (!running) {
      running = true;
      last = 0;
      raf = requestAnimationFrame(fallbackFrame);
    }
  }

  function stopLoop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------------------------- drag ------------------------------------- */
  let drag = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x: e.clientX, start: target };
    viewport.classList.add('is-dragging');
    if (e.pointerType !== 'mouse') viewport.setPointerCapture?.(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (drag) {
      target = drag.start + (e.clientX - drag.x) * 0.35;
      ensureLoop();
      return;
    }
    if (!hover || reduce) return;
    const r = viewport.getBoundingClientRect();
    if (!r.width) return;
    tiltY = ((e.clientX - r.left) / r.width - 0.5) * 14;
    tiltX = -((e.clientY - r.top) / r.height - 0.5) * 8;
    ensureLoop();
  }, { passive: true });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    viewport.classList.remove('is-dragging');
    // settle on the nearest card
    target = Math.round(target / STEP) * STEP;
    paintIndex();
    ensureLoop();
    if (e && e.pointerType !== 'mouse') viewport.releasePointerCapture?.(e.pointerId);
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener('pointerleave', () => {
    if (drag) return;
    tiltX = 0;
    tiltY = 0;
    ensureLoop();
  });

  /* --------------------------- controls ---------------------------------- */
  const currentIndex = () => ((Math.round(-target / STEP) % N) + N) % N;

  prev?.addEventListener('click', () => goTo((currentIndex() - 1 + N) % N));
  next?.addEventListener('click', () => goTo((currentIndex() + 1) % N));

  chips.forEach((chip, i) => {
    chip.addEventListener('click', () => goTo(i));
    chip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? -1 : 1;
      const ni = (i + dir + N) % N;
      chips[ni].focus();
      goTo(ni);
    });
  });


  /* ------------------------- subscribe ----------------------------------- */
  if (KGS.engine && KGS.engine.addFrame) {
    KGS.engine.addFrame((state) => {
      if (!visible || document.hidden) return;
      tick(state.dt || 16.67, state.scrollY || 0);
    });
  }

  /* ---------------------------- promote ---------------------------------- */
  if (supports3d) {
    section.classList.add('is-live');
    // initial paint at the first card, with drift applied once
    shown = target = 0;
    apply();
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          lastScroll = -1;   // force a layout read on entry
          ensureLoop();
        }
        else stopLoop();
      },
      { rootMargin: '160px 0px 160px 0px' }
    );
    io.observe(section);
  } else {
    visible = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (visible) ensureLoop();
  });

  paintIndex();
  paintDepth(index);
  if (KGS.engine) KGS.engine.lab = { goTo, get index() { return index; } };
})();
