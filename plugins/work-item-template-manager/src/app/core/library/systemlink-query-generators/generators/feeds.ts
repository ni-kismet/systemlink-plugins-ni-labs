/**
 * Feed query generator — `GET /nifeed/v1/feeds`.
 *
 * `nifeed` has no Dynamic LINQ query endpoint. Platform and workspace are pushed
 * to the service as query parameters; any other condition is evaluated
 * client-side against the response.
 *
 * @example
 * const query = feeds()
 *   .platform('WINDOWS')
 *   .inWorkspace(workspaceId)
 *   .contains('name', 'release');
 *
 * await query.run(); // Feed[]
 */
import { ListGenerator } from '../core/list-generator';
import { FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import { GeneratorSpec, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by the `platform` query parameter. */
export const FeedPlatform = {
  Windows: 'WINDOWS',
  NiLinuxRt: 'NI_LINUX_RT',
} as const;

/** A feed platform value. */
export type FeedPlatform = (typeof FeedPlatform)[keyof typeof FeedPlatform];

const platformValues: FieldEnumValue[] = Object.values(FeedPlatform).map((value) => ({ label: value, value }));

/** Fields on a feed, filterable client-side. */
export const feedFields: Record<string, FieldDef> = {
  id: fieldDef('Feed ID', 'id', FieldType.String),
  name: fieldDef('Name', 'name', FieldType.String),
  description: fieldDef('Description', 'description', FieldType.String),
  platform: fieldDef('Platform', 'platform', FieldType.Enum, { values: platformValues }),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  createdAt: fieldDef('Created', 'createdAt', FieldType.DateTime),
  updatedAt: fieldDef('Updated', 'updatedAt', FieldType.DateTime),
  packageSources: fieldDef('Package sources', 'packageSources', FieldType.StringArray),
  deleted: fieldDef('Deleted', 'deleted', FieldType.Boolean),
};

/** Fluent query generator for feeds (GET list + client-side filtering). */
export class FeedsQuery extends ListGenerator {
  /** The nifeed feeds endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'feeds',
    url: '/nifeed/v1/feeds',
    method: 'GET',
    responseKey: 'feeds',
    fields: feedFields,
    supportsFilter: false,
    paging: null,
  };

  /** Server-side filter: only feeds for this platform. */
  public platform(value: string): this {
    return this.param('platform', value);
  }

  /** Server-side filter: only feeds in this workspace. */
  public inWorkspace(workspaceId: string): this {
    return this.param('workspace', workspaceId);
  }
}

/** Creates a new feed query generator. */
export function feeds(options?: QueryGeneratorOptions): FeedsQuery {
  return new FeedsQuery(options);
}
