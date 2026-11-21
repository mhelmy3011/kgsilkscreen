# كمال جادو — سلك سكرين · kgsilkscreen.store

صفحة هبوط عربية (RTL) لورشة سلك سكرين في **أبو كبير، محافظة الشرقية** — مبنية كـ **رحلة** مش صفحة ثابتة.
الريبو فيه **٣ اتجاهات تصميم** كاملة وشغّالة، كل واحد صفحة مستقلة تقدر تسكرول فيها وتقرر.

A zero-build Node.js project prepared for **Hostinger shared hosting**.

---

## ١) التشغيل محليًا / Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | الوظيفة |
|---|---|
| `npm start` | تشغيل السيرفر (بورت `PORT` أو ٣٠٠٠) |
| `npm run dev` | تشغيل مع إعادة التحميل التلقائي |
| `npm run build` | يحدّث الـ JSON-LD ثم يبني `dist/` |
| `npm run export` | ينسخ `public/` + `.htaccess` إلى `dist/` |
| `npm run seo` | يحقن بيانات النشاط (LocalBusiness) في كل الصفحات |
| `npm test` | اختبار تشغيل + اختبار السكرول العكسي (بدون متصفح) |

الصفحات:

| الرابط | إيه ده |
|---|---|
| `/` | صفحة المقارنة — الاتجاهات الثلاثة + التوصية |
| `/concept-1/` | **المكبس** — ورق وشفرة وحبر بيتسحب مع السكرول |
| `/concept-2/` | **الغرق** — رحلة جوه الحبر بمقياس عمق (Canvas) |
| `/concept-3/` | **دفتر العيّنات** — صفحات Sticky بتتقلّب فوق بعض |

---

## ٢) النشر على Hostinger — اختار مسار واحد

### المسار (أ) — استضافة Node.js مباشرة ✅ الأفضل لو متاحة

1. hPanel → **Advanced → Node.js**.
2. **Create application**:
   - Application root: `kgsilkscreen` (فولدر جوه `domains/kgsilkscreen.store/`)
   - Application URL: `kgsilkscreen.store`
   - Application startup file: `server.js`
   - Node version: **18 أو 20**
3. ارفع الملفات (Git أو File Manager / FTP) — **بدون** `node_modules`.
4. اضغط **Run NPM Install** من نفس صفحة الـ Node.js.
5. اضغط **Restart**، وتأكد إن `https://kgsilkscreen.store/api/health` بيرجع JSON.
6. فعّل **SSL** من hPanel (مجاني) وحوّل HTTP → HTTPS.

> السيرفر بيقرأ `PORT` من متغيرات البيئة اللي بتعملها Hostinger تلقائيًا، فمش محتاج تعدّل حاجة.
> لو الـ process بيقف لوحده: hPanel → Node.js → **Restart**، وشوف `stderr.log`.

### المسار (ب) — استضافة ثابتة (لو Node.js مش متاحة في باقتك)

الموقع كله HTML/CSS/JS بدون build، فبيشتغل على أي استضافة:

```bash
npm run build
```

ارفُع **محتويات** فولدر `dist/` جوه `public_html`. ملف `.htaccess` جوه `dist` بيعمل
الضغط والتخزين المؤقت و ErrorDocument 404.

### بعد النشر — DNS

- دومين من Hostinger: **Manage → Nameservers → Hostinger**، أو
- دومين خارجي: غيّر الـ NS لنفس اللي في hPanel، أو اعمل `A record` لـ IP الاستضافة.

---

## ٣) قبل النشر: غيّر البيانات الحقيقية (مهم)

كل حاجة في مكان واحد: **`data/business.js`**

```js
phoneE164:  '+201000000000',   // ← الرقم الحقيقي
whatsapp:   '201000000000',    // ← من غيره
streetAr:   'شارع الجيش، أبو كبير',
geo: { lat: 30.7296, lng: 31.6731 },
```

بعد التعديل:

```bash
npm run build
```

> ⚠️ أرقام الواتساب مكتوبة كمان جوه الـ HTML في النماذج الثلاثة (روابط `wa.me`).
> ابحث في `public/` عن `201000000000` واستبدلها، أو استخدم:
> `grep -rl "201000000000" public/ | xargs sed -i 's/201000000000/2012XXXXXXXX/g'`

