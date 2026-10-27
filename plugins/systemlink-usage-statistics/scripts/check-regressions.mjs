import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const angularStub = {
  Component: () => target => target,
  ElementRef: class {},
  Inject: () => () => {},
  Injectable: () => target => target,
  LOCALE_ID: 'en',
  ViewChild: () => () => {},
};

function loadTypeScript(relativePath, imports = {}) {
  const source = fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const requireStub = id => imports[id] ?? (id === '@angular/core' ? angularStub : {});
  new Function('require', 'module', 'exports', javascript)(requireStub, module, module.exports);
  return module.exports;
}

const contextModule = loadTypeScript('src/app/core/systemlink/systemlink-context.service.ts');
const { SystemLinkContextService } = contextModule;
const { CurrentUserService } = loadTypeScript('src/app/core/systemlink/current-user.service.ts', {
  './systemlink-context.service': contextModule,
});
const { TagStatisticsService } = loadTypeScript('src/app/core/systemlink/tag-statistics.service.ts', {
  './systemlink-context.service': contextModule,
});
const { UsageMetricsService } = loadTypeScript('src/app/core/systemlink/usage-metrics.service.ts', {
  './systemlink-context.service': contextModule,
});
globalThis.$localize ??= (strings, ...values) => strings.reduce(
  (text, part, index) => text + part + (values[index] ?? ''),
  '',
);
const { HomePageComponent } = loadTypeScript('src/app/features/home/home-page.component.ts', {
  '../../core/state/app-view-state.service': {},
  '../../core/systemlink/current-user.service': {},
  '../../core/systemlink/systemlink-context.service': {},
  '../../core/systemlink/tag-statistics.service': {},
  '../../core/systemlink/usage-metrics.service': { INSTANCE_WIDE_METRIC_KEYS: new Set() },
  '../../shared/states/view-state.model': {},
});

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const withFetch = async (handler, action) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
};
const context = () => ({
  buildApiUrl: path => path,
  buildRequestInit: init => init,
  isServiceInstalled: async () => true,
});

test('Super User wildcard statements without a resource restriction are administrators', () => {
  const service = new CurrentUserService({});
  assert.equal(service.payloadIndicatesAdmin({
    policies: [{ statements: [{ actions: ['*'], workspace: '*' }] }],
  }), true);
});

test('workspace lookups share one in-flight request', async () => {
  const service = new SystemLinkContextService();
  service.buildApiUrl = () => '/niuser/v1/workspaces';
  service.extractWorkspaceName = () => 'Default';
  let requests = 0;
  await withFetch(async () => {
    requests += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return response({ workspaces: [{ id: 'default-id', name: 'Default' }] });
  }, async () => {
    assert.deepEqual(await Promise.all([
      service.resolveWorkspaceId(),
      service.resolveWorkspaceId(),
    ]), ['default-id', 'default-id']);
  });
  assert.equal(requests, 1);
});

test('registered non-LIVE optional services remain visible', async () => {
  const service = new SystemLinkContextService();
  service.installedServicesCache = Promise.resolve(new Set(['DataFrame']));
  assert.equal(await service.isServiceInstalled('DataFrame'), true);
  assert.equal(await service.isServiceInstalled('Locations'), false);
});

test('history reads and writes stop when the current workspace cannot be resolved', async () => {
  let requests = 0;
  const service = new TagStatisticsService({ resolveWorkspaceId: async () => null });
  await withFetch(async () => {
    requests += 1;
    return response({});
  }, async () => {
    await service.writeAllMetrics([{ key: 'files', value: 3 }], new Date().toISOString());
    assert.deepEqual(await service.readTagHistory('files'), []);
  });
  assert.equal(requests, 0);
});

test('administrator history is written once from the completed model, never a progressive partial', async () => {
  const component = Object.create(HomePageComponent.prototype);
  const partial = { metrics: [{ key: 'files', value: 1 }], unavailable: [], refreshedAt: 'partial' };
  const complete = { metrics: [{ key: 'files', value: 5 }], unavailable: [], refreshedAt: 'complete' };
  let finishLoad;
  const gate = new Promise(resolve => { finishLoad = resolve; });
  let writes = 0;
  let rateLoads = 0;
  Object.assign(component, {
    dataService: {
      load: async onPartial => {
        onPartial(partial.metrics);
        await gate;
        return complete;
      },
    },
    isSuperUser: true,
    selectedWorkspaceId: '',
    state: {},
    loadSeq: 0,
    historyRecordedSeq: 0,
    buildTreeNodes: () => [],
    applySearchFilter: () => {},
    writeAllTags: async model => {
      assert.equal(model, complete);
      writes += 1;
    },
    queueRateLoad: metrics => {
      assert.equal(metrics, complete.metrics);
      rateLoads += 1;
    },
  });
  const loading = component.reload();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 0);
  finishLoad();
  await loading;
  component.recordHistoryOnce(complete, 1);
  assert.equal(writes, 1);
  assert.equal(rateLoads, 1);
});

