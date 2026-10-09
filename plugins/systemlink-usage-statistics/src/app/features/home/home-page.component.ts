import { Component, ElementRef, Inject, LOCALE_ID, OnInit, ViewChild } from '@angular/core';

import '@ni/nimble-components/dist/esm/icons/check';
import '@ni/nimble-components/dist/esm/icons/download';
import '@ni/nimble-components/dist/esm/icons/lock';
import '@ni/nimble-components/dist/esm/icons/magnifying-glass';
import '@ni/nimble-components/dist/esm/dialog';
import '@ni/nimble-components/dist/esm/table';
import '@ni/nimble-components/dist/esm/table-column/text';
import '@ni/nimble-components/dist/esm/icons/xmark';

import { AppViewStateService } from '../../core/state/app-view-state.service';
import { CurrentUserService } from '../../core/systemlink/current-user.service';
import { SystemLinkContextService, WorkspaceSummary } from '../../core/systemlink/systemlink-context.service';
import { TagHistoryEntry, TagStatisticsService } from '../../core/systemlink/tag-statistics.service';
import {
  INSTANCE_WIDE_METRIC_KEYS,
  UsageDashboardModel,
  UsageMetric,
  UsageMetricsService,
} from '../../core/systemlink/usage-metrics.service';
import { ViewState } from '../../shared/states/view-state.model';

interface NimbleDialogElement extends HTMLElement {
  show: () => Promise<void>;
  close: (reason?: unknown) => void;
}

interface NimbleTableElement extends HTMLElement {
  setData: (rows: readonly unknown[]) => Promise<void>;
}

interface StatsTableRow {
  id: string;
  timestamp: string;
  value: string;
}

type UsageStatusGlyph = 'pass' | 'fail' | 'lock' | 'none' | 'pending';

interface UsageTreeNode {
  id: string;
  metric: string;
  count: string;
  details: string;
  source: string;
  statusGlyph: UsageStatusGlyph;
  statusLabel: string;
  children: readonly UsageTreeNode[];
}

interface UsageTreeLeaf {
  key: string;
  label: string;
  fallbackDetail: string;
}

interface UsageTreeGroup {
  key: string;
  label: string;
  description: string;
  children: readonly UsageTreeLeaf[];
}

