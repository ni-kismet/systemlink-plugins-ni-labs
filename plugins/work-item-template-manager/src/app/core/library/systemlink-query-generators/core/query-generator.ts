/**
 * Base class shared by every resource query generator.
 *
 * A generator collects filter conditions, renders them to a Dynamic LINQ
 * string, assembles the service's request body, and (optionally) executes the
 * request. Subclasses only supply a static `spec` describing their endpoint.
 */
import {
  buildLinqFilter,
  Condition,
  DateStyle,
  FieldDef,
  FieldType,
  FilterLogic,
  Op,
} from './linq';
import { getJson, HttpRequestOptions, postJson, QueryParams } from './http';

/** A value that can be compared against a field in a filter. */
export type FilterValue = string | number | boolean;

/** A date accepted by the date-comparison helpers. */
export type DateInput = Date | number | string;

/** Describes a resource endpoint and how its query body is shaped. */
export interface GeneratorSpec {
  /** Human-readable resource name, e.g. `'results'`. */
  resource: string;
  /** Endpoint path, e.g. `'/nitestmonitor/v2/query-results'`. */
  url: string;
  /** HTTP method the endpoint uses. */
  method: 'POST' | 'GET';
  /** Property on the response holding the array of records. */
  responseKey: string;
  /** Property holding the total match count. */
  totalCountKey?: string;
  /** Map of field name -> field definition. */
  fields: Record<string, FieldDef>;
  /** Field name used by the `.property()` helpers. */
  propertiesField?: string;
  /** Allowed `orderBy` values, when the service constrains them. */
  orderByValues?: string[];
  /** The date-rendering style this service documents. */
  dateStyle?: DateStyle;
  /** Body property that flips sort direction (defaults to `descending`). */
  descendingKey?: string;
  /** Pagination mechanism. */
  paging?: 'continuationToken' | 'skip' | null;
  /** False for services with no Dynamic LINQ filter. */
  supportsFilter?: boolean;
}

/** Options accepted by a query generator. */
export interface QueryGeneratorOptions extends HttpRequestOptions {
  /** Throw when filtering on a field the service does not document (default true). */
  strict?: boolean;
  /** Override the service's default date-rendering style. */
  dateStyle?: DateStyle;
}

/** Request-shaping state accumulated by the fluent methods. */
export interface QueryState {
  /** Maximum number of records to return. */
  take?: number;
  /** Number of records to skip (offset paging). */
  skip?: number;
  /** The `orderBy` field. */
  orderBy?: string;
  /** Whether to sort descending. */
  descending?: boolean;
  /** The projection (field subset). */
  projection?: string | string[];
  /** A continuation token for token-based paging. */
  continuationToken?: string;
  /** Whether the service should return a total count. */
  returnCount?: boolean;
  /** Assets-only: restrict to calibratable assets. */
  calibratableOnly?: boolean;
  /** Results-only: a secondary product-level filter. */
  productFilter?: string;
  /** Results-only: sort by a property key. */
  orderByKey?: string;
  /** Results-only: comparison type for `orderByKey`. */
  orderByComparisonType?: string;
}

/** Options for repeated, paged retrieval via {@link QueryGenerator.runAll}. */
export interface RunAllOptions extends HttpRequestOptions {
  /** Stop after collecting this many records. */
  maxRecords?: number;
  /** Records to request per page. */
  pageSize?: number;
}

/** A `{ method, url, body|params }` description of the request a generator will send. */
export interface RequestDescription {
  /** HTTP method. */
  method: 'GET' | 'POST';
  /** Fully-qualified request URL. */
  url: string;
  /** Request body (POST endpoints). */
  body?: Record<string, unknown>;
  /** Query parameters (GET endpoints). */
  params?: Record<string, unknown>;
}

/** Constructor signature shared by all generators, used for nested groups. */
type QueryGeneratorConstructor = new (options?: QueryGeneratorOptions) => QueryGenerator;

/** Resolves a value that may be a Date, a number of ms, or an ISO string. */
function toIsoString(value: DateInput): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  return String(value ?? '');
}

/** Base fluent query generator for a SystemLink resource. */
export class QueryGenerator {
  /** The endpoint description. Overridden by each subclass. */
  public static spec: GeneratorSpec = {
    resource: 'unknown',
    url: '',
    method: 'POST',
    responseKey: 'data',
    fields: {},
    supportsFilter: true,
  };

