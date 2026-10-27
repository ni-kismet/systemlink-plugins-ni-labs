/**
 * System state query generator — `GET /nisystemsstate/v1/states`.
 *
 * `nisystemsstate` has no Dynamic LINQ query endpoint. Workspace, architecture
 * and distribution are pushed to the service as query parameters; any other
 * condition is evaluated client-side against the response, so the fluent API
 * still behaves the same as the LINQ-backed generators.
 *
 * @example
 * const query = states()
 *   .inWorkspace(workspaceId)
 *   .architecture('X64')
 *   .contains('name', 'DAQmx');
 *
 * query.describe(); // { method: 'GET', url, params }
 * await query.run();
 */
import { matchesConditions } from '../core/client-filter';
import { HttpRequestOptions, QueryParams } from '../core/http';
import { ListGenerator } from '../core/list-generator';
import { FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import { GeneratorSpec, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by the `Architecture` query parameter. */
export const StateArchitecture = {
  Arm: 'ARM',
  X64: 'X64',
  X86: 'X86',
  Any: 'ANY',
} as const;

/** A state architecture value. */
export type StateArchitecture = (typeof StateArchitecture)[keyof typeof StateArchitecture];

/** Values accepted by the `Distribution` query parameter. */
export const StateDistribution = {
  NiLinuxRt: 'NI_LINUXRT',
  NiLinuxRtNxg: 'NI_LINUXRT_NXG',
  Windows: 'WINDOWS',
  Any: 'ANY',
} as const;

/** A state distribution value. */
export type StateDistribution = (typeof StateDistribution)[keyof typeof StateDistribution];

/** Maps an enum-like value object to selectable {@link FieldEnumValue}s. */
function enumValues(source: Record<string, string>): FieldEnumValue[] {
  return Object.values(source).map((value) => ({ label: value, value }));
}

/** Fields on a state, filterable client-side. */
export const stateFields: Record<string, FieldDef> = {
  id: fieldDef('State ID', 'id', FieldType.String),
  name: fieldDef('Name', 'name', FieldType.String),
  description: fieldDef('Description', 'description', FieldType.String),
  architecture: fieldDef('Architecture', 'architecture', FieldType.Enum, { values: enumValues(StateArchitecture) }),
  distribution: fieldDef('Distribution', 'distribution', FieldType.Enum, { values: enumValues(StateDistribution) }),
  properties: fieldDef('Properties', 'properties', FieldType.Properties),
  createdTimestamp: fieldDef('Created', 'createdTimestamp', FieldType.DateTime),
  lastUpdatedTimestamp: fieldDef('Last updated', 'lastUpdatedTimestamp', FieldType.DateTime),
  workspace: fieldDef('Workspace ID', 'workspace', FieldType.String),
};

/** Fluent query generator for system states (GET list + client-side filtering). */
export class StatesQuery extends ListGenerator {
  /** The nisystemsstate states endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'states',
    url: '/nisystemsstate/v1/states',
    method: 'GET',
    responseKey: 'states',
    fields: stateFields,
    propertiesField: 'properties',
    supportsFilter: false,
    paging: null,
  };

  /** Server-side filter: only states in this workspace. */
  public inWorkspace(workspaceId: string): this {
    return this.param('Workspace', workspaceId);
  }

  /** Server-side filter: states compatible with this architecture (plus `ANY`). */
  public architecture(value: string): this {
    return this.param('Architecture', value);
  }

  /** Server-side filter: states compatible with this distribution (plus `ANY`). */
  public distribution(value: string): this {
    return this.param('Distribution', value);
  }

  /** Adds the service-supported Skip/Take params to the query string. */
  public override serverParams(): QueryParams {
    const params: QueryParams = { ...this.params };
    if (this.state.take !== undefined) {
      params['Take'] = this.state.take;
    }
    if (this.state.skip !== undefined) {
      params['Skip'] = this.state.skip;
    }
    return params;
  }

  /** Fetches states and applies remaining conditions client-side (Skip/Take are server-applied). */
  public override async run<T = unknown>(options: HttpRequestOptions = {}): Promise<T[]> {
    const response = await this.fetchRaw<Record<string, unknown>>(options);
    const items = response?.[this.spec.responseKey];
    const all = Array.isArray(items) ? (items as T[]) : [];
    return all.filter((item) => matchesConditions(item, this.conditions, this.logic));
  }
}

/** Creates a new system state query generator. */
export function states(options?: QueryGeneratorOptions): StatesQuery {
  return new StatesQuery(options);
}
