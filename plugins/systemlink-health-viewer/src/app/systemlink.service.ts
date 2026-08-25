import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, of, throwError, timer } from 'rxjs';
import { catchError, map, mergeMap, retryWhen, switchMap, timeout, toArray } from 'rxjs/operators';

export interface EndpointHealth {
  service: string;
  method: 'GET' | 'POST';
  endpoint: string;
  registryService: string | null;
  registryState: string | null;
  latencyMs: number | null;
  responseCode: number | null;
  output: string;
  fullOutput: string;
  functional: boolean;
  authRestricted?: boolean;
  body?: unknown;
}

export interface AppConfig {
  endpoint: string;
  appName: string;
  appVersion: string;
  appDisplayVersion: string;
}

export class HealthConfigurationError extends Error {
  constructor() {
    super('Unable to load health-check configuration.');
    this.name = 'HealthConfigurationError';
  }
}

interface EndpointCheck {
  service: string;
  method: 'GET' | 'POST';
  endpoint: string;
  body?: unknown;
  requireRegistry?: boolean;
  registryOnly?: boolean;
}

interface RegistryServiceMatch {
  name: string | null;
  status: string | null;
}

interface RegistryMatchResult {
  matches: Map<string, RegistryServiceMatch>;
  hasResponse: boolean;
}

interface TestMappingEntry {
  serviceName: string;
  testName: string;
  command: 'GET' | 'POST';
  endpoint: string;
  buffer?: unknown;
  entitlements?: string[];
  requireRegistry?: boolean;
  enabled?: boolean;
}

interface TestMappingDocument {
  tests: TestMappingEntry[];
}

@Injectable({
  providedIn: 'root'
})
export class SystemLinkService {
  // Keep API requests same-origin so the hosted webapp resolves endpoints relative to its location.
  private readonly baseUrl = '';
  private readonly authEndpoint = '/niauth/v1/auth';
  private readonly defaultEntitlement = 'SystemLink_Edition_Enterprise';

  private readonly serviceRegistryEndpoint = '/niserviceregistry/v1/services';
  private readonly requestTimeoutMs = 10000;
  private readonly requestConcurrency = 2;
  private readonly maxRetries = 3;
  private readonly initialRetryDelayMs = 750;
  private readonly testMappingPath = 'assets/test-mapping.json';

  private resolvedChecks: EndpointCheck[] | null = null;
  private resolvedEntitlements: string[] | null = null;

  constructor(private http: HttpClient) {}

  getServiceHealth(): Observable<EndpointHealth[]> {
    return this.resolveChecks().pipe(
      switchMap(checks =>
        this.fetchRegistryMatches().pipe(
          switchMap(registryResult => {
            const activeChecks = this.filterChecksByRegistryRequirement(
              checks,
              registryResult.matches,
              registryResult.hasResponse
            );

            return from(activeChecks).pipe(
              mergeMap(check => {
                const source = check.registryOnly
                  ? of(this.buildRegistryOnlyHealth(check))
                  : this.checkEndpoint(check);
                return source.pipe(
                  map(result => this.applyRegistryState(result, check, registryResult.matches))
                );
              }, this.requestConcurrency),
              toArray(),
              map(results => this.sortByConfiguredOrder(results, activeChecks)),
              catchError(error =>
                of(
                  activeChecks.map(check => ({
                    service: check.service,
                    method: check.method,
                    endpoint: check.endpoint,
                    registryService: this.getRegistryMatchForCheck(check, registryResult.matches).name,
                    registryState: this.getRegistryMatchForCheck(check, registryResult.matches).status,
                    latencyMs: null,
                    responseCode: null,
                    output: `Unexpected health-check failure: ${this.stringifyResponse(error)}`,
                    fullOutput: `Unexpected health-check failure: ${this.stringifyResponse(error, Number.POSITIVE_INFINITY)}`,
                    functional: false
                  }))
                )
              )
            );
          })
        )
      )
    );
  }

  getDiscoveredServices(): Observable<string[]> {
    return this.resolveChecks().pipe(map(checks => [...new Set(checks.map(check => check.service))]));
  }

  getAppConfig(): Observable<AppConfig> {
    return this.executeRequestWithRetry(() =>
      this.http.get<AppConfig>(`${this.baseUrl}/api/config`, { observe: 'response' })
    ).pipe(
      map(response => response.body ?? {
        endpoint: '',
        appName: 'SystemLink',
        appVersion: 'unknown',
        appDisplayVersion: 'unknown'
      } as AppConfig),
      catchError(() => of({
        endpoint: '',
        appName: 'SystemLink',
        appVersion: 'unknown',
        appDisplayVersion: 'unknown'
      } as AppConfig))
    );
  }

