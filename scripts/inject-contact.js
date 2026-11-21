#!/usr/bin/env node
'use strict';
/**
 * inject-contact.js — sync workshop phone numbers from data/business.js.
 *
 * Replaces placeholder numbers across home.html and concept prototypes while
 * keeping explicit secondary phone/WhatsApp links intact.
 * Idempotent: running it twice produces the same file.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'public/home.html',
  'public/concept-1/index.html',
  'public/concept-2/index.html',
  'public/concept-3/index.html',
];
const biz = require(path.join(ROOT, 'data', 'business.js'));

const digits = biz.whatsapp.replace(/\D/g, '');
const digits2 = (biz.whatsappSecondary || '').replace(/\D/g, '');
const e164 = biz.phoneE164;
const e1642 = biz.phoneSecondaryE164 || '';
const display = biz.phoneDisplay;

let totalTel = 0;
let totalWa = 0;
let totalDisplay = 0;
let anyChanged = false;

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  html = html.replace(/tel:\+?\d{6,}/g, (m) => {
    if (e1642 && m === `tel:${e1642}`) return m;
    totalTel++;
    return `tel:${e164}`;
  });
  html = html.replace(/(wa\.me\/)\d{6,}/g, (m, pre) => {
    if (digits2 && m === `wa.me/${digits2}`) return m;
    totalWa++;
    return `${pre}${digits}`;
  });
  html = html.replace(/٠١٠\s*٠٠٠٠\s*٠٠٠٠/g, () => {
    totalDisplay++;
    return display;
  });

  if (html !== before) {
    fs.writeFileSync(file, html);
    anyChanged = true;
  }
}

// the quote script keeps its own copy of the primary WhatsApp number
const QJS = path.join(ROOT, 'public', 'assets', 'js', 'kgs-quote.js');
let qjs = fs.readFileSync(QJS, 'utf8');
qjs = qjs.replace(/const PHONE = '[^']*';/, `const PHONE = '${digits}';`);
fs.writeFileSync(QJS, qjs);

const warn = digits.startsWith('20100000') ? '  ⚠ placeholder number — edit data/business.js before going live\n' : '';
console.log(`[contact] primary tel:${e164} · wa.me/${digits} · ${display}`);
if (e1642) console.log(`[contact] secondary tel:${e1642} · wa.me/${digits2} · ${biz.phoneSecondaryDisplay}`);
console.log(`[contact] html: ${totalTel} primary tel, ${totalWa} primary whatsapp, ${totalDisplay} display${anyChanged ? '' : ' (unchanged)'}`);
if (warn) console.log(warn.trimEnd());
