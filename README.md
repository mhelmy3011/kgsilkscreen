# كمال جادو — سلك سكرين · kgsilkscreen.store

صفحة هبوط عربية (RTL) لورشة سلك سكرين في **أبو كبير، محافظة الشرقية** — مبنية كـ **رحلة غرق في الحبر**،
مش صفحة ثابتة. المشروع Node.js خفيف بيشتغل على **استضافة هوستنجر المشتركة**.

---

## ١. التشغيل

```bash
npm install
npm run dev     # http://localhost:3000
```

| الأمر | الوظيفة |
|---|---|
| `npm start` | تشغيل السيرفر (بورت `PORT` أو ٣٠٠٠) |
| `npm run build` | بناء كامل بالترتيب الصح: شعار → رقم → JSON-LD → صور → CSS → SSG |
| `npm run verify` | الشعار + الموبايل + التباين + الوصول + الشيدر + السكرول العكسي + الأصول |
| `npm run logo` | إعادة توليد العلامة والأقفال وحقنها في الصفحة |
| `npm run check:logo` | قواعد الهوية: مفيش خط، مفيش stroke، مفيش transform |
| `npm run check:mobile` | عقد الـ mobile-first (أحجام الخط، مساحات اللمس) |
| `npm run budget` | قياس الوزن الحقيقي على السلك ومقارنته بالميزانية |
| `npm run assets` | توليد الصور المتجاوبة + كارت المشاركة |
| `npm run fonts` | نسخ الخطوط من node_modules إلى `public/assets/fonts` |
| `npm run og` | إعادة رندر كارت المشاركة (يحتاج Python + HarfBuzz) |
| `npm test` | الهوية + الموبايل + التباين + الوصول + السلايدر + بنّاء العرض + السكرول (بدون متصفح) |
| `npm run check:deploy` | بناء `dist/` والتأكد إنه قابل للنشر: ضغط، كاش، MIME، CSP، 404 |

### الصفحات

| الرابط | إيه ده |
|---|---|
| `/` | **الصفحة النهائية** (الاتجاه ٢ المطوَّر) |
| `/home.html` | المصدر قبل الـ SSG (احتياطي) |
| `/hub.html` | صفحة المقارنة بين الاتجاهات الثلاثة |
| `/concept-1/` · `/concept-2/` · `/concept-3/` | النماذج الأولية الأولى (محفوظة، خارج الفهرس) |

---

## ٢. النشر على هوستنجر

### المسار (أ) — Node.js ✅ الموصى به

1. hPanel → **Advanced → Node.js → Create application**
   - Application root: `kgsilkscreen` (جوه `domains/kgsilkscreen.store/`)
   - Startup file: `server.js` · Node: **18 أو 20**
2. ارفع الملفات **بدون** `node_modules` و**بدون** `dist`.
3. اضغط **Run NPM Install** ثم **Restart**.
4. اتأكد إن `https://kgsilkscreen.store/api/health` بيرجع JSON.
5. فعّل SSL من hPanel.

> السيرفر بيقرأ `PORT` من متغيرات هوستنجر تلقائيًا. مفيش أي إعداد إضافي.
> لو نسيت تعمل build، السيرفر بيشتغل عادي على `home.html` بدون SSG — الصفحة شغالة في الحالتين.

### المسار (ب) — استضافة ثابتة (لو Node.js مش متاحة)

```bash
npm run build
```

ارفع **محتويات** `dist/` جوه `public_html`. ملف `.htaccess` بيتنسخ معاهم أوتوماتيك
(ضغط + كاش + صفحة ٤٠٤).

> ملاحظة: في الاستضافة الثابتة، `/` لازم يكون اسمه `index.html`. الـ SSG بيكتب
> `dist/index.html` والنسخة الأصلية بتبقى `dist/home.html` — فالاتنين شغالين.

### DNS

Nameservers بتاعة هوستنجر، أو `A record` لـ IP الاستضافة. بعد التحويل فعّل HTTPS.

---

## ٣. قبل النشر — ٣ حاجات لازم تتغير

### أ) رقم الواتساب والتليفون

```bash
# ١) بدّل الرقم في كل مكان
grep -rl "201000000000" public/ | xargs sed -i 's/201000000000/2012XXXXXXXXX/g'
grep -rl "٠١٠ ٠٠٠٠ ٠٠٠٠" public/ | xargs sed -i 's/٠١٠ ٠٠٠٠ ٠٠٠٠/٠١٠ ١٢٣٤ ٥٦٧٨/g'
```

الرقم موجود في: `public/home.html` (كل أزرار `wa.me` + `tel:`)، `data/business.js`، والـ JSON-LD.

### ب) العنوان والإحداثيات

`data/business.js` — غيّر `streetAr`, `geo`, `postalCode`.
ثم أعد بناء الـ SSG:

