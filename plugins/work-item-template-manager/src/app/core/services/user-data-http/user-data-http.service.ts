import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, EMPTY, Observable } from 'rxjs';
import {
  ICreateOrUpdateUserDataItemRequest,
  ICreateOrUpdateUserDataItemResponse,
  IGetUserDataItemsResponse,
  IQueryUserDataItemsRequest,
} from '../../models/user-data.models';
import { API_ROUTES, API_ERROR_MESSAGES } from '../../constants/api.constants';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** HTTP layer for NI User Data API. Handles notification banners on error. */
@Injectable({
  providedIn: 'root',
})
export class UserDataHttpService {
  /**
   * Creates an instance of UserDataHttpService.
   */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Queries user data items with pagination. Returns an empty response on error. */
  public queryUserDataItems<T = unknown>(
    body: IQueryUserDataItemsRequest,
    take: number,
    skip: number,
  ): Observable<IGetUserDataItemsResponse<T>> {
    return this.httpClient
      .post<IGetUserDataItemsResponse<T>>(API_ROUTES.queryUserDataItems, body, {
        params: new HttpParams().set('take', take).set('skip', skip),
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          // Suppress 404s because missing data is treated as an empty result.
          if (error.status !== 404) {
            this.notificationBannerService.showError(
              API_ERROR_MESSAGES.failedToQueryUserDataItems,
              error.message || API_ERROR_MESSAGES.unknownError,
            );
          }

          return EMPTY;
        }),
      );
  }

  /** Creates or updates user data items in batch. Returns an empty response on error. */
  public createOrUpdateUserDataItems<T = unknown>(
    body: ICreateOrUpdateUserDataItemRequest<T>[],
  ): Observable<ICreateOrUpdateUserDataItemResponse<T>> {
    return this.httpClient
      .post<ICreateOrUpdateUserDataItemResponse<T>>(API_ROUTES.createOrUpdateItems, body)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          // Suppress 404s because missing data is treated as an empty result.
          if (error.status !== 404) {
            this.notificationBannerService.showError(
              API_ERROR_MESSAGES.failedToCreateOrUpdateUserDataItems,
              error.message || API_ERROR_MESSAGES.unknownError,
            );
          }

          return EMPTY;
        }),
      );
  }
}