test('failed later DataFrame pages invalidate counts and sizing metrics', async () => {
  const service = new UsageMetricsService(context());
  const responses = [
    response({ tables: [{ rowCount: 10, columnCount: 3 }], continuationToken: 'next' }),
    response({}, 403),
  ];
  await withFetch(async () => responses.shift(), async () => {
    for (const key of ['data-tables', 'max-data-table-rows', 'max-data-table-columns']) {
      const outcome = await service.probeCount({
        key,
        label: key,
        detail: '',
        requests: [],
      }, null);
      assert.equal(outcome.attempt, null);
      assert.equal(outcome.unauthorized, true);
    }
  });
});

test('system summary authorization failures do not become zero totals', async () => {
  const service = new UsageMetricsService(context());
  service.getSystemsSummaryCounts = async () => ({
    total: null,
    connected: null,
    disconnected: null,
    virtual: null,
    unauthorized: true,
  });
  const outcome = await service.probeCount({
    key: 'systems',
    label: 'Systems',
    detail: '',
    requests: [],
  }, null);
  assert.equal(outcome.attempt, null);
  assert.equal(outcome.unauthorized, true);
});

test('template paging preserves 401/403 as Unauthorized', async () => {
  const service = new UsageMetricsService(context());
  await withFetch(async () => response({}, 403), async () => {
    const outcome = await service.probeCount({
      key: 'work-item-templates',
      label: 'Templates',
      detail: '',
      requests: [],
    }, null);
    assert.equal(outcome.attempt, null);
    assert.equal(outcome.unauthorized, true);
  });
});

test('a throwing count probe does not fail the dashboard load', async () => {
  const service = new UsageMetricsService(context());
  service.loadWorkItemTypeMetrics = async () => { throw new TypeError('mock network failure'); };
  const partialUpdates = [];
  const model = await withFetch(async url => {
    const { pathname } = new URL(url, 'http://localhost');
    if (pathname === '/niuser/v1/users/query' || pathname.startsWith('/niroutine/')) {
      throw new TypeError('mock network failure');
    }
    if (pathname === '/nitestmonitor/v2/query-results') return response({ count: 7 });
    if (pathname === '/niworkitem/v1/query-workitem-templates') return response({ workItemTemplates: [] });
    if (pathname === '/niworkitem/v1/query-workflows' || pathname === '/niworkorder/v1/query-workflows') {
      return response({ workflows: [] });
    }
    if (pathname === '/niworkitem/v1/query-workitems') return response({ workItems: [] });
    if (pathname === '/niworkitem/v1/workitemtypes') return response({ types: [] });
    return response({ count: 1 });
  }, () => service.load(metrics => partialUpdates.push(metrics)));

  const metrics = new Map(model.metrics.map(metric => [metric.key, metric]));
  for (const key of ['users', 'enabled-routines']) {
    assert.equal(metrics.get(key)?.value, null);
    assert.equal(metrics.get(key)?.status, 'unavailable');
    assert.equal(metrics.get(key)?.source, 'Request failed');
  }
  assert.equal(metrics.get('work-items-total')?.value, null);
  assert.equal(metrics.get('work-items-total')?.status, 'unavailable');
  assert.equal(metrics.get('work-items-total')?.source, 'Request failed');
  assert.equal(metrics.get('test-results')?.value, 7);
  assert.equal(metrics.get('test-results')?.status, 'ok');
  assert.ok(partialUpdates.length > 0, 'partial updates remain available');
});

test('partially failed combined workflow scans are unavailable and are not persisted', async () => {
  const service = new UsageMetricsService(context());
  await withFetch(async (url, options) => {
    const { pathname } = new URL(url, 'http://localhost');
    if (pathname === '/niworkitem/v1/query-workflows') {
      const body = JSON.parse(options?.body ?? '{}');
      return body.continuationToken ? response({}, 403) : response({
        workflows: [{ id: 'workflow-1' }],
        continuationToken: 'next',
      });
    }
    return response({ workflows: [] });
  }, async () => {
    const outcome = await service.probeCount({
      key: 'work-flows',
      label: 'Workflows',
      detail: '',
      requests: [],
    }, null);
    assert.equal(outcome.attempt, null);
    assert.equal(outcome.unauthorized, true);

    let persisted = null;
    const component = Object.create(HomePageComponent.prototype);
    component.tagStatisticsService = {
      writeAllMetrics: async metrics => { persisted = metrics; },
    };
    await component.writeAllTags({
      metrics: [{
        key: 'work-flows',
        value: null,
        status: 'unauthorized',
      }],
      refreshedAt: new Date().toISOString(),
    });
    assert.deepEqual(persisted, []);
  });
});