  /** The endpoint description resolved from the concrete subclass. */
  protected spec: GeneratorSpec;
  /** The options this generator was created with. */
  protected options: QueryGeneratorOptions;
  /** Whether unknown fields throw. */
  protected strict: boolean;
  /** The active date-rendering style. */
  protected dateStyle: DateStyle;
  /** The accumulated filter conditions. */
  protected conditions: Condition[];
  /** How top-level conditions are joined. */
  protected logic: FilterLogic;
  /** Raw query-string parameters (for GET/list resources). */
  protected params: QueryParams;
  /** Request-shaping state. */
  protected state: QueryState;

  /** Creates a generator, resolving its static `spec` and options. */
  public constructor(options: QueryGeneratorOptions = {}) {
    this.spec = (this.constructor as typeof QueryGenerator).spec;
    this.options = options;
    this.strict = options.strict ?? true;
    this.dateStyle = options.dateStyle ?? this.spec.dateStyle ?? DateStyle.Compare;
    this.conditions = [];
    this.logic = 'and';
    this.params = {};
    this.state = {};
  }

  /** The field definitions this resource supports. */
  public static get fields(): Record<string, FieldDef> {
    return this.spec.fields;
  }

  /** Field names as a sorted array — handy for building a UI picker. */
  public static fieldNames(): string[] {
    return Object.keys(this.spec.fields).sort();
  }

  /** The generated Dynamic LINQ filter string (`''` when no conditions). */
  public get filter(): string {
    return buildLinqFilter(this.conditions, this.logic, { dateStyle: this.dateStyle });
  }

  /** Adds a condition. Most callers should use the named helpers below. */
  public where(field: string, operation: Op, value?: FilterValue, key?: string): this {
    this.conditions.push({ field: this.resolveField(field), operation, value, key });
    return this;
  }

  /** Appends a pre-built LINQ fragment verbatim. Escape hatch for edge cases. */
  public raw(linq: string): this {
    this.conditions.push({ operation: Op.Raw, linq });
    return this;
  }

  /** Adds a parenthesized sub-group, e.g. `a && (b || c)`. */
  public group(build: (sub: QueryGenerator) => void, logic: FilterLogic = 'or'): this {
    const ctor = this.constructor as QueryGeneratorConstructor;
    const sub = new ctor(this.options);
    build(sub);
    if (sub.conditions.length > 0) {
      this.conditions.push({ group: sub.conditions, logic });
    }
    return this;
  }

  /** Joins top-level conditions with `||` instead of `&&`. */
  public any(): this {
    this.logic = 'or';
    return this;
  }

  /** Joins top-level conditions with `&&` (the default). */
  public all(): this {
    this.logic = 'and';
    return this;
  }

  /** `field = "value"` */
  public equals(field: string, value: FilterValue): this {
    return this.where(field, Op.Equals, value);
  }

  /** `field != "value"` */
  public notEquals(field: string, value: FilterValue): this {
    return this.where(field, Op.NotEquals, value);
  }

  /** `field.Contains("value")` */
  public contains(field: string, value: FilterValue): this {
    return this.where(field, Op.Contains, value);
  }

  /** `!field.Contains("value")` */
  public notContains(field: string, value: FilterValue): this {
    return this.where(field, Op.NotContains, value);
  }

  /** `field.StartsWith("value")` */
  public startsWith(field: string, value: FilterValue): this {
    return this.where(field, Op.StartsWith, value);
  }

  /** `field.EndsWith("value")` */
  public endsWith(field: string, value: FilterValue): this {
    return this.where(field, Op.EndsWith, value);
  }

  /** `string.IsNullOrEmpty(field)` */
  public isEmpty(field: string): this {
    return this.where(field, Op.IsEmpty);
  }

  /** `!string.IsNullOrEmpty(field)` */
  public isNotEmpty(field: string): this {
    return this.where(field, Op.IsNotEmpty);
  }

  /** `field > value` */
  public greaterThan(field: string, value: FilterValue): this {
    return this.where(field, Op.GreaterThan, value);
  }

  /** `field >= value` */
  public greaterThanOrEqual(field: string, value: FilterValue): this {
    return this.where(field, Op.GreaterThanOrEqual, value);
  }

  /** `field < value` */
  public lessThan(field: string, value: FilterValue): this {
    return this.where(field, Op.LessThan, value);
  }

  /** `field <= value` */
  public lessThanOrEqual(field: string, value: FilterValue): this {
    return this.where(field, Op.LessThanOrEqual, value);
  }

  /** `field > date` (in the service's documented date style). */
  public isAfter(field: string, value: DateInput): this {
    return this.where(field, Op.IsAfter, toIsoString(value));
  }

  /** `field >= date` */
  public isOnOrAfter(field: string, value: DateInput): this {
    return this.where(field, Op.IsOnOrAfter, toIsoString(value));
  }

