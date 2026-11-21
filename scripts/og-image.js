#!/usr/bin/env node
'use strict';
/**
 * Builds the social share card (1200×630) so it carries the real Arabic brand
 * lockup in the site's own typeface instead of relying on whatever fonts the
 * server happens to have. The layout is drawn in HTML/CSS and, if a headless
 * browser is available, captured; otherwise we fall back to a marked-up crop of
 * the hero art so the OG tag is never broken.
 *
 * Usage: node scripts/og-image.js
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'img', 'og.jpg');

const TEMPLATE = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face{font-family:A;src:url("file://${ROOT}/public/assets/fonts/alexandria-arabic-900-normal.woff2") format("woff2");font-weight:900}
@font-face{font-family:A;src:url("file://${ROOT}/public/assets/fonts/alexandria-arabic-400-normal.woff2") format("woff2");font-weight:400}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:A;background:#04070a;color:#eef3f1;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:64px 72px}
img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5}
.grad{position:absolute;inset:0;background:linear-gradient(100deg,#04070a 26%,rgba(4,7,10,.72) 58%,rgba(4,7,10,.35) 100%)}
.row{position:relative;display:flex;align-items:center;gap:18px;margin-bottom:26px}
.logo{width:56px;height:56px;border-radius:16px;background:linear-gradient(140deg,#ff8f5e,#d13d0d);display:grid;place-items:center;font-weight:900;font-size:26px;color:#180a04}
.brand{font-size:23px;font-weight:400;letter-spacing:.02em;color:#9fb3ae}
h1{position:relative;font-size:104px;line-height:.94;letter-spacing:-.035em;font-weight:900;margin-bottom:22px}
h1 span{color:#ff8f5e}
p{position:relative;font-size:27px;font-weight:400;color:#c3d2ce;max-width:760px;line-height:1.6}
.tags{position:relative;display:flex;gap:10px;margin-top:26px}
.tag{font-size:17px;padding:8px 16px;border:1px solid rgba(238,243,241,.28);border-radius:99px;color:#c3d2ce}
</style></head><body>
<img class="bg" src="file://${ROOT}/public/assets/img/hero-ink-1600.jpg" alt="">
<div class="grad"></div>
<div class="row"><div class="logo">ك</div><div class="brand">kgsilkscreen.store · أبو كبير، الشرقية</div></div>
<h1>كمال جادو <span>سلك سكرين</span></h1>
<p>طباعة يدوية على التيشيرتات واليونيفورم والأعلام والزجاج — سعر نهائي قبل التنفيذ وبروفة على قطعة حقيقية.</p>
<div class="tags"><span class="tag">تيشيرتات</span><span class="tag">يونيفورم مدارس</span><span class="tag">أعلام</span><span class="tag">زجاج وكرتون</span></div>
</body></html>`;

async function main() {
  const htmlPath = path.join(ROOT, 'assets-src', 'og.html');
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, TEMPLATE);

  let shot = false;
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto('file://' + htmlPath, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT, type: 'jpeg', quality: 86 });
    await browser.close();
    shot = true;
  } catch (err) {
    console.warn('[og] no headless browser (' + err.message.split('\n')[0] + ')');
  }

  if (!shot) {
    // fallback: tinted hero crop, still on-brand, still a valid 1200×630 card
    const { execFileSync } = require('node:child_process');
    execFileSync('convert', [
      path.join(ROOT, 'assets-src/img/hero-ink.png'),
      '-resize', '1200x630^', '-gravity', 'center', '-extent', '1200x630',
      '-brightness-contrast', '-12x6', '-quality', '84', OUT,
    ]);
    console.log('[og] wrote fallback card from hero art — run with playwright installed to get the full lockup');
  }

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`[og] ${path.relative(ROOT, OUT)} · ${kb} KB · ${shot ? 'HTML capture' : 'art fallback'}`);
}

main();
