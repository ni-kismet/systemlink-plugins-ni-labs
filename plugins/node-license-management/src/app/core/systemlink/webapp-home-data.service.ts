import { Injectable } from '@angular/core';

import { createDemoHomePageModel } from '../demo/demo-home-data';
import { SystemLinkContextService } from './systemlink-context.service';

export interface TrendPoint {
  month: string;
  managed: number;
  unmanaged: number;
}

export interface NodeDetailRow {
  [key: string]: string;
  rowId: string;
  id: string;
  systemUrl: string;
  // Friendly system alias shown in place of the minion id (falls back to the host for real systems).
  alias: string;
  hostName: string;
  hostRaw: string;
  nodeType: string;
  status: string;
  registered: string;
  lastActive: string;
  lastActiveIso: string;
  // Direct link to the latest test result for this row ('' when none).
  resultUrl: string;
  // 'View' when a result link exists, otherwise '' so the anchor shows its placeholder.
  resultLabel: string;
}

export interface HomePageModel {
  managed: number;
  unmanaged: number;
  inactive: number;
  virtual: number;
  trend: TrendPoint[];
  detail: NodeDetailRow[];
  // Runs the slow Last Active enrichment on demand and returns the updated detail rows.
  enrichLastActive: () => Promise<NodeDetailRow[]>;
}

interface RawSystem {
  id?: string;
  host?: string;
  localhostName?: string;
  alias?: string;
  createdTimestamp?: string;
  lastUpdated?: string;
  connectionState?: string;
}

interface NodeRecord {
  id: string | null;
  host: string;
  // Friendly system alias for display; only populated for real systems (managed/virtual).
  alias?: string;
  hostRaw: string;
  created: Date | null;
  lastUpdated: Date | null;
  connectionState: string | null;
  fromResult: boolean;
  // Explicit query-results predicate for rows not identified by host name (NULL/empty host, SYSTEM_ID).
  resultFilterOverride?: string;
  // Direct link to the latest test result, resolved during enrichment.
  resultUrl?: string;
  // Raw OS hostname (grains.data.host) when it differs from the displayed host, kept for result matching.
  altHost?: string | null;
}

interface StatusRecord extends NodeRecord {
  nodeType: 'Managed' | 'Unmanaged';
  status: string;
}

const MONTHS_TO_BUILD = 12;
const LICENSE_DURATION = 12;
const PAGE_SIZE = 1000;

// SystemLink Server has no concept of virtual nodes, so "connected.data.state" isn't a
// queryable field there and any filter referencing it fails with a 400 Bad Request.
const MANAGED_FILTER_WITH_VIRTUAL =
  'grains.data.host != null and grains.data.host != "" and connected.data.state != "VIRTUAL" ' +
  'and (activation.data.activated == true or activation.data.activated == null)';
const MANAGED_FILTER_NO_VIRTUAL =
  'grains.data.host != null and grains.data.host != "" ' +
  'and (activation.data.activated == true or activation.data.activated == null)';
// SLE/Valinor expose connected.data.state, letting us honor the "still CONNECTED is not stale" rule.
const MANAGED_PROJECTION_WITH_STATE =
  'new(id, grains.data.host as host, grains.data.localhost as localhostName, alias, createdTimestamp, ' +
  'connected.lastUpdatedTimestamp as lastUpdated, connected.data.state as connectionState)';
const MANAGED_PROJECTION_NO_STATE =
  'new(id, grains.data.host as host, grains.data.localhost as localhostName, alias, createdTimestamp, ' +
  'connected.lastUpdatedTimestamp as lastUpdated)';
const VIRTUAL_FILTER = 'connected.data.state == "VIRTUAL"';
const VIRTUAL_PROJECTION =
  'new(id, alias as host, createdTimestamp, createdTimestamp as lastUpdated)';

// Sentinels used as hostRaw for the collapsed NULL / empty-host unmanaged rows so result lookups
// can build the correct query-results filter for them.
const NULL_HOST_TOKEN = '\u0000NULL_HOST';
const EMPTY_HOST_TOKEN = '\u0000EMPTY_HOST';

@Injectable({ providedIn: 'root' })
export class WebappHomeDataService {
  /** Cached across calls: whether the target instance supports the virtual node concept (SLE only). */
  private virtualNodesSupported: boolean | null = null;

  // Caps concurrent in-flight requests so aggressive parallelism doesn't trigger 429s.
  private readonly maxConcurrentRequests = 6;
  private activeRequests = 0;
  private readonly requestWaiters: (() => void)[] = [];
  readonly isDemoMode = this.isLocalDemoRequested();

