import { APP_BASE_HREF, registerLocaleData } from '@angular/common';
import { enableProdMode, LOCALE_ID } from '@angular/core';
import { loadTranslations } from '@angular/localize';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { getSystemLinkLanguage } from './app/language.utils';
import { environment } from './environments/environment';

interface TranslationFile {
  translations: Record<string, string>;
}

const translationLoaders: Record<string, () => Promise<{ default: TranslationFile }>> = {
  de: () => import('./locale/messages.de.json'),
  fr: () => import('./locale/messages.fr.json'),
  ja: () => import('./locale/messages.ja.json'),
  zh: () => import('./locale/messages.zh.json')
};

// Angular locale data (dates, numbers, plurals) for each SystemLink language; 'en' is built in.
const localeDataLoaders: Record<string, () => Promise<{ default: unknown[] }>> = {
  de: () => import('@angular/common/locales/de'),
  fr: () => import('@angular/common/locales/fr'),
  ja: () => import('@angular/common/locales/ja'),
  zh: () => import('@angular/common/locales/zh'),
  ko: () => import('@angular/common/locales/ko')
};

if (environment.production) {
  enableProdMode();
}

async function bootstrap(): Promise<void> {
  const language = getSystemLinkLanguage();
  try {
    const loader = translationLoaders[language];
    if (loader) {
      loadTranslations((await loader()).default.translations);
    }
    const localeDataLoader = localeDataLoaders[language];
    if (localeDataLoader) {
      registerLocaleData((await localeDataLoader()).default, language);
    }
  } catch (error) {
    console.error(`Localization for '${language}' could not be loaded.`, error);
  }
  document.documentElement.lang = language;

  // Imported after translations load so module-level $localize strings are translated.
  const { AppComponent } = await import('./app/app.component');
  await bootstrapApplication(AppComponent, {
    providers: [
      provideHttpClient(),
      { provide: APP_BASE_HREF, useValue: '/' },
      { provide: LOCALE_ID, useValue: language }
    ]
  });
}

bootstrap().catch(err => console.error('Bootstrap error:', err));
