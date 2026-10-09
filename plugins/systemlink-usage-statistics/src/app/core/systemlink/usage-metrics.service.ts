import { Injectable } from '@angular/core';

import { SystemLinkContextService } from './systemlink-context.service';

export interface UsageMetric {
  key: string;
  label: string;
  detail: string;
  value: number | null;
  source: string;
  status: 'ok' | 'unavailable' | 'unauthorized';
}

export interface UsageDashboardModel {
  metrics: UsageMetric[];
  unavailable: string[];
  refreshedAt: string;
}

type CountParser = (payload: unknown) => number | null;

interface CountRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}

interface CountAttempt {
  request: CountRequest;
  value: number;
}

interface ProbeOutcome {
  attempt: CountAttempt | null;
  unauthorized: boolean;
}

interface RequestAttemptResult {
  value: number | null;
  unauthorized: boolean;
}

interface WorkItemTypeDefinition {
  type: string;
  label: string;
}

interface WorkItemTypeLookupResult {
  types: WorkItemTypeDefinition[];
  unauthorized: boolean;
}

interface WorkItemTypeCountResult {
  total: number | null;
  counts: Map<string, number>;
  unauthorized: boolean;
}

interface SystemsSummaryCounts {
  connected: number | null;
  disconnected: number | null;
  virtual: number | null;
  unauthorized: boolean;
}

interface FeedPackageCountResult {
  total: number | null;
  unauthorized: boolean;
}

interface RoutineStatusCounts {
  enabled: number | null;
  disabled: number | null;
  alarms: number | null;
  unauthorized: boolean;
}

interface DataTableStats {
  count: number | null;
  maxRows: number | null;
  maxColumns: number | null;
  unauthorized: boolean;
}

interface CountProbe {
  label: string;
  key: string;
  detail: string;
  requests: CountRequest[];
  parser?: CountParser;
}

// Metrics that describe the whole instance and have no workspace scope.
export const INSTANCE_WIDE_METRIC_KEYS: ReadonlySet<string> = new Set(['users', 'workspaces', 'roles']);

@Injectable({ providedIn: 'root' })
export class UsageMetricsService {
  // Shared scans memoized per load, keyed by scan + workspace so overlapping loads never share results.
  private readonly memo = new Map<string, Promise<unknown>>();

  constructor(private readonly context: SystemLinkContextService) {}

