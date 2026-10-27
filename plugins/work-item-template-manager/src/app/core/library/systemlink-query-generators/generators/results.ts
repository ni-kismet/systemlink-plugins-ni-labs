/**
 * Test result query generator — `POST /nitestmonitor/v2/query-results`.
 *
 * @example
 * const query = results()
 *   .equals('partNumber', 'PN-1234')
 *   .anyOf('status.statusType', ['Failed', 'Errored'])
 *   .inLastDays('startedAt', 7)
 *   .property('Location', 'Austin')
 *   .orderBy('STARTED_AT', { descending: true })
 *   .take(500);
 *
 * query.filter;        // the Dynamic LINQ string
 * query.build();       // the full request body
 * await query.run();   // TestResult[]
 */
import { DateStyle, FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import { GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';
import { ProductsQuery } from './products';

/** Status values accepted by `status.statusType`. */
export const ResultStatusType = {
  Looping: 'Looping',
  Skipped: 'Skipped',
  Custom: 'Custom',
  Done: 'Done',
  Passed: 'Passed',
  Failed: 'Failed',
  Running: 'Running',
  Waiting: 'Waiting',
  Terminated: 'Terminated',
  Errored: 'Errored',
  TimedOut: 'TimedOut',
} as const;

/** A test result status value. */
export type ResultStatusType = (typeof ResultStatusType)[keyof typeof ResultStatusType];

/** Values accepted by `orderBy`. */
export const ResultOrderBy = {
  Id: 'ID',
  StartedAt: 'STARTED_AT',
  UpdatedAt: 'UPDATED_AT',
  ProgramName: 'PROGRAM_NAME',
  SystemId: 'SYSTEM_ID',
  HostName: 'HOST_NAME',
  Operator: 'OPERATOR',
  SerialNumber: 'SERIAL_NUMBER',
  PartNumber: 'PART_NUMBER',
  Properties: 'PROPERTIES',
  TotalTimeInSeconds: 'TOTAL_TIME_IN_SECONDS',
} as const;

/** A result `orderBy` value. */
export type ResultOrderBy = (typeof ResultOrderBy)[keyof typeof ResultOrderBy];

const statusValues: FieldEnumValue[] = Object.values(ResultStatusType).map((value) => ({ label: value, value }));

/** Filterable fields documented by nitestmonitor v2 for results. */
export const resultFields: Record<string, FieldDef> = {
  id: fieldDef('Result ID', 'id', FieldType.String),
  'status.statusType': fieldDef('Status', 'status.statusType', FieldType.Enum, { values: statusValues }),
  'status.statusName': fieldDef('Status name', 'status.statusName', FieldType.String),
  startedAt: fieldDef('Started', 'startedAt', FieldType.DateTime),
  updatedAt: fieldDef('Updated', 'updatedAt', FieldType.DateTime),
  programName: fieldDef('Program name', 'programName', FieldType.String),
  systemId: fieldDef('System ID', 'systemId', FieldType.String),
  hostName: fieldDef('Host name', 'hostName', FieldType.String),
  operator: fieldDef('Operator', 'operator', FieldType.String),
  serialNumber: fieldDef('Serial number', 'serialNumber', FieldType.String),
  partNumber: fieldDef('Part number', 'partNumber', FieldType.String),
  productName: fieldDef('Product name', 'productName', FieldType.String, {
    note: 'Comparison operators only — Contains/Any are not supported.',
  }),
  totalTimeInSeconds: fieldDef('Total time (s)', 'totalTimeInSeconds', FieldType.Number),
  keywords: fieldDef('Keywords', 'keywords', FieldType.StringArray),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  fileIds: fieldDef('File IDs', 'fileIds', FieldType.StringArray),
  dataTableIds: fieldDef('Data table IDs', 'dataTableIds', FieldType.StringArray),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  workspaceName: fieldDef('Workspace name', 'workspaceName', FieldType.String, {
    note: 'Comparison operators only.',
  }),
};

/** Fluent query generator for test results. */
export class ResultsQuery extends QueryGenerator {
  /** The nitestmonitor query-results endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'results',
    url: '/nitestmonitor/v2/query-results',
    method: 'POST',
    responseKey: 'results',
    totalCountKey: 'totalCount',
    fields: resultFields,
    propertiesField: 'properties',
    orderByValues: Object.values(ResultOrderBy),
    dateStyle: DateStyle.Compare,
    descendingKey: 'descending',
    paging: 'continuationToken',
  };

  /**
   * Adds a `productFilter`, a second LINQ filter evaluated against the result's
   * product. Accepts a raw string or a {@link ProductsQuery}.
   */
  public productFilter(filterOrQuery: string | ProductsQuery): this {
    this.state.productFilter =
      typeof filterOrQuery === 'string' ? filterOrQuery : filterOrQuery?.filter;
    return this;
  }

  /** Sorts by a property key; requires `orderBy('PROPERTIES')`. */
  public orderByKey(key: string, comparison?: string): this {
    this.state.orderByKey = key;
    if (comparison) {
      this.state.orderByComparisonType = comparison;
    }
    return this;
  }

  /** Assembles the query-results body, using continuationToken paging. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    delete body['skip']; // nitestmonitor pages with continuationToken, not skip.
    if (this.state.productFilter) {
      body['productFilter'] = this.state.productFilter;
    }
    if (this.state.orderByKey) {
      body['orderByKey'] = this.state.orderByKey;
    }
    if (this.state.orderByComparisonType) {
      body['orderByComparisonType'] = this.state.orderByComparisonType;
    }
    return body;
  }
}

/** Creates a new test result query generator. */
export function results(options?: QueryGeneratorOptions): ResultsQuery {
  return new ResultsQuery(options);
}
