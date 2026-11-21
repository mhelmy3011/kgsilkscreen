'use strict';

/**
 * المصدر الوحيد لبيانات النشاط.
 * عدّل هنا فقط — كل الصفحات والـ JSON-LD والسايت ماب بيقروا من الملف ده.
 * Edit here only: pages, JSON-LD and meta all read from this file.
 */

module.exports = {
  nameAr: 'كمال جادو — سلك سكرين',
  nameEn: 'Kamal Gadou Silk Screen',
  url: 'https://kgsilkscreen.store',
  descriptionAr:
    'ورشة كمال جادو للسلك سكرين في أبو كبير، محافظة الشرقية. طباعة يدوية على التيشيرتات، اليونيفورم، الأعلام، الزجاج، والبلاستيك — بجودة ثابتة من أول ٢٥ قطعة.',

  // ⚠️ غيّر الرقم ده لرقم الورشة الحقيقي قبل النشر
  phoneE164: '+201000000000',
  phoneDisplay: '٠١٠ ٠٠٠٠ ٠٠٠٠',
  whatsapp: '201000000000',
  email: 'info@kgsilkscreen.store',

  streetAr: 'شارع الجيش، أبو كبير',
  cityAr: 'أبو كبير',
  regionAr: 'محافظة الشرقية',
  postalCode: '44621',
  geo: { lat: 30.7296, lng: 31.6731 },

  areaServed: ['أبو كبير', 'الزقازيق', 'بلبيس', 'منيا القمح', 'فاقوس', 'محافظة الشرقية', 'القاهرة'],
  priceRange: '٢٠ ج.م – ٥٠٠ ج.م للقطعة',

  hours: [
    { days: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '09:00', closes: '19:00' },
  ],

  social: ['https://www.facebook.com/kgsilkscreen'],

  services: [
    { nameAr: 'تيشيرتات وميرش', descAr: 'طباعة سلك سكرين على القطن والبوليستر من ٢٥ قطعة.' },
    { nameAr: 'يونيفورم مدارس وشركات', descAr: 'شعار المدرسة أو الشركة على الصدر والظهر بفاتورة رسمية.' },
    { nameAr: 'أعلام وبانرات', descAr: 'أعلام قماش مقاوم للشمس حتى مقاس ٢×١ متر.' },
    { nameAr: 'كوبايات وبرطمانات زجاج', descAr: 'طباعة على الزجاج بحرارة عالية تستحمل الغسيل.' },
    { nameAr: 'أكياس وعلب كرتون', descAr: 'تغليف بشعار المحل بأسعار جملة.' },
    { nameAr: 'أقلام وأدوات دعائية', descAr: 'هدايا المعارض والافتتاحات بطبعة دقيقة.' },
  ],
};
