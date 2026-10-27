import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, Observable, tap } from 'rxjs';
import {
  ICreateWorkitemTemplatesRequest,
  ICreateWorkitemTemplatesResponse,
  IDeleteWorkitemTemplatesRequest,
  IDeleteWorkitemTemplatesResponse,
  IQueryWorkitemTemplatesRequest,
  IQueryWorkitemTemplatesResponse,
  IUpdateWorkitemTemplatesRequest,
  IUpdateWorkitemTemplatesResponse,
} from '../../models/workitem-templates.models';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** HTTP layer for the testplan templates API. */
@Injectable({
  providedIn: 'root',
})
export class TestplanTemplateHttpService {
  /** Creates an instance of TestplanTemplateHttpService. */
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Deletes testplan templates by ID. */
  public deleteWorkItemTemplates(
    request: IDeleteWorkitemTemplatesRequest,
  ): Observable<IDeleteWorkitemTemplatesResponse> {
    return this.httpClient
      .post<IDeleteWorkitemTemplatesResponse>(API_ROUTES.deleteWorkItemTemplates, request)
      .pipe(
        tap((response) => {
          if (response?.failedIds?.length) {
            this.notificationBannerService.showError(
              API_ERROR_MESSAGES.partiallyFailedToDeleteTemplates,
              $localize`${response.failedIds.length}:count: template(s) could not be deleted.`,
            );
          }
        }),

        catchError((error: HttpErrorResponse) => {
          this.notificationBannerService.showError(
            API_ERROR_MESSAGES.failedToDeleteTemplates,
            this.errorDetail(error, API_ERROR_MESSAGES.noPrivilegeToDeleteTemplate),
          );

          return EMPTY;
        }),
      );
  }

  /** Queries a single batch of testplan templates. */
  public queryWorkItemTemplates(
    request: IQueryWorkitemTemplatesRequest,
  ): Observable<IQueryWorkitemTemplatesResponse> {
    return this.httpClient
      .post<IQueryWorkitemTemplatesResponse>(API_ROUTES.queryWorkItemTemplates, request)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.notificationBannerService.showError(
            API_ERROR_MESSAGES.failedToQueryTemplates,
            error.message || API_ERROR_MESSAGES.unknownError,
          );

          return EMPTY;
        }),
      );
  }

  /** Creates one testplan template. */
  public createWorkitemTemplates(
    request: ICreateWorkitemTemplatesRequest,
  ): Observable<ICreateWorkitemTemplatesResponse> {
    return this.httpClient
      .post<ICreateWorkitemTemplatesResponse>(API_ROUTES.createWorkItemTemplates, request)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.notificationBannerService.showError(
            API_ERROR_MESSAGES.failedToCreateTemplate,
            this.errorDetail(error, API_ERROR_MESSAGES.noPrivilegeToCreateTemplate),
          );

          return EMPTY;
        }),
      );
  }

  /** Updates one testplan template. */
  public updateWorkitemTemplates(
    request: IUpdateWorkitemTemplatesRequest,
  ): Observable<IUpdateWorkitemTemplatesResponse> {
    return this.httpClient
      .post<IUpdateWorkitemTemplatesResponse>(API_ROUTES.updateWorkItemTemplates, request)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.notificationBannerService.showError(
            API_ERROR_MESSAGES.failedToUpdateTemplate,
            this.errorDetail(error, API_ERROR_MESSAGES.noPrivilegeToUpdateTemplate),
          );

          return EMPTY;
        }),
      );
  }

  private errorDetail(error: HttpErrorResponse, privilegeMessage: string): string {
    if (error.status === 401 || error.status === 403) {
      return privilegeMessage;
    }
    return error.message || API_ERROR_MESSAGES.unknownError;
  }
}
