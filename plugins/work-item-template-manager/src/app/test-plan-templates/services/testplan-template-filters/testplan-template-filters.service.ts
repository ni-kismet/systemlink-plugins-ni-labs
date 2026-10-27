import { Injectable } from '@angular/core';
import { BehaviorSubject, finalize, merge, Observable, Subject, switchMap, tap } from 'rxjs';
import { TableRecord } from '@ni/nimble-angular/table';
import { IWorkitemTemplate } from '../../../core/models/workitem-templates.models';
import { ProductNameMap } from '../../../core/models/product.models';
import { TEMPLATE_PRODUCT_FAMILIES } from '../../constants/product-family.constants';
import { IFilterCascade, ITemplateFilters } from '../../models/template-filters.models';
import { TestplanTemplateService } from '../testplan-template/testplan-template.service';
import { WORKITEM_TEMPLATE_FIELDS } from '../../../core/constants/workitem-fields.constants';

/** Manages cascade dropdown options, active filters, search text, and client-side filtered table records. */
@Injectable({
  providedIn: 'root',
})
export class TestplanTemplateFiltersService {
  public readonly filteredRecords$: Observable<TableRecord[]>;
  public readonly cascade$: Observable<IFilterCascade>;
  public readonly filteredTypes$: Observable<string[]>;
  public readonly filteredProductFamilies$: Observable<string[]>;
  public readonly filteredProducts$: Observable<string[]>;
  public readonly filteredCategories$: Observable<string[]>;
  public readonly isLoading$: Observable<boolean>;
  public readonly dataSync$: Observable<unknown>;

  private readonly filteredRecordsSubject = new BehaviorSubject<TableRecord[]>([]);
  private readonly cascadeSubject = new BehaviorSubject<IFilterCascade>({
    allTypes: [],
    allFamilies: [],
    allProducts: [],
    allCategories: [],
  });
  private readonly filteredTypesSubject = new BehaviorSubject<string[]>([]);
  private readonly filteredProductFamiliesSubject = new BehaviorSubject<string[]>([]);
  private readonly filteredProductsSubject = new BehaviorSubject<string[]>([]);
  private readonly filteredCategoriesSubject = new BehaviorSubject<string[]>([]);
  private readonly activeFiltersSubject = new BehaviorSubject<ITemplateFilters>({
    workspace: '',
    type: '',
    productFamily: '',
    product: '',
    category: '',
  });
  private readonly isLoadingSubject = new BehaviorSubject<boolean>(false);
  private readonly loadTrigger$ = new Subject<boolean>();
  private searchText = '';
  private searchableFieldNames: string[] = ['name', 'summary', 'description'];
  private allRecords: TableRecord[] = [];
  private workspaceTemplates: IWorkitemTemplate[] = [];
  private workspaceProductMap: ProductNameMap = new Map();

  /** Sets up the reactive data pipeline. On each loadTrigger$ emission, calls the API (workspace-only filter when rebuilding cascade, full filter otherwise), waits for tableRecords$ to emit the resolved result, then updates dropdown options and filtered records. Also re-triggers on template deletion. */
  public constructor(private readonly templateService: TestplanTemplateService) {
    this.filteredRecords$ = this.filteredRecordsSubject.asObservable();
    this.cascade$ = this.cascadeSubject.asObservable();
    this.filteredTypes$ = this.filteredTypesSubject.asObservable();
    this.filteredProductFamilies$ = this.filteredProductFamiliesSubject.asObservable();
    this.filteredProducts$ = this.filteredProductsSubject.asObservable();
    this.filteredCategories$ = this.filteredCategoriesSubject.asObservable();
    this.isLoading$ = this.isLoadingSubject.asObservable();

    this.dataSync$ = merge(
      this.loadTrigger$.pipe(
        switchMap((rebuildCascade) => {
          let isCascadeInitialized = false;
          let isLoaded = false;
          const effectiveFilter = rebuildCascade
            ? this.buildWorkspaceFilter(this.activeFiltersSubject.getValue().workspace)
            : this.buildFilterString(this.activeFiltersSubject.getValue());
          this.isLoadingSubject.next(true);

          return this.templateService.loadTemplates(effectiveFilter).pipe(
            tap(() => (isLoaded = true)),
            // A failed query emits nothing (the HTTP layer shows a banner); stop the spinner.
            finalize(() => {
              if (!isLoaded) {
                this.isLoadingSubject.next(false);
              }
            }),
            switchMap(() => this.templateService.tableRecords$),
            tap(({ templates, records, prodMap }) => {
              if (rebuildCascade && !isCascadeInitialized) {
                isCascadeInitialized = true;
                this.workspaceTemplates = templates;
                this.workspaceProductMap = prodMap;
                this.emitAvailableOptions();
                this.narrowDropdownOptions();
              }
              this.allRecords = records;
              this.applyActiveFilters();
              this.isLoadingSubject.next(false);
            }),
          );
        }),
      ),
      this.templateService.deleted$.pipe(tap(() => this.reloadWithCascade())),
      this.templateService.saved$.pipe(tap(() => this.reloadWithCascade())),
    );
  }

