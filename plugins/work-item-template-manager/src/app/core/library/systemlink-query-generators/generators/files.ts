/**
 * File query generator — `POST /nifile/v1/service-groups/Default/query-files-linq`.
 *
 * @example
 * const query = files()
 *   .equals('extension', 'tdms')
 *   .inLastDays('created', 30)
 *   .property('Name', 'run-42.tdms')
 *   .orderBy('created', { descending: true })
 *   .take(200);
 *
 * await query.run(); // file metadata objects
 */
import { DateStyle, FieldDef, FieldType, fieldDef } from '../core/linq';
import { GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by `orderBy`. */
export const FileOrderBy = {
  Created: 'created',
  Updated: 'updated',
  Extension: 'extension',
  Size: 'size',
  Workspace: 'workspace',
} as const;

/** A file `orderBy` value. */
export type FileOrderBy = (typeof FileOrderBy)[keyof typeof FileOrderBy];

/** Filterable fields documented by nifile for query-files-linq. */
export const fileFields: Record<string, FieldDef> = {
  id: fieldDef('File ID', 'id', FieldType.String),
  created: fieldDef('Created', 'created', FieldType.DateTime),
  updated: fieldDef('Updated', 'updated', FieldType.DateTime),
  extension: fieldDef('Extension', 'extension', FieldType.String),
  size: fieldDef('Size (bytes)', 'size', FieldType.Number),
  userId: fieldDef('User ID', 'userId', FieldType.String),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  // The file name is stored as a metadata property, not a top-level field.
  name: fieldDef('Name', 'properties.Name', FieldType.String),
};

/** Fluent query generator for files. */
export class FilesQuery extends QueryGenerator {
  /** The nifile query-files-linq endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'files',
    url: '/nifile/v1/service-groups/Default/query-files-linq',
    method: 'POST',
    responseKey: 'availableFiles',
    totalCountKey: 'totalCount',
    fields: fileFields,
    propertiesField: 'properties',
    orderByValues: Object.values(FileOrderBy),
    dateStyle: DateStyle.Parse,
    descendingKey: 'orderByDescending',
    paging: 'skip',
  };

  /** Targets a service group other than `Default`. */
  public serviceGroup(name: string): this {
    this.spec = { ...this.spec, url: `/nifile/v1/service-groups/${encodeURIComponent(name)}/query-files-linq` };
    return this;
  }

  /** Assembles the query-files-linq body, using skip-based paging. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    delete body['continuationToken'];
    delete body['returnCount'];
    delete body['projection'];
    return body;
  }
}

/** Creates a new file query generator. */
export function files(options?: QueryGeneratorOptions): FilesQuery {
  return new FilesQuery(options);
}
