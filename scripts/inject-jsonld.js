#!/usr/bin/env node
'use strict';
/**
 * Injects the LocalBusiness (SilkScreen) structured data into the hub and all
 * three concepts from a single source of truth: data/business.js
 * Run: npm run seo
 */
const fs = require('node:fs');
const path = require('node:path');
const biz = require('../data/business.js');

const ROOT = path.join(__dirname, '..');
const PAGES = ['public/index.html', 'public/hub.html', 'public/concept-1/index.html', 'public/concept-2/index.html', 'public/concept-3/index.html'];

const ld = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'PrintShop'],
  '@id': `${biz.url}#business`,
  name: biz.nameAr,
  alternateName: biz.nameEn,
  description: biz.descriptionAr,
  foundingDate: biz.foundingYear || '2010',
  url: biz.url,
  telephone: biz.phoneSecondaryE164 ? [biz.phoneE164, biz.phoneSecondaryE164] : biz.phoneE164,
  contactPoint: [
    { '@type': 'ContactPoint', telephone: biz.phoneE164, contactType: 'sales', areaServed: 'EG', availableLanguage: ['ar-EG', 'ar'] },
    ...(biz.phoneSecondaryE164
      ? [{ '@type': 'ContactPoint', telephone: biz.phoneSecondaryE164, contactType: 'customer service', areaServed: 'EG', availableLanguage: ['ar-EG', 'ar'] }]
      : []),
  ],
  email: biz.email,
  image: `${biz.url}/assets/img/og.jpg`,
  priceRange: biz.priceRange,
  currenciesAccepted: 'EGP',
  paymentAccepted: 'Cash, Vodafone Cash, InstaPay, Bank transfer',
  areaServed: biz.areaServed.map((a) => ({ '@type': 'City', name: a })),
  address: {
    '@type': 'PostalAddress',
    ...(biz.streetAr ? { streetAddress: biz.streetAr } : {}),
    addressLocality: biz.cityAr,
    addressRegion: biz.regionAr,
    postalCode: biz.postalCode,
    addressCountry: 'EG',
  },
  geo: { '@type': 'GeoCoordinates', latitude: biz.geo.lat, longitude: biz.geo.lng },
  openingHoursSpecification: biz.hours.map((h) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: h.days,
    opens: h.opens,
    closes: h.closes,
  })),
  ...(Array.isArray(biz.social) && biz.social.length ? { sameAs: biz.social } : {}),
  makesOffer: biz.services.map((s) => ({
    '@type': 'Offer',
    itemOffered: { '@type': 'Service', name: s.nameAr, description: s.descAr },
  })),
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'خدمات السلك سكرين',
    itemListElement: biz.services.map((s) => ({
      '@type': 'OfferCatalog',
      name: s.nameAr,
    })),
  },
};

const tag = `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;

let changed = 0;
for (const rel of PAGES) {
  const p = path.join(ROOT, rel);
  let html = fs.readFileSync(p, 'utf8');
  html = html.replace(/\n?<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '\n');
  html = html.replace('</head>', `${tag}\n</head>`);
  fs.writeFileSync(p, html);
  changed++;
}
console.log(`[seo] JSON-LD injected into ${changed} pages (LocalBusiness · ${biz.nameAr})`);
