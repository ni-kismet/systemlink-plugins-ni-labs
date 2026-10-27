export interface IQuerySystemsRequest {
  take?: number;
  filter?: string;
  continuationToken?: string;
}

export interface IQuerySystemsResponse {
  systems?: Record<string, unknown>[];
  continuationToken?: string;
  totalCount?: number;
}
