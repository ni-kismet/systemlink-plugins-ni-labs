import '@angular/compiler';
import '@angular/localize/init';
import { clearTranslations, loadTranslations } from '@angular/localize';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(fileURLToPath(new URL('.client-test-', import.meta.url)));
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

try {
  const entry = fileURLToPath(new URL('../src/app/core/systemlink/webapp-home-data.service.ts', import.meta.url));
  const output = `${directory}/service.mjs`;
  await build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
  });
  globalThis.window = { location: { origin: 'https://systemlink.invalid', hostname: 'systemlink.invalid' } };
  const { WebappHomeDataService } = await import(pathToFileURL(output).href);
  const service = new WebappHomeDataService({
    origin: window.location.origin,
    buildRequestInit: (init) => ({ ...init, credentials: 'include' }),
  }, 'de');
  const delays = [];
  service.delay = async (ms) => { delays.push(ms); };

  for (const [path, query, payload] of [
    ['/nisysmgmt/v1/query-systems', () => service.queryAllSystems('id != null', 'new(id)'), { data: [] }],
    ['/nitestmonitor/v2/query-results', () => service.queryTestResults({ take: 1 }), { results: [] }],
  ]) {
    const bodies = [];
    const statuses = [429, 503, 200];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      assert.equal(new URL(request.url).pathname, path);
      assert.equal(request.method, 'POST');
      assert.equal(request.credentials, 'include');
      assert.equal(request.headers.get('Content-Type'), 'application/json');
      bodies.push(await request.text());
      return new Response(JSON.stringify(payload), {
        status: statuses.shift(),
        headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
      });
    };
    await query();
    assert.equal(bodies.length, 3);
    assert.deepEqual(bodies, [bodies[0], bodies[0], bodies[0]]);
    assert.equal(JSON.parse(bodies[0]).take, path.includes('nisysmgmt') ? 1000 : 1);
    assert.equal(service.activeRequests, 0);
  }
  assert.equal(delays.length, 4);
  assert.ok(delays.every((ms) => ms >= 2000 && ms < 2250));

  for (const payload of [{ data: [{ id: 'station-1' }] }, [{ data: { id: 'station-1' } }]]) {
    const skips = [];
    globalThis.fetch = async (request) => {
      const body = await request.json();
      skips.push(body.skip);
      return Response.json(body.skip === 0 ? payload : { data: [] });
    };
    assert.deepEqual(await service.queryAllSystems('id != null', 'new(id)'), [{ id: 'station-1' }]);
    assert.deepEqual(skips, [0, 1000]);
  }

  globalThis.fetch = async () => Response.json({}, { status: 400 });
  assert.equal(await service.detectVirtualNodeSupport(), false);
  await assert.rejects(service.queryAllSystems('id != null', 'new(id)'), /query-systems failed \(400\)/);
  assert.equal((await service.queryTestResults({ take: 1 })).response.status, 400);

  for (const [status, expectedAttempts] of [[400, 1], [429, 7], [503, 7]]) {
    let attempts = 0;
    globalThis.fetch = async (request) => {
      assert.equal(await request.text(), '{"take":1}');
      attempts++;
      return new Response('{}', { status });
    };
    const response = await service.fetchWithRetry(
      new Request('https://systemlink.invalid/query', { method: 'POST', body: '{"take":1}' }),
      {},
    );
    assert.equal(response.status, status);
    assert.equal(attempts, expectedAttempts);
    assert.equal(service.activeRequests, 0);
  }

  const networkError = new TypeError('Network failure');
  globalThis.fetch = async () => { throw networkError; };
  await assert.rejects(service.fetchWithRetry('https://systemlink.invalid/query', {}), /Network failure/);
  await assert.rejects(service.queryAllSystems('id != null', 'new(id)'), (error) => error === networkError);
  await assert.rejects(service.queryTestResults({ take: 1 }), (error) => error === networkError);
  assert.equal(service.activeRequests, 0);

  loadTranslations({
    '7827499803604543106': 'query-systems fehlgeschlagen ({$status})',
    '6880065366354456535': 'query-results fehlgeschlagen ({$status})',
  });
  globalThis.fetch = async () => new Response('{}', { status: 400 });
  await assert.rejects(service.queryAllSystems('id != null', 'new(id)'), /query-systems fehlgeschlagen \(400\)/);
  await assert.rejects(service.queryResultIdentities(new Date(0), new Date()), /query-results fehlgeschlagen \(400\)/);
  clearTranslations();

  let active = 0;
  let peak = 0;
  globalThis.fetch = async (request) => {
    active++;
    peak = Math.max(peak, active);
    await request.text();
    active--;
    return new Response('{}');
  };
  await Promise.all(Array.from({ length: 12 }, () => service.fetchWithRetry(
    'https://systemlink.invalid/query',
    { method: 'POST', body: '{}' },
  )));
  assert.equal(peak, 6);
  assert.equal(service.activeRequests, 0);
  assert.equal(service.requestWaiters.length, 0);
  console.log('SystemLink SDK retry, request body, endpoint, header, credential and failure checks passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
  await rm(directory, { recursive: true, force: true });
}
