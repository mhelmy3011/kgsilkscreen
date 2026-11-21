/* ==========================================================================
   الاتجاه ٢ — محرك الحبر (Canvas 2D)
   --------------------------------------------------------------------------
   Philosophy: the canvas never "plays an animation". It is a pure function of
   scroll progress (0 → 1) plus a slow time term for drift. Scroll up and every
   value walks back exactly the way it came, which is what makes the reverse
   feel smooth instead of "replayed".
   ========================================================================== */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('ink');
  // Graceful degradation: on a browser (or WebView) where a 2D context can't be
  // created we drop the water column but keep the depth meter, the reveal
  // engine and therefore the whole scroll journey intact.
  const ctx = canvas && typeof canvas.getContext === 'function'
    ? canvas.getContext('2d', { alpha: false })
    : null;
  const hasCanvas = Boolean(ctx);
  const fillEl = document.getElementById('depthFill');
  const valEl = document.getElementById('depthVal');
  const rises = [...document.querySelectorAll('.rise')];
  const root = document.documentElement;

  const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  let W = 0, H = 0, DPR = 1;
  let scrollP = 0;        // smoothed 0..1
  let scrollTarget = 0;
  let velocity = 0;       // px per frame, smoothed
  let lastScrollY = 0;
  let t = 0;
  let raf = 0;

  /* --------------------------------- blobs --------------------------------- */
  // Deep-ink bodies: a few soft radial blobs whose size/position/hue shift with
  // depth. Cheap (no pixel loops) and looks like suspended ink.
  const BLOBS = [
    { x: 0.18, y: 0.22, r: 0.55, hue: 'teal',   sx: 0.9,  sy: 1.4, ph: 0.0 },
    { x: 0.82, y: 0.42, r: 0.62, hue: 'teal',   sx: 1.5,  sy: 0.8, ph: 1.7 },
    { x: 0.50, y: 0.78, r: 0.70, hue: 'orange', sx: 1.1,  sy: 1.1, ph: 3.1 },
    { x: 0.12, y: 0.92, r: 0.48, hue: 'violet', sx: 0.7,  sy: 1.6, ph: 4.4 },
    { x: 0.90, y: 0.10, r: 0.36, hue: 'violet', sx: 1.8,  sy: 0.9, ph: 5.2 },
  ];

  const HUES = {
    teal:   [18, 164, 164],
    orange: [255, 77, 28],
    violet: [94, 52, 200],
  };

  /* -------------------------------- bubbles -------------------------------- */
  const BUBBLES = Array.from({ length: 46 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 2.6,
    sp: 0.06 + Math.random() * 0.22,
    wob: Math.random() * Math.PI * 2,
    wobSpeed: 0.25 + Math.random() * 0.85,
    depth: Math.random(),           // 0 near surface, 1 deep
    seed: i * 0.37,
  }));

  /* --------------------------------- resize -------------------------------- */
  function resize() {
    if (!hasCanvas) return;
    DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* --------------------------------- draw ---------------------------------- */
  function draw() {
    if (!hasCanvas) return;
    // --- base water column: colour depends on depth ---
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const surf = scrollP;
    g.addColorStop(0, mix([9, 26, 30], [4, 5, 7], surf));
    g.addColorStop(0.45, mix([7, 16, 22], [8, 5, 10], surf));
    g.addColorStop(1, mix([10, 12, 18], [26, 8, 6], surf));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // --- ink bodies ---
    ctx.globalCompositeOperation = 'lighter';
    for (const b of BLOBS) {
      const drift = reduce ? 0 : t * 0.00013;
      // as you sink, blobs swell and slide down+brighten slightly
      const rr = b.r * Math.min(W, H) * (0.55 + 0.55 * surf);
      const bx = (b.x + Math.sin(drift * 6 + b.ph) * 0.05 * b.sx) * W;
      const by = (b.y + Math.cos(drift * 5 + b.ph) * 0.045 * b.sy + surf * 0.45 * (1 - b.y)) * H;
      const rgb = HUES[b.hue];
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      const a = 0.16 + 0.16 * surf;
      rg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
      rg.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.32})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(bx, by, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- surface light shafts, strongest at top of the page ---
    const shaftA = (1 - surf) * 0.13;
    if (shaftA > 0.004) {
      for (let i = 0; i < 4; i++) {
        const x = (0.16 + i * 0.24) * W + Math.sin(t * 0.0004 + i) * 40;
        const sg = ctx.createLinearGradient(x, 0, x + 130, H);
        sg.addColorStop(0, `rgba(150,245,235,${shaftA})`);
        sg.addColorStop(1, 'rgba(150,245,235,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(x - 60, 0);
        ctx.lineTo(x + 60, 0);
        ctx.lineTo(x + 200, H);
        ctx.lineTo(x + 30, H);
        ctx.closePath();
        ctx.fill();
      }
    }

    // --- bubbles: rise against the scroll, faster when scrolling fast ---
    const push = Math.min(Math.abs(velocity) * 0.0014, 1.4);
    ctx.globalCompositeOperation = 'screen';
    for (const b of BUBBLES) {
      // upward drift in screen space = the opposite of the user's dive.
      // 0 → 1 through the column, wrapped so life never runs out.
      let y = (b.y - t * 0.000035 * b.sp - push * 0.06) % 1;
      if (y < 0) y += 1;
      const py = y * H;
      const px = (b.x + Math.sin(t * 0.00055 * b.wobSpeed + b.wob) * 0.022) * W;
      const r = b.r * (0.95 + push * 0.55);
      // bubbles fade near the surface so they don't crowd the text
      const nearTop = y < 0.12 ? y / 0.12 : 1;
      const alpha = (0.05 + 0.2 * (1 - Math.abs(scrollP - b.depth)) * (0.45 + push * 0.55)) * nearTop;
      if (alpha <= 0.004) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190,245,240,${alpha.toFixed(3)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // --- ink curtain at the very bottom = "the deep" ---
    const deep = ctx.createLinearGradient(0, H * 0.72, 0, H);
    deep.addColorStop(0, 'rgba(0,0,0,0)');
    deep.addColorStop(1, `rgba(2,2,4,${0.35 + 0.5 * surf})`);
    ctx.fillStyle = deep;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  function mix(a, b, p) {
    return `rgb(${Math.round(lerp(a[0], b[0], p))},${Math.round(lerp(a[1], b[1], p))},${Math.round(lerp(a[2], b[2], p))})`;
  }

  /* -------------------------------- element reveal -------------------------- */
  function updateRise() {
    if (reduce) return;
    const vh = window.innerHeight;
    for (const el of rises) {
      const r = el.getBoundingClientRect();
      // enters at 96% of viewport, fully present at 62%
      const p = clamp01((vh * 0.96 - r.top) / (vh * 0.34));
      el.style.setProperty('--p', p.toFixed(3));
    }
  }

  /* ---------------------------------- loop --------------------------------- */
  let last = 0;

  function frame(now) {
    const dt = last ? Math.min(48, now - last) : 16;
    last = now;
    t += dt;

    const y = window.scrollY || window.pageYOffset;
    velocity = lerp(velocity, y - lastScrollY, 0.14);
    lastScrollY = y;

    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? clamp01(y / max) : 0;
    // frame-rate independent, critically damped follow. No spring overshoot,
    // so reversing direction eases back instead of wobbling.
    const k = 1 - Math.pow(0.885, dt / 16.67);
    scrollP = lerp(scrollP, scrollTarget, k);

    draw();
    updateRise();

    if (fillEl) fillEl.style.height = (scrollP * 100).toFixed(2) + '%';
    if (valEl) {
      const v = ar(Math.round(scrollP * 72));
      if (valEl.textContent !== v) valEl.textContent = v;
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    lastScrollY = window.scrollY || 0;
    if (!reduce) root.classList.add('ink-ready');
    if (!raf) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { resize(); updateRise(); }, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 180));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = 0;              // don't integrate the paused time in one jump
      raf = requestAnimationFrame(frame);
    }
  });

  start();
  updateRise();
})();
