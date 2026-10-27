import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, Observable } from 'rxjs';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { IGetWorkItemTypesResponse } from '../../models/workitem-type.models';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

@Injectable({
  providedIn: 'root',
})
export class WorkItemTypesHttpService {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  public getWorkItemTypes(): Observable<IGetWorkItemTypesResponse> {
    return this.httpClient.get<IGetWorkItemTypesResponse>(API_ROUTES.getWorkItemTypes).pipe(
      catchError((error: HttpErrorResponse) => {
        this.notificationBannerService.showError(
          API_ERROR_MESSAGES.failedToQueryWorkItemTypes,
          error.message || API_ERROR_MESSAGES.unknownError,
        );

        return EMPTY;
      }),
    );
  }
}
