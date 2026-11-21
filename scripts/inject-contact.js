#!/usr/bin/env node
'use strict';
/**
 * inject-contact.js — one phone number, one place.
 *
 * The number appeared 16 times in home.html plus once in the quote-builder
 * script. Changing the workshop's number meant finding all 17, and missing one
 * means a customer calls someone else. The single source of truth is
 * data/business.js (which JSON-LD already reads), so this step stamps it into
 * the HTML at build time.
 *
 * Placeholders in the source stay human-readable:
 *   tel:+201000000000          → tel:{phoneE164}
 *   wa.me/201000000000         → wa.me/{whatsapp}
 *   ٠١٠ ٠٠٠٠ ٠٠٠٠              → {phoneDisplay}
 *
 * Idempotent: running it twice produces the same file.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public', 'home.html');
const biz = require(path.join(ROOT, 'data', 'business.js'));

const digits = biz.whatsapp.replace(/\D/g, '');
const e164 = biz.phoneE164;
const display = biz.phoneDisplay;

let html = fs.readFileSync(HTML, 'utf8');
const before = html;
let counts = { tel: 0, wa: 0, display: 0 };

html = html.replace(/tel:\+?\d{6,}/g, () => { counts.tel++; return `tel:${e164}`; });
html = html.replace(/(wa\.me\/)\d{6,}/g, (m, pre) => { counts.wa++; return `${pre}${digits}`; });
html = html.replace(/(اتصل:\s*)[٠-٩0-9][٠-٩0-9\s]{5,}/g, (m, pre) => { counts.display++; return `${pre}${display}`; });

// the quote script keeps its own copy of the number; stamp it too
const QJS = path.join(ROOT, 'public', 'assets', 'js', 'kgs-quote.js');
let qjs = fs.readFileSync(QJS, 'utf8');
qjs = qjs.replace(/const PHONE = '[^']*';/, `const PHONE = '${digits}';`);
fs.writeFileSync(QJS, qjs);

fs.writeFileSync(HTML, html);
const warn = digits.startsWith('20100000') ? '  ⚠ placeholder number — edit data/business.js before going live\n' : '';
console.log(`[contact] tel:${e164} · wa.me/${digits} · ${display}`);
console.log(`[contact] html: ${counts.tel} tel, ${counts.wa} whatsapp, ${counts.display} display${before === html ? ' (unchanged)' : ''}`);
if (warn) console.log(warn.trimEnd());
