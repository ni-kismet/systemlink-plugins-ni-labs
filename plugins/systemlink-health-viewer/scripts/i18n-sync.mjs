// Syncs src/locale/messages.<lang>.json with the extracted source messages (src/locale/messages.json).
// Each message uses SystemLink's own translation when SystemLink ships the same message (same
// message ID), so wording matches the native UI; otherwise the reviewed translation from
// src/locale/manual/<lang>.json (keyed by English source text) is used. Untranslated messages are
// written to src/locale/missing.<lang>.json.
// Usage:
//   node scripts/i18n-sync.mjs [--server https://<systemlink-host>]
//   node scripts/i18n-sync.mjs --lookup "English text" [...]   (prints SystemLink's wording)
import fs from 'node:fs';
import path from 'node:path';
import { computeMsgId } from '@angular/compiler';

const LANGUAGES = ['de', 'fr', 'ja', 'zh'];
const SYSTEMLINK_APPS = [
  'webapps',
  'labmanagement',
  'assets',
  'systems',
  'testinsights',
  'files',
  'dashboards',
  'jupyter',
  'security',
  'routines',
  'alarms',
  'tags',
  'feeds',
  'home',
];
const LOADER_NAMES = { de: 'getDe', fr: 'getFr', ja: 'getJa', zh: 'getZh' };

const serverArgIndex = process.argv.indexOf('--server');
const server = (
  serverArgIndex > 0 ? process.argv[serverArgIndex + 1] : 'https://demo.systemlink.ni.dev'
).replace(/\/$/, '');
const localeDir = path.join('src', 'locale');

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return response.text();
}

/** Parses the `{"<id>":"<text>",...}` translation object out of a compiled Angular locale chunk. */
function parseTranslationChunk(source) {
  const translations = {};
  for (const match of source.matchAll(/"(\d+)":"((?:[^"\\]|\\.)*)"/g)) {
    const jsonString = match[2].replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
    try {
      translations[match[1]] = JSON.parse(`"${jsonString}"`);
    } catch {
      // Skip entries that are not plain string literals.
    }
  }
  return translations;
}

/** Collects id -> { text -> count } per language across all SystemLink apps. */
async function harvestSystemLinkTranslations() {
  const votes = Object.fromEntries(LANGUAGES.map((language) => [language, new Map()]));

  for (const app of SYSTEMLINK_APPS) {
    let main;
    try {
      const index = await fetchText(`${server}/${app}/`);
      const mainFile = index.match(/main-[A-Z0-9]+\.js/)?.[0];
      if (!mainFile) {
        continue;
      }
      main = await fetchText(`${server}/${app}/${mainFile}`);
    } catch (error) {
      console.warn(`Skipping ${app}: ${error.message}`);
      continue;
    }

    for (const language of LANGUAGES) {
      const loader = new RegExp(`${LOADER_NAMES[language]}:\\(\\)=>[^}]*?import\\("\\./(chunk-[A-Z0-9]+\\.js)"\\)`);
      const chunk = main.match(loader)?.[1];
      if (!chunk) {
        continue;
      }
      try {
        const translations = parseTranslationChunk(await fetchText(`${server}/${app}/${chunk}`));
        for (const [id, text] of Object.entries(translations)) {
          const byText = votes[language].get(id) ?? new Map();
          byText.set(text, (byText.get(text) ?? 0) + 1);
          votes[language].set(id, byText);
        }
      } catch (error) {
        console.warn(`Skipping ${app} ${language}: ${error.message}`);
      }
    }
  }

  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      new Map(
        [...votes[language]].map(([id, byText]) => [
          id,
          [...byText].sort((left, right) => right[1] - left[1])[0][0],
        ]),
      ),
    ]),
  );
}

function readJson(file, fallback) {
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    : fallback;
}

const systemLink = await harvestSystemLinkTranslations();

const lookupIndex = process.argv.indexOf('--lookup');
if (lookupIndex > 0) {
  for (const english of process.argv.slice(lookupIndex + 1)) {
    const id = computeMsgId(english, '');
    const found = LANGUAGES.map(
      (language) => `${language}: ${systemLink[language].get(id) ?? '-'}`,
    ).join(' | ');
    console.log(`${english} => ${found}`);
  }
  process.exit(0);
}

const source = readJson(path.join(localeDir, 'messages.json'), null);
if (!source) {
  console.error(
    'Missing src/locale/messages.json. Run "ng extract-i18n --format json --output-path src/locale" first.',
  );
  process.exit(1);
}

for (const language of LANGUAGES) {
  const manual = readJson(path.join(localeDir, 'manual', `${language}.json`), {});
  const translations = {};
  const missing = {};
  let fromSystemLink = 0;
  let fromManual = 0;

  for (const [id, english] of Object.entries(source.translations)) {
    const systemLinkText = systemLink[language].get(id);
    if (systemLinkText !== undefined) {
      translations[id] = systemLinkText;
      fromSystemLink += 1;
    } else if (manual[english] !== undefined) {
      translations[id] = manual[english];
      fromManual += 1;
    } else {
      missing[id] = english;
    }
  }

  fs.writeFileSync(
    path.join(localeDir, `messages.${language}.json`),
    `${JSON.stringify({ locale: language, translations }, null, 2)}\n`,
  );
  const missingFile = path.join(localeDir, `missing.${language}.json`);
  if (Object.keys(missing).length > 0) {
    fs.writeFileSync(missingFile, `${JSON.stringify(missing, null, 2)}\n`);
  } else if (fs.existsSync(missingFile)) {
    fs.rmSync(missingFile);
  }
  console.log(
    `${language}: ${fromSystemLink} from SystemLink, ${fromManual} manual, ${Object.keys(missing).length} missing`,
  );
}
