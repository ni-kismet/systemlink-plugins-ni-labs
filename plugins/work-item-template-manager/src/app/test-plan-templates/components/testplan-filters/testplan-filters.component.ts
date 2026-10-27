import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import {
  combineLatest,
  debounceTime,
  EMPTY,
  filter,
  map,
  Observable,
  pairwise,
  shareReplay,
  Subject,
  switchMap,
  take,
  takeUntil,
} from 'rxjs';
import { IAuthWorkspace } from '../../../core/models/auth.models';
import { IUserDataItem } from '../../../core/models/user-data.models';
import { AuthService } from '../../../core/services/auth/auth.service';
import { UserDataService } from '../../../core/services/user-data/user-data.service';
import { USER_DATA_NAMESPACE } from '../../../core/constants/user-data.constants';
import { getWorkItemTypeLabel } from '../../../core/utils/workitem-type.utils';
import { FILTER_ERRORS } from '../../constants/filter-error.constants';
import { IFilterCascade, ITemplateFilters } from '../../models/template-filters.models';
import { TestplanTemplateFiltersService } from '../../services/testplan-template-filters/testplan-template-filters.service';

/** Filter bar for narrowing testplan templates by workspace, product family, product, and category. */
@Component({
  selector: 'app-testplan-filters',
  templateUrl: './testplan-filters.component.html',
  styleUrl: './testplan-filters.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestplanFiltersComponent implements OnInit, OnDestroy {
  public readonly workspaces$: Observable<IAuthWorkspace[]>;
  public readonly filteredTypes$: Observable<string[]>;
  public readonly filteredProductFamilies$: Observable<string[]>;
  public readonly filteredProducts$: Observable<string[]>;
  public readonly filteredCategories$: Observable<string[]>;

  public readonly filtersForm = new FormGroup({
    workspace: new FormControl(''),
    type: new FormControl(''),
    productFamily: new FormControl(''),
    product: new FormControl(''),
    category: new FormControl(''),
  });

  public readonly filterErrors = FILTER_ERRORS;
  public readonly getTypeLabel = getWorkItemTypeLabel;
  public workspaceError: string | null = null;
  public typeError: string | null = null;
  public productFamilyError: string | null = null;
  public productError: string | null = null;
  public categoryError: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly persistTrigger$ = new Subject<void>();
  private filterViewState: IUserDataItem<ITemplateFilters> | null = null;
  private isInitialLoad = true;

  /** Injects required services. */
  public constructor(
    private readonly authService: AuthService,
    private readonly templateFiltersService: TestplanTemplateFiltersService,
    private readonly userDataService: UserDataService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.workspaces$ = this.authService.getAllWorkspaces().pipe(
      map((response) =>
        [...response.workspaces].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
        ),
      ),
      shareReplay(1),
    );
    this.filteredTypes$ = this.templateFiltersService.filteredTypes$;
    this.filteredProductFamilies$ = this.templateFiltersService.filteredProductFamilies$;
    this.filteredProducts$ = this.templateFiltersService.filteredProducts$;
    this.filteredCategories$ = this.templateFiltersService.filteredCategories$;
  }

  /** Initializes filter subscriptions and restores saved filter state. */
  public ngOnInit(): void {
    this.templateFiltersService.dataSync$.pipe(takeUntil(this.destroy$)).subscribe();

    this.persistTrigger$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => this.persistFilters());

    this.loadSavedFilters();

    this.templateFiltersService.cascade$.pipe(takeUntil(this.destroy$)).subscribe((cascade) => {
      if (!this.isInitialLoad) {
        this.onCascadeChange(cascade);
      }
    });

    this.subscribeToFormChanges();
  }

  /** Cleans up subscriptions. */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Subscribes to each filter control and clears child filters on parent change. */
  private subscribeToFormChanges(): void {
    this.filtersForm.controls.workspace.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isInitialLoad = false;
        this.workspaceError = null;
        this.typeError = null;
        this.productFamilyError = null;
        this.productError = null;
        this.categoryError = null;
        this.filtersForm.controls.type.setValue('', { emitEvent: false });
        this.filtersForm.controls.productFamily.setValue('', { emitEvent: false });
        this.filtersForm.controls.product.setValue('', { emitEvent: false });
        this.filtersForm.controls.category.setValue('', { emitEvent: false });
        this.applyCurrentFilters();
      });

    this.filtersForm.controls.type.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isInitialLoad = false;
        this.typeError = null;
        this.productFamilyError = null;
        this.productError = null;
        this.categoryError = null;
        this.filtersForm.controls.productFamily.setValue('', { emitEvent: false });
        this.filtersForm.controls.product.setValue('', { emitEvent: false });
        this.filtersForm.controls.category.setValue('', { emitEvent: false });
        this.applyCurrentFilters();
      });

    this.filtersForm.controls.productFamily.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isInitialLoad = false;
        this.productFamilyError = null;
        this.productError = null;
        this.categoryError = null;
        this.filtersForm.controls.product.setValue('', { emitEvent: false });
        this.filtersForm.controls.category.setValue('', { emitEvent: false });
        this.applyCurrentFilters();
      });

    this.filtersForm.controls.product.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isInitialLoad = false;
      this.productError = null;
      this.categoryError = null;
      this.filtersForm.controls.category.setValue('', { emitEvent: false });
      this.applyCurrentFilters();
    });

    this.filtersForm.controls.category.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isInitialLoad = false;
      this.categoryError = null;
      this.applyCurrentFilters();
    });
  }

  /** Clears controls whose value is no longer valid in the narrowed options. */
  private onCascadeChange(cascade: IFilterCascade): void {
    const { allTypes, allFamilies, allProducts, allCategories } = cascade;
    let changed = false;

    const currentType = this.filtersForm.controls.type.value ?? '';
    if (currentType && !allTypes.includes(currentType) && this.typeError === null) {
      this.filtersForm.controls.type.setValue('', { emitEvent: false });
      changed = true;
    }

    const currentFamily = this.filtersForm.controls.productFamily.value ?? '';
    if (currentFamily && !allFamilies.includes(currentFamily) && this.productFamilyError === null) {
      this.filtersForm.controls.productFamily.setValue('', { emitEvent: false });
      changed = true;
    }

    const currentProduct = this.filtersForm.controls.product.value ?? '';
    if (currentProduct && !allProducts.includes(currentProduct) && this.productError === null) {
      this.filtersForm.controls.product.setValue('', { emitEvent: false });
      changed = true;
    }

    const currentCategory = this.filtersForm.controls.category.value ?? '';
    if (
      currentCategory &&
      !allCategories.includes(currentCategory) &&
      this.categoryError === null
    ) {
      this.filtersForm.controls.category.setValue('', { emitEvent: false });
      changed = true;
    }

    if (changed) {
      this.applyCurrentFilters();
    }
  }

  /** Restores saved filters, validates stale values once workspaces and cascade are ready. */
  private loadSavedFilters(): void {
    this.userDataService
      .queryUserDataItems<ITemplateFilters>({
        applications: [USER_DATA_NAMESPACE.testplanTemplatesApplication],
        names: [USER_DATA_NAMESPACE.templateFiltersItemName],
      })
      .pipe(
        switchMap((response) => {
          this.filterViewState = response.items[0] ?? null;
          const savedFilters = this.filterViewState?.value;
          if (!savedFilters) {
            this.isInitialLoad = false;
            this.templateFiltersService.initialize();
            return EMPTY;
          }
          this.filtersForm.patchValue(savedFilters, { emitEvent: false });
          this.templateFiltersService.initialize(savedFilters);
          // Wait for the true→false transition on isLoading$ to know the load cycle
          // triggered by initialize() has completed. This also works when the workspace
          // has no templates (cascade stays empty), unlike filtering on populated cascade.
          const loadComplete$ = this.templateFiltersService.isLoading$.pipe(
            pairwise(),
            filter(([prev, curr]) => prev && !curr),
            take(1),
            switchMap(() => this.templateFiltersService.cascade$.pipe(take(1))),
          );
          return combineLatest([this.workspaces$, loadComplete$]);
        }),
        take(1),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ([workspaces, cascade]) => {
          this.validateStaleFilters(cascade, workspaces);
          this.applyCurrentFilters();
          this.isInitialLoad = false;
          this.cdr.detectChanges();
        },
        complete: () => {
          // Handles EMPTY from queryUserDataItems (HTTP error / first-time user).
          if (this.isInitialLoad) {
            this.isInitialLoad = false;
            this.templateFiltersService.initialize();
          }
        },
      });
  }

  /** Sets error flags for any saved filter value no longer present in the available options. */
  private validateStaleFilters(cascade: IFilterCascade, workspaces: IAuthWorkspace[]): void {
    const workspace = this.filtersForm.controls.workspace.value ?? '';
    const type = this.filtersForm.controls.type.value ?? '';
    const family = this.filtersForm.controls.productFamily.value ?? '';
    const product = this.filtersForm.controls.product.value ?? '';
    const category = this.filtersForm.controls.category.value ?? '';

    this.workspaceError =
      workspace && !workspaces.some((ws) => ws.id === workspace) ? FILTER_ERRORS.workspace : null;
    this.typeError = type && !cascade.allTypes.includes(type) ? FILTER_ERRORS.type : null;
    this.productFamilyError =
      family && !cascade.allFamilies.includes(family) ? FILTER_ERRORS.productFamily : null;
    this.productError =
      product && !cascade.allProducts.includes(product) ? FILTER_ERRORS.product : null;
    this.categoryError =
      category && !cascade.allCategories.includes(category) ? FILTER_ERRORS.category : null;
  }

  /** Pushes current form values to the filter service and schedules a debounced persist. */
  private applyCurrentFilters(): void {
    const values = this.filtersForm.getRawValue();
    this.templateFiltersService.applyFilters({
      workspace: this.workspaceError ? '' : values.workspace ?? '',
      type: this.typeError ? '' : values.type ?? '',
      productFamily: this.productFamilyError ? '' : values.productFamily ?? '',
      product: this.productError ? '' : values.product ?? '',
      category: this.categoryError ? '' : values.category ?? '',
    });
    this.persistTrigger$.next();
  }

  /** Persists the current filter selections to user data. */
  private persistFilters(): void {
    const values = this.filtersForm.getRawValue();
    const payload: ITemplateFilters = {
      workspace: values.workspace ?? '',
      type: values.type ?? '',
      productFamily: values.productFamily ?? '',
      product: values.product ?? '',
      category: values.category ?? '',
    };

    this.userDataService
      .createOrUpdateUserDataItems<ITemplateFilters>([
        {
          ...(this.filterViewState?.id ? { id: this.filterViewState.id } : {}),
          application: USER_DATA_NAMESPACE.testplanTemplatesApplication,
          category: USER_DATA_NAMESPACE.filtersCategory,
          name: USER_DATA_NAMESPACE.templateFiltersItemName,
          value: payload,
        },
      ])
      .pipe(takeUntil(this.destroy$))
      .subscribe((saveResponse) => {
        if (saveResponse?.succeeded?.length > 0) {
          this.filterViewState = saveResponse.succeeded[0];
        }
      });
  }
}
