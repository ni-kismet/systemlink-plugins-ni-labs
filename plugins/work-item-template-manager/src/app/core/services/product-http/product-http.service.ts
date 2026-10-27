import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, Observable } from 'rxjs';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';
import { IQueryProductsRequest, IQueryProductsResponse } from '../../models/product.models';

/** HTTP layer for the products API. */
@Injectable({
  providedIn: 'root',
})
export class ProductHttpService {
  /** Creates an instance of ProductHttpService. */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Queries a single page of products. */
  public queryProducts(request: IQueryProductsRequest): Observable<IQueryProductsResponse> {
    return this.httpClient.post<IQueryProductsResponse>(API_ROUTES.queryProducts, request).pipe(
      catchError((error: HttpErrorResponse) => {
        this.notificationBannerService.showError(
          API_ERROR_MESSAGES.failedToQueryProducts,
          error.message || API_ERROR_MESSAGES.unknownError,
        );

        return EMPTY;
      }),
    );
  }
}
