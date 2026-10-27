import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, Observable } from 'rxjs';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { IQuerySystemsRequest, IQuerySystemsResponse } from '../../models/system.models';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** HTTP layer for the systems query API. */
@Injectable({
  providedIn: 'root',
})
export class SystemHttpService {
  /** Creates an instance of SystemHttpService. */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Queries a single page of systems. */
  public querySystems(request: IQuerySystemsRequest): Observable<IQuerySystemsResponse> {
    return this.httpClient.post<IQuerySystemsResponse>(API_ROUTES.querySystems, request).pipe(
      catchError((error: HttpErrorResponse) => {
        this.notificationBannerService.showError(
          API_ERROR_MESSAGES.failedToQuerySystems,
          error.message || API_ERROR_MESSAGES.unknownError,
        );

        return EMPTY;
      }),
    );
  }
}