---

## ٤) الأداء (USP رقم ٢) — إزاي اتحقق

| القرار | الأثر |
|---|---|
| **بدون أي framework** — HTML/CSS/JS صريح | مفيش hydration ولا bundle، الصفحة الأولى بترسم فورًا |
| **خطوط محلية** (`/assets/fonts`) | صفر طلبات لـ Google Fonts → أسرع على شبكات الموبايل المصرية |
| **`font-display: swap` + preload للوزنين المستخدمين في أول شاشة** | النص بيظهر فورًا بدون قفزة |
| **ضغط gzip/brotli** | صفحة الغرق ٩.٦ ك.ب → ~٣ ك.ب |
| **تنزيل كل الموقع ≈ ٢٤٠ ك.ب** بما فيها الخطوط | يحمّل على 3G في ثوانٍ |
| **حلقة rAF واحدة** لكل صفحة (مفيش مستمعين متعددين للسكرول) | سكرول ثابت ٦٠ إطار على موبايلات متوسطة |
| **الحركة كلها دالة في موضع السكرول** مش مؤقتات | السكرول العكسي رجوع رياضي مظبوط، مفيش drift |
| **`prefers-reduced-motion`** | كل التأثيرات بتتحول لنسخة ثابتة محترمة |
| **صفر اعتماد على JS للقراءة** | لو الجافاسكريبت وقع، المحتوى كله ظاهر (no-js fallback) |

قياس سريع:

```bash
curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download} bytes\n' https://kgsilkscreen.store/concept-2/
```

### نقطة مهمة عن أداء الموبايل
صفحة **الغرق** بتستخدم Canvas 2D + `backdrop-filter` في الكروت. على موبايل قديم (أقل من ٤ جيجا رام)
ممكن الـ blur يتقل — في الكود فيه احتياط (سقف DPR ١.٧٥ وإيقاف الرسم لما التاب يتخفي).
لو بعد اختبار حقيقي لقيت تنميل، الحل الأرخص: شيل `backdrop-filter` من `.card` و `.flow__step`
في `concept-2/style.css` — الشكل هيفضل ٩٠٪ زي ما هو.

---

## ٥) بنية الملفات

```
server.js                  سيرفر Express (ضغط + كاش + /api/health)
data/business.js           مصدر بيانات النشاط الوحيد (N-A-B-P)
scripts/inject-jsonld.js   حقن LocalBusiness JSON-LD في كل الصفحات
scripts/export-static.js   بناء dist/ للاستضافة الثابتة
scripts/smoke.js           اختبار تشغيل + إثبات السكرول العكسي
public/
  index.html               صفحة المقارنة بين الاتجاهات
  concept-1/{index.html,style.css,main.js}    المكبس
  concept-2/{index.html,style.css,ink.js}     الغرق
  concept-3/{index.html,style.css,main.js}    دفتر العيّنات
  assets/base.css          التوكنز + الخطوط + التنسيق المشترك
  assets/fonts/*.woff2      Cairo (عربي + لاتيني) — مستضافة محليًا
  robots.txt · sitemap.xml
```

الخطوط من `@fontsource/cairo` (SIL OFL). نسخ الملفات تم مرة واحدة في `public/assets/fonts،
فمش محتاج تثبيت الحزمة على السيرفر.

---

## ٦) الاختبارات

```bash
npm run dev      # في تيرمنال
npm test         # في تيرمنال تاني
```

`npm test` بيتأكد من:
1. مفيش أخطاء JS في أي صفحة،
2. كل متغيرات الحركة (`--p`) بتتغيّر مع السكرول **وبترجع لنفس القيمة بالظبط** لما تطلع لفوق،
3. مقاييس الحبر/العمق/الصفحات بتفضل بين ٠ و١٠٠٪.

---

## ٧) التوصية

الاتجاه **٢ (الغرق)** هو الأقرب لطلبك: إحساس الغرق والطباعة، ورجوع ناعم بالعكس.
والتوصية الكاملة (٢ للواجهة + ٣ للخدمات + ١ للهوية) موجودة في صفحة المقارنة `/`.