  async load(
    onPartialUpdate?: (metrics: readonly UsageMetric[]) => void,
    workspaceId: string | null = null,
  ): Promise<UsageDashboardModel> {
    this.memo.clear();
    const ws = workspaceId;
    const refreshedAt = new Date().toISOString();
    const accumulated: UsageMetric[] = [];

    const probes: CountProbe[] = [
      {
        key: 'test-results',
        label: 'Test Results',
        detail: $localize`Total test results available to the current user.`,
        requests: [
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-results',
            body: {
              filter: '',
              take: 0,
              continuationToken: null,
              returnCount: true,
              responseFormat: 'JSON',
            },
          },
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-results',
            body: {
              filter: '',
              take: 0,
              continuationToken: '',
              returnCount: true,
              responseFormat: 'JSON',
            },
          },
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-results',
            body: {
              take: 0,
              returnCount: true,
            },
          },
          {
            method: 'GET',
            path: '/nitestmonitor/v2/results?take=1&returnCount=true',
          },
        ],
      },
      {
        key: 'test-steps',
        label: 'Test Steps',
        detail: $localize`Total reported test steps.`,
        requests: [
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-steps',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-steps',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'GET',
            path: '/nitestmonitor/v2/steps?take=1&returnCount=true',
          },
        ],
        parser: (payload: unknown) => this.extractStepCount(payload),
      },
      {
        key: 'files',
        label: 'Files',
        detail: $localize`Total files in File Service.`,
        requests: [
          {
            method: 'GET',
            path: '/nifile/v1/service-groups/Default/files?take=1',
          },
          {
            method: 'POST',
            path: '/nifile/v1/service-groups/Default/query-files',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'POST',
            path: '/nifile/v1/service-groups/Default/query-files',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'POST',
            path: '/nifile/v1/service-groups/Default/query-files-linq',
            body: { take: 1 },
          },
        ],
      },
      {
        key: 'data-tables',
        label: 'Data Tables',
        detail: $localize`Total tables in DataFrame Service.`,
        requests: [
          {
            method: 'POST',
            path: '/nidataframe/v1/query-tables',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'POST',
            path: '/nidataframe/v1/query-tables',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'GET',
            path: '/nidataframe/v1/tables?take=1',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['tables']),
      },
      {
        key: 'max-file-size',
        label: 'Max File Size',
        detail: $localize`Largest single file size in File Service.`,
        requests: [],
      },
      {
        key: 'max-data-table-rows',
        label: 'Max Data Table Rows',
        detail: $localize`Largest row count across all data tables.`,
        requests: [],
      },
      {
        key: 'max-data-table-columns',
        label: 'Max Data Table Columns',
        detail: $localize`Largest column count across all data tables.`,
        requests: [],
      },
      {
        key: 'data-spaces',
        label: 'Data Spaces',
        detail: $localize`Total Data Spaces published to the WebApp service.`,
        requests: [
          {
            method: 'POST',
            path: '/niapp/v1/webapps/query?includeTotalCount=true',
            body: {
              filter: 'type == "DataSpace"',
              orderBy: 'updated',
              orderByDescending: true,
              take: 1,
            },
          },
        ],
      },
      {
        key: 'products',
        label: 'Products',
        detail: $localize`Total test products in Test Monitor.`,
        requests: [
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-products',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'POST',
            path: '/nitestmonitor/v2/query-products',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'GET',
            path: '/nitestmonitor/v2/products?take=1&returnCount=true',
          },
        ],
      },
      {
        key: 'workspaces',
        label: 'Workspaces',
        detail: $localize`Total workspaces configured on the instance.`,
        requests: [
          {
            method: 'GET',
            path: '/niuser/v1/workspaces',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['workspaces']),
      },
      {
        key: 'assets',
        label: 'Assets',
        detail: $localize`Total assets tracked by Asset Performance Management.`,
        requests: [
          {
            method: 'POST',
            path: '/niapm/v1/query-assets',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'POST',
            path: '/niapm/v1/query-assets',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'GET',
            path: '/niapm/v1/asset-summary',
          },
          {
            method: 'GET',
            path: '/niapm/v1/assets?Take=1&ReturnCount=true',
          },
        ],
      },
      {
        key: 'locations',
        label: 'Locations',
        detail: $localize`Total locations in the Locations service.`,
        requests: [
          {
            method: 'GET',
            path: '/nilocation/v1/locations',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['locations']),
      },
      {
        key: 'enabled-routines',
        label: 'Enabled Routines',
        detail: $localize`Total enabled event-action routines.`,
        requests: [
          {
            method: 'GET',
            path: '/niroutine/v2/routines?enabled=true&take=1',
          },
        ],
      },
      {
        key: 'disabled-routines',
        label: 'Disabled Routines',
        detail: $localize`Total disabled event-action routines.`,
        requests: [
          {
            method: 'GET',
            path: '/niroutine/v2/routines?enabled=false&take=1',
          },
        ],
      },
      {
        key: 'systems',
        label: 'Total Systems',
        detail: $localize`Total systems reported by Systems Management summary.`,
        requests: [
          {
            method: 'GET',
            path: '/nisysmgmt/v1/get-systems-summary',
          },
        ],
        parser: (payload: unknown) => this.extractSystemsSummaryTotal(payload),
      },
      {
        key: 'connected-systems',
        label: 'Connected Systems',
        detail: $localize`Connected systems reported by Systems Management summary.`,
        requests: [
          {
            method: 'GET',
            path: '/nisysmgmt/v1/get-systems-summary',
          },
        ],
        parser: (payload: unknown) => this.extractSystemsSummaryConnected(payload),
      },
      {
        key: 'disconnected-systems',
        label: 'Disconnected Systems',
        detail: $localize`Disconnected systems reported by Systems Management summary.`,
        requests: [
          {
            method: 'GET',
            path: '/nisysmgmt/v1/get-systems-summary',
          },
        ],
        parser: (payload: unknown) => this.extractSystemsSummaryDisconnected(payload),
      },
      {
        key: 'virtual-systems',
        label: 'Virtual Systems',
        detail: $localize`Virtual systems reported by Systems Management summary.`,
        requests: [
          {
            method: 'GET',
            path: '/nisysmgmt/v1/get-systems-summary',
          },
        ],
        parser: (payload: unknown) => this.extractSystemsSummaryVirtual(payload),
      },
      {
        key: 'users',
        label: 'Registered Users',
        detail: $localize`Total users available from User Management.`,
        requests: [
          {
            method: 'POST',
            path: '/niuser/v1/users/query',
            body: { take: 1000 },
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['users']),
      },
      {
        key: 'roles',
        label: 'Roles',
        detail: $localize`Total role templates in Authorization service.`,
        requests: [
          {
            method: 'GET',
            path: '/niauth/v1/policy-templates',
          },
          {
            method: 'GET',
            path: '/niauth/v1/policy-templates?take=5000',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['policyTemplates']),
      },
      {
        key: 'grafana-dashboards',
        label: 'Grafana Dashboards',
        detail: $localize`Total dashboards discoverable through embedded Grafana.`,
        requests: [
          {
            method: 'GET',
            path: '/dashboardhost/login',
          },
          {
            method: 'GET',
            path: '/dashboardhost/api/search?type=dash-db',
          },
          {
            method: 'GET',
            path: '/dashboardhost/api/search?type=dash-db&limit=5000',
          },
          {
            method: 'GET',
            path: '/grafana/api/search?type=dash-db&query=&limit=5000',
          },
          {
            method: 'GET',
            path: '/grafana/api/search?type=dash-db&limit=5000',
          },
        ],
        parser: (payload: unknown) => this.extractArrayCount(payload),
      },
      {
        key: 'published-notebooks',
        label: 'Published Notebooks',
        detail: $localize`Total Jupyter notebooks published to the Notebook service.`,
        requests: [],
      },
      {
        key: 'tags',
        label: 'Tags',
        detail: $localize`Total tags in Tag Service.`,
        requests: [
          {
            method: 'GET',
            path: '/nitag/v2/tags-count',
          },
          {
            method: 'GET',
            path: '/nitag/v2/tags?take=1',
          },
        ],
      },
      {
        key: 'states',
        label: 'States',
        detail: $localize`Total software states.`,
        requests: [
          {
            method: 'GET',
            path: '/nisystemsstate/v1/states?Take=1',
          },
          {
            method: 'GET',
            path: '/nisystemsstate/v1/states?Take=1&Skip=0',
          },
        ],
      },
      {
        key: 'feeds',
        label: 'Feeds',
        detail: $localize`Total package feeds.`,
        requests: [
          {
            method: 'GET',
            path: '/nifeed/v1/feeds',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['feeds']),
      },
      {
        key: 'package-counts',
        label: 'Packages',
        detail: $localize`Total packages across all package feeds.`,
        requests: [
          {
            method: 'GET',
            path: '/nifeed/v1/feeds',
          },
        ],
      },
      {
        key: 'alarm-routines',
        label: 'Routines With Alarm Actions',
        detail: $localize`Routines whose action list includes ALARM.`,
        requests: [
          {
            method: 'GET',
            path: '/niroutine/v2/routines?actionType=ALARM&take=1',
          },
          {
            method: 'GET',
            path: '/niroutine/v2/routines?filter=actionType eq ALARM&take=1',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['routines']),
      },
      {
        key: 'web-applications',
        label: 'Web Applications',
        detail: $localize`Total published SystemLink web applications.`,
        requests: [
          {
            method: 'GET',
            path: '/niapp/v1/webapps?take=1&includeTotalCount=true',
          },
          {
            method: 'POST',
            path: '/niapp/v1/webapps/query',
            body: { take: 1, includeTotalCount: true },
          },
          {
            method: 'POST',
            path: '/niapp/v1/webapps/query',
            body: { Take: 1, IncludeTotalCount: true },
          },
          {
            method: 'GET',
            path: '/niapp/v1/webapps?take=1000',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['webapps']),
      },
      {
        key: 'work-flows',
        label: 'Workflows',
        detail: $localize`Total workflow definitions in Work Item/Work Order services.`,
        requests: [
          {
            method: 'POST',
            path: '/niworkitem/v1/query-workflows',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'POST',
            path: '/niworkitem/v1/query-workflows',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'POST',
            path: '/niworkorder/v1/query-workflows',
            body: { take: 1, returnCount: true },
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['workflows']),
      },
      {
        key: 'work-item-templates',
        label: 'Work Item Templates',
        detail: $localize`Total work item templates in Test Plans.`,
        requests: [
          {
            method: 'POST',
            path: '/niworkitem/v1/query-workitem-templates',
            body: { take: 1, returnCount: true },
          },
          {
            method: 'POST',
            path: '/niworkitem/v1/query-workitem-templates',
            body: { Take: 1, ReturnCount: true },
          },
          {
            method: 'GET',
            path: '/niworkitem/v1/workitem-templates?take=1',
          },
        ],
        parser: (payload: unknown) => this.extractCollectionCount(payload, ['workItemTemplates']),
      },
    ];

    // Some metrics depend on optional services not present on every SystemLink version.
    const optionalServiceMetrics: ReadonlyArray<{ service: string; keys: readonly string[] }> = [
      { service: 'DataFrame', keys: ['data-tables', 'max-data-table-rows', 'max-data-table-columns'] },
      { service: 'Locations', keys: ['locations'] },
    ];
    const hiddenKeys = new Set<string>();
    for (const entry of optionalServiceMetrics) {
      if (!(await this.context.isServiceAvailable(entry.service))) {
        entry.keys.forEach(key => hiddenKeys.add(key));
      }
    }
    const activeProbes = probes
      .filter((probe: CountProbe) => !hiddenKeys.has(probe.key))
      .filter((probe: CountProbe) => !(ws && INSTANCE_WIDE_METRIC_KEYS.has(probe.key)))
      .map((probe: CountProbe) => (ws ? this.scopeProbeToWorkspace(probe, ws) : probe));

    const runProbe = async (probe: CountProbe): Promise<UsageMetric> => {
      const outcome = await this.probeCount(probe, ws);
      const attempt = outcome.attempt;
      const status: UsageMetric['status'] = attempt
        ? 'ok'
        : outcome.unauthorized
          ? 'unauthorized'
          : 'unavailable';
      const metric: UsageMetric = {
        key: probe.key,
        label: probe.label,
        detail: probe.detail,
        value: attempt ? attempt.value : null,
        source: attempt?.request.path ?? (outcome.unauthorized ? 'Unauthorized (401/403)' : 'No count field returned'),
        status,
      };
      accumulated.push(metric);
      onPartialUpdate?.([...accumulated]);
      return metric;
    };

    // Cap concurrency so the initial load doesn't burst past the API rate limit (429s).
    const baseMetricsPromise = this.mapWithConcurrency(activeProbes, 6, runProbe);

    // Run work-item-type metrics concurrently with the base probes
    const workItemTypePromise = this.loadWorkItemTypeMetrics(ws).then(witmMetrics => {
      accumulated.push(...witmMetrics);
      onPartialUpdate?.([...accumulated]);
      return witmMetrics;
    });

    const [baseMetrics, workItemTypeMetrics] = await Promise.all([
      baseMetricsPromise,
      workItemTypePromise,
    ]);

    const metrics = [...baseMetrics, ...workItemTypeMetrics];

    return {
      metrics,
      unavailable: metrics
        .filter((metric: UsageMetric) => metric.value === null)
        .map((metric) => metric.label),
      refreshedAt,
    };
  }

  private memoize<T>(key: string, factory: () => Promise<T>): Promise<T> {
    let promise = this.memo.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = factory();
      this.memo.set(key, promise);
    }
    return promise;
  }

  private workspaceFilter(ws: string): string {
    return 'workspace == ' + JSON.stringify(ws);
  }

  private itemWorkspace(item: unknown): string | null {
    return item && typeof item === 'object'
      ? this.toNonEmptyString((item as Record<string, unknown>)['workspace'])
      : null;
  }

  // Swaps generic count requests for workspace-scoped equivalents; scans are scoped in probeCount.
  private scopeProbeToWorkspace(probe: CountProbe, ws: string): CountProbe {
    const filter = this.workspaceFilter(ws);
    const wsParam = encodeURIComponent(ws);
    const scoped = (requests: CountRequest[]): CountProbe => ({ ...probe, requests });

    switch (probe.key) {
      case 'test-results':
        return scoped([{ method: 'POST', path: '/nitestmonitor/v2/query-results', body: { filter, take: 0, returnCount: true } }]);
      case 'test-steps':
        return scoped([{ method: 'POST', path: '/nitestmonitor/v2/query-steps', body: { filter, take: 1, returnCount: true } }]);
      case 'products':
        return scoped([{ method: 'POST', path: '/nitestmonitor/v2/query-products', body: { filter, take: 1, returnCount: true } }]);
      case 'assets':
        return scoped([{ method: 'POST', path: '/niapm/v1/query-assets', body: { filter, take: 1, returnCount: true } }]);
      case 'files':
        return scoped([{ method: 'POST', path: '/nifile/v1/service-groups/Default/query-files', body: { take: 1, workspace: ws } }]);
      case 'data-spaces':
        return scoped([{
          method: 'POST',
          path: '/niapp/v1/webapps/query?includeTotalCount=true',
          body: { filter: 'type == "DataSpace" && ' + filter, take: 1 },
        }]);
      case 'web-applications':
        return scoped([{ method: 'POST', path: '/niapp/v1/webapps/query?includeTotalCount=true', body: { filter, take: 1 } }]);
      case 'tags':
        return scoped([{ method: 'GET', path: '/nitag/v2/tags?take=1&workspace=' + wsParam }]);
      case 'states':
        return scoped([{ method: 'GET', path: '/nisystemsstate/v1/states?Take=1&Workspace=' + wsParam }]);
      case 'feeds':
        return scoped([{ method: 'GET', path: '/nifeed/v1/feeds?workspace=' + wsParam }]);
      default:
        return probe;
    }
  }

  private async loadWorkItemTypeMetrics(ws: string | null): Promise<UsageMetric[]> {
    const [typesResult, countResult] = await Promise.all([
      this.fetchWorkItemTypes(),
      this.countWorkItemsByTypeViaPagination(ws),
    ]);

    const unauthorized = typesResult.unauthorized || countResult.unauthorized;
    const unavailable = countResult.total === null;

    const totalStatus: UsageMetric['status'] = unavailable
      ? (unauthorized ? 'unauthorized' : 'unavailable')
      : 'ok';

    const totalMetric: UsageMetric = {
      key: 'work-items-total',
      label: 'Total Work Items',
      detail: $localize`Total work items in Test Plans.`,
      value: countResult.total,
      source: unavailable
        ? (unauthorized ? 'Unauthorized (401/403)' : 'No count field returned')
        : '/niworkitem/v1/query-workitems (paged)',
      status: totalStatus,
    };

    const typeMap = new Map<string, WorkItemTypeDefinition>();
    for (const type of typesResult.types) {
      typeMap.set(type.type.toLowerCase(), type);
    }
    for (const countedType of countResult.counts.keys()) {
      const key = countedType.toLowerCase();
      if (!typeMap.has(key)) {
        typeMap.set(key, { type: countedType, label: countedType });
      }
    }

    const typeMetrics: UsageMetric[] = Array.from(typeMap.values())
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
      .map((typeDef) => {
        const value = countResult.total === null
          ? null
          : this.getCountForType(countResult.counts, typeDef.type, typeDef.label);
        const status: UsageMetric['status'] = value === null
          ? (unauthorized ? 'unauthorized' : 'unavailable')
          : 'ok';

        return {
          key: 'work-item-type:' + this.toMetricKeyFragment(typeDef.type),
          label: typeDef.label,
          detail: $localize`Work items of type ${typeDef.label}:typeName:.`,
          value,
          source: value === null
            ? (unauthorized ? 'Unauthorized (401/403)' : 'No count field returned')
            : '/niworkitem/v1/workitemtypes + /niworkitem/v1/query-workitems',
          status,
        };
      });

    return [totalMetric, ...typeMetrics];
  }

  private async fetchWorkItemTypes(): Promise<WorkItemTypeLookupResult> {
    try {
      const response = await fetch(
        this.context.buildApiUrl('/niworkitem/v1/workitemtypes'),
        this.context.buildRequestInit({ method: 'GET' }),
      );

      if (!response.ok) {
        return {
          types: [],
          unauthorized: response.status === 401 || response.status === 403,
        };
      }

      const payload = (await response.json()) as unknown;
      const types = this.parseWorkItemTypes(payload);
      return {
        types,
        unauthorized: false,
      };
    } catch {
      return {
        types: [],
        unauthorized: false,
      };
    }
  }

  private parseWorkItemTypes(payload: unknown): WorkItemTypeDefinition[] {
    const candidates = this.extractArrayCandidate(payload, ['workItemTypes', 'types', 'value']);
    if (!candidates) {
      return [];
    }

    const result = new Map<string, WorkItemTypeDefinition>();
    for (const entry of candidates) {
      if (typeof entry === 'string') {
        const value = entry.trim();
        if (value.length > 0) {
          result.set(value.toLowerCase(), { type: value, label: value });
        }
        continue;
      }

      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const type =
        this.toNonEmptyString(record['type']) ??
        this.toNonEmptyString(record['id']) ??
        this.toNonEmptyString(record['key']) ??
        this.toNonEmptyString(record['value']) ??
        this.toNonEmptyString(record['name']) ??
        this.toNonEmptyString(record['displayName']);
      if (!type) {
        continue;
      }

      const label =
        this.toNonEmptyString(record['displayName']) ??
        this.toNonEmptyString(record['name']) ??
        type;
      result.set(type.toLowerCase(), {
        type,
        label,
      });
    }

    return Array.from(result.values());
  }

  private async countWorkItemsByTypeViaPagination(ws: string | null): Promise<WorkItemTypeCountResult> {
    const take = 1000;
    let continuationToken: string | undefined;
    let page = 0;
    const maxPages = 500;
    let total = 0;
    const counts = new Map<string, number>();

    while (page < maxPages) {
      const body: Record<string, unknown> = { take };
      if (ws) {
        body['filter'] = this.workspaceFilter(ws);
      }
      if (continuationToken) {
        body['continuationToken'] = continuationToken;
      }

      const response = await fetch(
        this.context.buildApiUrl('/niworkitem/v1/query-workitems'),
        this.context.buildRequestInit({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      );

      if (!response.ok) {
        return {
          total: null,
          counts: new Map<string, number>(),
          unauthorized: response.status === 401 || response.status === 403,
        };
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') {
        return {
          total: null,
          counts: new Map<string, number>(),
          unauthorized: false,
        };
      }

      const record = payload as Record<string, unknown>;
      const workItems = Array.isArray(record['workItems'])
        ? (record['workItems'] as unknown[])
        : Array.isArray(record['workitems'])
          ? (record['workitems'] as unknown[])
          : [];

      total += workItems.length;
      for (const item of workItems) {
        const type = this.extractWorkItemTypeValue(item);
        if (!type) {
          continue;
        }

        counts.set(type, (counts.get(type) ?? 0) + 1);
      }

      const tokenValue = record['continuationToken'];
      continuationToken = typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined;
      page += 1;

      if (!continuationToken) {
        return {
          total,
          counts,
          unauthorized: false,
        };
      }
    }

    return {
      total,
      counts,
      unauthorized: false,
    };
  }

  private extractWorkItemTypeValue(item: unknown): string | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    return (
      this.toNonEmptyString(record['type']) ??
      this.toNonEmptyString(record['workItemType']) ??
      this.toNonEmptyString(record['workitemType']) ??
      this.toNonEmptyString(record['itemType'])
    );
  }

  private extractArrayCandidate(payload: unknown, keys: string[]): unknown[] | null {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toMetricKeyFragment(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  private getCountForType(counts: Map<string, number>, ...aliases: string[]): number {
    for (const alias of aliases) {
      const exact = counts.get(alias);
      if (exact !== undefined) {
        return exact;
      }

      const lowerAlias = alias.toLowerCase();
      for (const [key, value] of counts.entries()) {
        if (key.toLowerCase() === lowerAlias) {
          return value;
        }
      }
    }

    return 0;
  }

  // Runs an async mapper over items with a bounded number of workers in flight.
  private async mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          break;
        }
        results[index] = await fn(items[index]);
      }
    });
    await Promise.all(workers);
    return results;
  }

  private async probeCount(probe: CountProbe, ws: string | null): Promise<ProbeOutcome> {
    if (
      probe.key === 'systems' ||
      probe.key === 'connected-systems' ||
      probe.key === 'disconnected-systems' ||
      probe.key === 'virtual-systems'
    ) {
      const systemsSummary = await this.getSystemsSummaryCounts(ws);
      if (systemsSummary) {
        const total =
          (systemsSummary.connected ?? 0) +
          (systemsSummary.disconnected ?? 0) +
          (systemsSummary.virtual ?? 0);

        const valueByKey: Record<string, number | null> = {
          'systems': total,
          'connected-systems': systemsSummary.connected,
          'disconnected-systems': systemsSummary.disconnected,
          'virtual-systems': systemsSummary.virtual,
        };

        const value = valueByKey[probe.key] ?? null;
        if (value !== null) {
          return {
            attempt: {
              request: {
                method: ws ? 'POST' : 'GET',
                path: ws ? '/nisysmgmt/v1/query-systems (paged)' : '/nisysmgmt/v1/get-systems-summary',
              },
              value,
            },
            unauthorized: false,
          };
        }

        return {
          attempt: null,
          unauthorized: systemsSummary.unauthorized,
        };
      }
    }

    if (probe.key === 'users') {
      const pagedUserCount = await this.countUsersViaPagination();
      if (pagedUserCount !== null) {
        return {
          attempt: {
            request: {
              method: 'POST',
              path: '/niuser/v1/users/query (paged)',
            },
            value: pagedUserCount,
          },
          unauthorized: false,
        };
      }
    }

    if (probe.key === 'grafana-dashboards') {
      const grafanaCount = await this.countGrafanaDashboardsStrict(ws);
      if (grafanaCount) {
        return {
          attempt: grafanaCount,
          unauthorized: false,
        };
      }
    }

    if (probe.key === 'locations' && ws) {
      const locations = await this.countLocationsInWorkspace(ws);
      return locations.value !== null
        ? { attempt: { request: { method: 'GET', path: '/nilocation/v1/locations' }, value: locations.value }, unauthorized: false }
        : { attempt: null, unauthorized: locations.unauthorized };
    }

    if (probe.key === 'data-tables') {
      const stats = await this.getDataTableStats(ws);
      if (stats && stats.count !== null) {
        return {
          attempt: {
            request: {
              method: 'POST',
              path: '/nidataframe/v1/query-tables (scanned)',
            },
            value: stats.count,
          },
          unauthorized: false,
        };
      }

      // Avoid generic fallback for Data Tables because deep object scanning can return misleading low values.
      return { attempt: null, unauthorized: stats?.unauthorized ?? false };
    }

    if (probe.key === 'published-notebooks') {
      const notebookCount = await this.countPagedCollectionByContinuationToken({
        path: '/ninotebook/v1/notebook/query',
        collectionKey: 'notebooks',
        filter: ws ? this.workspaceFilter(ws) : undefined,
        workspace: ws,
      });
      if (notebookCount !== null) {
        return {
          attempt: {
            request: {
              method: 'POST',
              path: '/ninotebook/v1/notebook/query (paged)',
            },
            value: notebookCount,
          },
          unauthorized: false,
        };
      }

      return { attempt: null, unauthorized: false };
    }

    if (probe.key === 'max-file-size') {
      const maxSize = await this.getMaxFileSize(ws);
      if (maxSize.value !== null) {
        return {
          attempt: {
            request: {
              method: ws ? 'POST' : 'GET',
              path: ws
                ? '/nifile/v1/service-groups/Default/query-files-linq'
                : '/nifile/v1/service-groups/Default/files?orderBy=size&orderByDescending=true',
            },
            value: maxSize.value,
          },
          unauthorized: false,
        };
      }

      return { attempt: null, unauthorized: maxSize.unauthorized };
    }

    if (probe.key === 'max-data-table-rows' || probe.key === 'max-data-table-columns') {
      const stats = await this.getDataTableStats(ws);
      if (stats) {
        const value = probe.key === 'max-data-table-rows' ? stats.maxRows : stats.maxColumns;
        if (value !== null) {
          return {
            attempt: {
              request: {
                method: 'POST',
                path: '/nidataframe/v1/query-tables (scanned)',
              },
              value,
            },
            unauthorized: false,
          };
        }

        return { attempt: null, unauthorized: stats.unauthorized };
      }

      return { attempt: null, unauthorized: false };
    }

    if (probe.key === 'work-flows') {
      const workflowsCount = await this.countWorkflowsViaPagination(ws);
      if (workflowsCount !== null) {
        return {
          attempt: {
            request: {
              method: 'POST',
              path: '/niworkitem|niworkorder/v1/query-workflows (paged)',
            },
            value: workflowsCount,
          },
          unauthorized: false,
        };
      }

      // Avoid generic fallback for Workflows because nested metadata fields often include version=1.
      return { attempt: null, unauthorized: false };
    }

    if (probe.key === 'work-item-templates') {
      const templatesCount = await this.countWorkItemTemplatesViaPagination(ws);
      if (templatesCount !== null) {
        return {
          attempt: {
            request: {
              method: 'POST',
              path: '/niworkitem/v1/query-workitem-templates (paged)',
            },
            value: templatesCount,
          },
          unauthorized: false,
        };
      }

      // Avoid generic fallback for templates because responses contain many scalar fields unrelated to totals.
      return { attempt: null, unauthorized: false };
    }

    if (probe.key === 'package-counts') {
      const packageCounts = await this.countPackagesAcrossFeeds(ws);
      if (packageCounts.total !== null) {
        return {
          attempt: {
            request: {
              method: 'GET',
              path: '/nifeed/v1/feeds/{feedId}/packages',
            },
            value: packageCounts.total,
          },
          unauthorized: false,
        };
      }

      // Avoid generic fallback for package counts because feed responses contain unrelated scalar values.
      return { attempt: null, unauthorized: packageCounts.unauthorized };
    }

    if (
      probe.key === 'enabled-routines' ||
      probe.key === 'disabled-routines' ||
      probe.key === 'alarm-routines'
    ) {
      const routineStatusCounts = await this.getRoutineStatusCounts(ws);
      if (routineStatusCounts) {
        const value = probe.key === 'enabled-routines'
          ? routineStatusCounts.enabled
          : probe.key === 'disabled-routines'
            ? routineStatusCounts.disabled
            : routineStatusCounts.alarms;

        if (value !== null) {
          return {
            attempt: {
              request: {
                method: 'GET',
                path: '/niroutine/v2/routines (status split)',
              },
              value,
            },
            unauthorized: false,
          };
        }

        return {
          attempt: null,
          unauthorized: routineStatusCounts.unauthorized,
        };
      }

      return { attempt: null, unauthorized: false };
    }

    let sawUnauthorized = false;

    for (const request of probe.requests) {
      const result = await this.tryRequest(request, probe.parser ?? this.extractCount);
      sawUnauthorized = sawUnauthorized || result.unauthorized;
      if (result.value !== null) {
        return {
          attempt: {
            request,
            value: result.value,
          },
          unauthorized: false,
        };
      }
    }

    return { attempt: null, unauthorized: sawUnauthorized };
  }

  // Memoized so the four systems metrics share a single summary request per load.
  private getSystemsSummaryCounts(ws: string | null): Promise<SystemsSummaryCounts | null> {
    return this.memoize('systems|' + (ws ?? ''), () =>
      ws ? this.fetchWorkspaceSystemsCounts(ws) : this.fetchSystemsSummaryCounts(),
    );
  }

  // The summary endpoint ignores workspace, so page the systems in the workspace and bucket by state.
  private async fetchWorkspaceSystemsCounts(ws: string): Promise<SystemsSummaryCounts | null> {
    const take = 1000;
    let skip = 0;
    let connected = 0;
    let disconnected = 0;
    let virtual = 0;

    try {
      for (let page = 0; page < 500; page++) {
        const response = await fetch(
          this.context.buildApiUrl('/nisysmgmt/v1/query-systems'),
          this.context.buildRequestInit({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filter: this.workspaceFilter(ws),
              projection: 'new(connected.data.state as state)',
              take,
              skip,
            }),
          }),
        );

        if (!response.ok) {
          return {
            connected: null,
            disconnected: null,
            virtual: null,
            unauthorized: response.status === 401 || response.status === 403,
          };
        }

        const systems = this.extractArrayCandidate((await response.json()) as unknown, ['data']);
        if (!systems) {
          return null;
        }

        for (const system of systems) {
          const state = system && typeof system === 'object'
            ? String((system as Record<string, unknown>)['state'] ?? '').toUpperCase()
            : '';
          // Matches the summary endpoint, which counts CONNECTED_REFRESH_* states as connected.
          if (state.startsWith('CONNECTED')) {
            connected += 1;
          } else if (state === 'DISCONNECTED') {
            disconnected += 1;
          } else if (state === 'VIRTUAL') {
            virtual += 1;
          }
        }

        if (systems.length < take) {
          break;
        }
        skip += take;
      }
    } catch {
      return null;
    }

    return { connected, disconnected, virtual, unauthorized: false };
  }

  private async countLocationsInWorkspace(ws: string): Promise<{ value: number | null; unauthorized: boolean }> {
    try {
      const response = await fetch(
        this.context.buildApiUrl('/nilocation/v1/locations'),
        this.context.buildRequestInit({ method: 'GET' }),
      );
      if (!response.ok) {
        return { value: null, unauthorized: response.status === 401 || response.status === 403 };
      }
      const locations = this.extractArrayCandidate((await response.json()) as unknown, ['locations']);
      return {
        value: locations ? locations.filter(location => this.itemWorkspace(location) === ws).length : null,
        unauthorized: false,
      };
    } catch {
      return { value: null, unauthorized: false };
    }
  }

  private async fetchSystemsSummaryCounts(): Promise<SystemsSummaryCounts | null> {
    try {
      const response = await fetch(
        this.context.buildApiUrl('/nisysmgmt/v1/get-systems-summary'),
        this.context.buildRequestInit({ method: 'GET' }),
      );

      if (!response.ok) {
        return {
          connected: null,
          disconnected: null,
          virtual: null,
          unauthorized: response.status === 401 || response.status === 403,
        };
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      const record = payload as Record<string, unknown>;
      const connected = this.toNumber(record['connectedCount']) ?? this.toNumber(record['ConnectedCount']);
      const disconnected =
        this.toNumber(record['disconnectedCount']) ?? this.toNumber(record['DisconnectedCount']);
      const virtual = this.toNumber(record['virtualCount']) ?? this.toNumber(record['VirtualCount']);

      return {
        connected,
        disconnected,
        virtual,
        unauthorized: false,
      };
    } catch {
      return null;
    }
  }

  private async tryRequest(request: CountRequest, parser: CountParser): Promise<RequestAttemptResult> {
    const init = this.context.buildRequestInit({ method: request.method });
    const headers = new Headers(init.headers ?? {});
    if (request.method === 'POST') {
      headers.set('Content-Type', 'application/json');
    }
    const requestInit: RequestInit = {
      ...init,
      headers,
      body: request.method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined,
    };
    const url = this.context.buildApiUrl(request.path);

    // Retry on 429/transient errors with exponential backoff to survive rate limits.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 400 * Math.pow(2, attempt - 1)));
      }

      let response: Response;
      try {
        response = await fetch(url, requestInit);
      } catch {
        continue;
      }

      if (response.status === 429) {
        continue;
      }

      if (!response.ok) {
        return {
          value: null,
          unauthorized: response.status === 401 || response.status === 403,
        };
      }

      const headerCount = this.parseCountFromHeaders(response.headers);
      if (headerCount !== null) {
        return { value: headerCount, unauthorized: false };
      }

      const raw = await response.text();
      if (!raw) {
        return { value: null, unauthorized: false };
      }

      const fromText = this.extractCountFromRawText(raw);
      if (fromText !== null) {
        return { value: fromText, unauthorized: false };
      }

      try {
        const payload = JSON.parse(raw) as unknown;
        const parsed = parser(payload);
        if (parsed !== null) {
          return { value: parsed, unauthorized: false };
        }
        return { value: this.findCountDeep(payload, 0, 8), unauthorized: false };
      } catch {
        return { value: null, unauthorized: false };
      }
    }

    return { value: null, unauthorized: false };
  }

  private parseCountFromHeaders(headers: Headers): number | null {
    const raw =
      headers.get('x-total-count') ??
      headers.get('x-ni-total-count') ??
      headers.get('x-total-results') ??
      headers.get('x-count');
    if (!raw) {
      return null;
    }

    return this.toNumber(raw);
  }

  private extractCount(payload: unknown): number | null {
    if (typeof payload === 'number' && Number.isFinite(payload)) {
      return payload;
    }

    if (typeof payload === 'string') {
      const fromText = this.extractCountFromRawText(payload);
      if (fromText !== null) {
        return fromText;
      }

      try {
        const parsed = JSON.parse(payload) as unknown;
        return this.extractCount(parsed);
      } catch {
        return null;
      }
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const entity = payload as Record<string, unknown>;
    const direct = this.getCountFromRecord(entity);
    if (direct !== null) {
      return direct;
    }

    const nestedKeys = ['summary', 'Summary', 'pagination', 'paging', 'metadata', 'meta', 'page'];
    for (const nestedKey of nestedKeys) {
      const nested = entity[nestedKey];
      if (nested && typeof nested === 'object') {
        const nestedCount = this.extractCount(nested);
        if (nestedCount !== null) {
          return nestedCount;
        }
      }
    }

    const deepCount = this.findCountDeep(payload, 0, 6);
    if (deepCount !== null) {
      return deepCount;
    }

    return null;
  }

  private extractStepCount(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const entity = payload as Record<string, unknown>;
    const knownStepKeys = ['totalSteps', 'stepCount', 'stepsCount', 'numberOfSteps'];
    for (const key of knownStepKeys) {
      const raw = entity[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
      }
    }

    const summary = entity['summary'];
    if (summary && typeof summary === 'object') {
      return this.extractStepCount(summary);
    }

    return this.extractCount(payload);
  }

  private getCountFromRecord(entity: Record<string, unknown>): number | null {
    const knownCountKeys = [
      'totalCount',
      'TotalCount',
      'total',
      'Total',
      'count',
      'Count',
      '@odata.count',
      'valueCount',
      'ValueCount',
      'itemCount',
      'ItemCount',
      'numberOfItems',
      'NumberOfItems',
      'totalItems',
      'TotalItems',
      'totalResults',
      'TotalResults',
      'numberOfResults',
      'NumberOfResults',
      'resultCount',
      'ResultCount',
      'totalUsers',
      'TotalUsers',
      'totalRecords',
      'TotalRecords',
      'recordsTotal',
      'RecordsTotal',
      'definedCount',
      'scheduledCount',
      'inProgressCount',
      'pendingApprovalCount',
      'pastDueDateCount',
    ];

    for (const key of knownCountKeys) {
      const raw = entity[key];
      if (raw && typeof raw === 'object') {
        const value = this.toNumber((raw as Record<string, unknown>)['value']);
        if (value !== null) {
          return value;
        }
      }

      const parsed = this.toNumber(raw);
      if (parsed !== null) {
        return parsed;
      }
    }

    return null;
  }

  private extractArrayCount(payload: unknown): number | null {
    if (Array.isArray(payload)) {
      return payload.length;
    }

    return this.extractCount(payload);
  }

  private extractCollectionCount(payload: unknown, keys: string[]): number | null {
    const direct = this.extractCount(payload);
    if (direct !== null) {
      return direct;
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const entity = payload as Record<string, unknown>;
    for (const key of keys) {
      const candidate = entity[key];
      if (Array.isArray(candidate)) {
        return candidate.length;
      }
    }

    return null;
  }

  private extractSystemsCount(payload: unknown): number | null {
    const direct = this.extractCount(payload);
    if (direct !== null) {
      return direct;
    }

    if (Array.isArray(payload) && payload.length > 0) {
      const first = payload[0];
      if (first && typeof first === 'object') {
        const maybeCount = this.toNumber((first as Record<string, unknown>)['count']);
        if (maybeCount !== null) {
          return maybeCount;
        }
      }
    }

    return null;
  }

  private extractSystemsSummaryTotal(payload: unknown): number | null {
    const explicitTotal = this.findFirstNumericKeyDeep(payload, [
      'totalCount',
      'TotalCount',
      'systemCount',
      'SystemCount',
      'totalSystems',
      'TotalSystems',
    ]);
    if (explicitTotal > 0) {
      return explicitTotal;
    }

    const connected = this.findFirstNumericKeyDeep(payload, ['connectedCount', 'ConnectedCount']);
    const disconnected = this.findFirstNumericKeyDeep(payload, [
      'disconnectedCount',
      'DisconnectedCount',
    ]);
    const virtual = this.findFirstNumericKeyDeep(payload, ['virtualCount', 'VirtualCount']);
    const summed = connected + disconnected + virtual;
    if (summed > 0) {
      return summed;
    }

    return this.extractSystemsCount(payload);
  }

  private extractSystemsSummaryConnected(payload: unknown): number | null {
    const connected = this.findFirstNumericKeyDeep(payload, ['connectedCount', 'ConnectedCount']);
    return connected > 0 ? connected : this.toNumber(connected);
  }

  private extractSystemsSummaryDisconnected(payload: unknown): number | null {
    const disconnected = this.findFirstNumericKeyDeep(payload, ['disconnectedCount', 'DisconnectedCount']);
    return disconnected > 0 ? disconnected : this.toNumber(disconnected);
  }

  private extractSystemsSummaryVirtual(payload: unknown): number | null {
    const virtual = this.findFirstNumericKeyDeep(payload, ['virtualCount', 'VirtualCount']);
    return virtual > 0 ? virtual : this.toNumber(virtual);
  }

  private extractWorkItemsCount(payload: unknown): number | null {
    const direct = this.extractCount(payload);
    if (direct !== null) {
      return direct;
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as Record<string, unknown>;
    const keys = [
      'definedCount',
      'scheduledCount',
      'inProgressCount',
      'pendingApprovalCount',
    ];

    let sum = 0;
    let hasAny = false;
    for (const key of keys) {
      const value = this.toNumber(record[key]);
      if (value !== null) {
        sum += value;
        hasAny = true;
      }
    }

    return hasAny ? sum : null;
  }

  private async countUsersViaPagination(): Promise<number | null> {
    let continuationToken: string | undefined;
    let total = 0;
    let page = 0;
    const maxPages = 200;

    while (page < maxPages) {
      const body: Record<string, unknown> = {
        take: 1000,
      };
      if (continuationToken) {
        body['continuationToken'] = continuationToken;
      }

      const response = await fetch(
        this.context.buildApiUrl('/niuser/v1/users/query'),
        this.context.buildRequestInit({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      const record = payload as Record<string, unknown>;
      const users = Array.isArray(record['users']) ? record['users'] : [];
      total += users.length;

      const tokenValue = record['continuationToken'];
      continuationToken = typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined;
      page += 1;

      if (!continuationToken) {
        return total;
      }
    }

    return total > 0 ? total : null;
  }

  private async countSystemsViaPagination(filter?: string): Promise<number | null> {
    const take = 1000;
    let skip = 0;
    let total = 0;
    let page = 0;
    const maxPages = 500;

    while (page < maxPages) {
      const body: Record<string, unknown> = {
        take,
        skip,
      };

      if (filter && filter.length > 0) {
        body['filter'] = filter;
      }

      const response = await fetch(
        this.context.buildApiUrl('/nisysmgmt/v1/query-systems'),
        this.context.buildRequestInit({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        const fallback = this.extractSystemsCount(payload);
        return fallback;
      }

      const pageCount = payload.length;
      total += pageCount;
      page += 1;

      if (pageCount < take) {
        return total;
      }

      skip += take;
    }

    return total > 0 ? total : null;
  }

  private async countSystemsViaGetSystems(): Promise<number | null> {
    const response = await fetch(
      this.context.buildApiUrl('/nisysmgmt/v1/systems'),
      this.context.buildRequestInit({ method: 'GET' }),
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return null;
    }

    return payload.length;
  }

  private async getMaxFileSize(ws: string | null): Promise<{ value: number | null; unauthorized: boolean }> {
    try {
      const params = new URLSearchParams();
      params.set('take', '1');
      params.set('orderBy', 'size');
      params.set('orderByDescending', 'true');

      // The GET list ignores workspace; the LINQ query honors it (but its totalCount is inexact).
      const response = ws
        ? await fetch(
          this.context.buildApiUrl('/nifile/v1/service-groups/Default/query-files-linq'),
          this.context.buildRequestInit({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filter: this.workspaceFilter(ws),
              take: 1,
              orderBy: 'size',
              orderByDescending: true,
            }),
          }),
        )
        : await fetch(
          this.context.buildApiUrl('/nifile/v1/service-groups/Default/files?' + params.toString()),
          this.context.buildRequestInit({ method: 'GET' }),
        );

      if (!response.ok) {
        return { value: null, unauthorized: response.status === 401 || response.status === 403 };
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') {
        return { value: null, unauthorized: false };
      }

      const record = payload as Record<string, unknown>;
      const files = Array.isArray(record['availableFiles']) ? record['availableFiles'] : [];

      if (files.length === 0) {
        // No files means the maximum size is zero.
        return { value: 0, unauthorized: false };
      }

      const first = files[0] as Record<string, unknown>;
      // size64 holds the accurate value; size is a 32-bit field capped at -1 when too large.
      const value = this.toNumber(first['size64']) ?? this.toNumber(first['size']);
      return { value: value ?? null, unauthorized: false };
    } catch {
      return { value: null, unauthorized: false };
    }
  }

  private getDataTableStats(ws: string | null): Promise<DataTableStats | null> {
    return this.memoize('data-tables|' + (ws ?? ''), () => this.computeDataTableStats(ws));
  }

  // Single paginated scan that yields the table count plus max rows/columns.
  // Projection keeps each row tiny (rowCount + columnCount only).
  private async computeDataTableStats(ws: string | null): Promise<DataTableStats | null> {
    const take = 1000;
    let continuationToken: string | undefined;
    let page = 0;
    const maxPages = 500;
    let count = 0;
    let maxRows: number | null = null;
    let maxColumns: number | null = null;
    let sawTable = false;
    let unauthorized = false;

    while (page < maxPages) {
      const body: Record<string, unknown> = {
        take,
        projection: ['ROW_COUNT', 'COLUMN_COUNT'],
      };
      if (ws) {
        body['filter'] = this.workspaceFilter(ws);
      }
      if (continuationToken) {
        body['continuationToken'] = continuationToken;
      }

      let response: Response;
      try {
        response = await fetch(
          this.context.buildApiUrl('/nidataframe/v1/query-tables'),
          this.context.buildRequestInit({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        );
      } catch {
        return sawTable ? { count, maxRows, maxColumns, unauthorized } : null;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          unauthorized = true;
        }
        return sawTable
          ? { count, maxRows, maxColumns, unauthorized }
          : { count: null, maxRows: null, maxColumns: null, unauthorized };
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') {
        break;
      }

      const record = payload as Record<string, unknown>;
      const tables = Array.isArray(record['tables']) ? record['tables'] : [];
      count += tables.length;
      for (const table of tables) {
        if (!table || typeof table !== 'object') {
          continue;
        }
        sawTable = true;
        const tableRecord = table as Record<string, unknown>;
        const rows = this.toNumber(tableRecord['rowCount']);
        if (rows !== null) {
          maxRows = maxRows === null ? rows : Math.max(maxRows, rows);
        }
        const columns = this.toNumber(tableRecord['columnCount'])
          ?? (Array.isArray(tableRecord['columns']) ? tableRecord['columns'].length : null);
        if (columns !== null) {
          maxColumns = maxColumns === null ? columns : Math.max(maxColumns, columns);
        }
      }

      const tokenValue = record['continuationToken'];
      continuationToken = typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined;
      page += 1;

      if (!continuationToken) {
        break;
      }
    }

    // No tables at all means the count and each maximum are zero.
    if (!sawTable) {
      return { count: 0, maxRows: 0, maxColumns: 0, unauthorized };
    }

    return { count, maxRows, maxColumns, unauthorized };
  }

  // Both services can return the same workflows, so count unique IDs across them.
  private async countWorkflowsViaPagination(ws: string | null): Promise<number | null> {
    const seenIds = new Set<string>();
    const workItemTotal = await this.countWorkItemWorkflowsViaPagination(ws, seenIds);
    const workOrderTotal = await this.countWorkOrderWorkflowsViaPagination(ws, seenIds);

    if (workItemTotal === null && workOrderTotal === null) {
      return null;
    }

    return (workItemTotal ?? 0) + (workOrderTotal ?? 0);
  }

  // query-workflows ignores filters, so workspace is applied client-side.
  private async countWorkItemWorkflowsViaPagination(ws: string | null, seenIds: Set<string>): Promise<number | null> {
    return this.countPagedCollectionByContinuationToken({
      path: '/niworkitem/v1/query-workflows',
      collectionKey: 'workflows',
      workspace: ws,
      seenIds,
    });
  }

  private async countWorkOrderWorkflowsViaPagination(ws: string | null, seenIds: Set<string>): Promise<number | null> {
    return this.countPagedCollectionByContinuationToken({
      path: '/niworkorder/v1/query-workflows',
      collectionKey: 'workflows',
      workspace: ws,
      seenIds,
    });
  }

  private async countWorkItemTemplatesViaPagination(ws: string | null): Promise<number | null> {
    return this.countPagedCollectionByContinuationToken({
      path: '/niworkitem/v1/query-workitem-templates',
      collectionKey: 'workItemTemplates',
      filter: ws ? this.workspaceFilter(ws) : undefined,
      workspace: ws,
    });
  }

  private async countPackagesAcrossFeeds(ws: string | null): Promise<FeedPackageCountResult> {
    const feedsResponse = await fetch(
      this.context.buildApiUrl('/nifeed/v1/feeds' + (ws ? '?workspace=' + encodeURIComponent(ws) : '')),
      this.context.buildRequestInit({ method: 'GET' }),
    );

    if (!feedsResponse.ok) {
      return {
        total: null,
        unauthorized: feedsResponse.status === 401 || feedsResponse.status === 403,
      };
    }

    const feedsPayload = (await feedsResponse.json()) as unknown;
    const feedIds = this.extractFeedIds(feedsPayload);
    if (feedIds.length === 0) {
      return {
        total: 0,
        unauthorized: false,
      };
    }

    // Smaller batch size + inter-batch delay to stay under the 429 rate limit
    const BATCH_SIZE = 5;
    let total = 0;

    for (let i = 0; i < feedIds.length; i += BATCH_SIZE) {
      if (i > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      }
      const batch = feedIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(feedId => this.fetchPackageCountForFeed(feedId)));
      for (const count of batchResults) {
        if (count === null) {
          continue;
        }
        total += count;
      }
    }

    return { total, unauthorized: false };
  }

  private async fetchPackageCountForFeed(feedId: string): Promise<number | null> {
    const url = this.context.buildApiUrl('/nifeed/v1/feeds/' + encodeURIComponent(feedId) + '/packages');
    const init = this.context.buildRequestInit({ method: 'GET' });

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(url, init);

        if (response.status === 429) {
          await new Promise<void>(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as unknown;
        const arr = this.extractArrayCandidate(payload, ['packages', 'value', 'items']);
        if (arr) return arr.length;
        return this.extractCollectionCount(payload, ['packages', 'value', 'items']) ?? 0;
      } catch {
        return null;
      }
    }

    return null;
  }

  private async getRoutineStatusCounts(ws: string | null): Promise<RoutineStatusCounts | null> {
    return this.memoize('routines|' + (ws ?? ''), () => this.countRoutineStatusesStrict(ws));
  }

  private async countRoutineStatusesStrict(ws: string | null): Promise<RoutineStatusCounts | null> {
    const fromV1 = await this.countRoutineStatusesByScanningRoutines('/niroutine/v1/routines', ws);
    const fromV2 = await this.countRoutineStatusesByScanningRoutines('/niroutine/v2/routines', ws);

    const enabled =
      fromV1?.enabled !== null && fromV1?.enabled !== undefined &&
      fromV2?.enabled !== null && fromV2?.enabled !== undefined
        ? fromV1.enabled + fromV2.enabled
        : fromV1?.enabled ?? fromV2?.enabled ?? null;

    const disabled =
      fromV1?.disabled !== null && fromV1?.disabled !== undefined &&
      fromV2?.disabled !== null && fromV2?.disabled !== undefined
        ? fromV1.disabled + fromV2.disabled
        : fromV1?.disabled ?? fromV2?.disabled ?? null;

    const alarms =
      fromV2?.alarms !== null && fromV2?.alarms !== undefined
        ? fromV2.alarms
        : fromV1?.alarms ?? null;

    const hasAnyCount = enabled !== null || disabled !== null || alarms !== null;
    if (!hasAnyCount) {
      const unauthorized = Boolean(fromV1?.unauthorized || fromV2?.unauthorized);
      if (unauthorized) {
        return {
          enabled: null,
          disabled: null,
          alarms: null,
          unauthorized: true,
        };
      }

      return null;
    }

    return {
      enabled,
      disabled,
      alarms,
      unauthorized: false,
    };
  }

  private async countRoutineStatusesByScanningRoutines(
    basePath: string,
    ws: string | null,
  ): Promise<RoutineStatusCounts | null> {
    const take = 1000;
    let continuationToken: string | undefined;
    let skip = 0;
    let page = 0;
    const maxPages = 500;
    let enabled = 0;
    let disabled = 0;
    let alarms = 0;
    let sawAny = false;
    let sawEnabledSignal = false;
    let sawAlarmSignal = false;
    const seenRoutineKeys = new Set<string>();

    while (page < maxPages) {
      const params = new URLSearchParams();
      params.set('take', String(take));
      params.set('skip', String(skip));
      if (continuationToken) {
        params.set('continuationToken', continuationToken);
      }

      const response = await fetch(
        this.context.buildApiUrl(basePath + '?' + params.toString()),
        this.context.buildRequestInit({ method: 'GET' }),
      );

      if (!response.ok) {
        return {
          enabled: null,
          disabled: null,
          alarms: null,
          unauthorized: response.status === 401 || response.status === 403,
        };
      }

      const payload = (await response.json()) as unknown;
      const routines = this.extractArrayCandidate(payload, ['routines', 'value', 'items'])
        ?? (Array.isArray(payload) ? payload : null);
      if (!routines) {
        return null;
      }

      let newItemsOnPage = 0;
      for (const routine of routines) {
        const routineKey = this.getRoutineUniqueKey(routine);
        if (routineKey && seenRoutineKeys.has(routineKey)) {
          continue;
        }
        if (routineKey) {
          seenRoutineKeys.add(routineKey);
        }
        newItemsOnPage += 1;

        // The routines API ignores workspace parameters, so filter client-side.
        if (ws && this.itemWorkspace(routine) !== ws) {
          continue;
        }

        const isEnabled = this.extractRoutineEnabled(routine);
        if (isEnabled !== null) {
          sawAny = true;
          sawEnabledSignal = true;
          if (isEnabled) {
            enabled += 1;
          } else {
            disabled += 1;
          }
        }

        const hasAlarmAction = this.extractRoutineHasAlarmAction(routine);
        if (hasAlarmAction !== null) {
          sawAny = true;
          sawAlarmSignal = true;
          if (hasAlarmAction) {
            alarms += 1;
          }
        }
      }

      const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      const tokenValue = record?.['continuationToken'];
      const nextToken = typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined;

      page += 1;
      if (nextToken) {
        continuationToken = nextToken;
        continue;
      }

      if (newItemsOnPage === 0) {
        break;
      }

      continuationToken = undefined;
      skip += Math.max(routines.length, 1);

      if (routines.length < take) {
        // Endpoint can still page via skip even when returned size is below requested take.
        // Continue until no new routines are discovered.
        continue;
      }
    }

    // The strict query fallbacks can't be workspace-scoped; only use them for All.
    if (!sawEnabledSignal && !ws) {
      const enabledStrict = await this.countRoutinesFromQueryStrict(basePath, ['enabled=true', 'filter=enabled eq true']);
      const disabledStrict = await this.countRoutinesFromQueryStrict(basePath, ['enabled=false', 'filter=enabled eq false']);
      if (enabledStrict !== null && disabledStrict !== null) {
        enabled = enabledStrict;
        disabled = disabledStrict;
        sawAny = true;
      }
    }

    if (!sawAlarmSignal && !ws) {
      const alarmsStrict = await this.countRoutinesFromQueryStrict(basePath, ['actionType=ALARM', 'filter=actionType eq ALARM']);
      if (alarmsStrict !== null) {
        alarms = alarmsStrict;
        sawAny = true;
      }
    }

    // A workspace with no routines is a valid zero, not an unknown.
    if (!sawAny && !ws) {
      return null;
    }

    return {
      enabled,
      disabled,
      alarms,
      unauthorized: false,
    };
  }

  private getRoutineUniqueKey(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    return (
      this.toNonEmptyString(record['id']) ??
      this.toNonEmptyString(record['routineId']) ??
      this.toNonEmptyString(record['name']) ??
      this.toNonEmptyString(record['displayName'])
    );
  }

  private extractRoutineEnabled(value: unknown): boolean | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const directBoolean = [
      record['enabled'],
      record['isEnabled'],
      record['Enabled'],
      record['IsEnabled'],
    ];

    for (const candidate of directBoolean) {
      if (typeof candidate === 'boolean') {
        return candidate;
      }
      if (typeof candidate === 'string') {
        const normalized = candidate.trim().toLowerCase();
        if (normalized === 'true' || normalized === 'enabled') {
          return true;
        }
        if (normalized === 'false' || normalized === 'disabled') {
          return false;
        }
      }
    }

    const stateLike = [
      record['state'],
      record['status'],
      record['routineState'],
      record['executionState'],
    ];

    for (const candidate of stateLike) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = candidate.trim().toLowerCase();
      if (normalized.includes('enabled') || normalized === 'active') {
        return true;
      }
      if (normalized.includes('disabled') || normalized === 'inactive') {
        return false;
      }
    }

    return null;
  }

  private extractRoutineHasAlarmAction(value: unknown): boolean | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;

    const flatActionHints = [
      record['actionType'],
      record['ActionType'],
      record['type'],
      record['Type'],
    ];
    for (const candidate of flatActionHints) {
      if (typeof candidate !== 'string') {
        continue;
      }
      if (candidate.trim().toUpperCase() === 'ALARM') {
        return true;
      }
    }

    const actionCollections = [
      record['actions'],
      record['Actions'],
      record['actionList'],
      record['ActionList'],
      record['routineActions'],
      record['RoutineActions'],
    ];

    let sawAction = false;
    for (const collection of actionCollections) {
      if (!Array.isArray(collection)) {
        continue;
      }

      for (const item of collection) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        sawAction = true;
        const action = item as Record<string, unknown>;
        const type =
          this.toNonEmptyString(action['actionType']) ??
          this.toNonEmptyString(action['type']) ??
          this.toNonEmptyString(action['name']) ??
          this.toNonEmptyString(action['kind']);
        if (type && type.toUpperCase() === 'ALARM') {
          return true;
        }
      }
    }

    if (sawAction) {
      return false;
    }

    return null;
  }

  private async countRoutinesFromQueryStrict(basePath: string, queryCandidates: readonly string[]): Promise<number | null> {
    for (const query of queryCandidates) {
      const result = await this.countRoutinesFromSingleQueryStrict(basePath, query);
      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  private async countRoutinesFromSingleQueryStrict(basePath: string, query: string): Promise<number | null> {
    const take = 1000;
    let continuationToken: string | undefined;
    let skip = 0;
    let total = 0;
    let page = 0;
    const maxPages = 500;
    const seenRoutineKeys = new Set<string>();

    while (page < maxPages) {
      const params = new URLSearchParams();
      params.set('take', String(take));
      params.set('skip', String(skip));

      const [queryKey, ...queryValueParts] = query.split('=');
      if (queryKey && queryValueParts.length > 0) {
        params.set(queryKey, queryValueParts.join('='));
      }

      if (continuationToken) {
        params.set('continuationToken', continuationToken);
      }

      const response = await fetch(
        this.context.buildApiUrl(basePath + '?' + params.toString()),
        this.context.buildRequestInit({ method: 'GET' }),
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      const routines = this.extractArrayCandidate(payload, ['routines', 'value', 'items'])
        ?? (Array.isArray(payload) ? payload : null);
      if (!routines) {
        return null;
      }

      let newItemsOnPage = 0;
      for (const routine of routines) {
        const routineKey = this.getRoutineUniqueKey(routine);
        if (routineKey && seenRoutineKeys.has(routineKey)) {
          continue;
        }
        if (routineKey) {
          seenRoutineKeys.add(routineKey);
        }
        newItemsOnPage += 1;
      }
      total += newItemsOnPage;

      const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      const tokenValue = record?.['continuationToken'];
      const nextToken = typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined;

      page += 1;
      if (nextToken) {
        continuationToken = nextToken;
        continue;
      }

      if (newItemsOnPage === 0) {
        return total;
      }

      continuationToken = undefined;
      skip += Math.max(routines.length, 1);
    }

    return total;
  }

  private extractFeedIds(payload: unknown): string[] {
    const feeds = this.extractArrayCandidate(payload, ['feeds', 'value', 'items']);
    if (!feeds) {
      return [];
    }

    const ids = new Set<string>();
    for (const entry of feeds) {
      if (typeof entry === 'string') {
        const feedId = entry.trim();
        if (feedId.length > 0) {
          ids.add(feedId);
        }
        continue;
      }

      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const feedId =
        this.toNonEmptyString(record['feedId']) ??
        this.toNonEmptyString(record['id']) ??
        this.toNonEmptyString(record['name']);

      if (feedId) {
        ids.add(feedId);
      }
    }

    return Array.from(ids.values());
  }

  private async countPagedCollectionByContinuationToken(options: {
    path: string;
    collectionKey: string;
    filter?: string;
    workspace?: string | null;
    // Shared across calls to skip items already counted from another endpoint.
    seenIds?: Set<string>;
  }): Promise<number | null> {
    const take = 1000;
    let continuationToken: string | undefined;
    let total = 0;
    let page = 0;
    const maxPages = 500;

    while (page < maxPages) {
      const body: Record<string, unknown> = {
        take,
      };
      if (options.filter) {
        body['filter'] = options.filter;
      }
      if (continuationToken) {
        body['continuationToken'] = continuationToken;
      }

      const response = await fetch(
        this.context.buildApiUrl(options.path),
        this.context.buildRequestInit({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      const record = payload as Record<string, unknown>;
      const items = Array.isArray(record[options.collectionKey])
        ? (record[options.collectionKey] as unknown[])
        : [];
      const workspace = options.workspace;
      const seenIds = options.seenIds;
      for (const item of items) {
        if (workspace && this.itemWorkspace(item) !== workspace) {
          continue;
        }
        if (seenIds) {
          const id = item && typeof item === 'object'
            ? this.toNonEmptyString((item as Record<string, unknown>)['id'])
            : null;
          if (id) {
            if (seenIds.has(id)) {
              continue;
            }
            seenIds.add(id);
          }
        }
        total += 1;
      }

      const tokenValue = record['continuationToken'];
      continuationToken = typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined;
      page += 1;

      if (!continuationToken) {
        return total;
      }
    }

    return total > 0 ? total : null;
  }

  // SystemLink stores each workspace's dashboards in a Grafana folder whose UID is the workspace ID.
  private async countGrafanaDashboardsStrict(ws: string | null): Promise<CountAttempt | null> {
    const bootstrapPaths = [
      '/dashboardhost/login',
    ];

    for (const path of bootstrapPaths) {
      try {
        await fetch(
          this.context.buildApiUrl(path),
          this.context.buildRequestInit({ method: 'GET' }),
        );
      } catch {
        // Continue with remaining bootstrap calls.
      }
    }

    const scope = ws ? '&folderUIDs=' + encodeURIComponent(ws) : '';
    const queryPaths = [
      '/dashboardhost/api/search?type=dash-db&query=&limit=5000',
      '/dashboardhost/api/search?type=dash-db&limit=5000',
      '/dashboardhost/api/search?type=dash-db',
      '/grafana/api/search?type=dash-db&query=&limit=5000',
      '/grafana/api/search?type=dash-db&limit=5000',
      '/grafana/api/search?type=dash-db',
    ].map(path => path + scope);
    const countDashboards = (items: unknown[]): number => ws
      ? items.filter(item => item && typeof item === 'object'
        && (item as Record<string, unknown>)['folderUid'] === ws).length
      : items.length;

    for (const path of queryPaths) {
      try {
        const response = await fetch(
          this.context.buildApiUrl(path),
          this.context.buildRequestInit({ method: 'GET' }),
        );

        if (!response.ok) {
          continue;
        }

        const raw = await response.text();
        if (!raw) {
          continue;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue;
        }

        if (Array.isArray(payload)) {
          return {
            request: { method: 'GET', path },
            value: countDashboards(payload),
          };
        }

        if (payload && typeof payload === 'object') {
          const record = payload as Record<string, unknown>;
          const dashboards = record['dashboards'];
          if (Array.isArray(dashboards)) {
            return {
              request: { method: 'GET', path },
              value: countDashboards(dashboards),
            };
          }

          const results = record['results'];
          if (Array.isArray(results)) {
            return {
              request: { method: 'GET', path },
              value: countDashboards(results),
            };
          }

          const totalCount = this.toNumber(record['totalCount']) ?? this.toNumber(record['TotalCount']);
          if (totalCount !== null && !ws) {
            return {
              request: { method: 'GET', path },
              value: totalCount,
            };
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractCountFromRawText(raw: string): number | null {
    const patterns = [
      /["']?totalCount["']?\s*:\s*(\d+)/i,
      /["']?TotalCount["']?\s*:\s*(\d+)/i,
      /["']?count["']?\s*:\s*(\d+)/i,
      /["']?Count["']?\s*:\s*(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match || match.length < 2) {
        continue;
      }

      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  private findCountDeep(value: unknown, depth: number, maxDepth: number): number | null {
    if (depth > maxDepth || value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return null;
    }

    if (typeof value === 'string') {
      return this.extractCountFromRawText(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findCountDeep(item, depth + 1, maxDepth);
        if (found !== null) {
          return found;
        }
      }

      return null;
    }

    if (typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const direct = this.getCountFromRecord(record);
    if (direct !== null) {
      return direct;
    }

    for (const nestedValue of Object.values(record)) {
      const found = this.findCountDeep(nestedValue, depth + 1, maxDepth);
      if (found !== null) {
        return found;
      }
    }

    return null;
  }

  private findFirstNumericKeyDeep(
    value: unknown,
    keys: string[],
    depth = 0,
    maxDepth = 8,
  ): number {
    if (depth > maxDepth || value === null || value === undefined) {
      return 0;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findFirstNumericKeyDeep(item, keys, depth + 1, maxDepth);
        if (found > 0) {
          return found;
        }
      }

      return 0;
    }

    if (typeof value !== 'object') {
      return 0;
    }

    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const parsed = this.toNumber(record[key]);
      if (parsed !== null && parsed >= 0) {
        return parsed;
      }
    }

    for (const nested of Object.values(record)) {
      const found = this.findFirstNumericKeyDeep(nested, keys, depth + 1, maxDepth);
      if (found > 0) {
        return found;
      }
    }

    return 0;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}