  /** `field < date` */
  public isBefore(field: string, value: DateInput): this {
    return this.where(field, Op.IsBefore, toIsoString(value));
  }

  /** `field <= date` */
  public isOnOrBefore(field: string, value: DateInput): this {
    return this.where(field, Op.IsOnOrBefore, toIsoString(value));
  }

  /** `field >= now - days`. Convenience for "the last N days". */
  public inLastDays(field: string, days: number): this {
    return this.isOnOrAfter(field, new Date(Date.now() - days * 86400000));
  }

  /** `field.Contains("value")` — membership in a string collection such as `keywords`. */
  public hasKeyword(value: FilterValue, field = 'keywords'): this {
    return this.where(field, Op.ListContains, value);
  }

  /** `!field.Contains("value")` */
  public lacksKeyword(value: FilterValue, field = 'keywords'): this {
    return this.where(field, Op.ListNotContains, value);
  }

  /** `field = a || field = b || ...`, wrapped in parentheses. */
  public anyOf(field: string, values: (FilterValue | null | undefined)[]): this {
    const list = (values ?? []).filter(
      (value): value is FilterValue => value !== undefined && value !== null,
    );
    if (list.length === 0) {
      return this;
    }
    const dataField = this.resolveField(field);
    this.conditions.push({
      group: list.map((value) => ({ field: dataField, operation: Op.Equals, value })),
      logic: 'or',
    });
    return this;
  }

  /** `field != a && field != b && ...`, wrapped in parentheses. */
  public noneOf(field: string, values: (FilterValue | null | undefined)[]): this {
    const list = (values ?? []).filter(
      (value): value is FilterValue => value !== undefined && value !== null,
    );
    if (list.length === 0) {
      return this;
    }
    const dataField = this.resolveField(field);
    this.conditions.push({
      group: list.map((value) => ({ field: dataField, operation: Op.NotEquals, value })),
      logic: 'and',
    });
    return this;
  }

  /** `properties["key"] = "value"` */
  public property(key: string, value: FilterValue, field?: string): this {
    this.conditions.push({ field: this.propertiesFieldName(field), operation: Op.KeyValueMatches, key, value });
    return this;
  }

  /** `properties["key"] != "value"` */
  public propertyNotEquals(key: string, value: FilterValue, field?: string): this {
    this.conditions.push({ field: this.propertiesFieldName(field), operation: Op.KeyValueNotMatches, key, value });
    return this;
  }

  /** `properties["key"].Contains("value")` */
  public propertyContains(key: string, value: FilterValue, field?: string): this {
    this.conditions.push({ field: this.propertiesFieldName(field), operation: Op.KeyValueContains, key, value });
    return this;
  }

  /** `properties.ContainsKey("key")` */
  public hasProperty(key: string, field?: string): this {
    this.conditions.push({ field: this.propertiesFieldName(field), operation: Op.ContainsKey, key });
    return this;
  }

  /** `!properties.ContainsKey("key")` */
  public lacksProperty(key: string, field?: string): this {
    this.conditions.push({ field: this.propertiesFieldName(field), operation: Op.NotContainsKey, key });
    return this;
  }

  /** Sets the maximum number of records to return. */
  public take(count: number): this {
    this.state.take = count;
    return this;
  }

  /** Sets the number of records to skip (offset paging). */
  public skip(count: number): this {
    this.state.skip = count;
    return this;
  }

  /** Restricts the response to a subset of fields. */
  public projection(fields: string[]): this {
    this.state.projection = fields;
    return this;
  }

  /** Sets a continuation token for token-based paging. */
  public continuationToken(token: string): this {
    this.state.continuationToken = token;
    return this;
  }

  /** Requests the service include a total match count. */
  public returnCount(enabled = true): this {
    this.state.returnCount = enabled;
    return this;
  }

  /** Sorts by one of the service's documented `orderBy` values. */
  public orderBy(field: string, options: { descending?: boolean } = {}): this {
    const allowed = this.spec.orderByValues;
    if (allowed && !allowed.includes(field)) {
      throw new Error(
        `Invalid orderBy "${field}" for ${this.spec.resource}. Allowed: ${allowed.join(', ')}.`,
      );
    }
    this.state.orderBy = field;
    if (options.descending !== undefined) {
      this.state.descending = options.descending;
    }
    return this;
  }

  /** Flips the current sort direction to descending. */
  public descending(enabled = true): this {
    this.state.descending = enabled;
    return this;
  }

  /** The request body (POST endpoints) or query params (GET endpoints). */
  public build(): Record<string, unknown> {
    return this.buildRequest();
  }

