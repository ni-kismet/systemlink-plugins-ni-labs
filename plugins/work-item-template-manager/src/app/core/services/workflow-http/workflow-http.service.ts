import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, Observable } from 'rxjs';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';
import { IQueryWorkflowsRequest, IQueryWorkflowsResponse } from '../../models/workflow.models';

/** HTTP layer for the workflows API. */
@Injectable({
  providedIn: 'root',
})
export class WorkflowHttpService {
  /** Creates an instance of WorkflowHttpService. */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Queries a single page of workflows. */
  public queryWorkflows(request: IQueryWorkflowsRequest): Observable<IQueryWorkflowsResponse> {
    return this.httpClient.post<IQueryWorkflowsResponse>(API_ROUTES.queryWorkflows, request).pipe(
      catchError((error: HttpErrorResponse) => {
        this.notificationBannerService.showError(
          API_ERROR_MESSAGES.failedToQueryWorkflows,
          error.message || API_ERROR_MESSAGES.unknownError,
        );

        return EMPTY;
      }),
    );
  }
}
