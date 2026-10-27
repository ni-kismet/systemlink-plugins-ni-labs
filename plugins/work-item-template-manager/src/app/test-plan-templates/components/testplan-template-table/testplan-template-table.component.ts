import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  viewChild,
} from '@angular/core';
import {
  debounceTime,
  BehaviorSubject,
  combineLatest,
  map,
  finalize,
  Observable,
  shareReplay,
  Subject,
  takeUntil,
} from 'rxjs';
import { take } from 'rxjs';
import {
  NimbleTableDirective,
  TableRecord,
  TableColumnConfigurationChangeEventDetail,
} from '@ni/nimble-angular/table';
import { NimbleDialogDirective } from '@ni/nimble-angular';
import { TestplanTemplateService } from '../../services/testplan-template/testplan-template.service';
import { TestplanTemplateFiltersService } from '../../services/testplan-template-filters/testplan-template-filters.service';
import { UserDataService } from '../../../core/services/user-data/user-data.service';
import { IGridColumn, IRenderedColumn } from '../../models/grid-column-config.models';
import {
  IColumnSortState,
  ICurrentGridViewState,
} from '../../../core/models/workitem-templates.models';
import { AVAILABLE_COLUMNS } from '../../constants/grid-column-config.constants';
import { GridConfigSlideoutComponent } from '../grid-config-slideout/grid-config-slideout.component';
import { TestplanCreateEditSlideoutComponent } from '../testplan-create-edit-slideout/testplan-create-edit-slideout.component';
import { TestplanDuplicateSlideoutComponent } from '../testplan-duplicate-slideout/testplan-duplicate-slideout.component';
import { IUserDataItem } from '../../../core/models/user-data.models';
import { USER_DATA_NAMESPACE } from '../../../core/constants/user-data.constants';
import { API_ERROR_MESSAGES } from '../../../core/constants/api.constants';
import {
  PermissionService,
  WORK_ITEM_TEMPLATE_ACTIONS,
} from '../../../core/services/permission/permission.service';

