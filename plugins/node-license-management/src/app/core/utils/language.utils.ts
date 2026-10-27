/** Languages the SystemLink shell supports; mirrors its language-preference resolution. */
const SYSTEMLINK_LANGUAGES = ['fr', 'de', 'ja', 'zh', 'en', 'ko'];
const SYSTEMLINK_LANGUAGE_STORAGE_KEY = 'language';
const SYSTEMLINK_LEGACY_LANGUAGE_STORAGE_KEY = 'skyline-api-languages';

/** Primary language subtag (e.g. 'de' for 'de-DE'), lower-cased. */
export function toLanguage(locale: string | null | undefined): string {
  return (locale ?? '').trim().split(/[-_]/)[0].toLowerCase();
}

function readLocalStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    // Storage is inaccessible in some sandboxed iframes.
    return null;
  }
}

/**
 * Resolves the SystemLink UI language the same way the SystemLink shell does: the user's saved
 * language preference first, then the browser language, then English.
 */
export function getSystemLinkLanguage(): string {
  const candidates = [
    readLocalStorage(SYSTEMLINK_LANGUAGE_STORAGE_KEY),
    readLocalStorage(SYSTEMLINK_LEGACY_LANGUAGE_STORAGE_KEY)?.split(',')[0],
    globalThis.navigator?.languages?.[0],
    globalThis.navigator?.language,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ];
  for (const candidate of candidates) {
    const language = toLanguage(candidate);
    if (SYSTEMLINK_LANGUAGES.includes(language)) {
      return language;
    }
  }

  return 'en';
}
