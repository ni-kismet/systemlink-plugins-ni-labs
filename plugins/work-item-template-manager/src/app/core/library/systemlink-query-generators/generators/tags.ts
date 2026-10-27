/**
 * Tag query generator — `POST /nitag/v2/query-tags-with-values`.
 *
 * @example
 * const query = tags()
 *   .startsWith('path', 'Line1.')
 *   .equals('type', 'DOUBLE')
 *   .property('Unit', 'degC')
 *   .take(500);
 *
 * await query.run(); // TagWithValue[]
 */
import { DateStyle, FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import { GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by `type`. */
export const TagType = {
  Double: 'DOUBLE',
  Int: 'INT',
  UInt64: 'U_INT64',
  String: 'STRING',
  Boolean: 'BOOLEAN',
  DateTime: 'DATE_TIME',
} as const;

/** A tag data type value. */
export type TagType = (typeof TagType)[keyof typeof TagType];

const typeValues: FieldEnumValue[] = Object.values(TagType).map((value) => ({ label: value, value }));

/** Filterable fields on tag metadata. */
export const tagFields: Record<string, FieldDef> = {
  id: fieldDef('Tag ID', 'id', FieldType.String),
  path: fieldDef('Path', 'path', FieldType.String),
  type: fieldDef('Type', 'type', FieldType.Enum, { values: typeValues }),
  keywords: fieldDef('Keywords', 'keywords', FieldType.StringArray),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  collectAggregates: fieldDef('Collect aggregates', 'collectAggregates', FieldType.Boolean),
  lastUpdateTimestamp: fieldDef('Last updated', 'lastUpdateTimestamp', FieldType.DateTime),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
};

/** Fluent query generator for tags. */
export class TagsQuery extends QueryGenerator {
  /** The nitag query-tags-with-values endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'tags',
    url: '/nitag/v2/query-tags-with-values',
    method: 'POST',
    responseKey: 'tagsWithValues',
    totalCountKey: 'totalCount',
    fields: tagFields,
    propertiesField: 'properties',
    // This endpoint does not accept orderBy.
    orderByValues: [],
    dateStyle: DateStyle.Compare,
    paging: 'continuationToken',
  };

  /** Assembles the query-tags-with-values body (filter, take, continuationToken). */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    delete body['skip'];
    delete body['orderBy'];
    delete body['descending'];
    delete body['projection'];
    delete body['returnCount'];
    return body;
  }
}

/** Creates a new tag query generator. */
export function tags(options?: QueryGeneratorOptions): TagsQuery {
  return new TagsQuery(options);
}
