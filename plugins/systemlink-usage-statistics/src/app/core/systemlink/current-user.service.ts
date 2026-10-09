import { Injectable } from '@angular/core';

import { SystemLinkContextService } from './systemlink-context.service';

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  constructor(private readonly context: SystemLinkContextService) {}

  async checkIsSuperUser(): Promise<boolean> {
    try {
      const response = await fetch(
        this.context.buildApiUrl('/niauth/v1/auth'),
        this.context.buildRequestInit({ method: 'GET' }),
      );

      if (!response.ok) {
        return false;
      }

      const payload = (await response.json()) as unknown;
      return this.payloadIndicatesAdmin(payload);
    } catch {
      return false;
    }
  }

  private payloadIndicatesAdmin(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const record = payload as Record<string, unknown>;
    // SLE auth policies carry only statements (no role names); Super User = '*' actions/resources in all workspaces.
    return this.hasFullAccessStatement(record) || this.hasAdminRoleInPolicies(record);
  }

  private hasFullAccessStatement(record: Record<string, unknown>): boolean {
    const policies = record['policies'];
    if (!Array.isArray(policies)) {
      return false;
    }

    return policies.some(policy => {
      const statements = (policy as { statements?: unknown } | null)?.statements;
      return Array.isArray(statements) && statements.some(statement => {
        const s = statement as { actions?: unknown; resource?: unknown; workspace?: unknown } | null;
        return Array.isArray(s?.actions) && s.actions.includes('*')
          && Array.isArray(s.resource) && s.resource.includes('*')
          && (s.workspace === undefined || s.workspace === '*');
      });
    });
  }

  private hasAdminRoleInPolicies(record: Record<string, unknown>): boolean {
    const candidateKeys = ['policies', 'roles', 'assignments', 'userPolicies', 'policyTemplates'];

    for (const key of candidateKeys) {
      const arr = record[key];
      if (!Array.isArray(arr)) {
        continue;
      }

      for (const item of arr) {
        if (typeof item === 'string') {
          if (/server.?administrator|super.?user/i.test(item)) {
            return true;
          }
          continue;
        }

        if (!item || typeof item !== 'object') {
          continue;
        }

        const entry = item as Record<string, unknown>;
        const nameFields = ['name', 'displayName', 'templateName', 'roleName', 'role'];
        for (const field of nameFields) {
          if (typeof entry[field] === 'string' && /server.?administrator|super.?user/i.test(entry[field] as string)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