```bash
npm run build
```

### ج) بيانات العملاء في آراء العملاء

الآراء الحالية **نص تحريري** مش شهادات حقيقية. قبل النشر لازم:
- تستبدلها بآراء عملاء حقيقيين، أو
- تشيلها خالص (`#quotes` + الـ `aggregateRating` من JSON-LD).

⚠️ ده مهم قانونيًا وسمعةً: تسجيل `aggregateRating` بأرقام غير حقيقية بيخالف
سياسة جوجل وبيعرّض الموقع لغرامة يدوية على الـ Rich Results.

---

## ٤. إزاي الحركة اشتغلت

### القاعدة الذهبية: كل حاجة دالة في موضع السكرول

مفيش `setTimeout` ولا keyframes بتتشغّل مرة واحدة. كل قيمة بصرية = دالة في:

```
depth     = scrollY / (scrollHeight - innerHeight)   // 0 → 1، بعد تنعيم
velocity  = مشتقة التنعيم (بتغذي عنف الفقاعات)
progress  = (viewport top − element top) / ربع الشاشة  // لكل عنصر
```

عشان كده لما تطلع لفوق **الأرقام بترجع زي ما كانت بالظبط** — ده مش «إعادة تشغيل»،
ده نفس الرحلة بالعكس. والاختبار الآلي بيثبت ده (شوف `npm test`).

### الطبقات

| الطبقة | التقنية | الوظيفة |
|---|---|---|
| `kgs-ink.js` | WebGL2 / WebGL1 | شيدر ضوء واحد بيرسم الحبر السايل والفقاعات وشبكة السلك سكرين |
| `kgs-engine.js` | rAF واحد | التنعيم، الكشف التدريجي، حارس الأداء، العدادات |
| `kgs-page.js` | DOM | توصيل الشيدر، لمعان الكروت، زر واتساب العائم، قياس Web Vitals |

### السكرول العكسي — التفاصيل اللي بتخليه ناعم

1. **تنعيم مستقل عن معدل الإطارات**: `k = 1 − 0.87^(dt/16.67)` — نفس الإحساس على ٣٠ و١٢٠ إطار.
2. **بدون spring overshoot** — الرجوع بيهدى بدون تطنيط.
3. **الشيدر بياخد `uDepth` بس** — مفيش حالة مخزنة، فمفيش drift.
4. **إيقاف الرسم لما التاب يتخفي** وعدم دمج الوقت الموقوف في نقلة واحدة.

---

## ٥. الأداء — أرقام مقاسة مش مُدَّعاة

`npm run budget` بيقيس اللي بيتنزّل فعلًا على السلك:

```
✓ Mobile 360×800  · first view — 57.4 KB
✓ Desktop 1440×900 · first view — 92.2 KB
   HTML 14.8 KB · CSS 7.7 KB · JS 10.2 KB · خطوط 24.6 KB · صورة 34.8 KB
```

| القرار | الأثر |
|---|---|
| صفر framework (لا React ولا GSAP) | لا hydration ولا bundle |
| **خطوط محلية** + preload + `unicode-range` | صفر طلبات لـ Google Fonts (مهم جدًا على شبكات مصر) |
| CSS مصغّر (31.8 ك.ب → 7.5 ك.ب مضغوط) | أسرع وأرخص |
| **critical CSS مضمّن** + الباقي `media="print"` swap | أول رسم مايستناش الستايل شيت |
| brotli من السيرفر | HTML 65 ك.ب → **15 ك.ب** |
| AVIF أولًا (35 ك.ب للهيرو) ثم WebP ثم JPEG | أقل وزن بأحسن جودة |
| `srcset`/`sizes` + `width`/`height` + lazy للصور تحت الشاشة | صفر CLS، صفر تحميل زايد |
| الشيدر بيتقفل لما التاب يتخفي | مفيش استهلاك بطارية في الخلفية |
| **حارس أداء تلقائي** | لو الإطارات نزلت عن ٤٥: نصّف دقة الرسم → شيل الـ blur → اقفل الشيدر |

### حارس الأداء (مهم للموبايلات القديمة)

`kgs-engine.js` بيقيس متوسط زمن الإطار كل ٩٠ إطار. لو نزل عن ~٤٥ إطار/ثانية بينزّل مستوى:

| الخطوة | اللي بيحصل |
|---|---|
| ١ | دقة الرسم تنزل لـ ٦٢٪ |
| ٢ | كل `backdrop-filter` يتشال |
| ٣ | الشيدر يتوقف و«الشفق» CSS يرجع مكانه |

الحالة بتتسجل في `<html data-perf="...">` — تقدر تجبر أي مستوى يدويًا للتجربة:

```js
document.documentElement.dataset.perf = 'canvas-off';
```

