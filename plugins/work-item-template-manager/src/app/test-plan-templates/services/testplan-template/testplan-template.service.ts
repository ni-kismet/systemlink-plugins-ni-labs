import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  defaultIfEmpty,
  filter,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { TableRecord } from '@ni/nimble-angular/table';
import { AuthService } from '../../../core/services/auth/auth.service';
import { UserService } from '../../../core/services/user/user.service';
import { ProductService } from '../../../core/services/product/product.service';
import { ProductNameMap } from '../../../core/models/product.models';
import {
  IWorkitemTemplate,
  ICreateWorkitemTemplateRequest,
  ICreateWorkitemTemplatesResponse,
  IDeleteWorkitemTemplatesResponse,
  IUpdateWorkitemTemplateRequest,
  IUpdateWorkitemTemplatesResponse,
} from '../../../core/models/workitem-templates.models';
import { WorkitemTemplatesService } from '../../../core/services/workitem-templates/workitem-templates.service';
import { WorkItemType } from '../../../core/constants/workitem-types.constant';
import { toTimestamp } from '../../../core/utils/date.utils';
import { getWorkItemTypeLabel } from '../../../core/utils/workitem-type.utils';
import { collectPropertyKeys } from '../../../core/utils/property.utils';

/** Data layer for testplan templates. Manages fetching, state, and table record mapping. */
@Injectable({
  providedIn: 'root',
})
export class TestplanTemplateService {
  public readonly totalCount$: Observable<number>;
  public readonly dynamicPropertyKeys$: Observable<string[]>;
  public readonly templateGroups$: Observable<string[]>;
  public readonly templates$: Observable<IWorkitemTemplate[]>;
  public readonly deleted$: Observable<void>;
  public readonly saved$: Observable<void>;
  public readonly tableRecords$: Observable<{
    templates: IWorkitemTemplate[];
    records: TableRecord[];
    prodMap: ProductNameMap;
  }>;

  private readonly templatesSubject = new BehaviorSubject<IWorkitemTemplate[]>([]);
  private readonly deletedSubject = new Subject<void>();
  private readonly savedSubject = new Subject<void>();

  private readonly workspaceNameMap$: Observable<Map<string, string>>;
  private readonly userNameMap$: Observable<Map<string, string>>;
  private readonly productNameMap$: Observable<{
    templates: IWorkitemTemplate[];
    prodMap: ProductNameMap;
  }>;

  /**
  * Creates an instance of TestplanTemplateService.
   */
  public constructor(
    private readonly workitemTemplatesService: WorkitemTemplatesService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly productService: ProductService,
  ) {
    this.totalCount$ = this.templatesSubject.pipe(map((template) => template.length));
    this.templates$ = this.templatesSubject.asObservable();
    this.deleted$ = this.deletedSubject.asObservable();
    this.saved$ = this.savedSubject.asObservable();

    this.templateGroups$ = this.templatesSubject.pipe(
      map((templates) => [
        ...new Set(
          templates.map((t) => t.templateGroup).filter((group): group is string => !!group),
        ),
      ].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
      )),
    );

    this.workspaceNameMap$ = this.authService.getAllWorkspaces().pipe(
      map(
        (response) =>
          new Map(response.workspaces.map((workspace) => [workspace.id, workspace.name])),
      ),
      startWith(new Map<string, string>()),
      shareReplay(1),
    );

    this.userNameMap$ = this.userService.getAllUsers().pipe(
      map(
        (response) =>
          new Map(response.users.map((user) => [user.id, `${user.firstName} ${user.lastName}`])),
      ),
      startWith(new Map<string, string>()),
      shareReplay(1),
    );

    this.productNameMap$ = this.templatesSubject.pipe(
      switchMap((templates) => {
        const partNumbers = templates.flatMap((template) => template.partNumbers ?? []);
        return this.productService.fetchProductNameFromPartNumbers(partNumbers).pipe(
          defaultIfEmpty(new Map<string, Map<string, string>>()),
          catchError(() => of(new Map<string, Map<string, string>>())),
          map((prodMap) => ({ templates, prodMap })),
        );
      }),
      shareReplay(1),
    );

