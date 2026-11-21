/* ==========================================================================
   kgs-ink.js — محرك الحبر (WebGL2 / WebGL1)
   ---------------------------------------------------------------------------
   A single full-screen fragment shader that renders the *liquid* of the dive:
   domain-warped FBM "ink currents", a caustic network, rising bubble cells, a
   vignette that tightens with depth, and a grain pass that kills gradient
   banding on cheap phone panels.

   KEY DESIGN RULE (this is what makes the scroll feel like a journey and not
   like a video that restarts):
   every visual property is a pure function of `uDepth` (0 → 1 scroll progress)
   plus `uTime`. Scrolling up lowers uDepth, so the shader walks back through
   exactly the states it just rendered. No keyframes, no easing history.

   FALLBACK: if WebGL is unavailable the module reports `ok:false` and the page
   keeps its CSS aurora — the journey still works, just less rich.
   ========================================================================== */
(() => {
  'use strict';

  const VERT = `#version 300 es
  in vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  out vec4 outColor;

  uniform vec2  uRes;
  uniform float uTime;
  uniform float uDepth;   // 0 surface → 1 bottom
  uniform float uVel;     // signed scroll velocity, normalised to ±1
  uniform vec3  uInkA;    // deep teal
  uniform vec3  uInkB;    // burnt orange
  uniform vec3  uInkC;    // violet
  uniform vec3  uLight;   // surface light

  /* ---------------- hash / noise (texture-free) ---------------- */
  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  /* Two octave budgets, because the warp layers don't need the detail the
     main current does. This is the single biggest perf lever in the shader. */
  const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

  float fbm2(vec2 p) {
    float v = 0.5 * vnoise(p);
    p = ROT * p * 2.03;
    v += 0.25 * vnoise(p);
    return v;
  }

  float fbm3(vec2 p) {
    float v = 0.5 * vnoise(p);
    p = ROT * p * 2.03;
    v += 0.25 * vnoise(p);
    p = ROT * p * 2.01;
    v += 0.125 * vnoise(p);
    return v;
  }

  /* ---------------- rising bubbles on a wrapped cell grid ---------------- */
  /* 9-cell search, each bubble keeps its own size + speed. The rise is applied
     in cell space and wrapped with mod(), so no seams appear at cell edges. */
  float bubbles(vec2 p, float t, float density) {
    vec2 g = floor(p);
    vec2 f = fract(p);
    float acc = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 id = g + o;
        float h = hash21(id);
        if (h > density) continue;
        vec2 rand = vec2(hash21(id + 7.13), hash21(id + 3.71));
        vec2 c = o + rand - f;
        // upward drift + wrap inside the cell
        c.y = mod(c.y + t * (0.10 + h * 0.22), 1.0) - 0.5;
        float r = 0.030 + h * 0.065;
        float d = length(c);
        float ring = 1.0 - smoothstep(r * 0.62, r, d);
        float halo = (1.0 - smoothstep(r, r * 2.4, d)) * 0.22;
        acc += ring + halo;
      }
    }
    return acc;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
    float d = uDepth;

    float t = uTime * 0.055;
    vec2 drift = vec2(t * 0.11, -t * 0.26 + uVel * 0.10);

    /* ---- domain-warped ink currents (2 octaves for warp, 3 for body) ---- */
    vec2 q = p * (1.55 - d * 0.5);
    vec2 warp = vec2(
      fbm2(q * 1.35 + drift),
      fbm2(q * 1.35 + drift + vec2(5.2, 1.3))
    );
    float current = fbm3(q * 1.05 + warp * 1.85 + drift * 1.5);
    float veins   = fbm3(q * 2.85 - warp * 1.05 - drift);

    /* ---- base water column ---- */
    vec3 col = mix(vec3(0.026, 0.070, 0.080), vec3(0.010, 0.014, 0.022), d);
    col = mix(col, vec3(0.050, 0.018, 0.014), smoothstep(0.45, 1.0, d + current * 0.22));

    /* ---- chromatic ink blooms; they lean orange as you sink ---- */
    float bA = smoothstep(0.30, 0.92, current) * (0.58 - d * 0.18);
    float bB = smoothstep(0.40, 1.00, veins)   * (0.16 + d * 0.60);
    float bC = smoothstep(0.52, 1.00, current * veins * 2.3) * 0.28;
    col += uInkA * bA;
    col += uInkB * bB;
    col += uInkC * bC;

    /* ---- caustics: the surface light network dies out with depth ---- */
    float caustic = pow(abs(sin(veins * 8.5 + t * 1.9)), 6.0);
    caustic *= 1.0 - smoothstep(0.0, 0.6, d);
    col += uLight * caustic * 0.14;

    /* ---- light shafts: only while you are still near the surface ----
       uv.y is 0 at the bottom of the screen in GL, so shafts belong at the top */
    float sx = abs(fract(p.x * 1.7 + sin(t * 0.45) * 0.05) - 0.5);
    float shaft = 1.0 - smoothstep(0.0, 0.30, sx);
    shaft *= smoothstep(0.15, 0.95, 1.0 - uv.y);   // strongest at the top edge
    shaft *= 1.0 - smoothstep(0.0, 0.55, d);
    col += uLight * shaft * 0.07;

    /* ---- bubbles ---- */
    float bub = bubbles(p * 6.0, uTime * 0.55, 0.24 + d * 0.30);
    col += vec3(0.52, 0.86, 0.83) * bub * (0.045 + 0.085 * d);

    /* ---- SILKSCREEN MESH ----
       the whole page is a giant screen: fine woven threads that fade as the
       ink fills them. This is the detail that makes it feel like print. */
    vec2 meshUv = gl_FragCoord.xy;
    float thread = max(
      smoothstep(0.86, 1.0, abs(sin(meshUv.x * 1.05))),
      smoothstep(0.86, 1.0, abs(sin(meshUv.y * 1.05)))
    );
    col += vec3(0.62, 0.88, 0.86) * thread * 0.022 * (1.0 - d * 0.7);

    /* ---- pressure vignette: edges close in with depth ---- */
    float vig = 1.0 - smoothstep(0.12, 1.30, length(p) * (1.0 + d * 0.9));
    col *= mix(0.32, 1.0, vig);

    /* ---- calm the mid-ground so type stays readable ---- */
    col = mix(col, col * 0.52, smoothstep(0.25, 1.0, d) * 0.38);

    /* ---- tone map + grain (kills 6-bit panel banding) ---- */
    col = col / (col + 0.74);
    col = pow(col, vec3(0.92));
    float grain = hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
    col += grain * 0.020;

    outColor = vec4(col, 1.0);
  }`;

  /* ------------------------- WebGL1 shim (older Androids) ------------------ */
  const FRAG1 = FRAG.replace('#version 300 es', '')
    .replace('out vec4 outColor;', '')
    .replace('outColor = vec4(col, 1.0);', 'gl_FragColor = vec4(col, 1.0);');
  const VERT1 = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const HEX = {
    inkA: [0.070, 0.560, 0.560],
    inkB: [1.000, 0.300, 0.110],
    inkC: [0.330, 0.190, 0.780],
    light: [0.780, 0.960, 0.940],
  };

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader: ' + log);
    }
    return sh;
  }

  function build(gl, isGL2) {
    const vs = compile(gl, gl.VERTEX_SHADER, isGL2 ? VERT : VERT1);
    const fs = compile(gl, gl.FRAGMENT_SHADER, isGL2 ? FRAG : FRAG1);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    return {
      prog,
      u: {
        res: gl.getUniformLocation(prog, 'uRes'),
        time: gl.getUniformLocation(prog, 'uTime'),
        depth: gl.getUniformLocation(prog, 'uDepth'),
        vel: gl.getUniformLocation(prog, 'uVel'),
        inkA: gl.getUniformLocation(prog, 'uInkA'),
        inkB: gl.getUniformLocation(prog, 'uInkB'),
        inkC: gl.getUniformLocation(prog, 'uInkC'),
        light: gl.getUniformLocation(prog, 'uLight'),
      },
    };
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onFrame?: Function }} [opts]
   */
  function create(canvas, opts = {}) {
    let gl = null;
    let isGL2 = false;
    let ready = null;

    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      isGL2 = Boolean(gl);
      if (!gl) {
        gl = canvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
        });
      }
      if (!gl) return { ok: false, destroy() {} };
      ready = build(gl, isGL2);
    } catch (err) {
      console.warn('[kgs-ink] fallback:', err.message);
      return { ok: false, error: err.message, destroy() {} };
    }

    let W = 1;
    let H = 1;
    let dpr = 1;
    let running = true;
    // resolution budget: this shader is ~5 FBM octaves + 9-cell bubble loop.
    // A 2M-pixel render on a mid phone GPU is wasteful, so cap the drawable.
    const MAX_PIXELS = 720_000;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, rect.width || window.innerWidth);
      const cssH = Math.max(1, rect.height || window.innerHeight);
      const raw = Math.min(window.devicePixelRatio || 1, 2);
      let px = cssW * cssH * raw * raw;
      dpr = raw;
      if (px > MAX_PIXELS) dpr = raw * Math.sqrt(MAX_PIXELS / px);
      W = Math.max(1, Math.round(cssW * dpr));
      H = Math.max(1, Math.round(cssH * dpr));
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
    }

    function draw(state) {
      if (!running || gl.isContextLost()) return;
      const u = ready.u;
      gl.useProgram(ready.prog);
      gl.uniform2f(u.res, W, H);
      gl.uniform1f(u.time, state.time);
      gl.uniform1f(u.depth, state.depth);
      gl.uniform1f(u.vel, state.vel);
      gl.uniform3fv(u.inkA, HEX.inkA);
      gl.uniform3fv(u.inkB, HEX.inkB);
      gl.uniform3fv(u.inkC, HEX.inkC);
      gl.uniform3fv(u.light, HEX.light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (opts.onFrame) opts.onFrame(state);
    }

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      running = false;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      ready = build(gl, isGL2);
      resize();
      running = true;
    });

    resize();

    return {
      ok: true,
      get gl2() {
        return isGL2;
      },
      resize,
      draw,
      setQuality(scale) {
        // called by the perf guard when frames start dropping
        const rect = canvas.getBoundingClientRect();
        W = Math.max(1, Math.round(rect.width * scale));
        H = Math.max(1, Math.round(rect.height * scale));
        canvas.width = W;
        canvas.height = H;
        gl.viewport(0, 0, W, H);
      },
      destroy() {
        running = false;
        try {
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
          /* ignore */
        }
      },
    };
  }

  window.KGS = window.KGS || {};
  window.KGS.ink = { create };
})();
