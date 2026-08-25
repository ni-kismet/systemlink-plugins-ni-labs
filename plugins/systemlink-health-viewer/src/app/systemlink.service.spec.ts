import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { HealthConfigurationError, SystemLinkService } from './systemlink.service';

describe('SystemLinkService', () => {
  let httpClient: jasmine.SpyObj<{ get: jasmine.Spy; request: jasmine.Spy }>;
  let service: SystemLinkService;

  beforeEach(() => {
    httpClient = jasmine.createSpyObj('HttpClient', ['get', 'request']);
    service = new SystemLinkService(httpClient as any);
  });

  it('returns unique discovered service names', async () => {
    configureHttp({
      user: { entitlements: { SystemLink_Edition_Base: true } }
    }, [
      createTest('Service A', '/a'),
      createTest('Service A', '/b'),
      createTest('Service B', '/c')
    ]);

    const services = await firstValueFrom(service.getDiscoveredServices());
    expect(services).toEqual(['Service A', 'Service B']);
  });

  it('uses enabled entries from the SDK entitlement map', async () => {
    configureHttp({
      user: {
        entitlements: {
          SystemLink_Edition_Base: true,
          SystemLink_Edition_Enterprise: false
        }
      }
    }, [
      createTest('Base', '/base', ['SystemLink_Edition_Base']),
      createTest('Enterprise', '/enterprise', ['SystemLink_Edition_Enterprise'])
    ]);

    const health = await firstValueFrom(service.getServiceHealth());

    expect(health.map(item => item.endpoint)).toEqual(['/base']);
  });

  it('defaults to Enterprise checks when auth cannot be resolved', async () => {
    httpClient.get.and.callFake((url: string) => {
      if (url === '/niauth/v1/auth') {
        return throwError(() => new HttpErrorResponse({ status: 401 }));
      }
      if (url === 'assets/test-mapping.json') {
        return of({
          tests: [createTest('Enterprise', '/enterprise', ['SystemLink_Edition_Enterprise'])]
        });
      }
      if (url === '/niserviceregistry/v1/services') {
        return of(new HttpResponse({ status: 200, body: { services: [] } }));
      }
      return throwError(() => new Error(`Unexpected GET ${url}`));
    });
    httpClient.request.and.returnValue(
      of(new HttpResponse({ status: 200, body: 'ok' }))
    );

    const health = await firstValueFrom(service.getServiceHealth());

    expect(health.map(item => item.endpoint)).toEqual(['/enterprise']);
  });

  it('leaves registry state unknown when a service is not registered', async () => {
    configureHttp({
      user: { entitlements: { SystemLink_Edition_Base: true } }
    }, [createTest('Configured', '/configured')], {
      services: [{ name: 'DifferentService', status: 'LIVE' }]
    });

    const health = await firstValueFrom(service.getServiceHealth());

    expect(health[0].registryService).toBeNull();
    expect(health[0].registryState).toBeNull();
    expect(health[0].functional).toBeTrue();
  });

  it('preserves the complete response alongside the table preview', async () => {
    const response = 'x'.repeat(700);
    configureHttp({
      user: { entitlements: { SystemLink_Edition_Base: true } }
    }, [createTest('Configured', '/configured')], undefined, response);

    const health = await firstValueFrom(service.getServiceHealth());

    expect(health[0].output).toBe(`${'x'.repeat(500)}...`);
    expect(health[0].fullOutput).toBe(response);
  });

  it('honors HTTP-date Retry-After values', () => {
    const now = Date.parse('Tue, 25 Aug 2026 15:00:00 GMT');
    const retryAt = now + 5000;
    spyOn(Date, 'now').and.returnValue(now);
    const error = new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'Retry-After': new Date(retryAt).toUTCString() })
    });

    const delay = (service as any).getRetryDelayMs(error, 1);

    expect(delay).toBe(retryAt - now);
  });

  it('reports a configuration error when the mapping cannot be loaded', async () => {
    httpClient.get.and.callFake((url: string) => {
      if (url === '/niauth/v1/auth') {
        return of(new HttpResponse({
          status: 200,
          body: { user: { entitlements: { SystemLink_Edition_Base: true } } }
        }));
      }
      if (url === 'assets/test-mapping.json') {
        return throwError(() => new Error('mapping unavailable'));
      }
      return throwError(() => new Error(`Unexpected GET ${url}`));
    });

    try {
      await firstValueFrom(service.getServiceHealth());
      fail('Expected a HealthConfigurationError');
    } catch (error) {
      expect(error).toEqual(jasmine.any(HealthConfigurationError));
    }
  });

  function configureHttp(
    authBody: unknown,
    tests: Array<Record<string, unknown>>,
    registryBody: unknown = { services: [] },
    responseBody = 'ok'
  ): void {
    httpClient.get.and.callFake((url: string) => {
      if (url === '/niauth/v1/auth') {
        return of(new HttpResponse({ status: 200, body: authBody }));
      }
      if (url === 'assets/test-mapping.json') {
        return of({ tests });
      }
      if (url === '/niserviceregistry/v1/services') {
        return of(new HttpResponse({ status: 200, body: registryBody }));
      }
      return throwError(() => new Error(`Unexpected GET ${url}`));
    });
    httpClient.request.and.returnValue(
      of(new HttpResponse({ status: 200, body: responseBody }))
    );
  }

  function createTest(
    serviceName: string,
    endpoint: string,
    entitlements?: string[]
  ): Record<string, unknown> {
    return {
      serviceName,
      testName: `${serviceName} test`,
      command: 'GET',
      endpoint,
      entitlements
    };
  }
});