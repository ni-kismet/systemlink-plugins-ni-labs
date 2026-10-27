/**
 * System query generator — `POST /nisysmgmt/v1/query-systems`.
 *
 * Note the shape of this service: most system data lives under a `<section>.data`
 * envelope (`properties.data`, `keywords.data`, …) and the response array is
 * `data`, not `systems`.
 *
 * @example
 * const query = systems()
 *   .contains('alias', 'lab-')
 *   .equals('connected.data.state', 'CONNECTED')
 *   .property('Location', 'Austin')
 *   .take(200);
 *
 * await query.run(); // system objects
 */
import { DateStyle, FieldDef, FieldType, fieldDef } from '../core/linq';
import { FilterValue, GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';

/** Filterable fields documented by nisysmgmt for query-systems. */
export const systemFields: Record<string, FieldDef> = {
  id: fieldDef('System ID', 'id', FieldType.String),
  alias: fieldDef('Alias', 'alias', FieldType.String),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  createdTimestamp: fieldDef('Created', 'createdTimestamp', FieldType.DateTime),
  lastUpdatedTimestamp: fieldDef('Last updated', 'lastUpdatedTimestamp', FieldType.DateTime),
  'activation.data.activated': fieldDef('Activated', 'activation.data.activated', FieldType.Boolean),
  'activation.data.licenseName': fieldDef('License name', 'activation.data.licenseName', FieldType.String),
  'activation.data.licenseVersion': fieldDef('License version', 'activation.data.licenseVersion', FieldType.String),
  'connected.data.state': fieldDef('Connection state', 'connected.data.state', FieldType.String),
  'status.data.http_connected': fieldDef('HTTP connected', 'status.data.http_connected', FieldType.Boolean),
  'keywords.data': fieldDef('Keywords', 'keywords.data', FieldType.StringArray),
  'properties.data': fieldDef('Properties', 'properties.data', FieldType.Properties),
  'grains.data': fieldDef('Grains', 'grains.data', FieldType.Properties),
  'packages.data': fieldDef('Packages', 'packages.data', FieldType.Properties),
  'feeds.data': fieldDef('Feeds', 'feeds.data', FieldType.Properties),
};

/** Fluent query generator for systems. */
export class SystemsQuery extends QueryGenerator {
  /** The nisysmgmt query-systems endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'systems',
    url: '/nisysmgmt/v1/query-systems',
    method: 'POST',
    responseKey: 'data',
    totalCountKey: 'count',
    fields: systemFields,
    propertiesField: 'properties.data',
    // orderBy is a free-form property name on this service, not an enum.
    orderByValues: undefined,
    dateStyle: DateStyle.Parse,
    paging: 'skip',
  };

  /** `keywords.data.Contains("value")` */
  public override hasKeyword(value: FilterValue, field = 'keywords.data'): this {
    return super.hasKeyword(value, field);
  }

  /** `!keywords.data.Contains("value")` */
  public override lacksKeyword(value: FilterValue, field = 'keywords.data'): this {
    return super.lacksKeyword(value, field);
  }

  /** `grains.data["boottime"] = "..."` */
  public grain(key: string, value: FilterValue): this {
    return this.property(key, value, 'grains.data');
  }

  /** Assembles the query-systems body, coercing projection to a string form. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    // This endpoint takes a projection *string*, e.g. 'new(id, alias)'.
    const projection = body['projection'];
    if (Array.isArray(projection)) {
      body['projection'] = `new(${projection.join(', ')})`;
    }
    delete body['continuationToken'];
    delete body['returnCount'];
    delete body['descending'];
    return body;
  }
}

/** Creates a new system query generator. */
export function systems(options?: QueryGeneratorOptions): SystemsQuery {
  return new SystemsQuery(options);
}