  constructor(private readonly context: SystemLinkContextService) {}

  async load(): Promise<HomePageModel> {
    if (this.isDemoMode) {
      return createDemoHomePageModel();
    }

    const now = new Date();
    const currentMonth = this.firstOfMonthUtc(now);
    const windows = Array.from({ length: MONTHS_TO_BUILD }, (_, m) => {
      const snapshot = m === 0 ? now : this.addMonthsUtc(currentMonth, -m);
      const windowStart =
        m === 0
          ? this.addMonthsPreservingUtcDay(snapshot, -LICENSE_DURATION)
          : this.addMonthsUtc(snapshot, -LICENSE_DURATION);
      return { snapshot, windowStart };
    });

    // Kick off every query that doesn't depend on virtual-node support so the systems queries and
    // the per-month result queries all run concurrently instead of in sequential batches.
    const fleetPromise = this.queryAllSystems('id != null', 'new(id)');
    const resultHostsPromise = Promise.all(
      windows.map((w) => this.queryResultHosts(w.windowStart, w.snapshot)),
    );
    const nullHostSysIdsPromise = Promise.all(
      windows.map((w) =>
        this.querySystemIds('(hostName == null or hostName == "")', w.windowStart, w.snapshot),
      ),
    );
    const hostedSysIdsPromise = Promise.all(
      windows.map((w) =>
        this.querySystemIds('hostName != null and hostName != ""', w.windowStart, w.snapshot),
      ),
    );

    const virtualSupported = await this.detectVirtualNodeSupport();
    const managedFilter = virtualSupported ? MANAGED_FILTER_WITH_VIRTUAL : MANAGED_FILTER_NO_VIRTUAL;
    const managedProjection = virtualSupported ? MANAGED_PROJECTION_WITH_STATE : MANAGED_PROJECTION_NO_STATE;

    const [managedRaw, virtualRaw, fleetRaw, resultHostsByMonth, nullHostSysIdsByMonth, hostedSysIdsByMonth] =
      await Promise.all([
        this.queryAllSystems(managedFilter, managedProjection),
        virtualSupported ? this.queryAllSystems(VIRTUAL_FILTER, VIRTUAL_PROJECTION) : Promise.resolve([]),
        fleetPromise,
        resultHostsPromise,
        nullHostSysIdsPromise,
        hostedSysIdsPromise,
      ]);
    // Every real system id; a SYSTEM_ID on a result that isn't here is an orphaned/misclassified host.
    const fleetIds = new Set(fleetRaw.map((r) => r.id).filter((id): id is string => !!id));

    const managed: NodeRecord[] = managedRaw.map((r) => {
      const rawHost = (r.host ?? '').toString().trim();
      const localhostName = (r.localhostName ?? '').toString().trim();
      // NI Linux RT targets report grains.data.host as "localhost"; prefer the friendlier
      // grains.data.localhost (the SystemLink "Hostname") when the raw host is generic.
      const display =
        localhostName && localhostName.toLowerCase() !== 'localhost'
          ? localhostName
          : rawHost && rawHost.toLowerCase() !== 'localhost'
            ? rawHost
            : localhostName || rawHost;
      return {
        id: r.id ?? null,
        host: display,
        alias: (r.alias ?? '').toString().trim(),
        hostRaw: display,
        created: this.parseDate(r.createdTimestamp),
        lastUpdated: this.parseDate(r.lastUpdated),
        connectionState: r.connectionState ?? null,
        fromResult: false,
        altHost: rawHost && rawHost.toUpperCase() !== display.toUpperCase() ? rawHost : null,
      };
    });

    const virtual: NodeRecord[] = virtualRaw.map((r) => ({
      id: r.id ?? null,
      host: (r.host ?? '').toString().trim().toUpperCase(),
      alias: (r.host ?? '').toString().trim(),
      hostRaw: (r.host ?? '').toString().trim(),
      created: this.parseDate(r.createdTimestamp),
      lastUpdated: this.parseDate(r.lastUpdated),
      connectionState: r.connectionState ?? null,
      fromResult: false,
    }));

    const trend: TrendPoint[] = [];
    let currentManaged: StatusRecord[] = [];
    let currentUnmanaged: StatusRecord[] = [];

    for (let m = 0; m < MONTHS_TO_BUILD; m++) {
      const { snapshot, windowStart } = windows[m];
      const staleCutoff = windowStart;

      // --- Managed snapshot ---
      const managedSnapshot = managed.filter((s) => s.created !== null && s.created <= snapshot);
      const staleIds = new Set(
        managed
          .filter((s) => {
            if (s.connectionState === 'CONNECTED') {
              return false;
            }
            return s.lastUpdated === null || s.lastUpdated <= staleCutoff;
          })
          .map((s) => s.id),
      );
      const managedRows: StatusRecord[] = managedSnapshot.map((s) => ({
        ...s,
        nodeType: 'Managed',
        status: staleIds.has(s.id) ? 'Inactive' : 'Active',
      }));
      const virtualSnapshot = virtual.filter((s) => s.created !== null && s.created <= snapshot);
      const virtualHosts = new Set(virtualSnapshot.map((v) => v.host));
      const managedHosts = new Set<string>();
      for (const s of managedSnapshot) {
        managedHosts.add(s.host.toUpperCase());
        // Also exclude the raw OS hostname so results reported under it aren't counted as unmanaged.
        if (s.altHost) {
          managedHosts.add(s.altHost.toUpperCase());
        }
      }

      // --- Unmanaged snapshot (Test Monitor result hosts + virtual, minus managed) ---
      const resultHosts = resultHostsByMonth[m];
      const seenResultHosts = new Set<string>();
      const resultRows: NodeRecord[] = [];
      let hasNullHost = false;
      let hasEmptyHost = false;
      for (const raw of resultHosts) {
        if (raw === null || raw === undefined) {
          hasNullHost = true;
          continue;
        }
        const trimmed = raw.toString().trim();
        if (trimmed === '') {
          hasEmptyHost = true;
          continue;
        }
        const key = trimmed.toUpperCase();
        if (seenResultHosts.has(key)) {
          continue;
        }
        seenResultHosts.add(key);
        resultRows.push({
          id: null,
          host: key,
          hostRaw: trimmed,
          created: null,
          lastUpdated: null,
          connectionState: null,
          fromResult: true,
        });
      }
      // Results whose host is misclassified under SYSTEM_ID: each distinct SYSTEM_ID that is not a
      // real system (orphaned) and never appears with a host name is a distinct unmanaged node.
      const hostedSysIds = new Set(
        hostedSysIdsByMonth[m]
          .map((s) => (s ?? '').toString().trim().toUpperCase())
          .filter((s) => s),
      );
      let emptySystemIdExists = false;
      for (const raw of nullHostSysIdsByMonth[m]) {
        const value = (raw ?? '').toString().trim();
        if (!value) {
          emptySystemIdExists = true;
          continue;
        }
        const key = value.toUpperCase();
        if (
          fleetIds.has(value) ||
          managedHosts.has(key) ||
          virtualHosts.has(key) ||
          seenResultHosts.has(key) ||
          hostedSysIds.has(key)
        ) {
          continue;
        }
        seenResultHosts.add(key);
        resultRows.push({
          id: null,
          host: value,
          hostRaw: value,
          created: null,
          lastUpdated: null,
          connectionState: null,
          fromResult: true,
          resultFilterOverride: `systemId == "${value.replace(/"/g, '\\"')}"`,
        });
      }

      // NULL / empty host results that also lack a SYSTEM_ID collapse to one node each.
      if (hasNullHost && emptySystemIdExists) {
        resultRows.push({
          id: null,
          host: '(no host name)',
          hostRaw: NULL_HOST_TOKEN,
          created: null,
          lastUpdated: null,
          connectionState: null,
          fromResult: true,
          resultFilterOverride: 'hostName == null and (systemId == null or systemId == "")',
        });
      }
      if (hasEmptyHost && emptySystemIdExists) {
        resultRows.push({
          id: null,
          host: '(empty host name)',
          hostRaw: EMPTY_HOST_TOKEN,
          created: null,
          lastUpdated: null,
          connectionState: null,
          fromResult: true,
          resultFilterOverride: 'hostName != null and hostName == "" and (systemId == null or systemId == "")',
        });
      }

      const combined: NodeRecord[] = [
        ...resultRows.filter((r) => !virtualHosts.has(r.host.toUpperCase())),
        ...virtualSnapshot,
      ];
      const unmanagedRows: StatusRecord[] = combined
        .filter((r) => virtualHosts.has(r.host) || !managedHosts.has(r.host))
        .map((r) => ({
          ...r,
          nodeType: 'Unmanaged',
          status: virtualHosts.has(r.host) ? 'Virtual' : 'Active',
        }));

      trend.push({
        month: this.yearMonthUtc(snapshot),
        managed: managedRows.length,
        unmanaged: unmanagedRows.length,
      });

      if (m === 0) {
        currentManaged = managedRows;
        currentUnmanaged = unmanagedRows;
      }
    }

    trend.reverse(); // oldest month first for the trend chart

    const inactive = currentManaged.filter((r) => r.status === 'Inactive').length;
    const virtualCount = currentUnmanaged.filter((r) => r.status === 'Virtual').length;
    const buildDetail = (): NodeDetailRow[] =>
      [...currentManaged, ...currentUnmanaged].map((r, index) => this.toDetailRow(r, index));

    // Defer the slow Last Active enrichment (paginated result scan) so the dashboard renders first.
    // Use the actual current time so Last Active matches the result the View Result link opens.
    const currentWindowStart = this.addMonthsPreservingUtcDay(now, -LICENSE_DURATION);
    // Hosts known to have results this window; used to target every row that should get a result link.
    const currentResultHostSet = new Set(
      (resultHostsByMonth[0] ?? [])
        .map((h) => (h ?? '').toString().trim().toUpperCase())
        .filter((h) => h),
    );

    return {
      managed: currentManaged.length,
      unmanaged: currentUnmanaged.length,
      inactive,
      virtual: virtualCount,
      trend,
      detail: buildDetail(),
      enrichLastActive: async () => {
        await this.enrichResults(
          [...currentManaged, ...currentUnmanaged],
          currentWindowStart,
          new Date(),
          currentResultHostSet,
        );
        return buildDetail();
      },
    };
  }

