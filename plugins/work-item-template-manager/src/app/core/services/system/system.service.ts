import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  FilterDataType,
  FilterFieldDef,
  FilterFieldEnumValue,
  FilterOperation,
  fieldDef,
} from '../../library/systemlink-query-generators';
import { LocationService } from '../location/location.service';

// Same field syntax and operators as SystemLink's system query builder: grains are untyped
// objects, so string comparisons go through `string(...)`.
const GRAIN_STRING_OPERATIONS: FilterOperation[] = [
  FilterOperation.Equals,
  FilterOperation.NotEquals,
  FilterOperation.Contains,
  FilterOperation.NotContains,
];

function objectStringField(label: string, path: string): FilterFieldDef {
  return fieldDef(label, `string(${path})`, FilterDataType.String, { operations: GRAIN_STRING_OPERATIONS });
}

// Object booleans only compare as their lowercase JSON text (`string(x)` yields no match).
function objectBooleanField(label: string, path: string): FilterFieldDef {
  return fieldDef(label, `${path}.ToString()`, FilterDataType.Enum, {
    values: [
      { label: $localize`True`, value: 'true' },
      { label: $localize`False`, value: 'false' },
    ],
  });
}

/**
 * Builds the SystemLink filter-field definitions for the systems query builder.
 *
 * Returns a fresh array each call so callers can safely mutate per-field `values`
 * at runtime. Uses the standalone, dependency-free `fieldDef()` helper; operation
 * sets default to `defaultOperationsFor(dataType)` unless a field overrides them.
 */
export function createSystemFilterFields(locationValues: FilterFieldEnumValue[] = []): FilterFieldDef[] {
  const locationFields =
    locationValues.length > 0
      ? [
          fieldDef($localize`Location`, 'locationId', FilterDataType.Enum, {
            values: locationValues,
            operations: [
              FilterOperation.Equals,
              FilterOperation.NotEquals,
              FilterOperation.IsEmpty,
              FilterOperation.IsNotEmpty,
            ],
          }),
        ]
      : [];

  return [
    fieldDef($localize`Connection status`, 'connected.data.state', FilterDataType.Enum, {
      values: [
        { label: $localize`Activated without connection`, value: 'ACTIVATED_WITHOUT_CONNECTION' },
        { label: $localize`Approved`, value: 'APPROVED' },
        { label: $localize`Disconnected`, value: 'DISCONNECTED' },
        { label: $localize`Connected`, value: 'CONNECTED' },
        { label: $localize`Connected (refresh failed)`, value: 'CONNECTED_REFRESH_FAILED' },
        { label: $localize`Connected (refresh pending)`, value: 'CONNECTED_REFRESH_PENDING' },
        { label: $localize`Virtual`, value: 'VIRTUAL' },
      ],
    }),
    objectStringField($localize`Description`, 'grains.data.computer_desc'),
    objectBooleanField($localize`Has HTTP connection`, 'status.data.http_connected'),
    objectStringField($localize`Hostname`, 'grains.data.localhost'),
    fieldDef($localize`Keyword`, 'keywords.data', FilterDataType.StringArray, {
      operations: [FilterOperation.Contains, FilterOperation.NotContains],
    }),
    ...locationFields,
    objectBooleanField($localize`Locked`, 'grains.data.minion_blackout'),
    fieldDef($localize`Minion ID`, 'id', FilterDataType.String),
    objectStringField($localize`Model`, 'grains.data.productname'),
    fieldDef($localize`Name`, 'alias', FilterDataType.String),
    objectStringField($localize`OS family`, 'grains.data.os_family'),
    objectStringField($localize`OS version`, 'grains.data.osrelease'),
    fieldDef($localize`Package`, 'packages.data', FilterDataType.Properties, {
      operations: [FilterOperation.ContainsKey, FilterOperation.NotContainsKey],
    }),
    // Rendered as SystemLink's package-version template in the slideout (see toFilterCondition).
    fieldDef($localize`Package and version`, 'packages', FilterDataType.Properties, {
      operations: [
        FilterOperation.KeyValueMatches,
        FilterOperation.KeyValueNotMatches,
        FilterOperation.GreaterThan,
        FilterOperation.GreaterThanOrEqual,
        FilterOperation.LessThan,
        FilterOperation.LessThanOrEqual,
      ],
    }),
    fieldDef($localize`Property`, 'properties.data', FilterDataType.Properties),
    objectBooleanField($localize`Secured`, 'grains.data.is_superuser_password_set'),
    objectStringField($localize`Serial number`, 'grains.data.serialnumber'),
    fieldDef($localize`System start time`, 'grains.data.boottime', FilterDataType.DateTime),
    objectStringField($localize`System tag`, 'grains.data.system_tag'),
    objectStringField($localize`SystemLink version`, 'grains.data.nisystemlink_version'),
    objectStringField($localize`Vendor`, 'grains.data.manufacturer'),
    fieldDef($localize`Workspace`, 'workspace', FilterDataType.Enum, { values: [] }),
  ];
}

/** Business logic for systems query operations. */
@Injectable({
  providedIn: 'root',
})
export class SystemService {
  /** Creates an instance of SystemService. */
  public constructor(private readonly locationService: LocationService) {}

  /** Returns documented Systems Dynamic LINQ filter fields with types for query builder behavior. */
  public queryDistinctSystemFieldsByWorkspace(workspaceId: string): Observable<FilterFieldDef[]> {
    void workspaceId;
    return this.locationService
      .getLocationFilterValues()
      .pipe(map((locations) => createSystemFilterFields(locations)));
  }
}
