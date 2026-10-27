import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap } from 'rxjs';
import { API_ROUTES } from '../../constants/api.constants';

/** SystemLink authorization actions for work item templates. */
export const WORK_ITEM_TEMPLATE_ACTIONS = {
  create: 'workitemtemplate:Create',
  update: 'workitemtemplate:Update',
  delete: 'workitemtemplate:Delete',
} as const;

interface IAuthStatement {
  actions?: string[];
  workspace?: string;
}

interface IAuthPoliciesResponse {
  policies?: { statements?: IAuthStatement[] }[];
}

/**
 * The signed-in user's effective privileges, read from `/niauth/v1/auth` (the same source the
 * SystemLink shell uses). Used only to shape the UI; the server still enforces every call.
 */
@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  /** Emits once the statements are loaded (null when they could not be read). */
  public readonly statements$: Observable<IAuthStatement[] | null>;

  // null = unknown, in which case every action is offered and the server decides.
  private readonly statements = signal<IAuthStatement[] | null>(null);

  /** Creates an instance of PermissionService. */
  public constructor(httpClient: HttpClient) {
    this.statements$ = httpClient.get<IAuthPoliciesResponse>(API_ROUTES.getAuth).pipe(
      map((response) => (response.policies ?? []).flatMap((policy) => policy.statements ?? [])),
      catchError(() => of(null)),
      tap((statements) => this.statements.set(statements)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.statements$.subscribe();
  }

  /** True when the user may perform `action` in `workspaceId`. */
  public can(action: string, workspaceId: string): boolean {
    const statements = this.statements();
    if (!statements) {
      return true;
    }
    return statements.some(
      (statement) =>
        this.matchesAction(statement, action) &&
        (statement.workspace === '*' || statement.workspace === workspaceId),
    );
  }

  /** True when the user may perform `action` in at least one workspace. */
  public canInAnyWorkspace(action: string): boolean {
    const statements = this.statements();
    if (!statements) {
      return true;
    }
    return statements.some(
      (statement) => this.matchesAction(statement, action) && !!statement.workspace && statement.workspace !== 'global',
    );
  }

  private matchesAction(statement: IAuthStatement, action: string): boolean {
    const service = action.split(':')[0];
    return (statement.actions ?? []).some(
      (granted) => granted === '*' || granted === action || granted === `${service}:*`,
    );
  }
}
