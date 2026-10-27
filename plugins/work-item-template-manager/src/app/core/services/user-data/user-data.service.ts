import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ICreateOrUpdateUserDataItemRequest,
  ICreateOrUpdateUserDataItemResponse,
  IGetUserDataItemsResponse,
  IQueryUserDataItemsRequest,
} from '../../models/user-data.models';
import { USER_DATA_BATCH_SIZE } from '../../constants/api.constants';
import { UserDataHttpService } from '../user-data-http/user-data-http.service';

/** Data layer for NI User Data. Delegates to the HTTP service. */
@Injectable({
  providedIn: 'root',
})
export class UserDataService {
  /**
   * Creates an instance of UserDataService.
   */
  public constructor(private readonly userDataHttpService: UserDataHttpService) {}

  /** Queries user data items. */
  public queryUserDataItems<T = unknown>(
    body: IQueryUserDataItemsRequest,
    take = USER_DATA_BATCH_SIZE,
    skip = 0,
  ): Observable<IGetUserDataItemsResponse<T>> {
    return this.userDataHttpService.queryUserDataItems<T>(body, take, skip);
  }

  /** Creates or updates user data items. */
  public createOrUpdateUserDataItems<T = unknown>(
    body: ICreateOrUpdateUserDataItemRequest<T>[],
  ): Observable<ICreateOrUpdateUserDataItemResponse<T>> {
    return this.userDataHttpService.createOrUpdateUserDataItems<T>(body);
  }
}
