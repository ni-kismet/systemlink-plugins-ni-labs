import { WorkItemType } from '../constants/workitem-types.constant';

/** Persisted sort state for a single column. */
export interface IColumnSortState {
  columnId: string;
  sortDirection: 'ascending' | 'descending';
  sortIndex: number;
}

interface IGridViewState {
  visibleColumns: string[];
  groupByColumns?: string[];
  sortState?: IColumnSortState[];
}

/** Value type for current grid column persistence. */
export interface ICurrentGridViewState {
  gridViewState: IGridViewState;
}

export interface IWorkitemTemplate {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  productFamilies: string[] | null;
  partNumbers: string[] | null;
  templateGroup: string | null;
  testProgram: string | null;
  timeline?: IWorkitemTemplateTimeline | null;
  type: WorkItemType | null;
  workspace: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fileIds?: string[] | null;
  properties: Record<string, unknown> | null;
  workflowId: string | null;
  dashboard?: IDashboardReferenceDefinition;
  resources?: ITemplateResourcesDefinition;
}

/** Timeline metadata attached to a template. */
export interface IWorkitemTemplateTimeline {
  estimatedDurationInSeconds?: number | null;
}

/** Dashboard reference attached to a template. */
export interface IDashboardReferenceDefinition {
  id?: string | null;
  variables?: Record<string, string> | null;
}

/** Filter criteria for a single resource type on a template. */
export interface IWorkitemTemplateResourceFilter {
  filter?: string | null;
}

/**
 * Query language used to evaluate the resource filters. LUCENE needs the Elasticsearch-backed
 * search services; SLE 2026-10 defaults omitted values to LUCENE, so the app always sets it.
 */
export type ResourceFilterType = 'LINQ' | 'LUCENE';

/** Resource filters used when creating or updating a template. */
export interface ITemplateResourcesDefinition {
  filterType?: ResourceFilterType;
  systems?: IWorkitemTemplateResourceFilter;
  duts?: IWorkitemTemplateResourceFilter;
  fixtures?: IWorkitemTemplateResourceFilter;
  assets?: IWorkitemTemplateResourceFilter;
}

/** Payload for creating a single testplan template. */
export interface ICreateWorkitemTemplateRequest {
  name: string;
  templateGroup: string;
  type: WorkItemType;
  productFamilies?: string[] | null;
  partNumbers?: string[] | null;
  summary?: string | null;
  description?: string | null;
  testProgram?: string | null;
  timeline?: IWorkitemTemplateTimeline;
  workspace?: string | null;
  fileIds?: string[] | null;
  properties?: Record<string, string> | null;
  workflowId?: string | null;
  resources?: ITemplateResourcesDefinition;
  dashboard?: IDashboardReferenceDefinition;
}

/** Wrapper request body for the create workitem templates API. */
export interface ICreateWorkitemTemplatesRequest {
  workItemTemplates: ICreateWorkitemTemplateRequest[];
}

/** Response from the create workitem templates API (covers both full and partial success). */
export interface ICreateWorkitemTemplatesResponse {
  createdWorkItemTemplates?: IWorkitemTemplate[];
  failedWorkItemTemplates?: ICreateWorkitemTemplateRequest[];
}

/** Payload for updating a single testplan template. All fields except id are optional. */
export interface IUpdateWorkitemTemplateRequest {
  id: string;
  type?: WorkItemType | null;
  name?: string | null;
  templateGroup?: string | null;
  productFamilies?: string[] | null;
  partNumbers?: string[] | null;
  summary?: string | null;
  description?: string | null;
  testProgram?: string | null;
  timeline?: IWorkitemTemplateTimeline;
  workspace?: string | null;
  fileIds?: string[] | null;
  properties?: Record<string, string> | null;
  workflowId?: string | null;
  resources?: ITemplateResourcesDefinition;
  dashboard?: IDashboardReferenceDefinition;
}

/** Wrapper request body for the update workitem templates API. */
export interface IUpdateWorkitemTemplatesRequest {
  workItemTemplates: IUpdateWorkitemTemplateRequest[];
  replace?: boolean;
}

/** Response from the update workitem templates API. */
export interface IUpdateWorkitemTemplatesResponse {
  updatedWorkItemTemplates?: IWorkitemTemplate[];
  failedWorkItemTemplates?: IUpdateWorkitemTemplateRequest[];
}

export interface IDeleteWorkitemTemplatesRequest {
  ids: string[];
}

export interface IDeleteWorkitemTemplatesResponse {
  deletedIds?: string[];
  failedIds?: string[];
}

/** Fields by which workitem templates can be ordered in query requests. */
export type WorkitemTemplateOrderByField =
  | 'ID'
  | 'NAME'
  | 'TEMPLATE_GROUP'
  | 'CREATED_AT'
  | 'UPDATED_AT';

export interface IQueryWorkitemTemplatesRequest {
  filter?: string;
  take?: number;
  orderBy?: WorkitemTemplateOrderByField;
  continuationToken?: string;
}

export interface IQueryWorkitemTemplatesResponse {
  workItemTemplates: IWorkitemTemplate[];
  continuationToken?: string;
  totalCount?: number;
}