/** Displays the testplan templates in a Nimble table with selection-driven toolbar actions. */
@Component({
  selector: 'app-testplan-template-table',
  templateUrl: './testplan-template-table.component.html',
  styleUrl: './testplan-template-table.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestplanTemplateTableComponent implements OnInit, OnDestroy {
  public readonly tableData$: Observable<TableRecord[]>;
  public readonly totalCount$: Observable<number>;
  public readonly isLoading$: Observable<boolean>;
  public readonly selectedIds$: Observable<Set<string>>;
  public readonly allColumns$: Observable<IGridColumn[]>;
  public readonly visibleColumnIds$: Observable<string[]>;
  public readonly groupByIds$: Observable<string[]>;
  public readonly renderedColumns$: Observable<IRenderedColumn[]>;
  public viewState: IUserDataItem<ICurrentGridViewState> | null = null;
  public searchText = '';
  protected readonly actions = WORK_ITEM_TEMPLATE_ACTIONS;
  protected readonly noCreatePrivilege = API_ERROR_MESSAGES.noPrivilegeToCreateTemplate;
  protected readonly noUpdatePrivilege = API_ERROR_MESSAGES.noPrivilegeToUpdateTemplate;
  protected readonly noDeletePrivilege = API_ERROR_MESSAGES.noPrivilegeToDeleteTemplate;
  private workspaceIdByRecordId = new Map<string, string>();

  @ViewChild(NimbleTableDirective)
  private readonly tableDirective!: NimbleTableDirective;

  @ViewChild(GridConfigSlideoutComponent)
  private readonly gridConfigComponent!: GridConfigSlideoutComponent;

  @ViewChild(TestplanCreateEditSlideoutComponent)
  private readonly createEditSlideout!: TestplanCreateEditSlideoutComponent;

  @ViewChild(TestplanDuplicateSlideoutComponent)
  private readonly duplicateSlideout!: TestplanDuplicateSlideoutComponent;

  @ViewChild('deleteDialog', { read: NimbleDialogDirective })
  private readonly deleteDialog!: NimbleDialogDirective<void>;

  private readonly searchField = viewChild<ElementRef>('searchField');
  private readonly onSearchFieldFocusIn = () => this.disableSearchFieldSuggestions();
  private searchFieldMutationObserver?: MutationObserver;
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  private readonly isLoadingSubject = new BehaviorSubject<boolean>(false);
  private readonly selectedIdsSubject = new BehaviorSubject<Set<string>>(new Set());
  private readonly allColumnsSubject = new BehaviorSubject<IGridColumn[]>(AVAILABLE_COLUMNS);
  private readonly visibleColumnIdsSubject = new BehaviorSubject<string[]>(
    AVAILABLE_COLUMNS.filter((column) => column.visible).map((column) => column.id),
  );
  private readonly groupByIdsSubject = new BehaviorSubject<string[]>([]);
  private readonly sortStateSubject = new BehaviorSubject<IColumnSortState[]>([
    { columnId: 'updatedAt', sortDirection: 'descending', sortIndex: 0 },
  ]);

  /**
   * Creates an instance of TestplanTemplateTableComponent.
   */
  public constructor(
    private readonly templateService: TestplanTemplateService,
    private readonly templateFiltersService: TestplanTemplateFiltersService,
    private readonly userDataService: UserDataService,
    private readonly permissionService: PermissionService,
  ) {
    this.tableData$ = this.templateFiltersService.filteredRecords$;
    this.totalCount$ = this.templateService.totalCount$;
    this.isLoading$ = combineLatest([
      this.templateFiltersService.isLoading$,
      this.isLoadingSubject,
    ]).pipe(map(([serviceLoading, localLoading]) => serviceLoading || localLoading));

    this.selectedIds$ = this.selectedIdsSubject.asObservable();
    this.allColumns$ = this.allColumnsSubject.asObservable();
    this.visibleColumnIds$ = this.visibleColumnIdsSubject.asObservable();
    this.groupByIds$ = this.groupByIdsSubject.asObservable();

    this.renderedColumns$ = combineLatest([
      this.allColumns$,
      this.visibleColumnIds$,
      this.groupByIds$,
      this.sortStateSubject,
    ]).pipe(
      map(([allColumns, visibleColumnIds, groupByIds, sortState]) => {
        const visibleIds = new Set(visibleColumnIds);
        const sortMap = new Map(sortState.map((s) => [s.columnId, s]));
        const visibleCols = visibleColumnIds
          .map((id) => allColumns.find((column) => column.id === id))
          .filter((column): column is IGridColumn => column !== undefined);
        const groupedNotVisible = groupByIds
          .filter((id) => !visibleIds.has(id))
          .map((id) => allColumns.find((column) => column.id === id))
          .filter((column): column is IGridColumn => column !== undefined);

        return [...visibleCols, ...groupedNotVisible].map((column) => {
          const index = groupByIds.indexOf(column.id);
          const sort = sortMap.get(column.id);

          return {
            ...column,
            hidden: !visibleIds.has(column.id),
            groupIndex: index >= 0 ? index : null,
            sortDirection: sort?.sortDirection ?? null,
            sortIndex: sort?.sortIndex ?? null,
          };
        });
      }),
    );
  }

  /** Loads templates, subscribes to table data updates, and restores saved column config. */
  public ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe((text) => this.templateFiltersService.onSearchTextChange(text));

    this.tableData$.pipe(takeUntil(this.destroy$)).subscribe((records) => {
      this.workspaceIdByRecordId = new Map(
        records.map((record) => [String(record['id']), String(record['workspaceId'] ?? '')]),
      );
    });

    combineLatest([this.allColumns$, this.visibleColumnIds$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([allColumns, visibleColumnIds]) => {
        const visibleFieldNames = visibleColumnIds
          .map((id) => allColumns.find((column) => column.id === id)?.fieldName)
          .filter((fieldName): fieldName is string => Boolean(fieldName));

        this.templateFiltersService.setSearchableFieldNames(visibleFieldNames);
      });

    this.initColumnConfig();
    requestAnimationFrame(() => this.disableSearchFieldSuggestions());
    setTimeout(() => this.setupSearchFieldSuggestionSuppression(), 0);
  }

  /** Cleans up subscriptions. */
  public ngOnDestroy(): void {
    this.searchFieldMutationObserver?.disconnect();
    this.searchFieldMutationObserver = undefined;

    const searchFieldElement = this.searchField()?.nativeElement as HTMLElement | undefined;
    searchFieldElement?.removeEventListener('focusin', this.onSearchFieldFocusIn);
    searchFieldElement?.removeEventListener('pointerdown', this.onSearchFieldFocusIn);
    searchFieldElement?.removeEventListener('keydown', this.onSearchFieldFocusIn);

    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Handles row selection changes from the Nimble table. */
  public onSelectionChange(event: Event): void {
    const detail = (event as CustomEvent).detail as { selectedRecordIds: string[] };
    this.selectedIdsSubject.next(new Set<string>(detail.selectedRecordIds));
  }

  /** True when the user may perform `action` on every selected template. */
  protected canOnSelection(action: string, selectedIds: Set<string>): boolean {
    return [...selectedIds].every((id) => {
      const workspaceId = this.workspaceIdByRecordId.get(id);
      return workspaceId === undefined || this.permissionService.can(action, workspaceId);
    });
  }

  /** True when the user may create templates in at least one workspace. */
  protected canCreate(): boolean {
    return this.permissionService.canInAnyWorkspace(this.actions.create);
  }

  /** Opens the create testplan template slideout. */
  public onCreate(): void {
    this.createEditSlideout.openPanel('create');
  }

  /** Opens the edit testplan template slideout pre-populated with the selected template. */
  public onEdit(): void {
    const [id] = [...this.selectedIdsSubject.getValue()];

    if (!id) {
      return;
    }

    this.templateService
      .getTemplateForEdit(id)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((template) => {
        if (!template) {
          return;
        }

        this.createEditSlideout.openPanel('edit', template);
      });
  }

  /** Fetches the full selected template and opens the duplicate slideout pre-populated with it. */
  public onDuplicate(): void {
    const [id] = [...this.selectedIdsSubject.getValue()];

    if (!id) {
      return;
    }

    this.templateService
      .getTemplateForEdit(id)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((template) => {
        if (!template) {
          return;
        }

        this.duplicateSlideout.openPanel(template);
      });
  }

  /** Opens the delete confirmation dialog. */
  public onDelete(): void {
    void this.deleteDialog.show();
  }

  /** Cancels the delete and closes the dialog. */
  public onCancelDelete(): void {
    this.deleteDialog.close(undefined);
  }

  /** Confirms deletion: calls the service and cleans up state on success. */
  public onConfirmDelete(): void {
    this.deleteDialog.close(undefined);
    this.isLoadingSubject.next(true);
    const selectedIds = this.selectedIdsSubject.getValue();

    this.templateService
      .deleteTemplates(selectedIds)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoadingSubject.next(false)),
      )
      .subscribe((response) => {
        // Keep templates that failed to delete selected so the user can retry.
        const failedIds = (response?.failedIds ?? []).filter((id) => selectedIds.has(id));
        this.selectedIdsSubject.next(new Set(failedIds));
        void this.tableDirective.setSelectedRecordIds(failedIds);
        if (failedIds.length === 0) {
          this.onClickClear();
        }
      });
  }

  /** Clears all selected templates and resets the table selection. */
  public clearSelection(): void {
    this.selectedIdsSubject.next(new Set());
    void this.tableDirective.setSelectedRecordIds([]);
  }

  /** Forwards search input to the debounced subject. */
  public onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText = value;
    this.searchInput$.next(value);
  }

  /** Opens the grid configuration drawer. */
  public onOpenGridConfig(): void {
    this.gridConfigComponent.openPanel();
  }

  /** Clears the search field and resets the text filter. */
  public onClickClear(): void {
    const element = this.searchField()?.nativeElement as HTMLInputElement | undefined;

    if (element) {
      element.value = '';
    }

    this.searchText = '';
    this.searchInput$.next('');
  }

  /** Disables browser autocomplete/suggestions for the search text field. */
  private disableSearchFieldSuggestions(): void {
    const searchFieldElement = this.searchField()?.nativeElement as HTMLElement | undefined;
    if (!searchFieldElement) {
      return;
    }

    // "new-password" is a reliable browser-level opt-out for autofill suggestions.
    searchFieldElement.setAttribute('autocomplete', 'new-password');
    searchFieldElement.setAttribute('autocapitalize', 'off');
    searchFieldElement.setAttribute('autocorrect', 'off');
    searchFieldElement.setAttribute('spellcheck', 'false');
    searchFieldElement.setAttribute('name', 'search-test-plan-templates-no-suggest');
    searchFieldElement.setAttribute('data-lpignore', 'true');
    searchFieldElement.setAttribute('aria-autocomplete', 'none');

    const searchFieldShadow = (searchFieldElement as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    const nativeInput = searchFieldShadow?.querySelector('input, textarea') as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;

    if (!nativeInput) {
      return;
    }

    nativeInput.autocomplete = 'new-password';
    nativeInput.name = 'search-test-plan-templates-no-suggest';
    nativeInput.autocapitalize = 'off';
    nativeInput.spellcheck = false;
    nativeInput.setAttribute('autocorrect', 'off');
    nativeInput.setAttribute('autocomplete', 'new-password');
    nativeInput.setAttribute('data-lpignore', 'true');
    nativeInput.setAttribute('data-form-type', 'other');
    nativeInput.setAttribute('aria-autocomplete', 'none');
  }

  /** Keeps search suggestion suppression active even if the text field re-renders its internal input. */
  private setupSearchFieldSuggestionSuppression(): void {
    const searchFieldElement = this.searchField()?.nativeElement as HTMLElement | undefined;
    if (!searchFieldElement) {
      return;
    }

    searchFieldElement.removeEventListener('focusin', this.onSearchFieldFocusIn);
    searchFieldElement.removeEventListener('pointerdown', this.onSearchFieldFocusIn);
    searchFieldElement.removeEventListener('keydown', this.onSearchFieldFocusIn);
    searchFieldElement.addEventListener('focusin', this.onSearchFieldFocusIn);

    this.searchFieldMutationObserver?.disconnect();

    const searchFieldShadow = (searchFieldElement as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (!searchFieldShadow) {
      return;
    }

    this.searchFieldMutationObserver = new MutationObserver(() => {
      this.disableSearchFieldSuggestions();
    });

    // Re-apply after menu interactions that can trigger internal input refreshes.
    searchFieldElement.addEventListener('pointerdown', this.onSearchFieldFocusIn);
    searchFieldElement.addEventListener('keydown', this.onSearchFieldFocusIn);

    this.searchFieldMutationObserver.observe(searchFieldShadow, {
      childList: true,
      subtree: true,
    });

    this.disableSearchFieldSuggestions();
  }

  /** Updates both visible columns and grouping from the grid config drawer, then persists once. */
  public onGridConfigChange(config: { columns: string[]; groupBy: string[] }): void {
    this.visibleColumnIdsSubject.next(config.columns);
    this.groupByIdsSubject.next(config.groupBy);
    this.persistViewState();
  }

  /** Captures column sort changes from the nimble table and persists them. */
  public onColumnConfigChange(event: Event): void {
    const detail = (event as CustomEvent).detail as TableColumnConfigurationChangeEventDetail;
    const sortState: IColumnSortState[] = detail.columns
      .filter(
        (c) =>
          c.columnId != null &&
          (c.sortDirection === 'ascending' || c.sortDirection === 'descending') &&
          c.sortIndex != null,
      )
      .map((c) => ({
        columnId: c.columnId!,
        sortDirection: c.sortDirection as 'ascending' | 'descending',
        sortIndex: c.sortIndex!,
      }));

    this.sortStateSubject.next(sortState);
    this.persistViewState();
  }

  /** Queries saved user-data column config, merges dynamic property columns, and initializes visible/group-by subjects. */
  private initColumnConfig(): void {
    const savedConfig$ = this.userDataService
      .queryUserDataItems<ICurrentGridViewState>({
        applications: [USER_DATA_NAMESPACE.testplanTemplatesApplication],
        names: [USER_DATA_NAMESPACE.templateTableColumnsItemName],
      })
      .pipe(take(1), shareReplay(1));

    // Re-evaluate column config whenever dynamic property keys change,
    // replaying the cached user-data response each time.
    combineLatest([savedConfig$, this.templateService.dynamicPropertyKeys$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([response, keys]) => {
        const dynamicColumns: IGridColumn[] = keys.map((key) => ({
          id: `prop_${key}`,
          label: key,
          fieldName: `prop_${key}`,
          visible: false,
        }));
        const allColumns = [...AVAILABLE_COLUMNS, ...dynamicColumns];
        const validIds = new Set(allColumns.map((column) => column.id));
        this.allColumnsSubject.next(allColumns);

        const savedItem = response.items[0];
        const savedCols = savedItem?.value?.gridViewState?.visibleColumns;
        const savedGroups = savedItem?.value?.gridViewState?.groupByColumns ?? [];
        const savedSort = savedItem?.value?.gridViewState?.sortState;

        if (!this.viewState) {
          this.viewState = savedItem ?? {
            application: USER_DATA_NAMESPACE.testplanTemplatesApplication,
            category: USER_DATA_NAMESPACE.tableCategory,
            name: USER_DATA_NAMESPACE.templateTableColumnsItemName,
            value: {
              gridViewState: { visibleColumns: [...this.visibleColumnIdsSubject.getValue()] },
            },
          };
        }

        const requestedVisibleIds =
          (savedCols ?? this.visibleColumnIdsSubject.getValue()).filter((id) => validIds.has(id));
        const fallbackVisibleIds = AVAILABLE_COLUMNS.filter((column) => column.visible).map(
          (column) => column.id,
        );

        this.visibleColumnIdsSubject.next(
          requestedVisibleIds.length > 0 ? requestedVisibleIds : fallbackVisibleIds,
        );
        // Reset persisted grouping on load to avoid stale/corrupt group state
        // that can leave the table header visible while hiding all data rows.
        if (savedGroups.length > 0) {
          this.groupByIdsSubject.next([]);
        } else {
          this.groupByIdsSubject.next(savedGroups.filter((id) => validIds.has(id)));
        }

        if (savedSort?.length) {
          this.sortStateSubject.next(savedSort.filter((s) => validIds.has(s.columnId)));
        }
      });
  }

  /** Persists the current column and grouping state to user data. */
  private persistViewState(): void {
    if (this.viewState) {
      this.userDataService
        .createOrUpdateUserDataItems<ICurrentGridViewState>([
          {
            application: this.viewState.application,
            category: this.viewState.category,
            name: this.viewState.name,
            value: {
              gridViewState: {
                visibleColumns: this.visibleColumnIdsSubject.getValue(),
                groupByColumns: this.groupByIdsSubject.getValue(),
                sortState: this.sortStateSubject.getValue(),
              },
            },
          },
        ])
        .pipe(takeUntil(this.destroy$))
        .subscribe((saveResponse) => {
          if (saveResponse?.succeeded?.length > 0) {
            this.viewState = saveResponse.succeeded[0];
          }
        });
    }
  }
}
