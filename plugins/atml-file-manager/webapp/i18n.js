/*
 * Localization for the ATML File Manager.
 * Follows the SystemLink UI language (same resolution order as the SL shell).
 * Strings are keyed by their English text; per-language tables live in
 * locale/<lang>.js and register themselves on I18N.messages.
 * Loaded in <head> before the Nimble bundle so <html lang> is set before
 * Nimble components read it for date/number formatting.
 */
(function (global) {
  'use strict';

  const SUPPORTED = ['en', 'de', 'fr', 'ja', 'zh', 'ko'];

  function normalize(value) {
    const lang = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED.includes(lang) ? lang : 'en';
  }

  function resolveLanguage() {
    const candidates = [];
    try {
      candidates.push(localStorage.getItem('language'));
      const legacy = localStorage.getItem('skyline-api-languages');
      if (legacy) candidates.push(legacy.split(',')[0]);
    } catch { /* localStorage may be unavailable */ }
    if (navigator.languages && navigator.languages.length) candidates.push(navigator.languages[0]);
    candidates.push(navigator.language);
    try { candidates.push(Intl.DateTimeFormat().resolvedOptions().locale); } catch { /* ignore */ }
    const first = candidates.find((c) => c && String(c).trim());
    return normalize(first);
  }

  // SystemLink reloads the page on language change, so resolve once.
  const lang = resolveLanguage();
  document.documentElement.lang = lang;

  const messages = {};
  const numberFormat = new Intl.NumberFormat(lang);
  const pluralRules = new Intl.PluralRules(lang);

  function format(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(params, key)) return match;
      const v = params[key];
      return typeof v === 'number' ? numberFormat.format(v) : String(v);
    });
  }

  // Translate an English message, substituting {placeholders}.
  function t(english, params) {
    const table = messages[lang];
    const text = (table && table[english]) || english;
    return format(text, params);
  }

  // Plural-aware: picks the English singular/plural key by the UI language's plural rules.
  function tn(one, other, count, params) {
    const key = pluralRules.select(count) === 'one' ? one : other;
    return t(key, Object.assign({ count }, params));
  }

  /* ---------- formatting (mirrors SystemLink: language-only locale, browser time zone) ---------- */
  const dateTimeFormat = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'medium' });
  function formatDateTime(value) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d) ? '' : dateTimeFormat.format(d);
  }

  function formatNumber(n, options) {
    return new Intl.NumberFormat(lang, options).format(n);
  }

  // 1000-based byte units with at most one decimal, like SystemLink's nimble-unit-byte.
  const BYTE_UNITS = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  function formatBytes(bytes) {
    if (bytes == null || isNaN(Number(bytes))) return '—';
    let n = Number(bytes);
    if (Math.abs(n) < 1000) return formatNumber(n, { style: 'unit', unit: 'byte', unitDisplay: 'long', maximumFractionDigits: 1 });
    let i = -1;
    do { n /= 1000; i++; } while (Math.abs(n) >= 1000 && i < BYTE_UNITS.length - 1);
    return formatNumber(n, { style: 'unit', unit: BYTE_UNITS[i], unitDisplay: 'short', maximumFractionDigits: 1 });
  }

  function formatUnit(value, unit, fractionDigits) {
    return formatNumber(value, {
      style: 'unit', unit, unitDisplay: 'short',
      minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
    });
  }

  function compare(a, b) {
    return String(a || '').localeCompare(String(b || ''), lang);
  }

  /* ---------- static markup ---------- */
  const TRANSLATED_ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);

  // Translate whole text nodes and common attributes whose English text has a translation.
  function translateDom(root) {
    if (!messages[lang]) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const raw = node.nodeValue;
      const text = raw.trim();
      if (!text) continue;
      const translated = t(text);
      if (translated !== text) node.nodeValue = raw.replace(text, translated);
    }
    const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const element of elements) {
      for (const name of TRANSLATED_ATTRS) {
        const value = element.getAttribute(name);
        if (value) element.setAttribute(name, t(value));
      }
    }
    if (root === document.body || root === document.documentElement) document.title = t(document.title);
  }

  // Nimble's built-in labels (English defaults) keyed by label-provider attribute.
  const NIMBLE_LABELS = {
    'nimble-label-provider-core': {
      'popup-dismiss': 'Close', 'numeric-decrement': 'Decrement', 'numeric-increment': 'Increment',
      'popup-icon-error': 'Error', 'popup-icon-warning': 'Warning', 'popup-icon-completed': 'Completed',
      'popup-icon-current': 'Current', 'popup-icon-information': 'Information',
      'filter-search': 'Search', 'filter-no-results': 'No items found', loading: 'Loading…',
      'scroll-backward': 'Scroll backward', 'scroll-forward': 'Scroll forward', 'item-remove': 'Remove',
    },
    'nimble-label-provider-table': {
      'group-collapse': 'Collapse group', 'group-expand': 'Expand group',
      'row-collapse': 'Collapse row', 'row-expand': 'Expand row', 'collapse-all': 'Collapse all',
      'cell-action-menu': 'Options', 'column-header-grouped': 'Grouped',
      'column-header-sorted-ascending': 'Sorted ascending', 'column-header-sorted-descending': 'Sorted descending',
      'select-all': 'Select all rows', 'group-select-all': 'Select all rows in group',
      'row-select': 'Select row', 'row-operation-column': 'Row operations', 'row-loading': 'Loading',
      'group-row-placeholder-no-value': 'No value', 'group-row-placeholder-empty': 'Empty',
    },
  };
  function applyNimbleLabels(root) {
    if (!messages[lang]) return;
    for (const [tag, labels] of Object.entries(NIMBLE_LABELS)) {
      for (const provider of (root || document).querySelectorAll(tag)) {
        for (const [attribute, english] of Object.entries(labels)) provider.setAttribute(attribute, t(english));
      }
    }
  }

  global.I18N = {
    lang,
    messages,
    t,
    tn,
    formatDateTime,
    formatNumber,
    formatBytes,
    formatUnit,
    compare,
    translateDom,
    applyNimbleLabels,
  };
})(window);
