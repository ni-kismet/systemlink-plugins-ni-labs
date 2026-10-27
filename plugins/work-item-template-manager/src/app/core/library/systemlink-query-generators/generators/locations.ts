/**
 * Location query generator — `GET /nilocation/v1/locations`.
 *
 * `nilocation` has no Dynamic LINQ query endpoint. Enabled, type and scan code
 * are pushed to the service as query parameters; any other condition is
 * evaluated client-side against the response.
 *
 * @example
 * const query = locations()
 *   .enabled(true)
 *   .type('Calibration lab')
 *   .startsWith('pathWithNames', '/Lab/')
 *   .property('Building', 'C');
 *
 * await query.run(); // Location[]
 */
import { ListGenerator } from '../core/list-generator';
import { FieldDef, FieldType, fieldDef } from '../core/linq';
import { GeneratorSpec, QueryGeneratorOptions } from '../core/query-generator';

/** Fields on a location, filterable client-side. */
export const locationFields: Record<string, FieldDef> = {
  id: fieldDef('Location ID', 'id', FieldType.String),
  name: fieldDef('Name', 'name', FieldType.String),
  type: fieldDef('Type', 'type', FieldType.String),
  description: fieldDef('Description', 'description', FieldType.String),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  enabled: fieldDef('Enabled', 'enabled', FieldType.Boolean),
  parentId: fieldDef('Parent ID', 'parentId', FieldType.String),
  path: fieldDef('Path (IDs)', 'path', FieldType.String),
  pathWithNames: fieldDef('Path (names)', 'pathWithNames', FieldType.String),
  scanCode: fieldDef('Scan code', 'scanCode', FieldType.String),
  keywords: fieldDef('Keywords', 'keywords', FieldType.StringArray),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  createdAt: fieldDef('Created', 'createdAt', FieldType.DateTime),
  createdBy: fieldDef('Created by', 'createdBy', FieldType.String),
  updatedAt: fieldDef('Updated', 'updatedAt', FieldType.DateTime),
  updatedBy: fieldDef('Updated by', 'updatedBy', FieldType.String),
  pathUpdatedAt: fieldDef('Path updated', 'pathUpdatedAt', FieldType.DateTime),
  pathUpdatedBy: fieldDef('Path updated by', 'pathUpdatedBy', FieldType.String),
};

/** Fluent query generator for locations (GET list + client-side filtering). */
export class LocationsQuery extends ListGenerator {
  /** The nilocation locations endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'locations',
    url: '/nilocation/v1/locations',
    method: 'GET',
    responseKey: 'locations',
    fields: locationFields,
    propertiesField: 'properties',
    supportsFilter: false,
    paging: null,
  };

  /** Server-side filter: only enabled (or only disabled) locations. */
  public enabled(value = true): this {
    return this.param('enabled', value);
  }

  /** Server-side filter: only locations of this type. */
  public type(value: string): this {
    return this.param('type', value);
  }

  /** Server-side filter: the location with this scan code. */
  public scanCode(value: string): this {
    return this.param('scanCode', value);
  }
}

/** Creates a new location query generator. */
export function locations(options?: QueryGeneratorOptions): LocationsQuery {
  return new LocationsQuery(options);
}
