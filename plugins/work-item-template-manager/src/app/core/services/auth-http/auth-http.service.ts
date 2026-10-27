import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, EMPTY, Observable } from 'rxjs';
import { IAuthResponse } from '../../models/auth.models';
import { API_ROUTES, API_ERROR_MESSAGES } from '../../constants/api.constants';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** HTTP layer for the NI Auth API. Makes the raw request and reports errors via notification banner. */
@Injectable({
  providedIn: 'root',
})
export class AuthHttpService {
  /**
   * Creates an instance of AuthHttpService.
   */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Fetches the current user's auth info and workspace list from the NI Auth API. */
  public getCurrentUser(): Observable<IAuthResponse> {
    return this.httpClient.get<IAuthResponse>(API_ROUTES.getUser).pipe(
      catchError((error: HttpErrorResponse) => {
        this.notificationBannerService.showError(
          API_ERROR_MESSAGES.failedToGetUser,
          error.message || API_ERROR_MESSAGES.unknownError,
        );

        return EMPTY;
      }),
    );
  }
}
