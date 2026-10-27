/**
 * SystemLink query generators.
 *
 * One generator per resource, each a thin fluent wrapper that produces the
 * Dynamic LINQ filter string and request body its SystemLink service expects.
 * TypeScript port of the dependency-free `systemlink-query-generators` package.
 *
 * Import everything from here, or import a single generator directly to keep
 * bundles small.
 */
import { assets } from './generators/assets';
import { feeds } from './generators/feeds';
import { files } from './generators/files';
import { locations } from './generators/locations';
import { products } from './generators/products';
import { results } from './generators/results';
import { states } from './generators/states';
import { systems } from './generators/systems';
import { tags } from './generators/tags';
import { webApps } from './generators/web-apps';
import { workItems } from './generators/work-items';
import { QueryGenerator, QueryGeneratorOptions } from './core/query-generator';

export * from './core/linq';
export * from './core/lucene';
export * from './core/http';
export * from './core/client-filter';
export {
  QueryGenerator,
  type GeneratorSpec,
  type QueryGeneratorOptions,
  type QueryState,
  type RunAllOptions,
  type RequestDescription,
  type FilterValue,
  type DateInput,
} from './core/query-generator';
export { ListGenerator } from './core/list-generator';

export { results, ResultsQuery, resultFields, ResultOrderBy, ResultStatusType } from './generators/results';
export { products, ProductsQuery, productFields, ProductOrderBy } from './generators/products';
export { systems, SystemsQuery, systemFields } from './generators/systems';
export { files, FilesQuery, fileFields, FileOrderBy } from './generators/files';
export {
  assets,
  AssetsQuery,
  assetFields,
  AssetOrderBy,
  AssetType,
  AssetBusType,
  AssetCalibrationStatus,
  AssetSystemConnection,
  AssetPresence,
} from './generators/assets';
export { workItems, WorkItemsQuery, workItemFields, WorkItemOrderBy, WorkItemState } from './generators/work-items';
export { webApps, WebAppsQuery, webAppFields, WebAppOrderBy, WebAppType } from './generators/web-apps';
export { states, StatesQuery, stateFields, StateArchitecture, StateDistribution } from './generators/states';
export { feeds, FeedsQuery, feedFields, FeedPlatform } from './generators/feeds';
export { locations, LocationsQuery, locationFields } from './generators/locations';
export { tags, TagsQuery, tagFields, TagType } from './generators/tags';

/** Every generator factory, keyed by resource name. */
export const generators = {
  results,
  products,
  systems,
  files,
  assets,
  workItems,
  webApps,
  states,
  feeds,
  locations,
  tags,
} as const;

/** The set of resource names accepted by {@link createQuery}. */
export type GeneratorName = keyof typeof generators;

/** Creates a generator by resource name. */
export function createQuery(resource: GeneratorName, options?: QueryGeneratorOptions): QueryGenerator {
  const factory = generators[resource];
  if (!factory) {
    throw new Error(`Unknown resource "${resource}". Available: ${Object.keys(generators).join(', ')}.`);
  }
  return factory(options);
}
