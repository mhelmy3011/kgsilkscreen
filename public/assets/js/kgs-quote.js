/**
 * kgs-quote.js — the 3-tap quote builder.
 *
 * The whole point is to remove the single biggest drop-off on an Arabic
 * silkscreen site: a visitor does not know what to write in a WhatsApp message,
 * so they don't send one. Three taps produce a complete, polite, specific
 * message that the workshop can price immediately.
 *
 * Deliberate constraints:
 *
 * · Progressive enhancement. The form is real markup with real radio inputs and
 *   a real href on the send button. If this file never loads, the button still
 *   opens WhatsApp with the default generic message. We only ever REWRITE the
 *   href — we never gate the button behind JS.
 * · No state to lose. Choices are read from the DOM at the moment of sending,
 *   so a back-navigation or a reformat cannot leave stale text.
 * · No PII. Nothing is stored, nothing is sent anywhere except WhatsApp when
 *   the user taps send. No localStorage, no analytics payload.
 * · Arabic-Indic numerals and the visitor's own words are preserved verbatim.
 */
(function () {
  'use strict';

  const KGS = (window.KGS = window.KGS || {});
  const PHONE = '201019458080'; // keep in sync with data/business.js

  function setupQuoteBuilder() {
    const form = document.querySelector('[data-quote-builder]');
    if (!form) return;

    const send = form.querySelector('[data-qb-send]');
    const summary = form.querySelector('[data-qb-summary]');
    if (!send) return;

    const val = (name) => {
      const el = form.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value.trim() : '';
    };

    function message() {
      const kind = val('kind');
      const qty = val('qty');
      const when = val('when');
      const lines = [
        'السلام عليكم كمال جادو،',
        'برجاء تسعير طلب طباعة سلك سكرين بالمواصفات التالية:',
        `• نوع الشغل: ${kind}`,
        `• الكمية المطلوبة: ${qty}`,
        `• موعد الاستلام: ${when}`,
      ];
      lines.push('', 'سأشارككم ملف التصميم والمقاسات وعدد الألوان المطلوبة.');
      return lines.join('\n');
    }

    function target() {
      return `https://wa.me/${PHONE}?text=${encodeURIComponent(message())}`;
    }

    function refresh() {
      send.setAttribute('href', target());
      if (summary) {
        summary.textContent = `${val('kind')} · ${val('qty')} · ${val('when')} — جاهز للإرسال على واتساب (01019458080).`;
      }
      form.setAttribute('data-ready', '1');
    }

    // `change` covers tap, keyboard and programmatic selection in one listener.
    form.addEventListener('change', refresh);
    form.addEventListener('submit', (e) => e.preventDefault());
    refresh();

    // Expose for tests and for the smoke check.
    KGS.quote = { message, target, refresh };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupQuoteBuilder);
  } else {
    setupQuoteBuilder();
  }
})();
