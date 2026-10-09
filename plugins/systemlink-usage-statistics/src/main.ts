import { registerLocaleData } from '@angular/common';
import { importProvidersFrom } from '@angular/core';
import { loadTranslations } from '@angular/localize';
import { bootstrapApplication } from '@angular/platform-browser';

import { getSystemLinkLanguage } from './app/core/utils/language.utils';

interface ITranslationFile {
  translations: Record<string, string>;
}

const translationLoaders: Record<string, () => Promise<{ default: ITranslationFile }>> = {
  de: () => import('./locale/messages.de.json'),
  fr: () => import('./locale/messages.fr.json'),
  ja: () => import('./locale/messages.ja.json'),
  zh: () => import('./locale/messages.zh.json'),
};

// Angular locale data (dates, numbers, plurals) for each SystemLink language; 'en' is built in.
const localeDataLoaders: Record<string, () => Promise<{ default: unknown[] }>> = {
  de: () => import('@angular/common/locales/de'),
  fr: () => import('@angular/common/locales/fr'),
  ja: () => import('@angular/common/locales/ja'),
  zh: () => import('@angular/common/locales/zh'),
  ko: () => import('@angular/common/locales/ko'),
};

async function bootstrap(): Promise<void> {
  const language = getSystemLinkLanguage();
  const loader = translationLoaders[language];
  const localeDataLoader = localeDataLoaders[language];
  try {
    if (loader) {
      loadTranslations((await loader()).default.translations);
    }
    if (localeDataLoader) {
      registerLocaleData((await localeDataLoader()).default, language);
    }
  } catch (error) {
    console.error(`Localization for '${language}' could not be loaded.`, error);
  }
  document.documentElement.lang = language;

  // Imported after translations load so module-level $localize strings are translated.
  const [{ AppComponent }, { AppModule }] = await Promise.all([
    import('./app/app.component'),
    import('./app/app.module'),
  ]);
  await bootstrapApplication(AppComponent, {
    providers: [importProvidersFrom(AppModule)],
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
});
