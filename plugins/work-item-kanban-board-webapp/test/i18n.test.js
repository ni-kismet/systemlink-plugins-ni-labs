import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/i18n.js', import.meta.url), 'utf8')
    .replace('const TRANSLATIONS = {', 'const TRANSLATIONS = globalThis.__translations = {')
    .replace('export const language = getSystemLinkLanguage();', 'const language = globalThis.__language = getSystemLinkLanguage();')
    .replace('export function t(', 'function t(')
    .replace('export function translateDocument(', 'function translateDocument(')
    + '\nglobalThis.__translate = t;';

function loadI18n(preferences = {}, browser = {}) {
    const context = vm.createContext({
        Intl,
        localStorage: { getItem: key => preferences[key] ?? null },
        navigator: {
            languages: browser.languages ?? [],
            language: browser.language ?? 'en-US',
        },
    });
    vm.runInContext(source, context);
    return context;
}

test('invalid primary preference falls back to normalized legacy preference', () => {
    const context = loadI18n({
        language: 'unsupported',
        'skyline-api-languages': 'de-DE,en-US',
    }, { language: 'ja-JP' });

    assert.equal(context.__language, 'de');
});

test('regional primary preference is normalized before the legacy preference', () => {
    const context = loadI18n({
        language: ' FR_ca ',
        'skyline-api-languages': 'de',
    });

    assert.equal(context.__language, 'fr');
});

test('regional browser preference is used after unsupported stored preferences', () => {
    const context = loadI18n({
        language: 'unsupported',
        'skyline-api-languages': 'unsupported',
    }, { languages: ['es-MX'], language: 'zh-CN' });

    assert.equal(context.__language, 'zh');
});

test('unsupported Korean preference falls back to English', () => {
    const context = loadI18n({
        language: 'ko-KR',
        'skyline-api-languages': 'ko-KR',
    }, { languages: ['ko-KR'], language: 'ko-KR' });

    assert.equal(context.__language, 'en');
});

test('translated placeholders interpolate in every locale', () => {
    for (const language of ['de', 'fr', 'ja', 'zh']) {
        const context = loadI18n({ language });
        const template = context.__translations[language]['Moved to {state}'];
        assert.equal(
            context.__translate('Moved to {state}', { state: 'Review' }),
            template.replace('{state}', 'Review'),
        );
    }
});

test('translation dictionaries have matching keys and placeholders', () => {
    const translations = loadI18n().__translations;
    const languages = ['de', 'fr', 'ja', 'zh'];
    const keys = Object.keys(translations.de).sort().join('\n');

    for (const language of languages) {
        assert.equal(Object.keys(translations[language]).sort().join('\n'), keys, `${language} keys`);
        for (const [key, translated] of Object.entries(translations[language])) {
            const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)]
                .map(([, name]) => name).sort().join(',');
            assert.equal(placeholders(translated), placeholders(key), `${language}: ${key}`);
        }
    }
});
