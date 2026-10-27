/**
 * Work item query generator — `POST /niworkitem/v1/query-workitems`.
 *
 * @example
 * const query = workItems()
 *   .anyOf('state', ['NEW', 'IN_PROGRESS'])
 *   .equals('assignedTo', userId)
 *   .isBefore('timeline.dueDateTime', new Date())
 *   .orderBy('UPDATED_AT', { descending: true });
 *
 * await query.run(); // WorkItem[]
 */
import { DateStyle, FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import { GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by `state`. */
export const WorkItemState = {
  New: 'NEW',
  Defined: 'DEFINED',
  Reviewed: 'REVIEWED',
  Scheduled: 'SCHEDULED',
  InProgress: 'IN_PROGRESS',
  PendingApproval: 'PENDING_APPROVAL',
  Closed: 'CLOSED',
  Canceled: 'CANCELED',
} as const;

/** A work item state value. */
export type WorkItemState = (typeof WorkItemState)[keyof typeof WorkItemState];

/** Values accepted by `orderBy`. */
export const WorkItemOrderBy = {
  Id: 'ID',
  UpdatedAt: 'UPDATED_AT',
} as const;

/** A work item `orderBy` value. */
export type WorkItemOrderBy = (typeof WorkItemOrderBy)[keyof typeof WorkItemOrderBy];

const stateValues: FieldEnumValue[] = Object.values(WorkItemState).map((value) => ({ label: value, value }));

/** Filterable fields documented by niworkitem for query-workitems. */
export const workItemFields: Record<string, FieldDef> = {
  id: fieldDef('Work item ID', 'id', FieldType.String, { note: 'Only = and != are supported.' }),
  name: fieldDef('Name', 'name', FieldType.String),
  type: fieldDef('Type', 'type', FieldType.String),
  state: fieldDef('State', 'state', FieldType.Enum, { values: stateValues }),
  substate: fieldDef('Substate', 'substate', FieldType.String),
  description: fieldDef('Description', 'description', FieldType.String),
  parentId: fieldDef('Parent ID', 'parentId', FieldType.String),
  templateId: fieldDef('Template ID', 'templateId', FieldType.String),
  workflowId: fieldDef('Workflow ID', 'workflowId', FieldType.String),
  assignedTo: fieldDef('Assigned to', 'assignedTo', FieldType.String),
  requestedBy: fieldDef('Requested by', 'requestedBy', FieldType.String),
  testProgram: fieldDef('Test program', 'testProgram', FieldType.String),
  partNumber: fieldDef('Part number', 'partNumber', FieldType.String),
  dashboard: fieldDef('Dashboard ID', 'dashboard', FieldType.String),
  createdBy: fieldDef('Created by', 'createdBy', FieldType.String),
  createdAt: fieldDef('Created', 'createdAt', FieldType.DateTime),
  updatedBy: fieldDef('Updated by', 'updatedBy', FieldType.String),
  updatedAt: fieldDef('Updated', 'updatedAt', FieldType.DateTime),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  fileIdsFromTemplate: fieldDef('Template file IDs', 'fileIdsFromTemplate', FieldType.StringArray),
  'timeline.earliestStartDateTime': fieldDef('Earliest start', 'timeline.earliestStartDateTime', FieldType.DateTime),
  'timeline.dueDateTime': fieldDef('Due', 'timeline.dueDateTime', FieldType.DateTime),
  'timeline.estimatedDurationInSeconds': fieldDef('Estimated duration (s)', 'timeline.estimatedDurationInSeconds', FieldType.Number),
  'schedule.plannedStartDateTime': fieldDef('Planned start', 'schedule.plannedStartDateTime', FieldType.DateTime),
  'schedule.plannedEndDateTime': fieldDef('Planned end', 'schedule.plannedEndDateTime', FieldType.DateTime),
  'schedule.plannedDurationInSeconds': fieldDef('Planned duration (s)', 'schedule.plannedDurationInSeconds', FieldType.Number),
  'resources.systems.selections.id': fieldDef('System ID', 'resources.systems.selections.id', FieldType.String),
  'resources.systems.selections.targetLocationId': fieldDef('System target location', 'resources.systems.selections.targetLocationId', FieldType.String),
  'resources.systems.filter': fieldDef('Systems filter', 'resources.systems.filter', FieldType.String),
  'resources.assets.selections.id': fieldDef('Asset ID', 'resources.assets.selections.id', FieldType.String),
  'resources.assets.selections.targetLocationId': fieldDef('Asset target location', 'resources.assets.selections.targetLocationId', FieldType.String),
  'resources.assets.selections.targetSystemId': fieldDef('Asset target system', 'resources.assets.selections.targetSystemId', FieldType.String),
  'resources.assets.selections.targetParentId': fieldDef('Asset target parent', 'resources.assets.selections.targetParentId', FieldType.String),
  'resources.assets.filter': fieldDef('Assets filter', 'resources.assets.filter', FieldType.String),
  'resources.duts.selections.id': fieldDef('DUT ID', 'resources.duts.selections.id', FieldType.String),
  'resources.duts.selections.targetLocationId': fieldDef('DUT target location', 'resources.duts.selections.targetLocationId', FieldType.String),
  'resources.duts.selections.targetSystemId': fieldDef('DUT target system', 'resources.duts.selections.targetSystemId', FieldType.String),
  'resources.duts.selections.targetParentId': fieldDef('DUT target parent', 'resources.duts.selections.targetParentId', FieldType.String),
  'resources.duts.filter': fieldDef('DUTs filter', 'resources.duts.filter', FieldType.String),
  'resources.fixtures.selections.id': fieldDef('Fixture ID', 'resources.fixtures.selections.id', FieldType.String),
  'resources.fixtures.selections.targetLocationId': fieldDef('Fixture target location', 'resources.fixtures.selections.targetLocationId', FieldType.String),
  'resources.fixtures.selections.targetSystemId': fieldDef('Fixture target system', 'resources.fixtures.selections.targetSystemId', FieldType.String),
  'resources.fixtures.selections.targetParentId': fieldDef('Fixture target parent', 'resources.fixtures.selections.targetParentId', FieldType.String),
  'resources.fixtures.filter': fieldDef('Fixtures filter', 'resources.fixtures.filter', FieldType.String),
};

/** Fluent query generator for work items. */
export class WorkItemsQuery extends QueryGenerator {
  /** The niworkitem query-workitems endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'work items',
    url: '/niworkitem/v1/query-workitems',
    method: 'POST',
    responseKey: 'workItems',
    totalCountKey: 'totalCount',
    fields: workItemFields,
    propertiesField: 'properties',
    orderByValues: Object.values(WorkItemOrderBy),
    dateStyle: DateStyle.Parse,
    descendingKey: 'descending',
    paging: 'continuationToken',
  };

  /** Assembles the query-workitems body, using continuationToken paging. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    delete body['skip']; // niworkitem pages with continuationToken, not skip.
    return body;
  }
}

/** Creates a new work item query generator. */
export function workItems(options?: QueryGeneratorOptions): WorkItemsQuery {
  return new WorkItemsQuery(options);
}
