import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, Observable } from 'rxjs';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { IQueryAssetsRequest, IQueryAssetsResponse } from '../../models/asset.models';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** HTTP layer for the assets query API. */
@Injectable({
  providedIn: 'root',
})
export class AssetHttpService {
  /** Creates an instance of AssetHttpService. */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Queries a single page of assets. */
  public queryAssets(request: IQueryAssetsRequest): Observable<IQueryAssetsResponse> {
    return this.httpClient.post<IQueryAssetsResponse>(API_ROUTES.queryAssets, request).pipe(
      catchError((error: HttpErrorResponse) => {
        this.notificationBannerService.showError(
          API_ERROR_MESSAGES.failedToQueryAssets,
          error.message || API_ERROR_MESSAGES.unknownError,
        );

        return EMPTY;
      }),
    );
  }
}
