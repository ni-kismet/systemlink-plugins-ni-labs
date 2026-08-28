import { Component, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { AppViewStateService } from '../../core/state/app-view-state.service';
import {
  HomePageModel,
  NodeDetailRow,
  WebappHomeDataService,
} from '../../core/systemlink/webapp-home-data.service';
import { ViewState } from '../../shared/states/view-state.model';

interface StatTile {
  key: string;
  label: string;
  value: number;
  description: string;
}

interface PieSlice {
  path: string;
  color: string;
  percent: string;
  label: string;
  count: number;
  labelX: number;
  labelY: number;
}

interface BarColumn {
  month: string;
  x: number;
  barWidth: number;
  managedY: number;
  managedHeight: number;
  unmanagedY: number;
  unmanagedHeight: number;
  managedLabelY: number;
  unmanagedLabelY: number;
  totalLabelY: number;
  managed: number;
  unmanaged: number;
  total: number;
}

interface AxisTick {
  value: number;
  y: number;
}

const MANAGED_COLOR = 'var(--ni-nimble-pass-color)';
const UNMANAGED_COLOR = 'var(--app-unmanaged-color)';

const BAR_WIDTH_TOTAL = 760;
const BAR_HEIGHT_TOTAL = 190;
const BAR_PADDING = { top: 20, right: 16, bottom: 28, left: 44 };

@Component({
  selector: 'sl-home-page',
  standalone: false,
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent implements OnInit {
  state: ViewState<HomePageModel>;

  readonly managedColor = MANAGED_COLOR;
  readonly unmanagedColor = UNMANAGED_COLOR;
  readonly demoMode: boolean;
  readonly barWidth = BAR_WIDTH_TOTAL;
  readonly barHeight = BAR_HEIGHT_TOTAL;
  readonly axisLeft = BAR_PADDING.left;
  readonly axisRight = BAR_WIDTH_TOTAL - BAR_PADDING.right;
  readonly axisBottom = BAR_HEIGHT_TOTAL - BAR_PADDING.bottom;

  tiles: StatTile[] = [];
  pieSlices: PieSlice[] = [];
  bars: BarColumn[] = [];
  axisTicks: AxisTick[] = [];
  activeFilter = 'total';
  enriching = false;
  hoverSlice: string | null = null;
  hoverBar: string | null = null;

  private allRows: NodeDetailRow[] = [];

  readonly detailData$ = new BehaviorSubject<NodeDetailRow[]>([]);

  tooltip = { visible: false, x: 0, y: 0, text: '', wide: false };

  constructor(
    private readonly dataService: WebappHomeDataService,
    appViewState: AppViewStateService,
  ) {
    this.state = appViewState.create<HomePageModel>();
    this.demoMode = dataService.isDemoMode;
  }

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    if (this.state.isLoading || this.enriching) {
      return;
    }
    this.state = { ...this.state, isLoading: true, error: null };
    this.enriching = false;
    try {
      const value = await this.dataService.load();
      this.state = { value, isLoading: false, error: null };
      this.buildCharts(value);
      this.setRows(value.detail);
      // Stream in Last Active times without blocking the initial render.
      this.enriching = true;
      value
        .enrichLastActive()
        .then((detail) => this.setRows(detail))
        .catch(() => undefined)
        .finally(() => {
          this.enriching = false;
        });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load node license data.';
      this.state = { ...this.state, isLoading: false, error: message };
    }
  }

  private setRows(detail: NodeDetailRow[]): void {
    this.allRows = [...detail].sort((a, b) => b.lastActiveIso.localeCompare(a.lastActiveIso));
    this.applyFilter();
  }

  showTip(event: MouseEvent, text: string, wide = false): void {
    this.tooltip = { visible: true, x: event.clientX + 12, y: event.clientY + 12, text, wide };
  }

  hideTip(): void {
    this.tooltip = { ...this.tooltip, visible: false };
  }

  selectTile(key: string): void {
    // Clicking the active non-total card again clears the filter back to all nodes.
    this.activeFilter = this.activeFilter === key && key !== 'total' ? 'total' : key;
    this.applyFilter();
  }

  exportCsv(): void {
    const columns: { header: string; field: keyof NodeDetailRow }[] = [
      { header: 'Alias', field: 'alias' },
      { header: 'Minion ID', field: 'id' },
      { header: 'Host Name', field: 'hostName' },
      { header: 'Node Type', field: 'nodeType' },
      { header: 'Status', field: 'status' },
      { header: 'Registered', field: 'registered' },
      { header: 'Last Active', field: 'lastActive' },
    ];
    // Always export the full data set, regardless of the active summary-card filter.
    const rows = this.allRows;
    const escape = (value: string): string => {
      const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${(safeValue ?? '').replace(/"/g, '""')}"`;
    };
    const lines = [
      columns.map((c) => escape(c.header)).join(','),
      ...rows.map((row) => columns.map((c) => escape(row[c.field])).join(',')),
    ];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `node-license-all-${this.timestampSuffix()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private timestampSuffix(): string {
    const now = new Date();
    const pad = (v: number): string => v.toString().padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  private applyFilter(): void {
    const predicate = (row: NodeDetailRow): boolean => {
      switch (this.activeFilter) {
        case 'managed':
          return row.nodeType === 'Managed';
        case 'unmanaged':
          return row.nodeType === 'Unmanaged';
        case 'inactive':
          return row.status === 'Inactive';
        case 'virtual':
          return row.status === 'Virtual';
        default:
          return true;
      }
    };
    this.detailData$.next(this.allRows.filter(predicate));
  }

  private buildCharts(model: HomePageModel): void {
    this.tiles = [
      {
        key: 'total',
        label: 'Total Nodes',
        value: model.managed + model.unmanaged,
        description: 'Total licensed nodes: the sum of Managed and Unmanaged nodes.',
      },
      {
        key: 'managed',
        label: 'Managed',
        value: model.managed,
        description:
          'A system that is not virtual and has a valid host name. Counted against licensing no matter ' +
          'how long it has been online.',
      },
      {
        key: 'unmanaged',
        label: 'Unmanaged',
        value: model.unmanaged,
        description:
          'A system that is not Managed but has reported test results in the last 12 months, or any ' +
          'virtual system regardless of whether the system has results.',
      },
      {
        key: 'inactive',
        label: 'Managed (Inactive)',
        value: model.inactive,
        description:
          'A Managed system that has not been online in the last 12 months. Still counted against ' +
          'licensing, so it is a good candidate to remove and free up a license.',
      },
      {
        key: 'virtual',
        label: 'Unmanaged (Virtual)',
        value: model.virtual,
        description: 'A system classified as virtual by SystemLink.',
      },
    ];
    this.pieSlices = this.buildPie(model.managed, model.unmanaged);
    this.buildBars(model);
  }

  private buildPie(managed: number, unmanaged: number): PieSlice[] {
    const total = managed + unmanaged;
    if (total === 0) {
      return [];
    }

    const cx = 110;
    const cy = 110;
    const r = 100;
    const segments = [
      { value: managed, color: MANAGED_COLOR, label: 'Managed' },
      { value: unmanaged, color: UNMANAGED_COLOR, label: 'Unmanaged' },
    ];

    const slices: PieSlice[] = [];
    let startAngle = -Math.PI / 2;
    for (const segment of segments) {
      if (segment.value === 0) {
        continue;
      }
      const fraction = segment.value / total;
      const endAngle = startAngle + fraction * 2 * Math.PI;
      const midAngle = (startAngle + endAngle) / 2;
      const largeArc = fraction > 0.5 ? 1 : 0;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const halfwayX = cx + r * Math.cos(startAngle + Math.PI);
      const halfwayY = cy + r * Math.sin(startAngle + Math.PI);
      const path =
        fraction >= 1
          ? `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
            `A ${r} ${r} 0 1 1 ${halfwayX.toFixed(2)} ${halfwayY.toFixed(2)} ` +
            `A ${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
          : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
      slices.push({
        path,
        color: segment.color,
        percent: `${Math.round(fraction * 100)}%`,
        label: segment.label,
        count: segment.value,
        labelX: cx + r * 0.55 * Math.cos(midAngle),
        labelY: cy + r * 0.55 * Math.sin(midAngle),
      });
      startAngle = endAngle;
    }
    return slices;
  }

  private buildBars(model: HomePageModel): void {
    const trend = model.trend;
    const plotHeight = this.axisBottom - BAR_PADDING.top;
    const innerWidth = this.axisRight - this.axisLeft;
    const maxTotal = this.niceMax(Math.max(1, ...trend.map((p) => p.managed + p.unmanaged)));

    const slot = trend.length > 0 ? innerWidth / trend.length : innerWidth;
    const barWidth = slot * 0.6;

    this.bars = trend.map((point, index) => {
      const total = point.managed + point.unmanaged;
      const x = this.axisLeft + slot * index + (slot - barWidth) / 2;
      const unmanagedHeight = (point.unmanaged / maxTotal) * plotHeight;
      const managedHeight = (point.managed / maxTotal) * plotHeight;
      const unmanagedY = this.axisBottom - unmanagedHeight;
      const managedY = unmanagedY - managedHeight;
      return {
        month: point.month,
        x,
        barWidth,
        unmanagedY,
        unmanagedHeight,
        managedY,
        managedHeight,
        managedLabelY: managedY + managedHeight / 2 + 4,
        unmanagedLabelY: unmanagedY + unmanagedHeight / 2 + 4,
        totalLabelY: managedY - 6,
        managed: point.managed,
        unmanaged: point.unmanaged,
        total,
      };
    });

    const tickCount = Math.min(5, Math.floor(maxTotal));
    this.axisTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const value = Math.round((maxTotal / tickCount) * i);
      return { value, y: this.axisBottom - (value / maxTotal) * plotHeight };
    });
  }

  private niceMax(value: number): number {
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let nice: number;
    if (normalized <= 1) {
      nice = 1;
    } else if (normalized <= 2) {
      nice = 2;
    } else if (normalized <= 5) {
      nice = 5;
    } else {
      nice = 10;
    }
    return nice * magnitude;
  }
}
