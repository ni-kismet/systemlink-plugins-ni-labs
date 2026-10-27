import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, EMPTY, expand, map, Observable, of, reduce, shareReplay } from 'rxjs';
import {
  IDynamicFormConfigurationRaw,
  IDynamicFormFieldRaw,
  IDynamicFormGroupRaw,
} from '../../models/dynamic-form-fields.models';

const DFF_BASE = '/nidynamicformfields/v1';

interface IPagedResponse<T> {
  continuationToken?: string | null;
  configurations?: T[];
  groups?: T[];
  fields?: T[];
}

/** HTTP layer for the SystemLink Dynamic Form Fields service. */
@Injectable({
  providedIn: 'root',
})
export class DynamicFormFieldsHttpService {
  private configurations$?: Observable<IDynamicFormConfigurationRaw[]>;
  private groups$?: Observable<IDynamicFormGroupRaw[]>;
  private fields$?: Observable<IDynamicFormFieldRaw[]>;

  public constructor(private readonly httpClient: HttpClient) {}

  /** Fetches and caches all dynamic form field configurations (all pages). */
  public getConfigurations(): Observable<IDynamicFormConfigurationRaw[]> {
    this.configurations$ ??= this.fetchAllPages<IDynamicFormConfigurationRaw>(
      'configurations',
      'configurations',
    );
    return this.configurations$;
  }

  /** Fetches and caches all dynamic form field groups (all pages). */
  public getGroups(): Observable<IDynamicFormGroupRaw[]> {
    this.groups$ ??= this.fetchAllPages<IDynamicFormGroupRaw>('groups', 'groups');
    return this.groups$;
  }

  /** Fetches and caches all dynamic form fields (all pages). */
  public getFields(): Observable<IDynamicFormFieldRaw[]> {
    this.fields$ ??= this.fetchAllPages<IDynamicFormFieldRaw>('fields', 'fields');
    return this.fields$;
  }

  /**
   * Follows the service's `continuationToken` pagination (100 items per page) until exhausted,
   * accumulating every page into a single array. Cached for the app session, except after a
   * transient failure so the next request retries. A 404 (service not installed) stays cached.
   */
  private fetchAllPages<T>(
    path: 'configurations' | 'groups' | 'fields',
    key: 'configurations' | 'groups' | 'fields',
  ): Observable<T[]> {
    const requestPage = (token?: string | null): Observable<IPagedResponse<T>> => {
      const url = token
        ? `${DFF_BASE}/${path}?continuationToken=${encodeURIComponent(token)}`
        : `${DFF_BASE}/${path}`;
      return this.httpClient.get<IPagedResponse<T>>(url);
    };
    const seenTokens = new Set<string>();

    return requestPage().pipe(
      expand((response) => {
        const token = response?.continuationToken;
        if (!token || seenTokens.has(token)) {
          return EMPTY;
        }
        seenTokens.add(token);
        return requestPage(token);
      }),
      reduce((accumulated, response) => accumulated.concat((response?.[key] as T[]) ?? []), [] as T[]),
      map((items) => items ?? []),
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse && error.status === 404)) {
          this.clearCache(path);
        }
        return of<T[]>([]);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }

  private clearCache(path: 'configurations' | 'groups' | 'fields'): void {
    if (path === 'configurations') {
      this.configurations$ = undefined;
    } else if (path === 'groups') {
      this.groups$ = undefined;
    } else {
      this.fields$ = undefined;
    }
  }
}
