/**
 * Product query generator — `POST /nitestmonitor/v2/query-products`.
 *
 * @example
 * const query = products()
 *   .contains('name', 'Widget')
 *   .equals('family', 'Sensors')
 *   .orderBy('UPDATED_AT', { descending: true });
 *
 * await query.run(); // Product[]
 */
import { DateStyle, FieldDef, FieldType, fieldDef } from '../core/linq';
import { GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by `orderBy`. */
export const ProductOrderBy = {
  Id: 'ID',
  PartNumber: 'PART_NUMBER',
  Name: 'NAME',
  Family: 'FAMILY',
  UpdatedAt: 'UPDATED_AT',
} as const;

/** A product `orderBy` value. */
export type ProductOrderBy = (typeof ProductOrderBy)[keyof typeof ProductOrderBy];

/** Filterable fields documented by nitestmonitor v2 for products. */
export const productFields: Record<string, FieldDef> = {
  id: fieldDef('Product ID', 'id', FieldType.String),
  partNumber: fieldDef('Part number', 'partNumber', FieldType.String),
  name: fieldDef('Name', 'name', FieldType.String),
  family: fieldDef('Family', 'family', FieldType.String),
  updatedAt: fieldDef('Updated', 'updatedAt', FieldType.DateTime),
  keywords: fieldDef('Keywords', 'keywords', FieldType.StringArray),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  fileIds: fieldDef('File IDs', 'fileIds', FieldType.StringArray),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  workspaceName: fieldDef('Workspace name', 'workspaceName', FieldType.String, {
    note: 'Comparison operators only.',
  }),
};

/** Fluent query generator for products. */
export class ProductsQuery extends QueryGenerator {
  /** The nitestmonitor query-products endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'products',
    url: '/nitestmonitor/v2/query-products',
    method: 'POST',
    responseKey: 'products',
    totalCountKey: 'totalCount',
    fields: productFields,
    propertiesField: 'properties',
    orderByValues: Object.values(ProductOrderBy),
    dateStyle: DateStyle.Compare,
    descendingKey: 'descending',
    paging: 'continuationToken',
  };

  /** Assembles the query-products body, using continuationToken paging. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    delete body['skip']; // nitestmonitor pages with continuationToken, not skip.
    return body;
  }
}

/** Creates a new product query generator. */
export function products(options?: QueryGeneratorOptions): ProductsQuery {
  return new ProductsQuery(options);
}