---

## ٦. SEO و GEO

### الـ SEO
- `<title>` و`description` بالكلمات اللي الناس بتدور بيها فعلًا (سلك سكرين، طباعة تيشيرتات، يونيفورم مدارس، أبو كبير، الشرقية).
- Canonical + Open Graph + Twitter Card + `og:image` مربوطة بكارت مشاركة **مرسوم بخط الموقع**.
- HTML ثابت بالكامل (SSG) — المحتوى كله موجود قبل أي جافاسكريبت.
- صور بـ `alt` وصفي عربي + `width/height` + `srcset`.
- `sitemap.xml` (بصور) + `robots.txt` بيستثني صفحات النماذج الأولية.
- JSON-LD: `LocalBusiness` + `PrintShop` + `OfferCatalog` + `FAQPage` + `WebSite`.

### الـ GEO (الظهور في البحث والمساعدين المحليين)
عشان الورشة تظهر لما حد يسأل «مين بيطبع تيشيرتات في الشرقية؟»:

1. `geo.position` و`geo.placename` في الميتا + `GeoCoordinates` في JSON-LD.
2. `areaServed` مكتوبة بأسماء المدن (أبو كبير، الزقازيق، بلبيس، منيا القمح، فاقوس) لا بـ «الشرقية» بس.
3. `openingHoursSpecification` بصيغة ISO.
4. `FAQPage` — ده اللي بيخلي جوجل والمساعدين يقتبسوا إجابات مباشرة.
5. محتوى بلغة محلية طبيعية (أبو كبير، ميرش، يونيفورم، جملة) — ده اللي بيفرق في البحث المحلي.

**الخطوة اللي بعد ده:** اعمل Google Business Profile للورشة بنفس الاسم والعنوان والرقم
بالظبط زي الموقع (NAP متطابق)، وحط الرابط. ده أقوى إشارة GEO محلية موجودة.

### قياس
`window.KGS.vitals` بعد أي تجربة بيرجع `{ lcp, cls, inp, ttfb }`.
مش بيتبعت لأي سيرفر — للاستخدام في الكونسول أو اختباراتك.

---

## ٧. بنية الملفات

```
server.js                      Express: brotli + كاش + MIME + /api/health
data/business.js               مصدر بيانات النشاط (NAP) الوحيد — الرقم والعنوان
public/
  home.html                    الصفحة النهائية (المصدر)
  _ssg/home.html               ناتج البناء (بيُخدّم على /)
  hub.html                     صفحة المقارنة بين الاتجاهات (مرجع، مش جزء من الموقع)
  concept-{1,2,3}/             النماذج الأولية (مرجع)
  favicon.svg                  العلامة (The Pull)
  icon-192.png · icon-512.png · icon-maskable-512.png · apple-touch-icon.png
  assets/css/kgs.css           نظام التصميم (٢٠ قسم، mobile-first)
  assets/css/kgs.min.css       ناتج البناء
  assets/js/kgs-ink.js         الشيدر (WebGL + احتياطي)
  assets/js/kgs-engine.js      rAF واحد + حارس الأداء + الكشف
  assets/js/kgs-hero.js        سلايدر الهيرو (٣ سلايدات، scroll-snap)
  assets/js/kgs-quote.js       بنّاء عرض السعر (٣ لمسات → رسالة واتساب)
  assets/js/kgs-page.js        توصيل الصفحة + Web Vitals
  assets/img/*.{avif,webp,jpg} صور متجاوبة (حسب الاتجاه: ٣٦٠–١٠٨٠ / ٦٤٠–١٩٢٠)
  assets/fonts/*.woff2         Alexandria + IBM Plex Mono + Cairo
scripts/
  logo-mark.js                 هندسة العلامة (أشكال مليانة فقط)
  logo-lockup.js               الأقفال + طقم الأيقونات
  inline-brand.js              حقن العلامة في النافبار والفوتر
  check-logo.js                فحص قواعد الهوية (مفيش خط، مفيش stroke)
  check-mobile.js              فحص عقد الـ mobile-first
  extract-wordmark.py          تحويل «كمال جادو» لمسارات (HarfBuzz)
  extract-descriptor.py        تحويل SILK SCREEN لمسارات
  svgrender.py                 محرّك تنقيط SVG للتحقق (بدون cairo)
  build-fonts.js               نسخ الخطوط (+ --ttf للـ OG)
  build-images.js              خط الصور المتجاوبة + ميزانية أول شاشة
  og-image.py                  كارت المشاركة (HarfBuzz + FreeType + العلامة)
  minify-css.js                تصغير CSS مع تحقق
  ssg.js                       critical CSS + تصغير HTML + noscript
  inject-jsonld.js             توليد JSON-LD من data/business.js
  inject-contact.js            حقن رقم الورشة من data/business.js
  export-static.js             بناء dist/
  lint-shaders.js              فحص GLSL + تطابق الـ uniforms
  test-hero.js                 سلوك السلايدر (٣٢ فحص)
  test-quote.js                سلوك بنّاء العرض (٢٩ فحص)
  smoke.js                     السكرول العكسي + أخطاء التشغيل
  check-assets.js              كل مرجع لازم يرجع 200 بنوع صح
  budget.js                    ميزانية الوزن على السلك (لكل أصل)
assets-src/logo/*.svg          العلامة والأقفال (مصدر الهوية)
assets-src/img/*.png           مصادر الصور
assets-src/original/           الأصل غير المضغوط (مش داخل git)
```