@Component({
  selector: 'sl-home-page',
  standalone: false,
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent implements OnInit {
  private static readonly GROUPS: readonly UsageTreeGroup[] = [
    {
      key: 'assets-systems',
      label: $localize`Assets and System Management`,
      description: $localize`Asset and system inventory metrics.`,
      children: [
        {
          key: 'assets',
          label: $localize`Assets`,
          fallbackDetail: $localize`Total assets tracked by Asset Performance Management.`,
        },
        {
          key: 'systems',
          label: $localize`Total Systems`,
          fallbackDetail: $localize`Total systems reported by Systems Management summary.`,
        },
        {
          key: 'connected-systems',
          label: $localize`Connected Systems`,
          fallbackDetail: $localize`Connected systems reported by Systems Management summary.`,
        },
        {
          key: 'disconnected-systems',
          label: $localize`Disconnected Systems`,
          fallbackDetail: $localize`Disconnected systems reported by Systems Management summary.`,
        },
        {
          key: 'virtual-systems',
          label: $localize`Virtual Systems`,
          fallbackDetail: $localize`Virtual systems reported by Systems Management summary.`,
        },
        {
          key: 'locations',
          label: $localize`Locations`,
          fallbackDetail: $localize`Total locations in the Locations service.`,
        },
        {
          key: 'tags',
          label: $localize`Tags`,
          fallbackDetail: $localize`Total tags in Tag Service.`,
        },
      ],
    },
    {
      key: 'configuration-management',
      label: $localize`Configuration Management`,
      description: $localize`State, feed, and package-management metrics.`,
      children: [
        {
          key: 'states',
          label: $localize`States`,
          fallbackDetail: $localize`Total software states.`,
        },
        {
          key: 'feeds',
          label: $localize`Feeds`,
          fallbackDetail: $localize`Total package feeds.`,
        },
        {
          key: 'package-counts',
          label: $localize`Packages`,
          fallbackDetail: $localize`Total packages across all package feeds.`,
        },
      ],
    },
    {
      key: 'data-management',
      label: $localize`Data Management`,
      description: $localize`Test and file data footprint metrics.`,
      children: [
        {
          key: 'products',
          label: $localize`Products`,
          fallbackDetail: $localize`Total test products in Test Monitor.`,
        },
        {
          key: 'test-results',
          label: $localize`Results`,
          fallbackDetail: $localize`Total test results available to the current user.`,
        },
        {
          key: 'test-steps',
          label: $localize`Steps`,
          fallbackDetail: $localize`Total reported test steps.`,
        },
        {
          key: 'data-tables',
          label: $localize`Data Tables`,
          fallbackDetail: $localize`Total tables in DataFrame Service.`,
        },
        {
          key: 'max-data-table-rows',
          label: $localize`Max Data Table Rows`,
          fallbackDetail: $localize`Largest row count across all data tables.`,
        },
        {
          key: 'max-data-table-columns',
          label: $localize`Max Data Table Columns`,
          fallbackDetail: $localize`Largest column count across all data tables.`,
        },
        {
          key: 'files',
          label: $localize`Files`,
          fallbackDetail: $localize`Total files in File Service.`,
        },
        {
          key: 'max-file-size',
          label: $localize`Max File Size`,
          fallbackDetail: $localize`Largest single file size in File Service.`,
        },
        {
          key: 'data-spaces',
          label: $localize`Data Spaces`,
          fallbackDetail: $localize`Total Data Spaces published to the WebApp service.`,
        },
      ],
    },
    {
      key: 'user-management',
      label: $localize`User Management`,
      description: $localize`Identity and workspace metrics.`,
      children: [
        {
          key: 'users',
          label: $localize`Registered Users`,
          fallbackDetail: $localize`Total users available from User Management.`,
        },
        {
          key: 'workspaces',
          label: $localize`Workspaces`,
          fallbackDetail: $localize`Total workspaces configured on the instance.`,
        },
        {
          key: 'roles',
          label: $localize`Roles`,
          fallbackDetail: $localize`Total role templates in Authorization service.`,
        },
      ],
    },
    {
      key: 'scheduling',
      label: $localize`Operations and Scheduling`,
      description: $localize`Planning and execution metrics.`,
      children: [
        {
          key: 'work-items-total',
          label: $localize`Work Items`,
          fallbackDetail: $localize`Total work items in Test Plans.`,
        },
        {
          key: 'work-item-types-dynamic',
          label: $localize`Work Item Types`,
          fallbackDetail: $localize`Counts for each work item type.`,
        },
        {
          key: 'work-flows',
          label: $localize`Workflows`,
          fallbackDetail: $localize`Total workflow definitions in Work Item/Work Order services.`,
        },
        {
          key: 'work-item-templates',
          label: $localize`Work Item Templates`,
          fallbackDetail: $localize`Total work item templates in Test Plans.`,
        },
      ],
    },
    {
      key: 'analytics-visualizations',
      label: $localize`Analytics and Visualizations`,
      description: $localize`Dashboard and routine metrics.`,
      children: [
        {
          key: 'grafana-dashboards',
          label: $localize`Dashboards`,
          fallbackDetail: $localize`Total dashboards discoverable through embedded Grafana.`,
        },
        {
          key: 'published-notebooks',
          label: $localize`Published Notebooks`,
          fallbackDetail: $localize`Total Jupyter notebooks published to the Notebook service.`,
        },
        {
          key: 'enabled-routines',
          label: $localize`Enabled Routines`,
          fallbackDetail: $localize`Total enabled event-action routines.`,
        },
        {
          key: 'disabled-routines',
          label: $localize`Disabled Routines`,
          fallbackDetail: $localize`Total disabled event-action routines.`,
        },
        {
          key: 'alarm-routines',
          label: $localize`Alarms`,
          fallbackDetail: $localize`Routines whose action list includes ALARM.`,
        },
      ],
    },
  ];

  state: ViewState<UsageDashboardModel>;
  searchTerm = '';
  private allTreeNodes: readonly UsageTreeNode[] = [];
  treeNodes: readonly UsageTreeNode[] = [];
  isSuperUser = false;
  workspaces: readonly WorkspaceSummary[] = [];
  // Empty string is the "All" option.
  selectedWorkspaceId = '';
  private loadSeq = 0;
  selectedMetricNode: UsageTreeNode | null = null;
  statisticsLoading = false;
  statisticsHistory: readonly TagHistoryEntry[] = [];
  statisticsMetricLabel = '';
  statisticsMetricKey = '';
  dailyRates = new Map<string, number | null>();
  dailyRatesLoading = false;
  isPartialLoad = false;
  private hiddenMetricKeys = new Set<string>();
  private lwChart: null = null; // reserved
  private rateQueue: UsageMetric[] = [];
  private rateQueuedKeys = new Set<string>();
  private rateWorkerActive = false;

  @ViewChild('statsDialog') private statsDialog?: ElementRef<NimbleDialogElement>;
  @ViewChild('statsTable') private statsTable?: ElementRef<NimbleTableElement>;

  constructor(
    private readonly dataService: UsageMetricsService,
    private readonly currentUserService: CurrentUserService,
    readonly tagStatisticsService: TagStatisticsService,
    private readonly context: SystemLinkContextService,
    appViewState: AppViewStateService,
    @Inject(LOCALE_ID) private readonly locale: string,
  ) {
    this.state = appViewState.create<UsageDashboardModel>();
  }

  ngOnInit(): void {
    void this.context.listWorkspaces().then(workspaces => {
      this.workspaces = workspaces;
    });
    void this.resolveHiddenMetrics().finally(() => void this.reload());
    void this.currentUserService.checkIsSuperUser().then(result => {
      this.isSuperUser = result;
      if (this.showDailyRate && this.state.value) {
        void this.writeAllTags(this.state.value);
        this.queueRateLoad(this.state.value.metrics);
      }
    });
  }

  // Tag history is only recorded for All workspaces, so rates and statistics don't apply to a single workspace.
  get showDailyRate(): boolean {
    return this.isSuperUser && !this.selectedWorkspaceId;
  }

  onWorkspaceChange(workspaceId: string): void {
    this.selectedWorkspaceId = workspaceId;
    this.selectedMetricNode = null;
    void this.reload();
  }

  // DataFrame service is optional; hide Data Table metrics when it isn't registered.
  private async resolveHiddenMetrics(): Promise<void> {
    const optionalServiceMetrics: ReadonlyArray<{ service: string; keys: readonly string[] }> = [
      { service: 'DataFrame', keys: ['data-tables', 'max-data-table-rows', 'max-data-table-columns'] },
      { service: 'Locations', keys: ['locations'] },
    ];
    const hidden = new Set<string>();
    for (const entry of optionalServiceMetrics) {
      if (!(await this.context.isServiceAvailable(entry.service))) {
        entry.keys.forEach(key => hidden.add(key));
      }
    }
    this.hiddenMetricKeys = hidden;
  }

  async reload(): Promise<void> {
    const seq = ++this.loadSeq;
    const workspaceId = this.selectedWorkspaceId || null;
    this.isPartialLoad = false;
    this.rateQueue = [];
    this.rateQueuedKeys = new Set();
    this.dailyRates = new Map();
    this.state = { ...this.state, isLoading: true, error: null };

    const handlePartial = (partial: readonly UsageMetric[]) => {
      if (seq !== this.loadSeq) return;
      this.allTreeNodes = this.buildTreeNodes(partial, true);
      this.applySearchFilter();
      if (this.showDailyRate) this.queueRateLoad(partial);
      // Show the tree as soon as any results arrive
      if (this.state.isLoading) {
        this.isPartialLoad = true;
        this.state = {
          value: { metrics: [...partial], unavailable: [], refreshedAt: new Date().toISOString() },
          isLoading: false,
          error: null,
        };
      }
    };

    try {
      const value = await this.dataService.load(handlePartial, workspaceId);
      if (seq !== this.loadSeq) return;
      this.isPartialLoad = false;
      this.allTreeNodes = this.buildTreeNodes(value.metrics);
      this.applySearchFilter();
      this.state = { value, isLoading: false, error: null };
      if (this.showDailyRate) {
        void this.writeAllTags(value);
        this.queueRateLoad(value.metrics);
      }
    } catch (error: unknown) {
      if (seq !== this.loadSeq) return;
      this.isPartialLoad = false;
      const message = error instanceof Error ? error.message : $localize`Failed to load usage metrics.`;
      this.state = { ...this.state, isLoading: false, error: message };
      this.allTreeNodes = [];
      this.treeNodes = [];
    }
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLElement & { value?: string };
    this.searchTerm = (target.value ?? '').trim();
    this.applySearchFilter();
  }

  exportCsv(): void {
    const rows: string[][] = [[
      $localize`Category`,
      $localize`Metric`,
      $localize`Status`,
      $localize`Count`,
      $localize`Details`,
    ]];

    for (const group of this.allTreeNodes) {
      for (const child of group.children) {
        rows.push([
          group.metric,
          child.metric,
          child.statusLabel,
          child.count,
          child.details,
        ]);
      }
    }

    const csv = rows
      .map((row) => row.map((value) => this.escapeCsvValue(value)).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    anchor.href = href;
    anchor.download = 'systemlink-usage-metrics-' + timestamp + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  }

  selectMetricRow(node: UsageTreeNode): void {
    if (node.children.length > 0) return;
    this.selectedMetricNode = this.selectedMetricNode === node ? null : node;
  }

  // Keep tree-item DOM stable across partial-load rebuilds so rows don't flicker/jump.
  trackByNodeId(_index: number, node: UsageTreeNode): string {
    return node.id;
  }

  openStatisticsOnDoubleClick(node: UsageTreeNode): void {
    // Statistics/history are a super-user, All-workspaces feature; otherwise only live counts are shown.
    if (!this.showDailyRate) return;
    this.selectMetricRow(node);
    this.openStatisticsDialog();
  }

  openStatisticsDialog(): void {
    if (!this.selectedMetricNode) return;
    this.statisticsMetricLabel = this.selectedMetricNode.metric;
    this.statisticsMetricKey = this.selectedMetricNode.id;
    this.statisticsLoading = true;
    this.statisticsHistory = [];
    void this.statsDialog?.nativeElement.show();
    void this.tagStatisticsService.readTagHistory(this.statisticsMetricKey).then(entries => {
      this.statisticsHistory = entries;
      this.statisticsLoading = false;
      setTimeout(() => this.updateStatsTable(), 0);
    });
  }

  exportStatsCsv(): void {
    const rows: string[][] = [[$localize`Timestamp`, $localize`Value`],
      ...this.statisticsHistoryDesc.map(e => [
        this.formatTimestamp(e.timestamp),
        String(e.value),
      ]),
    ];
    const csv = rows.map(r => r.map(v => '"' + v.replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = this.statisticsMetricKey + '-history.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  }

  closeStatisticsDialog(): void {
    this.statsDialog?.nativeElement.close();
  }

  private updateStatsTable(): void {
    const rows: StatsTableRow[] = this.statisticsHistoryDesc.map((e, i) => ({
      id: String(i),
      timestamp: this.formatTimestamp(e.timestamp),
      value: new Intl.NumberFormat(this.locale).format(e.value),
    }));
    void this.statsTable?.nativeElement.setData(rows);
  }

  // Matches SystemLink's medium date + medium time style in the UI language.
  private formatTimestamp(timestamp: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(timestamp));
  }

  get statisticsTagPath(): string {
    return this.statisticsMetricKey
      ? this.tagStatisticsService.tagPath(this.statisticsMetricKey)
      : '';
  }

  get statisticsHistoryDesc(): readonly TagHistoryEntry[] {
    return [...this.statisticsHistory].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  formatDailyRate(metricKey: string): string {
    if (this.dailyRatesLoading && !this.dailyRates.has(metricKey)) return '\u2026';
    const rate = this.dailyRates.get(metricKey);
    if (rate === undefined || rate === null) return '\u2014';
    if (Math.abs(rate) < 0.005) return '\u2248' + this.perDay(new Intl.NumberFormat(this.locale).format(0));
    const abs = Math.abs(rate);
    const digits = abs < 0.1 ? 2 : abs < 100 ? 1 : 0;
    const str = new Intl.NumberFormat(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs);
    return (rate > 0 ? '+' : '\u2212') + this.perDay(str);
  }

  private perDay(value: string): string {
    return $localize`${value}:rate:/d`;
  }

  getDailyRateSign(metricKey: string): 'positive' | 'negative' | 'neutral' {
    const rate = this.dailyRates.get(metricKey);
    if (rate === undefined || rate === null || Math.abs(rate) < 0.005) return 'neutral';
    return rate > 0 ? 'positive' : 'negative';
  }

  private queueRateLoad(metrics: readonly UsageMetric[]): void {
    const fresh = metrics.filter(m => !this.rateQueuedKeys.has(m.key));
    if (fresh.length === 0) return;
    for (const m of fresh) this.rateQueuedKeys.add(m.key);
    this.rateQueue.push(...fresh);
    this.dailyRatesLoading = true;
    if (!this.rateWorkerActive) void this.drainRateQueue();
  }

  private async drainRateQueue(): Promise<void> {
    this.rateWorkerActive = true;
    const now = new Date().toISOString();
    while (this.rateQueue.length > 0) {
      const batch = this.rateQueue.splice(0, 3);
      const results = await Promise.allSettled(
        batch.map(async m => {
          const history = await this.tagStatisticsService.readTagHistory(m.key);
          // Seed with live value so metrics with only 1 stored entry can show a rate
          const seeded: TagHistoryEntry[] = m.value !== null
            ? [...history, { value: m.value, timestamp: now }]
            : [...history];
          return { key: m.key, rate: this.computeDailyRate(seeded) };
        }),
      );
      const updated = new Map(this.dailyRates);
      for (const r of results) {
        if (r.status === 'fulfilled') updated.set(r.value.key, r.value.rate);
      }
      this.dailyRates = updated;
      if (this.rateQueue.length > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 150));
      }
    }
    this.rateWorkerActive = false;
    this.dailyRatesLoading = false;
  }

  private computeDailyRate(history: TagHistoryEntry[]): number | null {
    if (history.length < 2) return null;
    const sorted = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const msPerDay = 86_400_000;
    const t0 = new Date(sorted[0].timestamp).getTime();
    const spanDays = (new Date(sorted[sorted.length - 1].timestamp).getTime() - t0) / msPerDay;
    // Require at least 1 hour of data span to avoid near-zero denominators
    if (spanDays < 1 / 24) return null;
    const pts = sorted.map(e => ({
      x: (new Date(e.timestamp).getTime() - t0) / msPerDay,
      y: e.value,
    }));
    const n = pts.length;
    const sx = pts.reduce((s, p) => s + p.x, 0);
    const sy = pts.reduce((s, p) => s + p.y, 0);
    const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sx2 - sx * sx;
    return denom === 0 ? null : (n * sxy - sx * sy) / denom;
  }

  private async writeAllTags(model: UsageDashboardModel): Promise<void> {
    const metrics = model.metrics
      .filter((m): m is typeof m & { value: number } => m.value !== null)
      .map(m => ({ key: m.key, value: m.value }));
    await this.tagStatisticsService.writeAllMetrics(metrics, model.refreshedAt);
  }

  private escapeCsvValue(value: string): string {
    const escaped = String(value).replace(/"/g, '""');
    return '"' + escaped + '"';
  }

  private applySearchFilter(): void {
    const term = this.searchTerm.toLowerCase();
    if (!term) {
      this.treeNodes = this.allTreeNodes;
      return;
    }

    this.treeNodes = this.allTreeNodes
      .map((group) => {
        const groupMatches = this.nodeMatches(group, term);
        if (groupMatches) {
          return {
            ...group,
            children: group.children,
          };
        }

        const matchingChildren = group.children.filter((child) => this.nodeMatches(child, term));
        if (matchingChildren.length === 0) {
          return null;
        }

        return {
          ...group,
          children: matchingChildren,
        };
      })
      .filter((group): group is UsageTreeNode => group !== null);
  }

  private nodeMatches(node: UsageTreeNode, term: string): boolean {
    return (
      node.metric.toLowerCase().includes(term) ||
      node.details.toLowerCase().includes(term) ||
      node.count.toLowerCase().includes(term)
    );
  }

  private toMetricNode(metric: UsageMetric): UsageTreeNode {
    const metricLabel = metric.key.startsWith('work-item-type:')
      ? this.formatSchedulingTypeLabel(metric.label)
      : metric.label;

    const hasValue = metric.value !== null;
    const statusGlyph: UsageStatusGlyph = hasValue
      ? 'pass'
      : metric.status === 'unauthorized'
        ? 'lock'
        : 'fail';
    const statusLabel = hasValue
      ? $localize`Passed`
      : metric.status === 'unauthorized'
        ? $localize`Unauthorized`
        : $localize`Failed`;
    const isWorkItemType = metric.key.startsWith('work-item-type:');
    return {
      id: metric.key,
      metric: metricLabel,
      count: hasValue ? this.formatMetricCount(metric.key, metric.value as number) : $localize`N/A`,
      details: isWorkItemType ? $localize`Work items of type ${metricLabel}:typeName:.` : metric.detail,
      source: metric.source,
      statusGlyph,
      statusLabel,
      children: [],
    };
  }

  // File-size metric stores raw bytes; show a human-readable size in the count column.
  private formatMetricCount(key: string, value: number): string {
    if (key === 'max-file-size') {
      return this.formatBytes(value);
    }
    return new Intl.NumberFormat(this.locale).format(value);
  }

  // Mirrors SystemLink's nimble-unit-byte: 1000-based units, at most one decimal.
  private formatBytes(bytes: number): string {
    if (!isFinite(bytes) || bytes < 0) {
      return String(bytes);
    }
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1000 && unitIndex < units.length - 1) {
      value /= 1000;
      unitIndex += 1;
    }
    return new Intl.NumberFormat(this.locale, {
      style: 'unit',
      unit: units[unitIndex],
      unitDisplay: unitIndex === 0 ? 'long' : 'short',
      maximumFractionDigits: 1,
    }).format(value);
  }

  private buildTreeNodes(metrics: readonly UsageMetric[], isPartial = false): readonly UsageTreeNode[] {
    const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
    const workItemTypeMetrics = metrics
      .filter((metric) => metric.key.startsWith('work-item-type:'))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    const nodes: UsageTreeNode[] = [];

    for (const group of HomePageComponent.GROUPS) {
      const children: UsageTreeNode[] = [];
      for (const child of group.children) {
        if (this.hiddenMetricKeys.has(child.key)) {
          continue;
        }
        if (this.selectedWorkspaceId && INSTANCE_WIDE_METRIC_KEYS.has(child.key)) {
          continue;
        }
        if (child.key === 'work-item-types-dynamic') {
          if (workItemTypeMetrics.length === 0) {
            children.push({
              id: `metric-${group.key}-${child.key}`,
              metric: child.label,
              count: $localize`N/A`,
              details: child.fallbackDetail,
              source: 'Not wired yet',
              statusGlyph: 'fail',
              statusLabel: $localize`Failed`,
              children: [],
            });
          } else {
            for (const typeMetric of workItemTypeMetrics) {
              children.push(this.toMetricNode(typeMetric));
            }
          }

          continue;
        }

        const metric = byKey.get(child.key);
        if (!metric) {
          children.push({
            id: `metric-${group.key}-${child.key}`,
            metric: child.label,
            count: isPartial ? '\u2026' : $localize`N/A`,
            details: child.fallbackDetail,
            source: isPartial ? 'Loading\u2026' : 'Not wired yet',
            statusGlyph: isPartial ? 'pending' : 'fail',
            statusLabel: isPartial ? $localize`Loading` : $localize`Failed`,
            children: [],
          });
          continue;
        }

        children.push(
          this.toMetricNode({
            ...metric,
            label: child.label,
          }),
        );
      }

      if (children.length === 0) {
        continue;
      }

      nodes.push({
        id: `group-${group.key}`,
        metric: group.label,
        count: '-',
        details: group.description,
        source: '-',
        statusGlyph: 'none',
        statusLabel: $localize`Category`,
        children,
      });
    }

    return nodes;
  }

  private formatSchedulingTypeLabel(label: string): string {
    const known = HomePageComponent.workItemTypeLabels()[label.trim().toLowerCase()];
    if (known) {
      return known;
    }

    const normalized = label
      .replace(/workitem/gi, 'work item')
      .replace(/workorder/gi, 'work order')
      .replace(/transportorders/gi, 'transport orders')
      .replace(/transportorder/gi, 'transport order')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim()
      .replace(/\s+/g, ' ');

    if (normalized.length === 0) {
      return $localize`Work Items`;
    }

    const titled = normalized
      .split(' ')
      .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
      .join(' ');

    const lower = titled.toLowerCase();
    if (lower === 'maintenance') {
      return titled;
    }

    return lower.endsWith('s') ? titled : `${titled}s`;
  }

  // Display labels for SystemLink's built-in work item types, keyed by the raw API type.
  private static workItemTypeLabels(): Record<string, string> {
    return {
      testplan: $localize`Test Plans`,
      workorder: $localize`Work Orders`,
      job: $localize`Jobs`,
      maintenance: $localize`Maintenance`,
      calibration: $localize`Calibrations`,
      reservation: $localize`Reservations`,
      transportorder: $localize`Transport Orders`,
    };
  }
}
