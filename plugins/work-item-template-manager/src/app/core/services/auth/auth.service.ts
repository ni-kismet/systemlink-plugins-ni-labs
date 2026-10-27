import { Injectable } from '@angular/core';
import { defaultIfEmpty, map, Observable, shareReplay, tap } from 'rxjs';
import { IAuthResponse } from '../../models/auth.models';
import { AuthHttpService } from '../auth-http/auth-http.service';

/** Service that fetches workspace data. Caches the result when the list is non-empty. */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private cachedWorkspaces$: Observable<IAuthResponse> | null = null;

  /** Creates an instance of AuthService. */
  public constructor(private readonly authHttpService: AuthHttpService) {}

  /** Fetches all workspaces. Result is cached only when the workspace list is non-empty. */
  public getAllWorkspaces(): Observable<IAuthResponse> {
    if (this.cachedWorkspaces$) {
      return this.cachedWorkspaces$;
    }

    this.cachedWorkspaces$ = this.authHttpService.getCurrentUser().pipe(
      map((authResponse) => ({ workspaces: authResponse.workspaces ?? [] })),
      defaultIfEmpty({ workspaces: [] } as IAuthResponse),
      tap((response) => {
        if (response.workspaces.length === 0) {
          this.cachedWorkspaces$ = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.cachedWorkspaces$;
  }
}
