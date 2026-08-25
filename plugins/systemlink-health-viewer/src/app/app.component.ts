import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { EndpointHealth, HealthConfigurationError, SystemLinkService } from './systemlink.service';
import { AppModule } from './app.module';

type StatusFilter = 'all' | 'functional' | 'failed' | 'unauthorized';

interface HealthRow {
  id: string;
  functional: boolean;
  statusKey: 'functional' | 'failed' | 'unauthorized';
  serviceDisplay: string;
  service: string;
  commandDisplay: string;
  endpoint: string;
  registryStateDisplay: string;
  latencyMs: number | null;
  latencyDisplay: string;
  responseCode: number | null;
  responseDisplay: string;
  detailsAvailable: boolean;
}

interface NimbleTableElement extends HTMLElement {
  setData: (rows: readonly HealthRow[]) => Promise<void>;
  setSelectedRecordIds: (recordIds: readonly string[]) => Promise<void>;
}

interface NimbleDialogElement extends HTMLElement {
  show: () => Promise<unknown>;
  close: (reason?: unknown) => void;
}

interface TestMappingEntry {
  serviceName: string;
  testName: string;
  command: 'GET' | 'POST';
  endpoint: string;
  enabled?: boolean;
}

interface TestMappingDocument {
  tests: TestMappingEntry[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [AppModule]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'SystemLink Health Viewer';
  appDisplayVersion: string | null = null;
  theme: 'light' | 'dark' = 'light';
  endpointHealth: EndpointHealth[] = [];
  filteredHealth: EndpointHealth[] = [];
  tableRows: HealthRow[] = [];
  loading = false;
  error: string | null = null;
  errorTitle = 'Connection error';
  searchTerm = '';
  statusFilter: StatusFilter = 'all';
  lastUpdated: Date | null = null;
  selectedOutput: EndpointHealth | null = null;

  @ViewChild('outputDialog') outputDialog?: ElementRef<NimbleDialogElement>;

  private tableElement?: NimbleTableElement;
  private readonly rowsById = new Map<string, EndpointHealth>();
  private readonly testMappingByKey = new Map<string, TestMappingEntry>();
  private dialogOpen = false;
  private colorSchemeListener: ((event: MediaQueryListEvent) => void) | null = null;

  @ViewChild('healthTable')
  set healthTable(ref: ElementRef<NimbleTableElement> | undefined) {
    this.tableElement = ref?.nativeElement;
    if (this.tableElement) {
      this.pushTableData();
    }
  }

  constructor(private systemLink: SystemLinkService, private http: HttpClient) {}

  ngOnInit(): void {
    this.initializeTheme();
    this.systemLink.getAppConfig().subscribe({
      next: config => {
        this.appDisplayVersion =
          config.appDisplayVersion === 'NOT_CONFIGURED' ? null : config.appDisplayVersion;
      },
      error: () => {
        this.appDisplayVersion = null;
      }
    });
    this.loadTestMappings().subscribe({
      next: () => this.refresh(),
      error: error => this.showError(error)
    });
  }

  ngOnDestroy(): void {
    if (this.colorSchemeListener) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.removeEventListener('change', this.colorSchemeListener);
      this.colorSchemeListener = null;
    }
  }

  refresh(): void {
    this.loading = true;
    this.error = null;

    this.systemLink.getServiceHealth().subscribe({
      next: data => {
        this.endpointHealth = data;
        this.applyFilters();
        this.lastUpdated = new Date();
        this.loading = false;
      },
      error: err => {
        this.showError(err);
        this.loading = false;
      }
    });
  }

  get totalServices(): number {
    return this.getVisibleEndpointHealth().length;
  }

  get hasHealthData(): boolean {
    return this.endpointHealth.length > 0;
  }

  get functionalCount(): number {
    return this.getCountableEndpointHealth().filter(item => item.functional).length;
  }

  get failedCount(): number {
    return this.getCountableEndpointHealth().filter(item => !item.functional).length;
  }

  get unauthorizedCount(): number {
    return this.getVisibleEndpointHealth().filter(item => item.authRestricted).length;
  }

  get availabilityPercent(): number {
    const countable = this.getCountableEndpointHealth();
    if (!countable.length) {
      return 0;
    }
    return Math.round((this.functionalCount / countable.length) * 100);
  }

