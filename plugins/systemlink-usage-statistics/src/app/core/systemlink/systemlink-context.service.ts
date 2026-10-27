import { Injectable } from '@angular/core';

export type AuthMode = 'same-origin' | 'api-key';

export interface WorkspaceSummary {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SystemLinkContextService {
  readonly appName = 'systemlink-usage-statistics';
  readonly publishName = 'SystemLink Usage Statistics';
  readonly authMode: AuthMode = 'same-origin';

  private workspaceIdCache: Promise<string | null> | null = null;
  private installedServicesCache: Promise<Set<string> | null> | null = null;

  get workspaceName(): string {
    return this.extractWorkspaceName();
  }

  get origin(): string {
    return window.location.origin;
  }

  buildApiUrl(servicePath: string): string {
    return `${this.origin}/${servicePath.replace(/^\/+/, '')}`;
  }

  buildRequestInit(init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers ?? {});
    if (this.authMode === 'api-key') {
      const apiKey = window.localStorage.getItem('slcli.webapp.apiKey');
      if (apiKey) {
        headers.set('x-ni-api-key', apiKey);
      }
    }

    return {
      ...init,
      credentials: this.authMode === 'same-origin' ? 'include' : init.credentials,
      headers,
    };
  }

  // Resolves the workspace ID matching the webapp's deployed workspace (from URL path).
  resolveWorkspaceId(): Promise<string | null> {
    if (!this.workspaceIdCache) {
      const lookup = this.fetchWorkspaceId();
      this.workspaceIdCache = lookup;
      void lookup.then(id => {
        if (id === null && this.workspaceIdCache === lookup) {
          this.workspaceIdCache = null;
        }
      });
    }
    return this.workspaceIdCache;
  }

  // Lists workspaces visible to the current user, sorted by name.
  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    try {
      const response = await fetch(
        this.buildApiUrl('/niuser/v1/workspaces?take=5000'),
        this.buildRequestInit({ method: 'GET' }),
      );
      if (!response.ok) return [];
      const payload = (await response.json()) as Record<string, unknown>;
      const workspaces = Array.isArray(payload['workspaces']) ? (payload['workspaces'] as Record<string, unknown>[]) : [];
      return workspaces
        .filter(w => typeof w['id'] === 'string')
        .map(w => ({ id: w['id'] as string, name: typeof w['name'] === 'string' ? w['name'] : (w['id'] as string) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } catch {
      return [];
    }
  }

  // Returns installed services, or null when the registry is unreachable.
  private getInstalledServices(): Promise<Set<string> | null> {
    if (!this.installedServicesCache) {
      this.installedServicesCache = this.fetchInstalledServices();
    }
    return this.installedServicesCache;
  }

  // A registered but stopped service is installed; let its API request report the failure.
  async isServiceInstalled(serviceName: string): Promise<boolean> {
    const services = await this.getInstalledServices();
    if (services === null) {
      return true;
    }
    return services.has(serviceName);
  }

  private async fetchInstalledServices(): Promise<Set<string> | null> {
    try {
      const response = await fetch(
        this.buildApiUrl('/niserviceregistry/v1/services'),
        this.buildRequestInit({ method: 'GET' }),
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const services = payload['services'];
      if (!Array.isArray(services)) {
        return null;
      }
      const installed = new Set<string>();
      for (const service of services) {
        if (!service || typeof service !== 'object') {
          continue;
        }
        const record = service as Record<string, unknown>;
        const name = typeof record['name'] === 'string' ? record['name'] : null;
        if (name) {
          installed.add(name);
        }
      }
      return installed;
    } catch {
      return null;
    }
  }

  private extractWorkspaceName(): string {
    try {
      const parent = window.parent !== window ? window.parent : window;
      // Check both pathname and hash to handle SPA hash-based routing
      const candidates = [parent.location.pathname, parent.location.hash];
      for (const source of candidates) {
        const parts = source.split('/').filter(Boolean);
        const appIdx = parts.indexOf('app');
        if (appIdx >= 0 && parts[appIdx + 1]) {
          const name = decodeURIComponent(parts[appIdx + 1]);
          console.debug('[SystemLinkContext] detected workspace name:', name, 'from', source);
          return name;
        }
      }
    } catch {
      // cross-origin parent — fall through to default
    }
    console.debug('[SystemLinkContext] workspace name not found in URL, using Default');
    return 'Default';
  }

  private async fetchWorkspaceId(): Promise<string | null> {
    try {
      const name = this.extractWorkspaceName();
      const response = await fetch(
        this.buildApiUrl('/niuser/v1/workspaces?take=5000'),
        this.buildRequestInit({ method: 'GET' }),
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as Record<string, unknown>;
      const workspaces = payload['workspaces'];
      if (!Array.isArray(workspaces)) return null;
      console.debug('[SystemLinkContext] available workspaces:', JSON.stringify(workspaces));
      const lower = name.toLowerCase();
      // Match on any string field that could carry the workspace name
      const match = (workspaces as Record<string, unknown>[]).find(w =>
        ['name', 'displayName', 'alias', 'mappedName'].some(
          key => typeof w[key] === 'string' && (w[key] as string).toLowerCase() === lower,
        ),
      );
      const id = match && typeof match['id'] === 'string' ? match['id'] : null;
      console.debug('[SystemLinkContext] workspace ID resolved:', id, 'for name:', name);
      return id;
    } catch {
      return null;
    }
  }
}
