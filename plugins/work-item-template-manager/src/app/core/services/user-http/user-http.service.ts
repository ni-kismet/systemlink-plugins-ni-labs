import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, EMPTY, Observable } from 'rxjs';
import { IQueryUsersRequest, IQueryUsersResponse } from '../../models/user.models';
import { API_ROUTES } from '../../constants/api.constants';

/** HTTP layer for the NI User API. Makes the raw POST request. */
@Injectable({
  providedIn: 'root',
})
export class UserHttpService {
  /**
   * Creates an instance of UserHttpService.
   */
  public constructor(private readonly httpClient: HttpClient) {}

  /** Queries a single paginated batch of users. */
  public queryUsers(request: IQueryUsersRequest): Observable<IQueryUsersResponse> {
    return (
      this.httpClient
        .post<IQueryUsersResponse>(API_ROUTES.queryUsers, request)
        // This lookup treats missing or unavailable data as "no result" instead of a failure.
        // Returning EMPTY completes the stream silently so the caller does not show an error.
        .pipe(catchError(() => EMPTY))
    );
  }
}
