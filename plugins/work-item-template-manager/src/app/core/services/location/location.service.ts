import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, combineLatest, EMPTY, expand, map, Observable, of, reduce, shareReplay } from 'rxjs';
import { API_ROUTES } from '../../constants/api.constants';
import { FilterFieldEnumValue } from '../../library/systemlink-query-generators';

interface ILocation {
  id: string;
  name: string;
  pathWithNames?: string;
}

interface IGetLocationsResponse {
  locations?: ILocation[];
}

interface IQuerySystemAliasesResponse {
  data?: { id: string; alias?: string }[];
}

const SYSTEM_PAGE_SIZE = 1000;

const byLabel = (a: FilterFieldEnumValue, b: FilterFieldEnumValue): number =>
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });

/** Loads the Location filter options, mirroring the SystemLink query builders. */
@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private locationValues$?: Observable<FilterFieldEnumValue[]>;
  private assetLocationValues$?: Observable<FilterFieldEnumValue[]>;

  /** Creates an instance of LocationService. */
  public constructor(private readonly httpClient: HttpClient) {}

  /** Physical locations as `name: path` options (value = location ID), cached for the session. */
  public getLocationFilterValues(): Observable<FilterFieldEnumValue[]> {
    // nilocation is optional (absent on older servers); treat any failure as "no locations".
    this.locationValues$ ??= this.httpClient.get<IGetLocationsResponse>(API_ROUTES.getLocations).pipe(
      map((response) =>
        (response.locations ?? [])
          .map((location) => ({
            label: location.pathWithNames ? `${location.name}: ${location.pathWithNames}` : location.name,
            value: location.id,
          }))
          .sort(byLabel),
      ),
      catchError(() => of<FilterFieldEnumValue[]>([])),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.locationValues$;
  }

  /** Asset locations: parent systems (by alias) followed by physical locations, as in SystemLink Assets. */
  public getAssetLocationFilterValues(): Observable<FilterFieldEnumValue[]> {
    this.assetLocationValues$ ??= combineLatest([this.getSystemAliasValues(), this.getLocationFilterValues()]).pipe(
      map(([systems, locations]) => [...systems, ...locations]),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.assetLocationValues$;
  }

  private getSystemAliasValues(): Observable<FilterFieldEnumValue[]> {
    const page = (skip: number): Observable<IQuerySystemAliasesResponse & { skip: number }> =>
      this.httpClient
        .post<IQuerySystemAliasesResponse>(API_ROUTES.querySystems, {
          take: SYSTEM_PAGE_SIZE,
          skip,
          projection: 'new(id, alias)',
        })
        .pipe(map((response) => ({ ...response, skip })));

    return page(0).pipe(
      expand((response) =>
        (response.data?.length ?? 0) < SYSTEM_PAGE_SIZE ? EMPTY : page(response.skip + SYSTEM_PAGE_SIZE),
      ),
      reduce(
        (values, response) => [
          ...values,
          ...(response.data ?? []).map((system) => ({ label: system.alias || system.id, value: system.id })),
        ],
        [] as FilterFieldEnumValue[],
      ),
      map((values) => values.sort(byLabel)),
      catchError(() => of<FilterFieldEnumValue[]>([])),
    );
  }
}
