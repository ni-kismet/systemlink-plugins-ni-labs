import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, switchMap } from 'rxjs';
import { API_ROUTES } from '../../constants/api.constants';
import { IDashboardFolderSearchItem, IDashboardSearchItem } from '../../models/dashboard.models';

/** HTTP layer for the DashboardHost search API. */
@Injectable({
  providedIn: 'root',
})
export class DashboardHttpService {
  private grafanaSessionInit$: Observable<void> | null = null;

  /** Creates an instance of DashboardHttpService. */
  public constructor(private readonly httpClient: HttpClient) {}

  /**
   * Ensures dashboardhost login is called once so Grafana can establish its session cookie.
   * Concurrent callers share the same cached observable.
   */
  private ensureGrafanaSession(): Observable<void> {
    if (this.grafanaSessionInit$) {
      return this.grafanaSessionInit$;
    }

    this.grafanaSessionInit$ = this.httpClient
      .get(API_ROUTES.dashboardLogin, { responseType: 'text' })
      .pipe(
        map(() => undefined),
        catchError((_error: HttpErrorResponse) => of(undefined)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.grafanaSessionInit$;
  }

  /** Clears the cached login request and creates a fresh dashboardhost session init call. */
  private refreshGrafanaSession(): Observable<void> {
    this.grafanaSessionInit$ = null;
    return this.ensureGrafanaSession();
  }

  /** Executes a dashboard search. On failure, logs in once and retries the search once. */
  private searchWithLoginRetry<T>(params: HttpParams): Observable<T[]> {
    return this.httpClient.get<T[]>(API_ROUTES.searchDashboards, { params }).pipe(
      catchError((_error: HttpErrorResponse) =>
        this.refreshGrafanaSession().pipe(
          switchMap(() => this.httpClient.get<T[]>(API_ROUTES.searchDashboards, { params })),
          catchError((retryError: HttpErrorResponse) => {
            if (retryError.status === 401 || retryError.status === 403) {
              return this.refreshGrafanaSession().pipe(
                switchMap(() => this.httpClient.get<T[]>(API_ROUTES.searchDashboards, { params })),
                catchError((_finalRetryError: HttpErrorResponse) => of([] as T[])),
              );
            }

            return of([] as T[]);
          }),
        ),
      ),
    );
  }

  /** Queries dashboard folders. */
  public queryDashboardFolders(): Observable<IDashboardFolderSearchItem[]> {
    const params = new HttpParams().set('type', 'dash-folder');
    return this.searchWithLoginRetry<IDashboardFolderSearchItem>(params);
  }

  /** Queries dashboards by workspace folder UID. */
  public queryDashboardsByFolderUid(folderUid: string): Observable<IDashboardSearchItem[]> {
    const params = new HttpParams().set('type', 'dash-db').set('folderUIDs', folderUid);
    return this.searchWithLoginRetry<IDashboardSearchItem>(params);
  }
}