test('default count parsing remains bound to the service', async () => {
  const service = new UsageMetricsService(context());
  await withFetch(async (_url, options) => response(
    options.method === 'POST' ? { totalRecords: 123 } : { totalCount: '123' },
  ), async () => {
    for (const method of ['GET', 'POST']) {
      const outcome = await service.probeCount({
        key: 'count-parser',
        label: 'Count',
        detail: '',
        requests: [{ method, path: '/count' }],
      }, null);
      assert.equal(outcome.attempt?.value, 123);
    }
  });
});

test('system workspace projections count wrapped state rows', async () => {
  const service = new UsageMetricsService(context());
  await withFetch(async () => response({
    data: [{ data: { state: 'CONNECTED' } }, { data: { state: 'DISCONNECTED' } }],
  }), async () => {
    assert.deepEqual(await service.fetchWorkspaceSystemsCounts('workspace-id'), {
      total: 2,
      connected: 1,
      disconnected: 1,
      virtual: 0,
      unauthorized: false,
    });
  });
});

test('paged scans fail closed when the continuation cap is reached', async () => {
  const service = new UsageMetricsService(context());
  let pages = 0;
  await withFetch(async () => {
    pages += 1;
    return response({ rows: [{ id: String(pages) }], continuationToken: String(pages) });
  }, async () => {
    const result = await service.countPagedCollectionByContinuationToken({
      path: '/workflows',
      collectionKey: 'rows',
    });
    assert.deepEqual(result, { total: null, unauthorized: false });
  });
  assert.equal(pages, 500);
});

test('work-item counts and breakdowns fail closed when continuation remains at the cap', async () => {
  const service = new UsageMetricsService(context());
  let pages = 0;
  await withFetch(async url => {
    if (url === '/niworkitem/v1/workitemtypes') return response({ types: [{ type: 'Test' }] });
    pages += 1;
    return response({ workItems: [{ type: 'Test' }], continuationToken: String(pages) });
  }, async () => {
    const result = await service.countWorkItemsByTypeViaPagination(null);
    assert.equal(result.total, null);
    assert.deepEqual([...result.counts], []);
    assert.equal(result.unauthorized, false);
  });
  assert.equal(pages, 500);
});

test('Grafana search results at the endpoint limit are unavailable rather than truncated', async () => {
  const service = new UsageMetricsService(context());
  let searches = 0;
  await withFetch(async url => {
    if (url.endsWith('/dashboardhost/login')) return new Response('', { status: 200 });
    searches += 1;
    return response(Array.from({ length: 5000 }, () => ({})));
  }, async () => {
    const result = await service.countGrafanaDashboardsStrict(null);
    assert.equal(result.attempt, null);
    assert.equal(result.unauthorized, false);
  });
  assert.equal(searches, 1);
});

test('routine v1 fallback does not double-count the v2 inventory', async () => {
  const service = new UsageMetricsService(context());
  await withFetch(async url => {
    const path = new URL(url, 'http://localhost').pathname;
    const skip = new URL(url, 'http://localhost').searchParams.get('skip');
    if (skip !== '0') return response({ routines: [] });
    return response({
      routines: [{ id: 'same-routine', enabled: true, actions: [{ type: 'ALARM' }] }],
    });
  }, async () => {
    assert.deepEqual(await service.countRoutineStatusesStrict(null), {
      enabled: 1,
      disabled: 0,
      alarms: 1,
      unauthorized: false,
    });
  });
});

test('package totals are unavailable when any feed fails', async () => {
  const service = new UsageMetricsService(context());
  await withFetch(async url => {
    if (url === '/nifeed/v1/feeds') return response({ feeds: [{ id: 'ok' }, { id: 'denied' }] });
    if (url.includes('/denied/')) return response({}, 403);
    return response({ packages: [{ id: 'one' }] });
  }, async () => {
    assert.deepEqual(await service.countPackagesAcrossFeeds(null), {
      total: null,
      unauthorized: true,
    });
  });
});