  get averageLatencyMs(): number | null {
    const measured = this.getCountableEndpointHealth()
      .map(item => item.latencyMs)
      .filter((value): value is number => typeof value === 'number');

    if (!measured.length) {
      return null;
    }

    return Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length);
  }

  trackByEndpoint(index: number, item: EndpointHealth): string {
    return `${item.service}-${item.endpoint}-${index}`;
  }

  onRowSelectionChange(event: Event): void {
    const detail = (event as CustomEvent<{ selectedRecordIds?: string[] }>).detail;
    const id = detail?.selectedRecordIds?.[0] ?? null;
    if (id) {
      this.openDetailsForId(id);
    }
  }

  closeOutputModal(): void {
    this.outputDialog?.nativeElement.close();
  }

  private openDetailsForId(id: string | null): void {
    const result = id ? this.rowsById.get(id) ?? null : null;
    if (!result) {
      return;
    }

    this.selectedOutput = result;
    const dialog = this.outputDialog?.nativeElement;
    if (dialog && !this.dialogOpen) {
      this.dialogOpen = true;
      void dialog.show().then(() => {
        this.dialogOpen = false;
        this.selectedOutput = null;
        void this.tableElement?.setSelectedRecordIds?.([]);
      });
    }
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value ?? '';
    this.applyFilters();
  }

  onStatusSummaryClick(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  onSummaryPanelClick(event: Event): void {
    const tile = event.composedPath().find(
      (item): item is HTMLElement =>
        item instanceof HTMLElement && item.localName === 'ok-fv-summary-panel-tile'
    );
    const filter = tile?.dataset['filter'];
    if (filter === 'all' || filter === 'functional' || filter === 'failed' || filter === 'unauthorized') {
      this.onStatusSummaryClick(filter);
    }
  }

  private initializeTheme(): void {
    const urlTheme = this.getThemeFromUrl();
    const storedTheme = this.getStoredTheme();

    if (urlTheme) {
      this.setTheme(urlTheme);
      return;
    }

    if (storedTheme) {
      this.setTheme(storedTheme);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.setTheme(mediaQuery.matches ? 'dark' : 'light');
    this.colorSchemeListener = event => {
      this.setTheme(event.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', this.colorSchemeListener);
  }

  private setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
  }

  private getThemeFromUrl(): 'light' | 'dark' | null {
    const query = new URLSearchParams(window.location.search);
    const value = query.get('theme');
    if (value === 'light' || value === 'dark') {
      return value;
    }
    return null;
  }

  private getStoredTheme(): 'light' | 'dark' | null {
    const value = window.localStorage.getItem('slhm-theme');
    if (value === 'light' || value === 'dark') {
      return value;
    }
    return null;
  }

  private applyFilters(): void {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();
    const filtered = this.endpointHealth.filter(item => {
      if (this.shouldHideHealthItem(item)) {
        return false;
      }

      const statusMatch =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'functional' && item.functional && !item.authRestricted) ||
        (this.statusFilter === 'failed' && !item.functional && !item.authRestricted) ||
        (this.statusFilter === 'unauthorized' && item.authRestricted);

      if (!statusMatch) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const serviceName = this.getMappedServiceName(item);
      const testName = this.getTestNameDisplayForHealth(item);

      return (
        String(serviceName).toLowerCase().includes(normalizedSearch) ||
        String(testName).toLowerCase().includes(normalizedSearch) ||
        String(item.endpoint).toLowerCase().includes(normalizedSearch) ||
        String(item.output).toLowerCase().includes(normalizedSearch)
      );
    });

    this.filteredHealth = filtered;
    this.buildTableRows();
    this.pushTableData();
  }

  private buildTableRows(): void {
    this.rowsById.clear();
    this.tableRows = this.filteredHealth.map((item, index) => {
      const id = `${item.service}|${item.endpoint}|${index}`;
      this.rowsById.set(id, item);
      const serviceName = this.getMappedServiceName(item);
      return {
        id,
        functional: item.functional,
        statusKey: item.authRestricted ? 'unauthorized' : item.functional ? 'functional' : 'failed',
        serviceDisplay: serviceName,
        service: this.getTestNameDisplayForHealth(item),
        commandDisplay: item.endpoint === 'N/A' ? 'N/A' : item.method,
        endpoint: item.endpoint,
        registryStateDisplay: item.registryState ?? 'N/A',
        latencyMs: item.latencyMs,
        latencyDisplay: item.latencyMs !== null ? `${item.latencyMs} ms` : 'N/A',
        responseCode: item.responseCode,
        responseDisplay: item.responseCode !== null ? String(item.responseCode) : 'N/A',
        detailsAvailable: true
      };
    });
  }

  private pushTableData(): void {
    const table = this.tableElement;
    if (table && typeof table.setData === 'function') {
      void table.setData(this.tableRows);
    }
  }

  private getVisibleEndpointHealth(): EndpointHealth[] {
    return this.endpointHealth.filter(item => !this.shouldHideHealthItem(item));
  }

  private getCountableEndpointHealth(): EndpointHealth[] {
    return this.getVisibleEndpointHealth().filter(item => !item.authRestricted);
  }

  private shouldHideHealthItem(item: EndpointHealth): boolean {
    return false;
  }

  getTestNameDisplayForHealth(item: EndpointHealth): string {
    const mapping = this.getTestMapping(item);
    if (mapping?.testName) {
      return mapping.testName;
    }

    return this.getMappedServiceName(item);
  }

  getSelectedOutputTestName(): string {
    return this.selectedOutput ? this.getTestNameDisplayForHealth(this.selectedOutput) : '';
  }

  private loadTestMappings(): Observable<void> {
    return this.http.get<TestMappingDocument>('assets/test-mapping.json').pipe(
      map(document => {
        if (!document || !Array.isArray(document.tests)) {
          throw new HealthConfigurationError();
        }

        this.testMappingByKey.clear();
        for (const test of document.tests) {
          if (!test?.command || !test?.endpoint || test.enabled === false) {
            continue;
          }

          this.testMappingByKey.set(this.getTestMappingKey(test.command, test.endpoint), test);
        }
      }),
      catchError(() => {
        this.testMappingByKey.clear();
        return throwError(() => new HealthConfigurationError());
      })
    );
  }

  private showError(error: unknown): void {
    console.error(error);
    if (error instanceof HealthConfigurationError) {
      this.errorTitle = 'Configuration error';
      this.error = error.message;
      return;
    }

    this.errorTitle = 'Connection error';
    this.error = 'Unable to connect to SystemLink API. Please check the API URL and credentials.';
  }

  private getMappedServiceName(item: EndpointHealth): string {
    const mapping = this.getTestMapping(item);
    return mapping?.serviceName ?? item.service;
  }

  private getTestMapping(item: Pick<EndpointHealth, 'method' | 'endpoint'>): TestMappingEntry | undefined {
    return this.testMappingByKey.get(this.getTestMappingKey(item.method, item.endpoint));
  }

  private getTestMappingKey(method: string, endpoint: string): string {
    return `${method.toUpperCase()}|${endpoint}`;
  }

}