  /** Triggers the initial template load. If saved filters include a workspace, pre-seeds the active workspace filter before fetching so the API call is already scoped. */
  public initialize(savedFilters?: ITemplateFilters): void {
    if (savedFilters?.workspace) {
      this.activeFiltersSubject.next({
        ...this.activeFiltersSubject.getValue(),
        workspace: savedFilters.workspace,
      });
    }
    this.isLoadingSubject.next(true);
    this.loadTrigger$.next(true);
  }

  /** Updates the search text and re-applies client-side filtering without triggering an API call. */
  public onSearchTextChange(text: string): void {
    this.searchText = text.toLowerCase().trim();
    this.applyActiveFilters();
  }

  /** Updates which record fields are searchable based on visible table columns. */
  public setSearchableFieldNames(fieldNames: string[]): void {
    this.searchableFieldNames = [...new Set(fieldNames.filter(Boolean))];
    this.applyActiveFilters();
  }

  /** Applies new filter values. No-ops if nothing changed. On workspace change, triggers an API reload with cascade rebuild; otherwise re-narrows dropdown options and re-applies client-side filtering only. */
  public applyFilters(filters: ITemplateFilters): void {
    const prev = this.activeFiltersSubject.getValue();
    const workspaceChanged = filters.workspace !== prev.workspace;
    const filtersChanged =
      workspaceChanged ||
      filters.type !== prev.type ||
      filters.productFamily !== prev.productFamily ||
      filters.product !== prev.product ||
      filters.category !== prev.category;

    if (!filtersChanged) {
      return;
    }

    this.activeFiltersSubject.next(filters);
    this.narrowDropdownOptions();
    this.applyActiveFilters();

    this.loadTrigger$.next(workspaceChanged);
  }

