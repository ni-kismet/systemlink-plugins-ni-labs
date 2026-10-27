/** Languages the SystemLink shell supports; mirrors its language-preference resolution. */
const SYSTEMLINK_LANGUAGES = ['fr', 'de', 'ja', 'zh', 'en', 'ko'];
const SYSTEMLINK_LANGUAGE_STORAGE_KEY = 'language';
const SYSTEMLINK_LEGACY_LANGUAGE_STORAGE_KEY = 'skyline-api-languages';

/** Primary language subtag (e.g. 'de' for 'de-DE'), lower-cased. */
export function toLanguage(locale: string | null | undefined): string {
  return (locale ?? '').split(/[-_]/)[0].trim().toLowerCase();
}

/** Reads a saved UI preference, falling back when iframe storage access is denied. */
export function readLocalStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'SecurityError') {
      throw error;
    }
    console.warn('Local storage is inaccessible; using default UI preferences.', error);
    return null;
  }
}

/**
 * Resolves the SystemLink UI language the same way the SystemLink shell does: the user's saved
 * language preference first, then the browser language, then English.
 */
export function getSystemLinkLanguage(): string {
  const stored =
    readLocalStorage(SYSTEMLINK_LANGUAGE_STORAGE_KEY) ??
    readLocalStorage(SYSTEMLINK_LEGACY_LANGUAGE_STORAGE_KEY)?.split(',')[0];
  if (stored && SYSTEMLINK_LANGUAGES.includes(stored)) {
    return stored;
  }

  const browserCandidates = [
    globalThis.navigator?.languages?.[0],
    globalThis.navigator?.language,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ];
  for (const candidate of browserCandidates) {
    const language = toLanguage(candidate);
    if (SYSTEMLINK_LANGUAGES.includes(language)) {
      return language;
    }
  }

  return 'en';
}