  private checkEndpoint(check: EndpointCheck): Observable<EndpointHealth> {
    const startedAt = this.nowMs();

    try {
      return this.executeRequestWithRetry(() =>
        this.http.request<any>(check.method, `${this.baseUrl}${check.endpoint}`, { observe: 'response', body: check.body })
      )
        .pipe(
          map(response => this.buildHealth(check, response.status, response.body, this.elapsedMs(startedAt))),
          catchError((error: unknown) => of(this.buildErrorHealth(check, error, this.elapsedMs(startedAt))))
        );
    } catch (error) {
      return of(this.buildErrorHealth(check, error, this.elapsedMs(startedAt)));
    }
  }

  private buildRegistryOnlyHealth(check: EndpointCheck): EndpointHealth {
    return {
      service: check.service,
      method: check.method,
      endpoint: check.endpoint,
      registryService: null,
      registryState: null,
      latencyMs: null,
      responseCode: null,
      output: '',
      fullOutput: '',
      functional: true,
      body: check.body
    };
  }

  private buildHealth(check: EndpointCheck, status: number, body: any, latencyMs: number, actualBody?: unknown): EndpointHealth {
    const output = this.stringifyResponse(body);
    const fullOutput = this.stringifyResponse(body, Number.POSITIVE_INFINITY);
    return {
      service: check.service,
      method: check.method,
      endpoint: check.endpoint,
      registryService: null,
      registryState: null,
      latencyMs,
      responseCode: status,
      output,
      fullOutput,
      functional: status >= 200 && status < 300,
      body: actualBody ?? check.body
    };
  }

