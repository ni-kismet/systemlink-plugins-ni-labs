export interface IQueryAssetsRequest {
  take?: number;
  filter?: string;
  continuationToken?: string;
}

export interface IQueryAssetsResponse {
  assets?: Record<string, unknown>[];
  continuationToken?: string;
  totalCount?: number;
}
