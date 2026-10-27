/**
 * Web app query generator — `POST /niapp/v1/webapps/query`.
 *
 * @example
 * const query = webApps()
 *   .equals('type', 'Notebook')
 *   .startsWith('name', 'Analysis')
 *   .orderBy('updated', { descending: true })
 *   .take(50);
 *
 * await query.run(); // WebApp[]
 */
import { postJson, HttpRequestOptions } from '../core/http';
import { DateStyle, FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import {
  GeneratorSpec,
  QueryGenerator,
  QueryGeneratorOptions,
  RequestDescription,
} from '../core/query-generator';

/** Values accepted by `type`. */
export const WebAppType = {
  WebVI: 'WebVI',
  DataSpace: 'DataSpace',
  MstrNavigation: 'MSTRNavigation',
  MstrAttributeMapping: 'MSTRAttributeMapping',
  Notebook: 'Notebook',
} as const;

/** A web app type value. */
export type WebAppType = (typeof WebAppType)[keyof typeof WebAppType];

/** Values accepted by `orderBy`. */
export const WebAppOrderBy = {
  Name: 'name',
  Created: 'created',
  Updated: 'updated',
} as const;

/** A web app `orderBy` value. */
export type WebAppOrderBy = (typeof WebAppOrderBy)[keyof typeof WebAppOrderBy];

const typeValues: FieldEnumValue[] = Object.values(WebAppType).map((value) => ({ label: value, value }));

/** Filterable fields documented by niapp for webapps/query. */
export const webAppFields: Record<string, FieldDef> = {
  id: fieldDef('Web app ID', 'id', FieldType.String),
  name: fieldDef('Name', 'name', FieldType.String),
  type: fieldDef('Type', 'type', FieldType.Enum, { values: typeValues }),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
  userId: fieldDef('User ID', 'userId', FieldType.String),
  created: fieldDef('Created', 'created', FieldType.DateTime),
  updated: fieldDef('Updated', 'updated', FieldType.DateTime),
  'properties.embedLocation': fieldDef('Embed location', 'properties.embedLocation', FieldType.String),
  'properties.interface': fieldDef('Interface', 'properties.interface', FieldType.String),
  'properties.dataSource': fieldDef('Data source', 'properties.dataSource', FieldType.String),
};

/** Fluent query generator for web apps. */
export class WebAppsQuery extends QueryGenerator {
  /** The niapp webapps/query endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'web apps',
    url: '/niapp/v1/webapps/query',
    method: 'POST',
    responseKey: 'webapps',
    totalCountKey: 'totalCount',
    fields: webAppFields,
    orderByValues: Object.values(WebAppOrderBy),
    dateStyle: DateStyle.Compare,
    descendingKey: 'orderByDescending',
    paging: 'continuationToken',
  };

  /**
   * niapp exposes the total-count switch as a query-string parameter rather than
   * a body property.
   */
  public override returnCount(enabled = true): this {
    this.params['includeTotalCount'] = enabled;
    return this;
  }

  /** Describes the request, appending the total-count query parameter when set. */
  public override describe(): RequestDescription {
    const described = super.describe();
    return this.params['includeTotalCount']
      ? { ...described, url: `${described.url}?includeTotalCount=true` }
      : described;
  }

  /** Executes the query, appending the total-count query parameter when set. */
  public override async fetchRaw<T = unknown>(options: HttpRequestOptions = {}): Promise<T> {
    if (!this.params['includeTotalCount']) {
      return super.fetchRaw<T>(options);
    }
    const merged: HttpRequestOptions = { ...this.options, ...options, label: 'query web apps' };
    const url = `${merged.baseUrl ?? ''}${this.spec.url}?includeTotalCount=true`;
    return postJson<T>(url, this.build(), merged);
  }

  /** Assembles the webapps/query body, using continuationToken paging. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    delete body['skip'];
    delete body['projection'];
    delete body['returnCount'];
    return body;
  }
}

/** Creates a new web app query generator. */
export function webApps(options?: QueryGeneratorOptions): WebAppsQuery {
  return new WebAppsQuery(options);
}