  private buildErrorHealth(check: EndpointCheck, error: unknown, latencyMs: number): EndpointHealth {
    if (error instanceof HttpErrorResponse) {
      const isNetworkError = error.status === 0;
      const isAuthRestricted = error.status === 401 || error.status === 403;
      const output = isNetworkError
        ? `Network request failed (possible CORS, CSP, or connectivity issue) for ${check.method} ${check.endpoint}`
        : error.error
          ? this.stringifyResponse(error.error)
          : this.stringifyResponse(error.message);
      return {
        service: check.service,
        method: check.method,
        endpoint: check.endpoint,
        registryService: null,
        registryState: null,
        latencyMs,
        responseCode: error.status || null,
        output,
        fullOutput: isNetworkError
          ? output
          : error.error
            ? this.stringifyResponse(error.error, Number.POSITIVE_INFINITY)
            : this.stringifyResponse(error.message, Number.POSITIVE_INFINITY),
        functional: false,
        authRestricted: isAuthRestricted,
        body: check.body
      };
    }

    return {
      service: check.service,
      method: check.method,
      endpoint: check.endpoint,
      registryService: null,
      registryState: null,
      latencyMs,
      responseCode: null,
      output: this.stringifyResponse(error),
      fullOutput: this.stringifyResponse(error, Number.POSITIVE_INFINITY),
      functional: false,
      body: check.body
    };
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private elapsedMs(startedAt: number): number {
    return Math.round(this.nowMs() - startedAt);
  }

  private sortByConfiguredOrder(results: EndpointHealth[], checks: EndpointCheck[]): EndpointHealth[] {
    const indexMap = new Map(checks.map((check, index) => [`${check.service}|${check.endpoint}`, index]));
    return [...results].sort((a, b) => {
      const indexA = indexMap.get(`${a.service}|${a.endpoint}`) ?? Number.MAX_SAFE_INTEGER;
      const indexB = indexMap.get(`${b.service}|${b.endpoint}`) ?? Number.MAX_SAFE_INTEGER;
      return indexA - indexB;
    });
  }

  private resolveChecks(): Observable<EndpointCheck[]> {
    if (this.resolvedChecks) {
      return of(this.resolvedChecks);
    }

    return this.getResolvedEntitlements().pipe(
      switchMap(entitlements => this.loadConfiguredChecks(entitlements)),
      map(checks => {
        this.resolvedChecks = checks;
        return this.resolvedChecks;
      })
    );
  }

  private loadConfiguredChecks(activeEntitlements: string[]): Observable<EndpointCheck[]> {
    return this.loadTestMappings().pipe(
      map(mappings => mappings
        .filter(test => this.isEntitled(test, activeEntitlements))
        .map(test => {
          const method = test.command.toUpperCase() === 'POST' ? 'POST' : 'GET';
          return {
            service: test.serviceName,
            method,
            endpoint: test.endpoint,
            body: this.getConfiguredBody(test, method),
            requireRegistry: test.requireRegistry === true
          } as EndpointCheck;
        }))
    );
  }

  private getResolvedEntitlements(): Observable<string[]> {
    if (this.resolvedEntitlements) {
      return of(this.resolvedEntitlements);
    }

    return this.executeRequestWithRetry(() =>
      this.http.get<unknown>(`${this.baseUrl}${this.authEndpoint}`, { observe: 'response' })
    ).pipe(
      map(response => this.extractPartNumbersFromAuth(response.body)),
      map(partNumbers => {
        this.resolvedEntitlements = partNumbers.length
          ? partNumbers
          : [this.defaultEntitlement];
        return this.resolvedEntitlements;
      }),
      catchError(() => {
        this.resolvedEntitlements = [this.defaultEntitlement];
        return of(this.resolvedEntitlements);
      })
    );
  }

  private extractPartNumbersFromAuth(payload: unknown): string[] {
    const partNumbers = new Set<string>();

    const addPartNumber = (value: unknown): void => {
      if (typeof value === 'string' && value.trim().length) {
        partNumbers.add(value.trim());
      }
    };

    const appendFromEntitlements = (value: unknown): void => {
      if (!Array.isArray(value)) {
        return;
      }

      for (const entitlement of value) {
        if (!entitlement || typeof entitlement !== 'object') {
          continue;
        }

        const item = entitlement as Record<string, unknown>;
        addPartNumber(item.partNumber);

        if (item.entitlingProduct && typeof item.entitlingProduct === 'object') {
          const entitlingProduct = item.entitlingProduct as Record<string, unknown>;
          addPartNumber(entitlingProduct.partNumber);
        }
      }
    };

    if (payload && typeof payload === 'object') {
      const root = payload as Record<string, unknown>;
      appendFromEntitlements(root.entitlements);
      this.appendFromEntitlementMap(root.entitlements, addPartNumber);

      const nestedEntitlements = root.entitlements;
      if (nestedEntitlements && typeof nestedEntitlements === 'object') {
        const wrapped = nestedEntitlements as Record<string, unknown>;
        appendFromEntitlements(wrapped.entitlements);
        this.appendFromEntitlementMap(wrapped, addPartNumber);
      }

      const user = root.user;
      if (user && typeof user === 'object') {
        const userRecord = user as Record<string, unknown>;
        const userEntitlements = userRecord.entitlements;
        if (userEntitlements && typeof userEntitlements === 'object') {
          const wrapped = userEntitlements as Record<string, unknown>;
          appendFromEntitlements(wrapped.entitlements);
          this.appendFromEntitlementMap(wrapped, addPartNumber);
        }
      }
    }

    return [...partNumbers];
  }

  private isEntitled(test: TestMappingEntry, activeEntitlements: string[]): boolean {
    const required = (test.entitlements ?? [])
      .map(item => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(item => item.length > 0);

    if (!required.length) {
      return true;
    }

    const activeSet = new Set(
      activeEntitlements
        .map(item => item.trim().toLowerCase())
        .filter(item => item.length > 0)
    );
    return required.some(item => activeSet.has(item));
  }

  private loadTestMappings(): Observable<TestMappingEntry[]> {
    return this.http.get<TestMappingDocument>(this.testMappingPath).pipe(
      map(document => {
        if (!document || !Array.isArray(document.tests)) {
          throw new HealthConfigurationError();
        }

        const mappings: TestMappingEntry[] = [];
        for (const test of document.tests) {
          if (!test?.command || !test?.endpoint || test.enabled === false) {
            continue;
          }

          mappings.push(test);
        }

        return mappings;
      }),
      catchError(() => throwError(() => new HealthConfigurationError()))
    );
  }

  private appendFromEntitlementMap(
    value: unknown,
    addPartNumber: (value: unknown) => void
  ): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    for (const [key, entitlement] of Object.entries(value)) {
      if (key.toLowerCase().startsWith('systemlink_edition_') && Boolean(entitlement)) {
        addPartNumber(key);
      }

      if (entitlement && typeof entitlement === 'object') {
        const item = entitlement as Record<string, unknown>;
        addPartNumber(item.partNumber);
        if (item.entitlingProduct && typeof item.entitlingProduct === 'object') {
          const entitlingProduct = item.entitlingProduct as Record<string, unknown>;
          addPartNumber(entitlingProduct.partNumber);
        }
      }
    }
  }

  private getConfiguredBody(test: TestMappingEntry, method: 'GET' | 'POST'): unknown {
    if (method !== 'POST') {
      return undefined;
    }

    if (test.buffer === null || test.buffer === undefined) {
      return undefined;
    }

    if (typeof test.buffer === 'string') {
      return this.parseConfiguredBuffer(test.buffer);
    }

    return test.buffer;
  }

  private parseConfiguredBuffer(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        const normalized = trimmed
          .replace(/'/g, '"')
          .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
        return JSON.parse(normalized);
      } catch {
        return trimmed;
      }
    }
  }

