import { Injectable } from '@angular/core';
import { EMPTY, expand, Observable, reduce } from 'rxjs';
import { IWorkflow } from '../../models/workflow.models';
import { WORKFLOW_BATCH_SIZE } from '../../constants/api.constants';
import { WorkflowHttpService } from '../workflow-http/workflow-http.service';

/** Business logic layer for workflow operations. */
@Injectable({
  providedIn: 'root',
})
export class WorkflowService {
  /** Creates an instance of WorkflowService. */
  public constructor(private readonly workflowHttpService: WorkflowHttpService) {}

  /** Fetches all workflows across all pages for the optional workflow type. */
  public queryWorkflows(type?: string | null): Observable<IWorkflow[]> {
    return this.workflowHttpService
      .queryWorkflows({ take: WORKFLOW_BATCH_SIZE, ...(type ? { type } : {}) })
      .pipe(
      expand((response) => {
        if (!response.continuationToken) {
          return EMPTY;
        }

        return this.workflowHttpService.queryWorkflows({
          ...(type ? { type } : {}),
          take: WORKFLOW_BATCH_SIZE,
          continuationToken: response.continuationToken,
        });
      }),
      reduce((all: IWorkflow[], response) => [...all, ...response.workflows], []),
    );
  }
}
