import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { API_ROUTES } from '../../constants/api.constants';
import {
  IQueryResultValuesRequest,
  IQueryResultsRequest,
  IQueryResultsResponse,
} from '../../models/test-result.models';

/** HTTP layer for test results API. */
@Injectable({
  providedIn: 'root',
})
export class TestResultHttpService {
  /** Creates an instance of TestResultHttpService. */
  public constructor(private readonly httpClient: HttpClient) {}

  /** Queries test results for a specific workspace context. */
  public queryResults(
    request: IQueryResultsRequest,
    workspaceId: string,
  ): Observable<IQueryResultsResponse> {
    const headers = this.createWorkspaceHeaders(workspaceId);

    return this.httpClient
      .post<IQueryResultsResponse>(API_ROUTES.queryResults, request, { headers })
      .pipe(
        catchError((_error: HttpErrorResponse) =>
          of({ results: [] } satisfies IQueryResultsResponse),
        ),
      );
  }

  /** Queries distinct result values for a field in a specific workspace context. */
  public queryResultValues(
    request: IQueryResultValuesRequest,
    workspaceId: string,
  ): Observable<string[]> {
    const headers = this.createWorkspaceHeaders(workspaceId);

    return this.httpClient.post<string[]>(API_ROUTES.queryResultValues, request, { headers }).pipe(
      catchError((_error: HttpErrorResponse) => of([])),
    );
  }

  /** Builds workspace-scoped request headers. */
  private createWorkspaceHeaders(workspaceId: string): HttpHeaders {
    return new HttpHeaders({
      'x-ni-workspace': workspaceId,
    });
  }
}
