export interface IQueryProductsRequest {
  take?: number;
  projection?: string[];
  orderBy?: string;
  descending?: boolean;
  filter?: string;
  continuationToken?: string;
}

export interface IProduct {
  name: string | null;
  partNumber: string;
  family: string | null;
  workspace?: string;
  id: string;
}

export interface IQueryProductsResponse {
  products: IProduct[];
  continuationToken?: string;
  totalCount?: number;
}

/** Product names indexed by workspace, then part number. */
export type ProductNameMap = Map<string, Map<string, string>>;