  /** Escapes double quotes in a filter value. */
  private escapeFilterValue(value: string): string {
    return value.replace(/"/g, '\\"');
  }

  /** Builds the API filter string from active dropdown filters. */
  private buildFilterString(filters: ITemplateFilters): string {
    const parts: string[] = [];

    if (filters.workspace) {
      parts.push(
        `${WORKITEM_TEMPLATE_FIELDS.WORKSPACE}="${this.escapeFilterValue(filters.workspace)}"`,
      );
    }

    if (filters.type) {
      parts.push(`${WORKITEM_TEMPLATE_FIELDS.TYPE}="${this.escapeFilterValue(filters.type)}"`);
    }

    if (filters.productFamily) {
      parts.push(
        `${WORKITEM_TEMPLATE_FIELDS.PRODUCT_FAMILIES}.Contains("${this.escapeFilterValue(
          filters.productFamily,
        )}")`,
      );
    }

    if (filters.product) {
      const partNumbers = this.findPartNumbersForProduct(filters.product);

      if (partNumbers.length > 0) {
        const clauses = partNumbers.map(
          (partNumber) =>
            `${WORKITEM_TEMPLATE_FIELDS.PART_NUMBERS}.Contains("${this.escapeFilterValue(
              partNumber,
            )}")`,
        );

        parts.push(`(${clauses.join(' || ')})`);
      }
    }

    if (filters.category) {
      parts.push(
        `${WORKITEM_TEMPLATE_FIELDS.TEMPLATE_GROUP}="${this.escapeFilterValue(filters.category)}"`,
      );
    }

    return parts.join(' AND ');
  }

  /** Builds the API filter string scoped to the given workspace (or all if empty). */
  private buildWorkspaceFilter(workspace: string): string {
    return workspace
      ? `${WORKITEM_TEMPLATE_FIELDS.WORKSPACE}="${this.escapeFilterValue(workspace)}"`
      : '';
  }

  /** Reloads all templates for the active workspace and rebuilds cascade dropdown options. Called after a deletion so removed values are no longer shown. */
  private reloadWithCascade(): void {
    this.loadTrigger$.next(true);
  }

  /** Emits option sets derived from all workspace templates. Used for stale-value validation on restore and as the base for cascade narrowing. */
  private emitAvailableOptions(): void {
    const types = new Set<string>();
    const families = new Set<string>();
    const products = new Set<string>();
    const categories = new Set<string>();

    for (const template of this.workspaceTemplates) {
      if (template.type) {
        types.add(String(template.type));
      }
      (template.productFamilies ?? []).forEach((family) => {
        if (family) families.add(family);
      });
      this.resolveProducts(template).forEach((product) => products.add(product));

      if (template.templateGroup) categories.add(template.templateGroup);
    }

    this.cascadeSubject.next({
      allTypes: [...types].sort(),
      allFamilies: [...families].sort(),
      allProducts: [...products].sort(),
      allCategories: [...categories].sort(),
    });
  }

  /** Maps a template's part numbers to resolved product names using the current workspace product map. */
  private resolveProducts(template: IWorkitemTemplate): string[] {
    return this.templateService
      .resolveProductNames(template.partNumbers ?? [], this.workspaceProductMap, template.workspace)
      .filter((name) => !!name);
  }

  /** Returns true if any of the template's resolved product names match the given product. */
  private templateHasProduct(template: IWorkitemTemplate, product: string): boolean {
    return this.resolveProducts(template).includes(product);
  }

  /** Narrows each dropdown to options compatible with the currently active filters. */
  private narrowDropdownOptions(): void {
    const { type, productFamily, product } = this.activeFiltersSubject.getValue();

    const typeCandidates = this.workspaceTemplates.filter(
      (template) => !type || String(template.type ?? '') === type,
    );

    const types = this.collectSorted(
      this.workspaceTemplates
        .map((template) => String(template.type ?? '')),
    );

    const families = this.collectSorted(
      typeCandidates
        .flatMap((template) => template.productFamilies ?? []),
    );

    const productCandidates = typeCandidates.filter(
      (template) => !productFamily || (template.productFamilies ?? []).includes(productFamily),
    );
    const products = this.collectSorted(
      productCandidates.flatMap((template) => this.resolveProducts(template)),
    );

    const categoryCandidates = typeCandidates.filter(
      (template) =>
        (!productFamily || (template.productFamilies ?? []).includes(productFamily)) &&
        (!product || this.templateHasProduct(template, product)),
    );
    const categories = this.collectSorted(
      categoryCandidates.map((template) => template.templateGroup).filter(Boolean) as string[],
    );

    this.filteredTypesSubject.next(types);
    this.filteredProductFamiliesSubject.next(families);
    this.filteredProductsSubject.next(products);
    this.filteredCategoriesSubject.next(categories);
  }

  /** Returns a deduped, sorted array from the input, discarding empty/falsy entries. */
  private collectSorted(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
    );
  }

  /** Returns all part numbers whose resolved product name matches the given product name. Used to build the API filter clause for a product selection. */
  private findPartNumbersForProduct(productName: string): string[] {
    const result: string[] = [];
    const activeWorkspace = this.activeFiltersSubject.getValue().workspace;
    for (const [workspace, products] of this.workspaceProductMap) {
      if (activeWorkspace && workspace !== activeWorkspace) {
        continue;
      }
      products.forEach((name, partNumber) => {
        if (name === productName) {
          result.push(partNumber);
        }
      });
    }

    return [...new Set(result)];
  }

  /** Filters allRecords client-side by the active workspace, product family, product, category, and search text, then emits the result to filteredRecords$. */
  private applyActiveFilters(): void {
    let filtered = this.allRecords;
    const filters = this.activeFiltersSubject.getValue();

    if (filters.workspace) {
      filtered = filtered.filter((record) => record['workspaceId'] === filters.workspace);
    }

    if (filters.type) {
      filtered = filtered.filter((record) => String(record['type'] ?? '') === filters.type);
    }

    if (filters.productFamily) {
      filtered = filtered.filter((record) => {
        const families = String(record['productFamily'] ?? '').split(', ');

        return families.includes(filters.productFamily);
      });
    }

    if (filters.product) {
      filtered = filtered.filter((record) => {
        const products = String(record['product'] ?? '').split(', ');

        return products.includes(filters.product);
      });
    }

    if (filters.category) {
      filtered = filtered.filter((record) => record['category'] === filters.category);
    }

    if (this.searchText) {
      const searchFields =
        this.searchableFieldNames.length > 0
          ? this.searchableFieldNames
          : ['name', 'summary', 'description'];

      filtered = filtered.filter((record) =>
        searchFields.some((fieldName) =>
          String(record[fieldName] ?? '').toLowerCase().includes(this.searchText),
        ),
      );
    }

    this.filteredRecordsSubject.next(filtered);
  }
}
