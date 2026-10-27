import { Injectable } from '@angular/core';
import { EMPTY, expand, Observable, of, reduce, switchMap } from 'rxjs';
import {
  ICreateWorkitemTemplateRequest,
  ICreateWorkitemTemplatesResponse,
  IDeleteWorkitemTemplatesResponse,
  IQueryWorkitemTemplatesResponse,
  IUpdateWorkitemTemplateRequest,
  IUpdateWorkitemTemplatesResponse,
  WorkitemTemplateOrderByField,
} from '../../models/workitem-templates.models';
import { API_ERROR_MESSAGES, TEMPLATE_BATCH_SIZE } from '../../constants/api.constants';
import { TestplanTemplateHttpService } from '../workitem-templates-http/workitem-templates-http.service';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** Business logic layer for workitem template operations. */
@Injectable({
  providedIn: 'root',
})
export class WorkitemTemplatesService {
  /** Creates an instance of WorkitemTemplatesService. */
  public constructor(
    private readonly httpService: TestplanTemplateHttpService,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Fetches all matching templates, following continuation tokens across pages. */
  public queryWorkitemTemplates(
    filter?: string,
    orderBy?: WorkitemTemplateOrderByField,
  ): Observable<IQueryWorkitemTemplatesResponse> {
    const request = { filter, orderBy, take: TEMPLATE_BATCH_SIZE };
    const seenTokens = new Set<string>();

    return this.httpService.queryWorkItemTemplates(request).pipe(
      expand((response) => {
        const token = response.continuationToken;
        if (!token || seenTokens.has(token)) {
          return EMPTY;
        }
        seenTokens.add(token);
        return this.httpService.queryWorkItemTemplates({ ...request, continuationToken: token });
      }),
      reduce((all, page) => ({
        ...page,
        workItemTemplates: [...all.workItemTemplates, ...page.workItemTemplates],
      })),
    );
  }

  /** Deletes workitem templates by ID. */
  public deleteWorkitemTemplates(ids: Set<string>): Observable<IDeleteWorkitemTemplatesResponse> {
    return this.httpService.deleteWorkItemTemplates({ ids: [...ids] });
  }

  /** Creates a single testplan template. Returns EMPTY on partial failure after showing a banner. */
  public createTemplate(
    template: ICreateWorkitemTemplateRequest,
  ): Observable<ICreateWorkitemTemplatesResponse> {
    return this.httpService.createWorkitemTemplates({ workItemTemplates: [template] }).pipe(
      switchMap((response) => {
        if (response?.failedWorkItemTemplates?.length) {
          this.notificationBannerService.showError(
            API_ERROR_MESSAGES.failedToCreateTemplate,
            API_ERROR_MESSAGES.failedToCreateTemplateNamed(template.name),
          );

          return EMPTY;
        }

        return of(response);
      }),
    );
  }

  /** Updates a single testplan template. Replaces array and key-value fields entirely. Returns EMPTY on partial failure after showing a banner. */
  public updateTemplate(
    template: IUpdateWorkitemTemplateRequest,
  ): Observable<IUpdateWorkitemTemplatesResponse> {
    return this.httpService
      .updateWorkitemTemplates({ workItemTemplates: [template], replace: true })
      .pipe(
        switchMap((response) => {
          if (response?.failedWorkItemTemplates?.length) {
            this.notificationBannerService.showError(
              API_ERROR_MESSAGES.failedToUpdateTemplate,
              API_ERROR_MESSAGES.failedToUpdateTemplateNamed(template.name ?? ''),
            );

            return EMPTY;
          }

          return of(response);
        }),
      );
  }
}