  private fetchRegistryMatches(): Observable<RegistryMatchResult> {
    return this.executeRequestWithRetry(() =>
      this.http.get<unknown>(`${this.baseUrl}${this.serviceRegistryEndpoint}`, { observe: 'response' })
    ).pipe(
      map(response => ({
        matches: this.extractRegistryMatches(response.body),
        hasResponse: true
      })),
      catchError(() =>
        of({
          matches: new Map<string, RegistryServiceMatch>(),
          hasResponse: false
        })
      )
    );
  }

  private filterChecksByRegistryRequirement(
    checks: EndpointCheck[],
    registryMatches: Map<string, RegistryServiceMatch>,
    hasRegistryResponse: boolean
  ): EndpointCheck[] {
    if (!hasRegistryResponse) {
      return checks;
    }

    return checks.filter(check => {
      if (!check.requireRegistry) {
        return true;
      }

      return this.getRegistryMatchForCheck(check, registryMatches).name !== null;
    });
  }

  private applyRegistryState(
    health: EndpointHealth,
    check: EndpointCheck,
    registryMatches: Map<string, RegistryServiceMatch>
  ): EndpointHealth {
    const match = this.getRegistryMatchForCheck(check, registryMatches);
    const isLive =
      match.name === null ||
      match.status === null ||
      match.status.toLowerCase() === 'live';
    const registryState = match.name === null ? null : match.status;

    return {
      ...health,
      registryService: match.name,
      registryState,
      functional: health.functional && isLive
    };
  }

  private getRegistryMatchForCheck(
    check: EndpointCheck,
    registryMatches: Map<string, RegistryServiceMatch>
  ): RegistryServiceMatch {
    const emptyMatch: RegistryServiceMatch = { name: null, status: null };

    const byName = registryMatches.get(`name:${check.service}`);
    return byName ?? emptyMatch;
  }

  private extractRegistryMatches(payload: unknown): Map<string, RegistryServiceMatch> {
    const matches = new Map<string, RegistryServiceMatch>();

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(item => visit(item));
        return;
      }

      if (!value || typeof value !== 'object') {
        return;
      }

      const record = value as Record<string, unknown>;
      const status = this.readString(record.status) ?? this.readString(record.state);
      const names = [
        this.readString(record.service),
        this.readString(record.serviceName),
        this.readString(record.name),
        this.readString(record.displayName),
        this.readString(record.title)
      ].filter((item): item is string => Boolean(item));
      if (status) {
        for (const name of names) {
          matches.set(`name:${name}`, { name, status });
        }
      }

      Object.values(record).forEach(item => visit(item));
    };

    visit(payload);
    return matches;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length ? value.trim() : null;
  }

  private executeRequestWithRetry<T>(requestFactory: () => Observable<T>): Observable<T> {
    return requestFactory().pipe(
      timeout(this.requestTimeoutMs),
      retryWhen(errors =>
        errors.pipe(
          mergeMap((error: unknown, retryIndex: number) => {
            const attempt = retryIndex + 1;
            if (!this.shouldRetry(error) || attempt > this.maxRetries) {
              return throwError(() => error);
            }

            return timer(this.getRetryDelayMs(error, attempt));
          })
        )
      )
    );
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    // Only retry transient conditions; genuine 5xx faults are reported as-is.
    return error.status === 429 || error.status === 0 || error.status === 503;
  }

  private getRetryDelayMs(error: unknown, attempt: number): number {
    if (error instanceof HttpErrorResponse && error.status === 429) {
      const retryAfterHeader = error.headers?.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.round(retryAfterSeconds * 1000);
      }
    }

    return this.initialRetryDelayMs * Math.pow(2, attempt - 1);
  }


  private stringifyResponse(value: unknown, maxLength = 500): string {
    if (value === null || value === undefined) {
      return 'No response body';
    }
    if (typeof value === 'string') {
      return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    }
    try {
      const json = JSON.stringify(value, null, 2);
      return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
    } catch {
      return String(value);
    }
  }
}
