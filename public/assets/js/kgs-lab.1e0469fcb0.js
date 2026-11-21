/* ==========================================================================
   kgs-lab.js — مختبر الخامات: CSS-3D material ring
   ---------------------------------------------------------------------------
   Six photographs sit on a preserve-3d cylinder. Rotating the ring is one
   rotateY on a single wrapper; the cards never animate individually. The spin
   itself is handed to the compositor by CSS transition, so this file owns no
   animation loop, no rAF pump and no scroll sampling.

   What this file owns:
     · spin   — target angle, from drag / buttons / chips → one custom property
     · tilt   — a few degrees of pointer parallax, precise pointers only
     · caption — name + spec mirrored into an aria-live region

   Rules it obeys:
     · no loop at all: drag writes --spin directly, CSS eases it; tilt is
       coalesced into at most one rAF per pointer burst
     · without preserve-3d nothing is promoted and the CSS grid fallback stands
     · prefers-reduced-motion / Save-Data → no tilt, instant spin (CSS handles
       the reduced-motion transition kill switch)
     · vertical scroll is never captured (touch-action: pan-y); only horizontal
       pointer travel turns the ring
   ========================================================================== */
(() => {
  'use strict';

  const viewport = document.querySelector('[data-lab]');
  if (!viewport) return;

  const section = viewport.closest('.lab') || viewport;
  const spin = viewport.querySelector('[data-lab-spin]');
  const tiltEl = viewport.querySelector('[data-lab-tilt]');
  const cards = [...viewport.querySelectorAll('[data-lab-card]')];
  const chips = [...document.querySelectorAll('[data-lab-goto]')];
  const prev = document.querySelector('[data-lab-prev]');
  const next = document.querySelector('[data-lab-next]');
  const readName = document.querySelector('[data-lab-read]');
  const readSpec = document.querySelector('[data-lab-spec]');
  if (!spin || cards.length < 2) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const conn = navigator.connection || {};
  const saveData = Boolean(conn.saveData) || /2g/.test(conn.effectiveType || '');
  const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));

  const N = cards.length;
  const STEP = 360 / N;
  const meta = cards.map((c) => ({ name: c.dataset.name || '', spec: c.dataset.spec || '' }));

  const supports3d = (() => {
    try {
      return Boolean(window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d'));
    } catch {
      return false;
    }
  })();

  let target = 0;       // requested ring angle, degrees
  let index = 0;
  let shownSpin = null; // last value written, so style is not dirtied twice
  let shownRx = null;
  let shownRy = null;

  /* ---------------------------- caption ---------------------------------- */
  function paintDepth(front) {
    cards.forEach((card, k) => {
      let d = Math.abs(k - front);
      d = Math.min(d, N - d);
      card.style.setProperty('--dim', d === 0 ? '0' : Math.min(0.52, 0.16 + d * 0.11).toFixed(2));
    });
  }

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

  /* ------------------------------ spin ----------------------------------- */
  /* One property, one wrapper. The transition lives in CSS, so a click or a
     drag release is a single style recalc and the compositor does the easing. */
  function setSpin(deg) {
    const v = Math.round(deg * 100) / 100;
    if (v === shownSpin) return;
    shownSpin = v;
    spin.style.setProperty('--spin', v.toFixed(2) + 'deg');
  }

  function goTo(i) {
    target = -i * STEP;
    setSpin(target);
    paintIndex();
  }

  /* ------------------------------ tilt ----------------------------------- */
  function writeTilt(rx, ry) {
    if (!tiltEl) return;
    if (rx !== shownRx) {
      shownRx = rx;
      tiltEl.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    }
    if (ry !== shownRy) {
      shownRy = ry;
      tiltEl.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    }
  }

  let tiltQueued = false;
  let tiltX = 0;
  let tiltY = 0;

  function queueTilt() {
    if (tiltQueued) return;
    tiltQueued = true;
    raf(() => {
      tiltQueued = false;
      writeTilt(tiltX, tiltY);
    });
  }

  function clearTilt() {
    tiltX = 0;
    tiltY = 0;
    queueTilt();
  }

  /* ---------------------------- drag ------------------------------------- */
  let drag = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!supports3d) return;
    drag = { x: e.clientX, start: target };
    viewport.classList.add('is-dragging');
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      /* older Safari: pointer capture is a nicety, not a requirement */
    }
    if (!reduce) clearTilt();
  });

  viewport.addEventListener(
    'pointermove',
    (e) => {
      if (drag) {
        target = drag.start + (e.clientX - drag.x) * 0.35;
        setSpin(target);
        return;
      }
      if (!finePointer || reduce || saveData || !supports3d) return;
      const r = viewport.getBoundingClientRect();
      if (!r.width || !r.height) return;
      tiltY = ((e.clientX - r.left) / r.width - 0.5) * 12;
      tiltX = -((e.clientY - r.top) / r.height - 0.5) * 7;
      queueTilt();
    },
    { passive: true }
  );

  let releasedPointer = null;

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    releasedPointer = e && e.pointerId;
    viewport.classList.remove('is-dragging');
    /* settle on the nearest card rather than leaving a half-turned ring */
    target = Math.round(target / STEP) * STEP;
    setSpin(target);
    paintIndex();
    if (releasedPointer != null) {
      try {
        viewport.releasePointerCapture(releasedPointer);
      } catch {
        /* the pointer may already be gone; nothing to release */
      }
    }
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener('pointerleave', () => {
    if (drag) return;
    if (!reduce && !saveData) clearTilt();
  });

  /* images must not start a native drag halfway through a ring gesture */
  for (const img of viewport.querySelectorAll('img')) {
    img.addEventListener('dragstart', (e) => e.preventDefault());
  }

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

  /* ---------------------------- promote ---------------------------------- */
  if (supports3d) {
    section.classList.add('is-live');
    setSpin(0);
    paintDepth(0);
  }

  /* initial caption/pressed state is authored in the markup; this only makes
     the JS state agree with it when the DOM arrives pre-selected differently */
  const first = chips.findIndex((c) => c.getAttribute('aria-pressed') === 'true');
  if (first > 0) goTo(first);
})();
