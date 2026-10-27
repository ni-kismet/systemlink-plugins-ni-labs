import assert from 'node:assert/strict';
import { computeMsgId } from '@angular/compiler';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const pluginDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syncScript = path.join(pluginDirectory, 'scripts', 'i18n-sync.mjs');
const localeDirectory = path.join(pluginDirectory, 'src', 'locale');
const languages = ['de', 'fr', 'ja', 'zh'];
const placeholderTokens = value => [...value.matchAll(/\{\$[A-Z0-9_]+\}/g)].map(match => match[0]).sort();
let server;
let serverUrl;

before(async () => {
  server = createServer((_request, response) => {
    response.writeHead(503).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('i18n sync preserves every locale when SystemLink translations are unavailable', async () => {
  const fixture = await createFixture({ '1': 'Manual' }, { 'Manual': 'Manual translation' });
  const originalFiles = await snapshotCatalogs(fixture);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [syncScript, '--server', serverUrl],
      { cwd: fixture.directory }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  try {
    const currentFiles = await snapshotCatalogs(fixture);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /refusing to overwrite its locale file/);
    assert.deepEqual(currentFiles, originalFiles);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('i18n sync rejects a nonempty partial harvest before writing any locale', async () => {
  configureTranslationResponses({ '999999999999': 'Unrelated native translation' });
  const fixture = await createFixture(
    {
      [computeMsgId('Missing native', '')]: 'Missing native',
      [computeMsgId('Manual', '')]: 'Manual'
    },
    { Manual: 'Manual translation' }
  );
  const originalFiles = await snapshotCatalogs(fixture);
  try {
    const result = await runSync(fixture);
    const currentFiles = await snapshotCatalogs(fixture);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /untranslated messages/);
    assert.match(result.stderr, /Refusing to overwrite locale files/);
    assert.deepEqual(currentFiles, originalFiles);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('i18n sync preserves manual fallback and native-translation precedence', async () => {
  const manualId = computeMsgId('Manual', '');
  const nativeId = computeMsgId('Native wins', '');
  configureTranslationResponses({ [nativeId]: 'SystemLink native translation' });
  const fixture = await createFixture(
    {
      [manualId]: 'Manual',
      [nativeId]: 'Native wins'
    },
    {
      Manual: 'Manual translation',
      'Native wins': 'Manual fallback'
    }
  );
  try {
    const result = await runSync(fixture);
    assert.equal(result.code, 0, result.stderr);
    for (const language of languages) {
      const catalog = JSON.parse(
        await readFile(path.join(fixture.localeDirectory, `messages.${language}.json`), 'utf8')
      );
      assert.deepEqual(catalog.translations, {
        [manualId]: 'Manual translation',
        [nativeId]: 'SystemLink native translation'
      });
    }
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

async function createFixture(sourceTranslations, manualTranslations) {
  const directory = await mkdtemp(path.join(pluginDirectory, 'scripts', '.i18n-sync-test-'));
  const localeDirectory = path.join(directory, 'src', 'locale');
  await mkdir(path.join(localeDirectory, 'manual'), { recursive: true });
  await writeFile(
    path.join(localeDirectory, 'messages.json'),
    JSON.stringify({ locale: 'en-US', translations: sourceTranslations })
  );
  await Promise.all(languages.map(async language => {
    await writeFile(
      path.join(localeDirectory, 'manual', `${language}.json`),
      JSON.stringify(manualTranslations)
    );
    await writeFile(
      path.join(localeDirectory, `messages.${language}.json`),
      `preserve-${language}`
    );
  }));
  return { directory, localeDirectory };
}

async function snapshotCatalogs(fixture) {
  return Promise.all(
    languages.map(language => readFile(path.join(fixture.localeDirectory, `messages.${language}.json`)))
  );
}

function runSync(fixture) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [syncScript, '--server', serverUrl],
      { cwd: fixture.directory }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function configureTranslationResponses(translations) {
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    if (request.url === '/webapps/') {
      response.writeHead(200).end('<script src="main-ABC.js"></script>');
    } else if (request.url === '/webapps/main-ABC.js') {
      response.writeHead(200).end(
        'getDe:()=>import("./chunk-ABC.js"),getFr:()=>import("./chunk-ABC.js"),' +
        'getJa:()=>import("./chunk-ABC.js"),getZh:()=>import("./chunk-ABC.js")'
      );
    } else if (request.url === '/webapps/chunk-ABC.js') {
      response.writeHead(200).end(JSON.stringify(translations));
    } else {
      response.writeHead(503).end();
    }
  });
}

test('locale catalogs retain source keys and interpolation placeholders', async () => {
  const source = JSON.parse(await readFile(path.join(localeDirectory, 'messages.json'), 'utf8')).translations;
  const sourceIds = Object.keys(source).sort();

  for (const language of ['de', 'fr', 'ja', 'zh']) {
    const catalog = JSON.parse(
      await readFile(path.join(localeDirectory, `messages.${language}.json`), 'utf8')
    );
    assert.equal(catalog.locale, language);
    assert.deepEqual(Object.keys(catalog.translations).sort(), sourceIds, `${language} source keys`);
    for (const [id, english] of Object.entries(source)) {
      assert.deepEqual(
        placeholderTokens(catalog.translations[id]),
        placeholderTokens(english),
        `${language}/${id} placeholders`
      );
    }

    const manual = JSON.parse(
      await readFile(path.join(localeDirectory, 'manual', `${language}.json`), 'utf8')
    );
    for (const [english, translated] of Object.entries(manual)) {
      assert.ok(Object.values(source).includes(english), `${language} manual key: ${english}`);
      assert.deepEqual(
        placeholderTokens(translated),
        placeholderTokens(english),
        `${language} manual placeholders: ${english}`
      );
    }
  }
});
