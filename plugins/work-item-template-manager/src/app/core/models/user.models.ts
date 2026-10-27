import { UserSortBy, UserOrder } from '../constants/user.constants';

interface IUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface IQueryUsersRequest {
  filter?: string;
  sortBy?: UserSortBy;
  order?: UserOrder;
  take?: number;
  continuationToken?: string;
}

export interface IQueryUsersResponse {
  users: IUser[];
  continuationToken?: string;
}