  private async queryAllSystems(filter: string, projection: string): Promise<RawSystem[]> {
    const url = this.context.buildApiUrl('nisysmgmt/v1/query-systems');
    const all: RawSystem[] = [];
    let skip = 0;

    for (;;) {
      const response = await this.fetchWithRetry(
        url,
        this.context.buildRequestInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter, skip, take: PAGE_SIZE, projection }),
        }),
      );
      if (!response.ok) {
        throw new Error(`query-systems failed (${response.status})`);
      }
      const payload = (await response.json()) as { data?: RawSystem[] };
      const data = payload.data ?? [];
      if (data.length === 0) {
        break;
      }
      all.push(...data);
      skip += PAGE_SIZE;
    }

    return all;
  }

  /** Probes whether the connected instance supports querying virtual node state (SLE only). */
  private async detectVirtualNodeSupport(): Promise<boolean> {
    if (this.virtualNodesSupported !== null) {
      return this.virtualNodesSupported;
    }

    const url = this.context.buildApiUrl('nisysmgmt/v1/query-systems');
    const response = await this.fetchWithRetry(
      url,
      this.context.buildRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: VIRTUAL_FILTER, skip: 0, take: 1, projection: VIRTUAL_PROJECTION }),
      }),
    );
    this.virtualNodesSupported = response.ok;
    return this.virtualNodesSupported;
  }

  private async queryResultHosts(windowStart: Date, snapshot: Date): Promise<(string | null)[]> {
    const url = this.context.buildApiUrl('nitestmonitor/v2/query-result-values');
    const filter = `updatedAt >= "${windowStart.toISOString()}" and updatedAt <= "${snapshot.toISOString()}"`;
    const response = await this.fetchWithRetry(
      url,
      this.context.buildRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'HOST_NAME', filter }),
      }),
    );
    if (!response.ok) {
      throw new Error(`query-result-values failed (${response.status})`);
    }
    const payload = (await response.json()) as (string | null)[] | { values?: (string | null)[] };
    return Array.isArray(payload) ? payload : payload.values ?? [];
  }

  /** Distinct SYSTEM_ID values among results matching the given hostName clause, within the window. */
  private async querySystemIds(
    hostClause: string,
    windowStart: Date,
    snapshot: Date,
  ): Promise<(string | null)[]> {
    const url = this.context.buildApiUrl('nitestmonitor/v2/query-result-values');
    const filter =
      `${hostClause} ` +
      `and updatedAt >= "${windowStart.toISOString()}" and updatedAt <= "${snapshot.toISOString()}"`;
    const response = await this.fetchWithRetry(
      url,
      this.context.buildRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'SYSTEM_ID', filter }),
      }),
    );
    if (!response.ok) {
      // Best-effort grouping; skip if the service rejects the query.
      return [];
    }
    const payload = (await response.json()) as (string | null)[] | { values?: (string | null)[] };
    return Array.isArray(payload) ? payload : payload.values ?? [];
  }

  /** Fills Last Active and Result links for detail rows via a single paged results scan. */
  private async enrichResults(
    records: StatusRecord[],
    windowStart: Date,
    windowEnd: Date,
    resultHosts: Set<string>,
  ): Promise<void> {
    // Rows identified by an explicit predicate (NULL/empty host or SYSTEM_ID) can't be matched by
    // host key, so query each directly — in parallel.
    const overrideRows = records.filter((r) => r.resultFilterOverride);
    await Promise.all(
      overrideRows.map(async (row) => {
        const latest = await this.getLatestResult(row.resultFilterOverride as string, windowStart, windowEnd);
        if (latest.timestamp && !row.lastUpdated) {
          row.lastUpdated = latest.timestamp;
        }
        if (latest.id) {
          row.resultUrl = this.resultUrlFromId(latest.id);
        }
      }),
    );

    // Target every row (managed/virtual/unmanaged) whose host is known to have results, so the scan
    // captures each one's latest result id — not just the unmanaged rows needing Last Active.
    const targetKeys = new Set<string>();
    for (const r of records) {
      if (r.resultFilterOverride) {
        continue;
      }
      const key = this.resultHostKey(r);
      if (key && resultHosts.has(key)) {
        targetKeys.add(key);
      }
    }
    if (targetKeys.size === 0) {
      return;
    }

    const url = this.context.buildApiUrl('nitestmonitor/v2/query-results');
    const filter = `updatedAt >= "${windowStart.toISOString()}" and updatedAt <= "${windowEnd.toISOString()}"`;
    // Latest result (id + timestamp) per host; captured for every host seen, not just targets.
    const latestByHost = new Map<string, { ts: Date | null; id?: string }>();
    let targetsFound = 0;
    let continuationToken: string | undefined;
    const maxPages = 60;

    for (let page = 0; page < maxPages && targetsFound < targetKeys.size; page++) {
      const response = await this.fetchWithRetry(
        url,
        this.context.buildRequestInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter,
            orderBy: 'UPDATED_AT',
            descending: true,
            take: 1000,
            projection: ['HOST_NAME', 'STARTED_AT', 'UPDATED_AT', 'ID'],
            continuationToken,
          }),
        }),
      );
      if (!response.ok) {
        break;
      }
      const payload = (await response.json()) as {
        results?: { hostName?: string; startedAt?: string; updatedAt?: string; id?: string }[];
        continuationToken?: string;
      };
      const results = payload.results ?? [];
      for (const result of results) {
        // Results are newest-first, so the first hit per host is its latest.
        const key = (result.hostName ?? '').trim().toUpperCase();
        if (!key || latestByHost.has(key)) {
          continue;
        }
        latestByHost.set(key, { ts: this.parseDate(result.updatedAt ?? result.startedAt), id: result.id });
        if (targetKeys.has(key)) {
          targetsFound++;
        }
      }
      continuationToken = payload.continuationToken;
      if (!continuationToken || results.length === 0) {
        break;
      }
    }

    for (const row of records) {
      if (row.resultFilterOverride) {
        continue;
      }
      const key = this.resultHostKey(row);
      const entry = key ? latestByHost.get(key) : undefined;
      if (!entry) {
        continue;
      }
      if (row.nodeType === 'Unmanaged' && row.status === 'Active' && !row.lastUpdated && entry.ts) {
        row.lastUpdated = entry.ts;
      }
      if (!row.resultUrl && entry.id) {
        row.resultUrl = this.resultUrlFromId(entry.id);
      }
    }
  }

  /**
   * The host key under which a row's test results are actually stored. Results carry the machine's
   * OS hostname (grains.data.host), which for managed nodes can differ from the displayed friendly
   * SystemLink Hostname — so prefer altHost. The generic "localhost" can't identify a node uniquely,
   * so it yields no key (no link) rather than an incorrect one.
   */
  private resultHostKey(r: NodeRecord): string | null {
    const candidate = (r.altHost || r.host || '').trim();
    if (!candidate || candidate.toLowerCase() === 'localhost') {
      return null;
    }
    return candidate.toUpperCase();
  }

  private resultUrlFromId(id: string): string {
    return `${this.context.origin}/testinsights/results/result/${id}`;
  }

  /** Latest result (timestamp + id) for a hostName/systemId predicate, bounded to the window. */
  private async getLatestResult(
    hostFilter: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<{ timestamp: Date | null; id: string | null }> {
    const url = this.context.buildApiUrl('nitestmonitor/v2/query-results');
    const filter =
      `${hostFilter} ` +
      `and updatedAt >= "${windowStart.toISOString()}" and updatedAt <= "${windowEnd.toISOString()}"`;
    const response = await this.fetchWithRetry(
      url,
      this.context.buildRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter,
          orderBy: 'UPDATED_AT',
          descending: true,
          take: 1,
          projection: ['ID', 'UPDATED_AT', 'STARTED_AT'],
        }),
      }),
    );
    if (!response.ok) {
      return { timestamp: null, id: null };
    }
    const payload = (await response.json()) as {
      results?: { id?: string; updatedAt?: string; startedAt?: string }[];
    };
    const result = payload.results?.[0];
    return result
      ? { timestamp: this.parseDate(result.updatedAt ?? result.startedAt), id: result.id ?? null }
      : { timestamp: null, id: null };
  }

  private toDetailRow(record: StatusRecord, index: number): NodeDetailRow {
    const id = record.id ?? '';
    // Keep the NULL/empty sentinel out of the DOM; the clean predicate lives in resultFilter.
    const isToken = record.hostRaw === NULL_HOST_TOKEN || record.hostRaw === EMPTY_HOST_TOKEN;
    return {
      rowId: `${index}`,
      id,
      systemUrl: id ? `/systems/${id}` : '',
      // Show the friendly alias; for real systems with no alias fall back to the host, never the raw id.
      alias: (record.alias ?? '').trim() || (id ? record.host : ''),
      // Display the original host casing (hostRaw); the uppercased host is only an internal de-dup key.
      hostName: isToken ? record.host : record.hostRaw,
      hostRaw: isToken ? '' : record.hostRaw,
      nodeType: record.nodeType,
      status: record.status,
      registered: this.formatTimestamp(record.created),
      lastActive: this.formatTimestamp(record.lastUpdated),
      lastActiveIso: record.lastUpdated ? record.lastUpdated.toISOString() : '',
      resultUrl: record.resultUrl ?? '',
      resultLabel: record.resultUrl ? 'View Result' : '',
    };
  }

  /** Fetch wrapper that retries on 429/503 with backoff (honoring Retry-After). */
  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 6): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.withSlot(() => fetch(url, init));
      if ((response.status !== 429 && response.status !== 503) || attempt >= maxRetries) {
        return response;
      }
      const retryAfter = Number(response.headers.get('Retry-After'));
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(500 * 2 ** attempt, 8000);
      await this.delay(backoff + Math.random() * 250);
    }
  }

  /** Runs a request while holding one of a limited number of concurrency slots. */
  private async withSlot<T>(run: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrentRequests) {
      await new Promise<void>((resolve) => this.requestWaiters.push(resolve));
    }
    this.activeRequests++;
    try {
      return await run();
    } finally {
      this.activeRequests--;
      this.requestWaiters.shift()?.();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private firstOfMonthUtc(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private addMonthsUtc(date: Date, delta: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
  }

  private addMonthsPreservingUtcDay(date: Date, delta: number): Date {
    const targetMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta + 1, 0),
    );
    const result = new Date(date);
    result.setUTCDate(1);
    result.setUTCFullYear(
      targetMonth.getUTCFullYear(),
      targetMonth.getUTCMonth(),
      Math.min(date.getUTCDate(), targetMonth.getUTCDate()),
    );
    return result;
  }

  private yearMonthUtc(date: Date): string {
    return `${date.getUTCFullYear()}-${this.pad(date.getUTCMonth() + 1)}`;
  }

  private formatTimestamp(date: Date | null): string {
    if (!date) {
      return '';
    }
    // Display in the browser's local timezone to match how SystemLink shows timestamps.
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  private pad(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private isLocalDemoRequested(): boolean {
    if (typeof window === 'undefined' || !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return false;
    }

    const searchValue = new URLSearchParams(window.location.search).get('demo');
    const hashQueryIndex = window.location.hash.indexOf('?');
    const hashValue =
      hashQueryIndex >= 0
        ? new URLSearchParams(window.location.hash.slice(hashQueryIndex + 1)).get('demo')
        : null;
    const value = (searchValue ?? hashValue)?.toLowerCase();
    return value === 'true' || value === '1';
  }
}