---

## ٨. الاختبارات — إيه اللي بتغطيه فعلًا

```bash
npm run verify
```

| الأداة | بتثبت إيه |
|---|---|
| `lint-shaders` | الشيدر متوازن، مفيش `smoothstep` معكوس (undefined behavior في GLSL)، كل uniform في JS موجود في الشيدر |
| `smoke` | مفيش أخطاء JS، **كل قيمة حركة بترجع لنفسها عند السكرول العكسي**، احتياطي WebGL بيشتغل، الأرقام عربية |
| `check-assets` | ٨٢ مرجع: مفيش ٤٠٤، ومفيش `content-type` غلط (ده اللي بيكسر الصور بصمت) |
| `check-logo` | الهوية كلها مسارات مليانة: مفيش `<text>` ولا `<g>` ولا `stroke` ولا `transform`، وكل أيقونة بمقاسها الصح |
| `check-mobile` | مفيش قاعدة `max-width` بتصغّر خط أو مساحة لمس، والخط الأساسي ≥ ١٦px، وكل هدف لمس ≥ ٤٤px، وصورة الهيرو مش مخفية على الموبايل |
| `test-hero` | ٣ سلايدات: واحد بس نشط، `inert` على المخفي، النقط والأسهم والكيبورد بمنطق RTL، مفيش autoplay، صورة السلايد الأول عالية الأولوية والباقي lazy |
| `test-quote` | ٣ لمسات → رسالة واتساب كاملة، الـ href بيتحدث صح، والتشفير بيرجع زي ما هو، ومفيش أي تخزين |
| `check-contrast` | كل زوج لون مستخدم فعلًا بيعدّي WCAG AA (نص ٤.٥:١ · حدود وأيقونات ٣:١) |
| `check-a11y` | landmark واحد لكل نوع · `h1` واحد · ترتيب عناوين سليم · alt · labels · ids فريدة · مراجع aria معلّقة |
| `check-deploy` | `dist/` فيه كل الملفات، `.htaccess` فيه ضغط وكاش و MIME و CSP، مفيش مصادر أو نماذج أولية بتتسرب |
| `budget` | الوزن الحقيقي على السلك أقل من الميزانية، **ولكل أصل حد أقصى**، وأول شاشة على الموبايل ≤ ١١٠ ك.ب |

**اللي الاختبارات مش بتغطيه:** الرسم الفعلي للشيدر (محتاج GPU حقيقي) والـ Lighthouse
(محتاج متصفح). الاتنين لازم يتعملوا على موبايل حقيقي بعد النشر.

---

## ٩. خطوات مقترحة بعد النشر

1. **Google Business Profile** بنفس NAP — أقوى إشارة محلية.
2. **صور شغل حقيقية** بدل الصور المولّدة. المصمم/المصور: نفس الإضاءة والزوايا، وحطها في `assets-src/img` ثم `npm run assets`.
3. **قسم «شغلنا»** بمعرض بسيط (بيتحمّل lazy) — بيدعم التحويل والـ GEO.
4. **صفحة لكل خدمة** (`/services/tees` إلخ) بنفس التصميم — بتفتح باب كلمات مفتاحية أوسع.
5. **قياس**: حط Google Analytics 4 أو Plausible، وتابع `click` على `[data-cta]` (كل زر معمول له data attribute جاهز).

---

## ١٠. ملاحظات تقنية معروفة

- **الخطوط**: Alexandria مقسومة عربي/لاتيني. أي نص بيخلط الاتنين بيعتمد على
  `unicode-range` في CSS — لو أضفت لغة تالتة، ضيف ملف subset و`@font-face` ليها.
- **الشيدر على WebGL1**: بيشتغل، بس بدقة ألوان أقل (بدون `mediump` بعض التعريفات).
- **`backdrop-filter`**: مدعوم في Safari بـ `-webkit-`، ومعمول له fallback خلفية صلبة.
- **RTL + `transform`**: كل الحركات أفقية بتستخدم `translate3d` بمحور Y فقط،
  فمفيش مشاكل مع اتجاه الصفحة.