test('locale catalogs cover all extracted messages and preserve interpolation placeholders', () => {
  const source = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'src/locale/messages.json'), 'utf8')).translations;
  const mainSource = fs.readFileSync(path.join(pluginRoot, 'src/main.ts'), 'utf8');
  const languageSource = fs.readFileSync(path.join(pluginRoot, 'src/app/core/utils/language.utils.ts'), 'utf8');
  const placeholders = text => [...text.matchAll(/\{\$([^}]+)\}/g)].map(match => match[1]).sort();
  const loaderLocales = name => {
    const start = mainSource.indexOf(`const ${name}:`);
    const end = mainSource.indexOf('\n};', start);
    return [...mainSource.slice(start, end).matchAll(/^\s{2}([a-z]{2}):/gm)]
      .map(match => match[1])
      .sort();
  };
  const supportedMatch = /const SYSTEMLINK_LANGUAGES = \[([^\]]+)\]/.exec(languageSource);
  assert.ok(supportedMatch);
  const supported = [...supportedMatch[1].matchAll(/'([a-z]{2})'/g)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(supported, ['de', 'en', 'fr', 'ja', 'zh']);
  assert.deepEqual(loaderLocales('translationLoaders'), ['de', 'fr', 'ja', 'zh']);
  assert.deepEqual(loaderLocales('localeDataLoaders'), ['de', 'fr', 'ja', 'zh']);
  for (const locale of ['de', 'fr', 'ja', 'zh']) {
    const catalog = JSON.parse(fs.readFileSync(path.join(pluginRoot, `src/locale/messages.${locale}.json`), 'utf8'));
    assert.equal(catalog.locale, locale);
    assert.deepEqual(Object.keys(catalog.translations).sort(), Object.keys(source).sort(), `${locale} message keys`);
    for (const [id, message] of Object.entries(source)) {
      assert.deepEqual(placeholders(catalog.translations[id]), placeholders(message), `${locale} placeholders for ${id}`);
    }
  }
});

test('saved regional and legacy language preferences resolve to supported language keys', () => {
  const { getSystemLinkLanguage } = loadTypeScript('src/app/core/utils/language.utils.ts');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: key => key === 'language' ? 'invalid-locale' : key === 'skyline-api-languages' ? 'ja-JP,fr' : null,
      },
    });
    assert.equal(getSystemLinkLanguage(), 'ja');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: key => key === 'language' ? 'de-DE' : null },
    });
    assert.equal(getSystemLinkLanguage(), 'de');
  } finally {
    if (originalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalStorage);
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('incomplete empty and partial locale harvests preserve every existing catalog', () => {
  const fixtureRoot = path.join(pluginRoot, '.i18n-regression-fixture');
  const source = path.join(pluginRoot, 'scripts/i18n-sync.mjs');
  const preload = path.join(fixtureRoot, 'mock-fetch.mjs');
  const fixtureLocales = path.join(fixtureRoot, 'src/locale');
  const originalCatalogs = new Map();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureLocales, 'manual'), { recursive: true });

  try {
    fs.writeFileSync(path.join(fixtureLocales, 'messages.json'), JSON.stringify({
      translations: { '111': 'One', '222': 'Two' },
    }));
    for (const locale of ['de', 'fr', 'ja', 'zh']) {
      const file = path.join(fixtureLocales, `messages.${locale}.json`);
      const original = JSON.stringify({ locale, translations: { preserve: `existing-${locale}` } }, null, 2) + '\n';
      fs.writeFileSync(file, original);
      originalCatalogs.set(locale, original);
      fs.writeFileSync(
        path.join(fixtureLocales, 'manual', `${locale}.json`),
        JSON.stringify({
          One: `manual-${locale}`,
          ...(locale === 'zh' ? {} : { Two: `manual-two-${locale}` }),
        }),
      );
    }
    fs.writeFileSync(preload, `
const mode = process.env.RESPONSE_MODE;
globalThis.fetch = async input => {
  const url = String(input);
  if (mode === 'empty') return new Response('<html></html>');
  if (url.endsWith('/')) {
    return new Response(url.includes('/webapps/') ? 'main-AAAA.js' : '<html></html>');
  }
  if (url.endsWith('/main-AAAA.js')) {
    return new Response('getDe:()=>import("./chunk-DE.js"),getFr:()=>import("./chunk-FR.js"),getJa:()=>import("./chunk-JA.js"),getZh:()=>import("./chunk-ZH.js")');
  }
  if (/chunk-(DE|FR|JA|ZH)\\.js$/.test(url)) return new Response('"111":"system translation"');
  return new Response('');
};
`);

    for (const mode of ['empty', 'partial']) {
      const result = spawnSync(process.execPath, [source], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
          RESPONSE_MODE: mode,
        },
      });
      assert.equal(result.status, 1, `${mode} harvest must fail closed: ${result.stderr}`);
      assert.match(result.stderr, /Refusing to update locale catalogs/);
      for (const [locale, original] of originalCatalogs) {
        assert.equal(fs.readFileSync(path.join(fixtureLocales, `messages.${locale}.json`), 'utf8'), original);
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
