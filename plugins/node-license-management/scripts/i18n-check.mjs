import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '@angular/localize/init';
import { clearTranslations, loadTranslations } from '@angular/localize';
import { computeMsgId } from '@angular/compiler';
import { getSystemLinkLanguage } from '../src/app/core/utils/language.utils.ts';

const pluginDir = fileURLToPath(new URL('../', import.meta.url));
const localeDir = path.join(pluginDir, 'src/locale');
const languages = ['de', 'fr', 'ja', 'zh'];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const source = readJson(path.join(localeDir, 'messages.json')).translations;
const placeholders = (text) => [...text.matchAll(/\{\$([^}]+)\}/g)].map((match) => match[1]).sort();
for (const language of languages) {
  const catalog = readJson(path.join(localeDir, `messages.${language}.json`));
  assert.equal(catalog.locale, language);
  assert.deepEqual(Object.keys(catalog.translations).sort(), Object.keys(source).sort());
  for (const [id, english] of Object.entries(source)) {
    assert.ok(catalog.translations[id].trim(), `${language}: empty ${english}`);
    assert.deepEqual(placeholders(catalog.translations[id]), placeholders(english), `${language}: ${english}`);
  }
  clearTranslations();
  loadTranslations(catalog.translations);
  assert.equal($localize`Node License Dashboard`, catalog.translations[computeMsgId('Node License Dashboard', '')]);
  assert.equal($localize`query-results failed (${503}:status:)`,
    catalog.translations[computeMsgId('query-results failed ({$status})', '')].replace('{$status}', '503'));
}
clearTranslations();
assert.equal($localize`Node License Dashboard`, 'Node License Dashboard');

let stored = {};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, value: { getItem: (key) => stored[key] ?? null },
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true, value: { languages: ['ja-JP'], language: 'zh-CN' },
});
for (const [preferences, expected] of [
  [{ language: ' DE-de ', 'skyline-api-languages': 'fr' }, 'de'],
  [{ language: 'invalid', 'skyline-api-languages': ' FR_fr ,en' }, 'fr'],
  [{ language: '', 'skyline-api-languages': 'zh-CN,en' }, 'zh'],
  [{ language: 'xx', 'skyline-api-languages': 'yy' }, 'ja'],
  [{ language: 'ko-KR' }, 'ko'],
  [{ language: 'en-US', 'skyline-api-languages': 'de' }, 'en'],
]) {
  stored = preferences;
  assert.equal(getSystemLinkLanguage(), expected);
}
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, get() { throw new Error('Storage denied'); },
});
assert.equal(getSystemLinkLanguage(), 'ja');
globalThis.navigator.languages = ['unsupported'];
assert.equal(getSystemLinkLanguage(), 'zh');
globalThis.navigator.language = 'unsupported';
const originalDateTimeFormat = Intl.DateTimeFormat;
Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ locale: 'unsupported' }) });
assert.equal(getSystemLinkLanguage(), 'en');
Intl.DateTimeFormat = originalDateTimeFormat;

// Exercise the real CLI offline, keeping fixtures inside this project and deleting them afterwards.
const fixture = path.join(pluginDir, '.i18n-regression');
assert.ok(!fs.existsSync(fixture), 'Regression fixture directory already exists');
const fixtureLocale = path.join(fixture, 'src/locale');
const scriptUrl = pathToFileURL(path.join(pluginDir, 'scripts/i18n-sync.mjs')).href;
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
function runSync(mode) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = async (url) => {
      if (${JSON.stringify(mode)} === 'offline') throw new Error('Simulated outage');
      const body = url.endsWith('/') ? 'main-ABC.js'
        : url.includes('main-') ? ${JSON.stringify(languages.map((language) => {
          const loader = { de: 'getDe', fr: 'getFr', ja: 'getJa', zh: 'getZh' }[language];
          return `${loader}:()=>import("./chunk-${language.toUpperCase()}.js")`;
        }).join(','))}
        : JSON.stringify({ 1: 'native translation' });
      return { ok: true, text: async () => body };
    };
    await import(${JSON.stringify(scriptUrl)});
  `], { cwd: fixture, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return result;
}
try {
  fs.mkdirSync(path.join(fixtureLocale, 'manual'), { recursive: true });
  writeJson(path.join(fixtureLocale, 'messages.json'), { translations: { 1: 'Native', 2: 'Manual' } });
  const originals = new Map();
  for (const language of languages) {
    const file = path.join(fixtureLocale, `messages.${language}.json`);
    writeJson(file, { locale: language, translations: { 1: 'existing', 2: 'existing' } });
    originals.set(file, fs.readFileSync(file, 'utf8'));
    writeJson(path.join(fixtureLocale, 'manual', `${language}.json`), { Manual: 'manual translation' });
  }
  const outage = runSync('offline');
  assert.equal(outage.status, 1, outage.stderr);
  assert.match(outage.stderr, /Existing catalogs were not changed/);
  for (const [file, original] of originals) assert.equal(fs.readFileSync(file, 'utf8'), original);
  for (const language of languages) {
    assert.deepEqual(readJson(path.join(fixtureLocale, `missing.${language}.json`)), { 1: 'Native' });
  }
  writeJson(path.join(fixtureLocale, 'manual', 'zh.json'), {});
  assert.equal(runSync('online').status, 1, 'One incomplete language must preserve all catalogs');
  for (const [file, original] of originals) assert.equal(fs.readFileSync(file, 'utf8'), original);
  writeJson(path.join(fixtureLocale, 'manual', 'zh.json'), { Manual: 'manual translation' });
  const success = runSync('online');
  assert.equal(success.status, 0, success.stderr);
  for (const language of languages) {
    assert.deepEqual(readJson(path.join(fixtureLocale, `messages.${language}.json`)).translations,
      { 1: 'native translation', 2: 'manual translation' });
    assert.ok(!fs.existsSync(path.join(fixtureLocale, `missing.${language}.json`)));
  }
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
console.log('Localization checks passed: catalogs, placeholders, runtime text, language precedence, atomic sync.');
