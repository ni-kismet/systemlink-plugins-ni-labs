'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const languages = ['de', 'fr', 'ja', 'zh'];
const catalogs = Object.fromEntries(languages.map((language) => {
  const file = path.join(root, 'webapp', 'locale', `${language}.js`);
  const messages = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { I18N: { messages } }, { filename: file });
  return [language, messages[language]];
}));
const expectedKeys = Object.keys(catalogs.de).sort();
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

for (const [language, catalog] of Object.entries(catalogs)) {
  assert.deepEqual(Object.keys(catalog).sort(), expectedKeys, `${language} translation keys differ`);
  for (const [key, value] of Object.entries(catalog)) {
    assert.deepEqual(placeholders(value), placeholders(key), `${language} placeholders differ for "${key}"`);
  }
  assert.ok(catalog['Result created'], `${language} is missing the created-result label`);
  assert.notEqual(catalog['Result created'], catalog.Created, `${language} reuses the creation-date label`);
}

const app = fs.readFileSync(path.join(root, 'webapp', 'app.js'), 'utf8');
assert.match(app, /created:\s*'Result created'/, 'created upload state must use its dedicated translation key');

const i18nSource = fs.readFileSync(path.join(root, 'webapp', 'i18n.js'), 'utf8');
function resolvedLanguage(language, legacy, browser) {
  const window = {};
  const document = { documentElement: { lang: '' } };
  const storage = { language, 'skyline-api-languages': legacy };
  vm.runInNewContext(i18nSource, {
    window,
    document,
    localStorage: { getItem: (key) => storage[key] || null },
    navigator: { languages: browser ? [browser] : [], language: browser },
  });
  return window.I18N.lang;
}

assert.equal(resolvedLanguage('es', 'de', 'fr'), 'de', 'unsupported primary preference must fall back to a supported legacy preference');
assert.equal(resolvedLanguage('es', 'it', 'fr'), 'fr', 'unsupported stored preferences must fall back to the browser language');
assert.equal(resolvedLanguage('JA-jp', null, 'fr'), 'ja', 'supported regional preferences must normalize');
assert.equal(resolvedLanguage('es', 'it', 'pt'), 'en', 'unsupported preferences must default to English');
console.log(`Locale integrity OK: ${languages.length} catalogs, ${expectedKeys.length} keys, placeholders, created-result label, and fallback precedence.`);