  /** The full request as `{ method, url, body|params }` — useful for logging. */
  public describe(): RequestDescription {
    const request = this.build();
    const url = `${this.options.baseUrl ?? ''}${this.spec.url}`;
    return this.spec.method === 'GET'
      ? { method: 'GET', url, params: request }
      : { method: 'POST', url, body: request };
  }

  /** Returns the generated Dynamic LINQ filter string. */
  public toString(): string {
    return this.filter;
  }

  /** Executes the query and returns the raw service response. */
  public async fetchRaw<T = unknown>(options: HttpRequestOptions = {}): Promise<T> {
    const merged: HttpRequestOptions = { ...this.options, ...options, label: `query ${this.spec.resource}` };
    const url = `${merged.baseUrl ?? ''}${this.spec.url}`;
    const request = this.build();
    return this.spec.method === 'GET'
      ? getJson<T>(url, request as QueryParams, merged)
      : postJson<T>(url, request, merged);
  }

  /** Executes the query and returns just the array of matching records. */
  public async run<T = unknown>(options: HttpRequestOptions = {}): Promise<T[]> {
    const response = await this.fetchRaw<Record<string, unknown>>(options);
    const items = response?.[this.spec.responseKey];
    return Array.isArray(items) ? (items as T[]) : [];
  }

  /** Executes the query repeatedly until every match is retrieved. */
  public async runAll<T = unknown>(options: RunAllOptions = {}): Promise<T[]> {
    const { maxRecords = Infinity, pageSize } = options;
    const paging = this.spec.paging;
    if (!paging) {
      return this.run<T>(options);
    }

    const all: T[] = [];
    let token: string | undefined;
    let offset = this.state.skip ?? 0;
    const previousToken = this.state.continuationToken;
    const previousSkip = this.state.skip;
    const previousTake = this.state.take;
    if (pageSize !== undefined) {
      this.state.take = pageSize;
    }

    try {
      for (;;) {
        if (paging === 'continuationToken') {
          this.state.continuationToken = token;
        } else {
          this.state.skip = offset;
        }
        const response = await this.fetchRaw<Record<string, unknown>>(options);
        const page = response?.[this.spec.responseKey];
        if (!Array.isArray(page) || page.length === 0) {
          break;
        }
        all.push(...(page as T[]));
        if (all.length >= maxRecords) {
          return all.slice(0, maxRecords);
        }
        if (paging === 'continuationToken') {
          token = response['continuationToken'] as string | undefined;
          if (!token) {
            break;
          }
        } else {
          offset += page.length;
          if (this.state.take !== undefined && page.length < this.state.take) {
            break;
          }
        }
      }
    } finally {
      this.state.continuationToken = previousToken;
      this.state.skip = previousSkip;
      this.state.take = previousTake;
    }
    return all;
  }

  /** Assembles the service's request body from the current filter and state. */
  protected buildRequest(): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const filter = this.filter;
    if (this.spec.supportsFilter !== false && filter) {
      body['filter'] = filter;
    }
    const { take, skip, orderBy, descending, projection, continuationToken, returnCount } = this.state;
    if (take !== undefined) {
      body['take'] = take;
    }
    if (skip !== undefined) {
      body['skip'] = skip;
    }
    if (orderBy !== undefined) {
      body['orderBy'] = orderBy;
    }
    if (descending !== undefined) {
      body[this.spec.descendingKey ?? 'descending'] = descending;
    }
    if (projection !== undefined) {
      body['projection'] = projection;
    }
    if (continuationToken !== undefined) {
      body['continuationToken'] = continuationToken;
    }
    if (returnCount !== undefined) {
      body['returnCount'] = returnCount;
    }
    return body;
  }

  /** Resolves a field name to its underlying data field, honoring strict mode. */
  private resolveField(field: string): string {
    const { fields } = this.spec;
    if (fields[field]) {
      return fields[field].dataField;
    }
    // Allow addressing into a documented dictionary field, e.g. `properties.Foo`.
    const root = field.split(/[.[]/)[0];
    if (fields[root] && fields[root].type === FieldType.Properties) {
      return field;
    }
    if (this.strict) {
      throw new Error(
        `Unknown ${this.spec.resource} filter field "${field}". ` +
          `Known fields: ${Object.keys(fields).sort().join(', ')}. ` +
          `Pass { strict: false } to allow undocumented fields, or use .raw().`,
      );
    }
    return field;
  }

  /** Resolves the properties field name used by the `.property()` helpers. */
  private propertiesFieldName(field?: string): string {
    const name = field ?? this.spec.propertiesField;
    if (!name) {
      throw new Error(`${this.spec.resource} has no properties field; pass one explicitly.`);
    }
    return this.resolveField(name);
  }
}
