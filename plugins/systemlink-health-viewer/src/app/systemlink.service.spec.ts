import { firstValueFrom, throwError } from 'rxjs';
import { SystemLinkService } from './systemlink.service';

describe('SystemLinkService', () => {
  let httpClient: jasmine.SpyObj<{ get: jasmine.Spy; request: jasmine.Spy }>;
  let service: SystemLinkService;

  beforeEach(() => {
    httpClient = jasmine.createSpyObj('HttpClient', ['get', 'request']);
    httpClient.get.and.returnValue(throwError(() => new Error('registry unavailable')));
    service = new SystemLinkService(httpClient as any);
  });

  it('returns unique discovered service names', async () => {
    const services = await firstValueFrom(service.getDiscoveredServices());
    expect(services.length).toBe(new Set(services).size);
  });
});