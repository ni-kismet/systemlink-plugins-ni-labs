/** A workflow fetched from the SLE workflows API. */
export interface IWorkflow {
  id: string;
  name: string | null;
  workspace: string | null;
}

/** Request body for querying workflows. */
export interface IQueryWorkflowsRequest {
  type?: string | null;
  take?: number;
  continuationToken?: string;
}

/** Response from the query workflows API. */
export interface IQueryWorkflowsResponse {
  workflows: IWorkflow[];
  continuationToken?: string;
}
