interface IApiError {
  name: string;
  message: string;
  code?: string;
  resourceType?: string;
  resourceId?: string;
  innerErrors?: IApiError[];
}

export interface IQueryUserDataItemsRequest {
  applications?: string[];
  names?: string[];
}

export interface IUserDataItem<T = unknown> {
  id?: string;
  user?: string;
  application: string;
  category: string;
  name: string;
  value?: T;
  visibleToOthers?: boolean;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IGetUserDataItemsResponse<T = unknown> {
  items: IUserDataItem<T>[];
  totalCount: number;
}

export interface ICreateOrUpdateUserDataItemRequest<T = unknown> {
  id?: string;
  application: string;
  category: string;
  name: string;
  value: T;
  visibleToOthers?: boolean;
  expectedRevision?: number;
}

export interface ICreateOrUpdateUserDataItemResponse<T = unknown> {
  succeeded: IUserDataItem<T>[];
  failed: ICreateOrUpdateUserDataItemRequest<T>[];
  error?: IApiError;
}
