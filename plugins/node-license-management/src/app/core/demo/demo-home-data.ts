import type {
  HomePageModel,
  NodeDetailRow,
  TrendPoint,
} from '../systemlink/webapp-home-data.service';

interface DemoRowOptions {
  id?: string;
  alias?: string;
  hostName: string;
  nodeType: 'Managed' | 'Unmanaged';
  status: 'Active' | 'Inactive' | 'Virtual';
  registeredDaysAgo: number | null;
  lastActiveDaysAgo: number | null;
  resultId?: string;
}

export function createDemoHomePageModel(): HomePageModel {
  const now = new Date();
  const detail = [
    createRow(
      {
        id: 'demo-system-001',
        alias: 'Line 01 Controller',
        hostName: 'line-01-controller',
        nodeType: 'Managed',
        status: 'Active',
        registeredDaysAgo: 620,
        lastActiveDaysAgo: 1,
        resultId: 'demo-result-001',
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-002',
        alias: 'Line 02 Controller',
        hostName: 'line-02-controller',
        nodeType: 'Managed',
        status: 'Active',
        registeredDaysAgo: 580,
        lastActiveDaysAgo: 3,
        resultId: 'demo-result-002',
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-003',
        alias: 'Environmental Chamber A',
        hostName: 'env-chamber-a',
        nodeType: 'Managed',
        status: 'Active',
        registeredDaysAgo: 420,
        lastActiveDaysAgo: 5,
        resultId: 'demo-result-003',
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-004',
        alias: 'Environmental Chamber B',
        hostName: 'env-chamber-b',
        nodeType: 'Managed',
        status: 'Active',
        registeredDaysAgo: 390,
        lastActiveDaysAgo: 8,
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-005',
        alias: 'Calibration Bench 01',
        hostName: 'cal-bench-01',
        nodeType: 'Managed',
        status: 'Active',
        registeredDaysAgo: 300,
        lastActiveDaysAgo: 12,
        resultId: 'demo-result-005',
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-006',
        alias: 'Calibration Bench 02',
        hostName: 'cal-bench-02',
        nodeType: 'Managed',
        status: 'Active',
        registeredDaysAgo: 240,
        lastActiveDaysAgo: 18,
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-007',
        alias: 'Production Test Rack',
        hostName: 'production-test-rack',
        nodeType: 'Managed',
        status: 'Inactive',
        registeredDaysAgo: 510,
        lastActiveDaysAgo: 390,
      },
      now,
    ),
    createRow(
      {
        id: 'demo-system-008',
        alias: 'Legacy Test Stand',
        hostName: 'legacy-test-stand',
        nodeType: 'Managed',
        status: 'Inactive',
        registeredDaysAgo: 760,
        lastActiveDaysAgo: 450,
      },
      now,
    ),
    createRow(
      {
        id: 'demo-virtual-001',
        alias: 'Virtual Simulation 01',
        hostName: 'VIRTUAL-SIM-01',
        nodeType: 'Unmanaged',
        status: 'Virtual',
        registeredDaysAgo: 95,
        lastActiveDaysAgo: 2,
      },
      now,
    ),
    createRow(
      {
        id: 'demo-virtual-002',
        alias: 'Virtual Simulation 02',
        hostName: 'VIRTUAL-SIM-02',
        nodeType: 'Unmanaged',
        status: 'Virtual',
        registeredDaysAgo: 35,
        lastActiveDaysAgo: 4,
      },
      now,
    ),
    createRow(
      {
        hostName: 'contractor-rig-07',
        nodeType: 'Unmanaged',
        status: 'Active',
        registeredDaysAgo: null,
        lastActiveDaysAgo: 1,
        resultId: 'demo-result-011',
      },
      now,
    ),
    createRow(
      {
        hostName: 'qa-laptop-14',
        nodeType: 'Unmanaged',
        status: 'Active',
        registeredDaysAgo: null,
        lastActiveDaysAgo: 6,
        resultId: 'demo-result-012',
      },
      now,
    ),
    createRow(
      {
        hostName: 'integration-runner-03',
        nodeType: 'Unmanaged',
        status: 'Active',
        registeredDaysAgo: null,
        lastActiveDaysAgo: 14,
        resultId: 'demo-result-013',
      },
      now,
    ),
    createRow(
      {
        hostName: '(no host name)',
        nodeType: 'Unmanaged',
        status: 'Active',
        registeredDaysAgo: null,
        lastActiveDaysAgo: null,
      },
      now,
    ),
  ].map((row, index) => ({ ...row, rowId: String(index) }));

  const trend = createTrend(now);

  return {
    managed: 8,
    unmanaged: 6,
    inactive: 2,
    virtual: 2,
    trend,
    detail,
    enrichLastActive: async () => detail,
  };
}

function createRow(options: DemoRowOptions, now: Date): NodeDetailRow {
  const registered = options.registeredDaysAgo === null ? null : daysAgo(now, options.registeredDaysAgo);
  const lastActive = options.lastActiveDaysAgo === null ? null : daysAgo(now, options.lastActiveDaysAgo);
  const id = options.id ?? '';
  const resultUrl = options.resultId
    ? `/testinsights/results/result/${options.resultId}`
    : '';

  return {
    rowId: '',
    id,
    systemUrl: id ? `/systems/${id}` : '',
    alias: options.alias ?? '',
    hostName: options.hostName,
    hostRaw: options.hostName,
    nodeType: options.nodeType,
    status: options.status,
    registered: formatTimestamp(registered),
    lastActive: formatTimestamp(lastActive),
    lastActiveIso: lastActive?.toISOString() ?? '',
    resultUrl,
    resultLabel: resultUrl ? 'View Result' : '',
  };
}

function createTrend(now: Date): TrendPoint[] {
  const counts = [
    [5, 3],
    [5, 3],
    [6, 3],
    [6, 4],
    [6, 4],
    [7, 4],
    [7, 5],
    [7, 5],
    [8, 5],
    [8, 5],
    [8, 6],
    [8, 6],
  ];
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return counts.map(([managed, unmanaged], index) => {
    const month = new Date(
      Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - (counts.length - index - 1), 1),
    );
    return {
      month: `${month.getUTCFullYear()}-${pad(month.getUTCMonth() + 1)}`,
      managed,
      unmanaged,
    };
  });
}

function daysAgo(now: Date, days: number): Date {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function formatTimestamp(date: Date | null): string {
  if (!date) {
    return '';
  }
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

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
