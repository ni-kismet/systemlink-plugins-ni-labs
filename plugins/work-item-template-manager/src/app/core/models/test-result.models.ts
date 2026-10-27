/** Fields by which test results can be ordered. */
export type TestResultOrderByField =
  | 'ID'
  | 'STARTED_AT'
  | 'UPDATED_AT'
  | 'PROGRAM_NAME'
  | 'TOTAL_TIME_IN_SECONDS';

/** Request body for querying test results. */
export interface IQueryResultsRequest {
  filter?: string;
  take?: number;
  continuationToken?: string;
  orderBy?: TestResultOrderByField;
  descending?: boolean;
}

/** Fields that can be queried via query-result-values. */
export type TestResultValueField = 'PROGRAM_NAME';

/** Request body for querying distinct values from test results. */
export interface IQueryResultValuesRequest {
  field: TestResultValueField;
  filter?: string;
  take?: number;
}

/** Minimal result shape needed for duration auto-population. */
export interface ITestResult {
  id: string;
  programName?: string | null;
  totalTimeInSeconds?: number | null;
}

/** Response from query results API. */
export interface IQueryResultsResponse {
  results: ITestResult[];
  continuationToken?: string;
  totalCount?: number;
}
