import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, shareReplay } from 'rxjs';
import { API_ROUTES } from '../../constants/api.constants';
import { ResourceFilterType } from '../../models/workitem-templates.models';

/**
 * Detects which query language the server can evaluate for work item template resource filters.
 * LUCENE needs the Elasticsearch-backed `materialized/search-systems` and `search-assets`
 * endpoints, which customers can disable; otherwise templates fall back to LINQ.
 */
@Injectable({
  providedIn: 'root',
})
export class ResourceFilterLanguageService {
  /** LUCENE when both search endpoints answer, else LINQ. Probed once per app session. */
  public readonly language$: Observable<ResourceFilterType>;

  /** Creates an instance of ResourceFilterLanguageService. */
  public constructor(private readonly httpClient: HttpClient) {
    this.language$ = forkJoin([
      this.probe(API_ROUTES.searchSystems, 'id'),
      this.probe(API_ROUTES.searchAssets, 'Id'),
    ]).pipe(
      map(([systems, assets]): ResourceFilterType => (systems && assets ? 'LUCENE' : 'LINQ')),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }

  /** True when the search endpoint returns a page; 404 (search disabled) or any error is false. */
  private probe(route: string, projection: string): Observable<boolean> {
    return this.httpClient.post(route, { take: 1, projection: [projection] }).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