    this.dynamicPropertyKeys$ = this.templatesSubject.pipe(
      map((templates) => collectPropertyKeys(templates)),
    );

    this.tableRecords$ = this.templatesSubject.pipe(
      switchMap((templates) =>
        combineLatest({
          workspaceMap: this.workspaceNameMap$,
          userMap: this.userNameMap$,
          // Skip the replayed map from the previous template set.
          prodMap: this.productNameMap$.pipe(
            filter((result) => result.templates === templates),
            map((result) => result.prodMap),
          ),
        }).pipe(map((deps) => ({ templates, ...deps }))),
      ),
      map(({ templates, workspaceMap, userMap, prodMap }) => ({
        templates,
        prodMap,
        records: this.toTableRecords(
          templates,
          collectPropertyKeys(templates),
          workspaceMap,
          userMap,
          prodMap,
        ),
      })),
    );
  }

  /** Returns the in-memory template matching the given ID, or undefined if not found. */
  public getTemplateById(id: string): IWorkitemTemplate | undefined {
    return this.templatesSubject.getValue().find((template) => template.id === id);
  }

  /** Fetches a fresh template object by ID for edit mode so full property data is available. */
  public getTemplateForEdit(id: string): Observable<IWorkitemTemplate | undefined> {
    const fallback = this.getTemplateById(id);
    const filter = `id="${this.escapeFilterValue(id)}"`;

    return this.workitemTemplatesService.queryWorkitemTemplates(filter).pipe(
      map((response) => response.workItemTemplates.find((template) => template.id === id) ?? fallback),
    );
  }

  /** Fetches the most recently updated testplan templates. */
  public loadTemplates(filter: string): Observable<IWorkitemTemplate[]> {
    return this.workitemTemplatesService.queryWorkitemTemplates(filter, 'UPDATED_AT').pipe(
      map((response) => response.workItemTemplates),
      tap((templates) => this.templatesSubject.next(templates)),
    );
  }

  /** Fetches distinct template groups for a workspace, sorted case-insensitively. */
  public queryTemplateGroupsByWorkspace(workspaceId: string): Observable<string[]> {
    if (!workspaceId) {
      return of([]);
    }

    const filter = `workspace="${this.escapeFilterValue(workspaceId)}"`;

    return this.workitemTemplatesService.queryWorkitemTemplates(filter, 'UPDATED_AT').pipe(
      map((response) =>
        [...new Set(
          response.workItemTemplates
            .map((template) => template.templateGroup?.trim())
            .filter((group): group is string => Boolean(group)),
        )].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
        ),
      ),
      catchError(() => of([])),
    );
  }

  /** Deletes templates by ID and emits on `deleted$` upon success. */
  public deleteTemplates(ids: Set<string>): Observable<IDeleteWorkitemTemplatesResponse> {
    return this.workitemTemplatesService.deleteWorkitemTemplates(ids).pipe(
      tap(() => this.deletedSubject.next()),
    );
  }

  /** Creates a single testplan template and emits on `saved$` upon success. */
  public createTemplate(
    template: ICreateWorkitemTemplateRequest,
  ): Observable<ICreateWorkitemTemplatesResponse> {
    return this.workitemTemplatesService
      .createTemplate(template)
      .pipe(tap(() => this.savedSubject.next()));
  }

  /** Updates a single testplan template and emits on `saved$` upon success. */
  public updateTemplate(
    template: IUpdateWorkitemTemplateRequest,
  ): Observable<IUpdateWorkitemTemplatesResponse> {
    return this.workitemTemplatesService
      .updateTemplate(template)
      .pipe(tap(() => this.savedSubject.next()));
  }

  /**
   * Creates a copy of an existing template, applying the provided name, description, and
   * workspace overrides while carrying over every other setting from the source template.
   */
  public duplicateTemplate(
    source: IWorkitemTemplate,
    overrides: { name: string; description: string | null; workspace: string | null },
  ): Observable<ICreateWorkitemTemplatesResponse> {
    return this.createTemplate(this.buildDuplicateRequest(source, overrides));
  }

  /** Builds a create request that copies all settings from the source template, applying overrides. */
  private buildDuplicateRequest(
    source: IWorkitemTemplate,
    overrides: { name: string; description: string | null; workspace: string | null },
  ): ICreateWorkitemTemplateRequest {
    return {
      name: overrides.name,
      templateGroup: source.templateGroup ?? '',
      type: source.type ?? WorkItemType.Testplan,
      productFamilies: source.productFamilies ?? null,
      partNumbers: source.partNumbers ?? null,
      summary: source.summary ?? null,
      description: overrides.description,
      testProgram: source.testProgram ?? null,
      timeline: source.timeline ?? undefined,
      workspace: overrides.workspace,
      fileIds: source.fileIds ?? null,
      properties: this.normalizeProperties(source.properties),
      workflowId: source.workflowId ?? null,
      resources: this.normalizeResources(source.resources),
      dashboard: source.dashboard,
    };
  }

  /**
   * Ensures duplicated resources declare a filterType so the API does not default a copied
   * pre-migration filter to LUCENE (SLE 2026-10). Preserves the source's type, else LINQ.
   */
  private normalizeResources(
    resources: IWorkitemTemplate['resources'],
  ): IWorkitemTemplate['resources'] {
    if (!resources) {
      return undefined;
    }

    return {
      ...resources,
      filterType: resources.filterType ?? 'LINQ',
    };
  }

  /** Coerces a template's stored property values to strings for a create request. */
  private normalizeProperties(
    properties: Record<string, unknown> | null | undefined,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(properties ?? {})) {
      if (value !== null && value !== undefined) {
        normalized[key] = String(value);
      }
    }

    return normalized;
  }

  /** Resolves part numbers to distinct product names while preserving first-seen order. */
  public resolveProductNames(
    partNumbers: string[],
    prodMap: ProductNameMap,
    workspace: string | null,
  ): string[] {
    return [...new Set(
      partNumbers.map((partNumber) => prodMap.get(workspace ?? '')?.get(partNumber) ?? partNumber),
    )];
  }

  /** Escapes filter values before placing them into API filter strings. */
  private escapeFilterValue(value: string): string {
    return value.replace(/"/g, '\\"');
  }

  /** Maps templates to flat table records using the provided name maps. */
  private toTableRecords(
    templates: IWorkitemTemplate[],
    allPropertyKeys: string[],
    workspaceMap: Map<string, string>,
    userMap: Map<string, string>,
    prodMap: ProductNameMap,
  ): TableRecord[] {
    return templates.map((template) => {
      const record: TableRecord = {
        id: template.id,
        name: template.name,
        productFamily: (template.productFamilies ?? []).join(', '),
        product: (template.partNumbers ?? [])
          .map((partNumber) => prodMap.get(template.workspace ?? '')?.get(partNumber) ?? partNumber)
          .join(', '),
        category: template.templateGroup ?? '',
        workspaceId: template.workspace ?? '',
        workspace: workspaceMap.get(template.workspace ?? '') ?? template.workspace ?? '',
        summary: template.summary ?? '',
        description: template.description ?? '',
        testProgram: template.testProgram ?? '',
        partNumbers: (template.partNumbers ?? []).join(', '),
        type: template.type ?? '',
        typeLabel: getWorkItemTypeLabel(template.type),
        createdBy: template.createdBy ? userMap.get(template.createdBy) ?? $localize`Loading...` : '',
        updatedBy: template.updatedBy ? userMap.get(template.updatedBy) ?? $localize`Loading...` : '',
        createdAt: toTimestamp(template.createdAt),
        updatedAt: toTimestamp(template.updatedAt),
        workflowId: template.workflowId ?? '',
        systemsFilter: template.resources?.systems?.filter ?? '',
        dutsFilter: template.resources?.duts?.filter ?? '',
        fixturesFilter: template.resources?.fixtures?.filter ?? '',
        assetsFilter: template.resources?.assets?.filter ?? '',
      };

      for (const key of allPropertyKeys) {
        record[`prop_${key}`] =
          template.properties?.[key] != null ? String(template.properties[key]) : '';
      }

      return record;
    });
  }
}
