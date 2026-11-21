'use strict';

/**
 * kgsilkscreen.store — production server
 * ---------------------------------------------------------------------------
 * Zero-build Node.js server that runs on Hostinger shared hosting
 * (hPanel → Advanced → Node.js) as well as on any VPS / Docker / local machine.
 *
 * Design constraints (deliberate):
 *  - No template engine, no bundler, no runtime dependency on a database.
 *  - The landing page is plain HTML/CSS/JS shipped from /public, so the server
 *    cost per request is close to zero and TTFB stays in the low milliseconds.
 *  - Immutable long-cache for hashed/static assets, no-cache for HTML.
 *  - Compression on, ETag on, tiny in-memory request guard.
 */

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const compression = require('compression');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_VERSION = readVersion();

// AVIF/WebP/woff2 are not in every mime table that ships with Node, and a wrong
// content-type stops browsers from rendering the image at all.
const MIME = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
for (const [ext, type] of Object.entries(MIME)) express.static.mime.define({ [type]: [ext.replace('.', '')] });

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(
  compression({
    threshold: 1024,
    // Compressed HTML/CSS/JS is what actually makes this fast on Egyptian 4G.
    filter: (req, res) => {
      const type = res.getHeader('Content-Type') || '';
      if (String(type).includes('image/')) return false;
      return compression.filter(req, res);
    },
  })
);

/* --------------------------------- headers -------------------------------- */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-App-Version', APP_VERSION);
  next();
});

/* ---------------------------------- routes -------------------------------- */

// "/" → the pre-rendered landing page when the build exists, else the source.
// Both are plain files on disk, so this costs one stat per request at most.
const SSG_HOME = path.join(PUBLIC_DIR, '_ssg', 'home.html');
app.get('/', (req, res, next) => {
  const file = fs.existsSync(SSG_HOME) ? SSG_HOME : path.join(PUBLIC_DIR, 'home.html');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  // 103 Early Hints / preload: the stylesheet the document actually references
  const sheet = fs.existsSync(path.join(PUBLIC_DIR, 'assets', 'css', 'kgs.min.css'))
    ? '/assets/css/kgs.min.css'
    : '/assets/css/kgs.css';
  res.setHeader(
    'Link',
    `<${sheet}>; rel=preload; as=style, </assets/fonts/alexandria-arabic-900-normal.woff2>; rel=preload; as=font; type=font/woff2; crossorigin`
  );
  fs.readFile(file, 'utf8', (err, html) => {
    if (err) return next(err);
    // res.send (not sendFile) so `compression` can brotli/gzip the document
    res.type('text/html; charset=utf-8').send(html);
  });
});

/* ---------------------------------- html ---------------------------------- */

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  next();
});

/* --------------------------------- static --------------------------------- */

app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    lastModified: true,
    index: 'index.html',
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (
        filePath.endsWith('.woff2') ||
        filePath.endsWith('.webp') ||
        filePath.endsWith('.avif')
      ) {
        // versioned-in-practice binaries: cache hard, revalidate never
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    },
  })
);

/* ------------------------------- health/API ------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: APP_VERSION,
    env: process.env.NODE_ENV || 'development',
    uptime: Math.round(process.uptime()),
    served: PUBLIC_DIR,
  });
});

/* ---------------------------------- 404 ----------------------------------- */

app.use((req, res) => {
  res.status(404).setHeader('Cache-Control', 'no-store');
  const file = path.join(PUBLIC_DIR, '404.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.type('text/plain; charset=utf-8').send('٤٠٤ — الصفحة غير موجودة');
});

/* --------------------------------- errors --------------------------------- */

app.use((err, req, res, _next) => {
  console.error('[kgsilkscreen]', err && err.stack ? err.stack : err);
  res.status(500).type('text/plain; charset=utf-8').send('خطأ في السيرفر');
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[kgsilkscreen] v${APP_VERSION} listening on http://${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref();
  });
}

function readVersion() {
  try {
    return require('./package.json').version;
  } catch {
    return '0.0.0';
  }
}

module.exports = app;
