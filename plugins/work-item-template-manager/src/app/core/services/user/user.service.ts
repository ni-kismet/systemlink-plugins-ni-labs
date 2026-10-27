import { Injectable } from '@angular/core';
import { EMPTY, expand, Observable, reduce, shareReplay } from 'rxjs';
import { IQueryUsersResponse } from '../../models/user.models';
import { USER_BATCH_SIZE } from '../../constants/api.constants';
import { UserHttpService } from '../user-http/user-http.service';

/** Service that fetches all users via paginated API calls and caches an id-to-name map. */
@Injectable({
  providedIn: 'root',
})
export class UserService {
  private cachedLoad$: Observable<IQueryUsersResponse> | null = null;

  /** Creates an instance of UserService. */
  public constructor(private readonly userHttpService: UserHttpService) {}

  /** Fetches all users once and caches the result. Safe to call multiple times. */
  public getAllUsers(): Observable<IQueryUsersResponse> {
    if (this.cachedLoad$) {
      return this.cachedLoad$;
    }

    this.cachedLoad$ = this.userHttpService.queryUsers({ take: USER_BATCH_SIZE }).pipe(
      expand((response) => {
        if (!response.continuationToken) {
          return EMPTY;
        }

        return this.userHttpService.queryUsers({
          take: USER_BATCH_SIZE,
          continuationToken: response.continuationToken,
        });
      }),

      reduce<IQueryUsersResponse, IQueryUsersResponse>(
        (acc, response) => ({
          ...response,
          users: [...acc.users, ...(response.users ?? [])],
        }),
        { users: [] },
      ),

      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.cachedLoad$;
  }
}
