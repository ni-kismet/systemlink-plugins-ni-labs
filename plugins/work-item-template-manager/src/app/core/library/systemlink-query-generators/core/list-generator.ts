/**
 * Base class for SystemLink services that expose a plain GET list endpoint
 * instead of a Dynamic LINQ query endpoint.
 *
 * Conditions that map onto a documented query parameter are pushed to the
 * server; everything else is evaluated in the browser against the response.
 * `filter` therefore returns `''` for these resources — use `describe()` to see
 * what will actually be sent.
 */
import { matchesConditions } from './client-filter';
import { getJson, HttpRequestOptions, QueryParams } from './http';
import { Condition } from './linq';
import { QueryGenerator, RunAllOptions } from './query-generator';

/** A query generator backed by a plain GET list endpoint. */
export class ListGenerator extends QueryGenerator {
  /** Always `''`: this service has no Dynamic LINQ filter. */
  public override get filter(): string {
    return '';
  }

  /** The conditions that will be evaluated client-side. */
  public get clientFilter(): Condition[] {
    return this.conditions;
  }

  /** Sets a raw query-string parameter. */
  public param(name: string, value: QueryParams[string]): this {
    this.params[name] = value;
    return this;
  }

  /** Executes the request against the list endpoint and returns the raw response. */
  public override async fetchRaw<T = unknown>(options: HttpRequestOptions = {}): Promise<T> {
    const merged: HttpRequestOptions = { ...this.options, ...options, label: `list ${this.spec.resource}` };
    const url = `${merged.baseUrl ?? ''}${this.spec.url}`;
    return getJson<T>(url, this.buildRequest() as QueryParams, merged);
  }

  /** Fetches the list, applies client-side conditions, then take/skip. */
  public override async run<T = unknown>(options: HttpRequestOptions = {}): Promise<T[]> {
    const response = await this.fetchRaw<Record<string, unknown>>(options);
    const items = response?.[this.spec.responseKey];
    const all = Array.isArray(items) ? (items as T[]) : [];
    const matched = all.filter((item) => matchesConditions(item, this.conditions, this.logic));
    const { take, skip } = this.state;
    const start = skip ?? 0;
    return take === undefined ? matched.slice(start) : matched.slice(start, start + take);
  }

  /** List endpoints return everything in one call, so `runAll` defers to `run`. */
  public override async runAll<T = unknown>(options: RunAllOptions = {}): Promise<T[]> {
    return this.run<T>(options);
  }

  /** Maps conditions onto server-side query params. Overridden per resource. */
  public serverParams(): QueryParams {
    return { ...this.params };
  }

  /** Builds the query-string parameters that are sent to the server. */
  protected override buildRequest(): Record<string, unknown> {
    return this.serverParams();
  }
}
