import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  Inject,
  LOCALE_ID,
  NgZone,
  OnDestroy,
  QueryList,
  signal,
  viewChild,
  ViewChildren,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  combineLatest,
  concatMap,
  distinctUntilChanged,
  filter,
  finalize,
  from,
  forkJoin,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  take,
  takeUntil,
  timer,
  toArray,
  throwError,
} from 'rxjs';
import {
  DrawerLocation,
  NimbleDialogDirective,
  NimbleDrawerDirective,
  NimbleTabsDirective,
} from '@ni/nimble-angular';
import { StepSeverity } from '@ni/nimble-angular/step';
import { NimbleTableDirective, TableRecord } from '@ni/nimble-angular/table';
import { WorkItemType } from '../../../core/constants/workitem-types.constant';
import { IAuthWorkspace } from '../../../core/models/auth.models';
import { IProduct } from '../../../core/models/product.models';
import {
  ICreateWorkitemTemplateRequest,
  IUpdateWorkitemTemplateRequest,
  IWorkitemTemplate,
  IDashboardReferenceDefinition,
  ResourceFilterType,
} from '../../../core/models/workitem-templates.models';
import { IWorkflow } from '../../../core/models/workflow.models';
import { AuthService } from '../../../core/services/auth/auth.service';
import { NotificationBannerService } from '../../../core/services/notification-banner/notification-banner.service';
import { ProductService } from '../../../core/services/product/product.service';
import { WorkflowService } from '../../../core/services/workflow/workflow.service';
import { DashboardService } from '../../../core/services/dashboard/dashboard.service';
import { TestResultService } from '../../../core/services/test-result/test-result.service';
import { IWorkItemTypeDefinition } from '../../../core/models/workitem-type.models';
import { FILE_ACCEPT } from '../../constants/file-upload.constants';
import {
  FILE_PROPERTY_KEYS,
  GLOBAL_PARAM_PREFIX,
} from '../../constants/property-keys.constants';
import {
  ICreateEditDashboardForm,
  ITemplateDetailsForm,
  IFileConfigurationForm,
  ICreateEditTemplateForm,
  ICustomPropertyFormGroup,
  IDashboardParameterFormGroup,
  IGlobalParameterFormGroup,
} from '../../models/create-edit-template-form.models';
import { WorkItemTypesService } from '../../../core/services/workitem-types/workitem-types.service';
import { TestplanTemplateService } from '../../services/testplan-template/testplan-template.service';
import { FileService } from '../../../core/services/file/file.service';
import {
  FilterCondition,
  FilterDataType,
  FilterFieldDef,
  FilterFieldEnumValue,
  FilterLogic,
  FilterOperation,
  DateStyle,
  buildLinqFilter,
  combineFilters,
  conditionToLinq,
  defaultOperationsFor,
  escapeLinqString,
  fieldDef,
} from '../../../core/library/systemlink-query-generators';
import { FILTER_OPERATION_META } from '../../../core/constants/filter-operations.constants';
import {
  PermissionService,
  WORK_ITEM_TEMPLATE_ACTIONS,
} from '../../../core/services/permission/permission.service';
import { createSystemFilterFields, SystemService } from '../../../core/services/system/system.service';
import { AssetService, createAssetFilterFields } from '../../../core/services/asset/asset.service';
import { ResourceFilterLanguageService } from '../../../core/services/resource-filter-language/resource-filter-language.service';
import {
  groupsToLucene,
  IResourceFilterCondition,
  IResourceFilterGroup,
  normalizeFilterExpression,
  parseLuceneGroups,
  ResourceFilterKind,
} from '../../utils/resource-filter-lucene.utils';
import {
  IDynamicFormTemplateContext,
  IResolvedDynamicField,
  IResolvedDynamicView,
} from '../../../core/models/dynamic-form-fields.models';
import { DynamicFormFieldsService } from '../../../core/services/dynamic-form-fields/dynamic-form-fields.service';
import { formatByteSize } from '../../../core/utils/format.utils';
import { getWorkItemTypeLabel } from '../../../core/utils/workitem-type.utils';

/** Step identifiers for the multi-step create/edit flow. */
enum CreateEditFormStep {
  TemplateDetails = 'TemplateDetails',
  Filter = 'Filter',
  Dashboard = 'Dashboard',
  FileUpload = 'FileUpload',
  DynamicForm = 'DynamicForm',
  FileConfiguration = 'FileConfiguration',
}

/** Represents a selected product for chip display. */
interface ISelectedProduct {
  partNumber: string;
  displayName: string;
}

interface IDashboardOption {
  id: string;
  name: string;
}

interface IStoredFileMetadata {
  name: string;
  size: string | null;
  id?: string | null;
}

type StagedFileUploadStatus = 'uploading' | 'uploaded' | 'failed';

interface IStagedFileUpload {
  uid: number;
  file: File;
  status: StagedFileUploadStatus;
  uploadedFileId: string | null;
  errorMessage: string | null;
}

type ISystemFilterCondition = IResourceFilterCondition;
type ISystemFilterGroup = IResourceFilterGroup;

/** Default operation used for a freshly added condition row before a field is chosen. */
const DEFAULT_FILTER_OPERATION = FilterOperation.Equals;

// SystemLink's own templates for compound filters, so filters round-trip with the native UI.
const ASSET_LOCATION_BLANK =
  'string.IsNullOrEmpty(Location.MinionId) && string.IsNullOrEmpty(Location.PhysicalLocation)';
const ASSET_LOCATION_NOT_BLANK =
  '!string.IsNullOrEmpty(Location.MinionId) || !string.IsNullOrEmpty(Location.PhysicalLocation)';
const LINQ_STRING = '"((?:[^"\\\\]|\\\\.)*)"';
const ASSET_LOCATION_EQUALS = new RegExp(
  `^Location\\.MinionId = ${LINQ_STRING} \\|\\| Location\\.PhysicalLocation = "\\1"$`,
);
const ASSET_LOCATION_NOT_EQUALS = new RegExp(
  `^Location\\.MinionId != ${LINQ_STRING} && Location\\.PhysicalLocation != "\\1"$`,
);
const PACKAGE_VERSION = new RegExp(
  `^packages\\.data\\.keys\\.Contains\\(${LINQ_STRING}\\) && string\\(packages\\.data\\["\\1"\\]\\.version\\) (=|!=|>=|<=|>|<) ${LINQ_STRING}$`,
);
const PACKAGE_VERSION_COMPARATORS: Partial<Record<FilterOperation, string>> = {
  [FilterOperation.KeyValueMatches]: '=',
  [FilterOperation.KeyValueNotMatches]: '!=',
  [FilterOperation.GreaterThan]: '>',
  [FilterOperation.GreaterThanOrEqual]: '>=',
  [FilterOperation.LessThan]: '<',
  [FilterOperation.LessThanOrEqual]: '<=',
};

type FilterControlName = 'systemFilter' | 'dutFilter' | 'fixturesFilter' | 'assetsFilter';

const FILTER_CONTROL_NAMES: readonly FilterControlName[] = [
  'systemFilter',
  'dutFilter',
  'fixturesFilter',
  'assetsFilter',
];

/** Example filters shown as placeholders, per query language. */
const FILTER_EXAMPLES: Record<ResourceFilterType, Record<FilterControlName, string>> = {
  LINQ: {
    systemFilter: 'properties.data["Lab"] = "Battery Pack Lab"',
    dutFilter: 'ModelName = "cRIO-9045" && SerialNumber = "01E82ED0"',
    fixturesFilter: 'AssetType = "FIXTURE" && ModelName.Contains("Bench")',
    assetsFilter: 'ModelName.Contains("MSO") && VendorName = "Tektronix"',
  },
  LUCENE: {
    systemFilter: 'properties.Lab:"Battery Pack Lab"',
    dutFilter: 'ModelName:"cRIO-9045" AND SerialNumber:"01E82ED0"',
    fixturesFilter: 'AssetType:"FIXTURE" AND ModelName:"*Bench*"',
    assetsFilter: 'ModelName:"*MSO*" AND VendorName:"Tektronix"',
  },
};

const nonEmptyArrayValidator: ValidatorFn = (control) =>
  Array.isArray(control.value) && control.value.length > 0 ? null : { required: true };

type SupportedFieldName =
  | 'DESCRIPTION'
  | 'TEST_PROGRAM'
  | 'PART_NUMBER'
  | 'TIMELINE.ESTIMATED_DURATION_IN_SECONDS'
  | 'RESOURCES.SYSTEMS'
  | 'RESOURCES.DUTS'
  | 'RESOURCES.FIXTURES'
  | 'RESOURCES.ASSETS';

/** Slideout drawer for creating and editing test plan templates. */
@Component({
  selector: 'app-testplan-create-edit-slideout',
  templateUrl: './testplan-create-edit-slideout.component.html',
  styleUrl: './testplan-create-edit-slideout.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestplanCreateEditSlideoutComponent implements OnDestroy {
  /** The fully-typed reactive form shared across both steps. */
  public readonly form: FormGroup<ICreateEditTemplateForm>;

  protected readonly drawerLocation = DrawerLocation.right;
  protected readonly CreateEditFormStep = CreateEditFormStep;

  /** Dynamically derived header and save-button label based on the current mode and step. */
  protected readonly drawerConfig = computed(() => ({
    header: this.isEditMode() ? $localize`Edit work item template` : $localize`Create work item template`,
    saveLabel: this.isEditMode() ? $localize`Save` : $localize`Create`,
  }));

  /** Workspace options for the workspace dropdown, fetched once and cached. */
  protected readonly workspaces$: Observable<IAuthWorkspace[]>;

  /** Workflow options for the workflow dropdown, fetched once and cached. */
  protected readonly workflows$: Observable<IWorkflow[]>;

  /** Unique template group names derived from loaded templates, for the combobox dropdown. */
  protected readonly templateGroups$: Observable<string[]>;

  /** Workspace-scoped distinct test program names for the combobox dropdown. */
  protected readonly testPrograms$: Observable<string[]>;

  /** Workspace-scoped dashboard options fetched from DashboardHost. */
  protected readonly dashboardOptions$: Observable<IDashboardOption[]>;

  /** Available work item types and field rules from the work item types endpoint. */
  protected readonly workItemTypes$: Observable<IWorkItemTypeDefinition[]>;

  /** Selected work item type definition, used to display descriptions and disabled-section hints. */
  protected readonly selectedWorkItemType = computed(() => {
    const type = this.selectedWorkItemTypeName();
    return type ? this.workItemTypesIndex()[type] ?? null : null;
  });

  /** Selected product families for chip display. */
  protected readonly selectedProductFamilies = signal<string[]>([]);
  protected readonly currentTemplateId = signal('');
  protected readonly activeFilterFields = signal<FilterFieldDef[]>([]);
  private readonly workspaceFilterValues = signal<FilterFieldEnumValue[]>([]);
  private readonly workspaceIdByName = signal<Record<string, string>>({});
  /** Condition groups shown in the filter query builder dialog. Groups are OR'd; rows within a group are AND'd. */
  protected readonly systemFilterGroups = signal<ISystemFilterGroup[]>([]);
  protected readonly showSystemFilterValidation = signal(false);
  private activeFilterControl: FilterControlName = 'systemFilter';
  private readonly queryDraftByFilter = new Map<FilterControlName, ISystemFilterGroup[]>();
  /** Language of the resource filters: LUCENE when the server has search enabled, else LINQ. */
  protected readonly filterLanguage = signal<ResourceFilterType>('LINQ');

  /** Selected products with display names for chip display. */
  protected readonly selectedProducts = signal<ISelectedProduct[]>([]);

  /** Table records for the product family selection dialog. */
  protected readonly productFamilyTableData$ = new BehaviorSubject<TableRecord[]>([]);

  /** Table records for the product selection dialog, updated when dialog opens. */
  protected readonly productTableData$ = new BehaviorSubject<TableRecord[]>([]);

  /** Files selected on Step 2 with immediate upload state and resulting file IDs. */
  protected readonly selectedFiles = signal<IStagedFileUpload[]>([]);

  /** Whether the upload zone is in drag-over state. */
  protected readonly isDragOver = signal(false);

  /** Client-side file validation error message, if any. */
  protected readonly fileError = signal<string | null>(null);

  /** Tracks whether the user replaced the file during an edit session. */
  protected readonly fileChanged = signal(false);

  /** Existing file metadata restored from template custom properties, shown in the file table during edit. */
  protected readonly existingFiles = signal<IStoredFileMetadata[]>([]);

  /** Whether the uploaded file is currently being parsed for global parameters. */
  protected readonly isParsingFile = signal(false);

  /** Whether workspace-scoped configuration data (workflows, groups, dashboards, etc.)
   *  is still loading after opening an edit, used to show a loading overlay instead of stale data. */
  protected readonly isConfigDataLoading = signal(false);

  /** Whether a save operation is in progress. */
  protected readonly isSaving = signal(false);

  /** Accepted file extension for the native file picker, bound to the input's accept attribute. */
  protected readonly fileAccept = FILE_ACCEPT;

  protected readonly isPartNumberSelectionEnabled = computed(
    () =>
      this.selectedWorkItemType()?.fields.some(
        (field) => field.name === 'PART_NUMBER' && field.supported,
      ) ?? true,
  );

  protected readonly hasPendingUploads = computed(() =>
    this.selectedFiles().some((file) => file.status === 'uploading'),
  );

  /** Whether the save button should be disabled: saving in progress, form is invalid, or no changes made in edit mode. */
  protected readonly isSaveDisabled = computed(
    () =>
      this.isSaving() ||
      this.hasPendingUploads() ||
      !this.templateDetailsValid() ||
      !this.dynamicFormFieldsValid() ||
      (this.isEditMode() && !this.formDirty() && !this.fileChanged() && !this.dynamicFormDirty()),
  );

  /** Whether the Next button should be disabled based on the current step's validation state. */
  protected readonly isNextDisabled = computed(() => {
    if (this.currentStep() === CreateEditFormStep.TemplateDetails) {
      return !this.detailsStepValid();
    }

    return false;
  });

  protected readonly isTemplateDetailsVisible = computed(
    () => this.currentStep() === CreateEditFormStep.TemplateDetails,
  );

  protected readonly isFilterVisible = computed(
    () => this.currentStep() === CreateEditFormStep.Filter,
  );

  protected readonly isDashboardVisible = computed(
    () => this.currentStep() === CreateEditFormStep.Dashboard,
  );

  protected readonly isFileUploadVisible = computed(
    () => this.currentStep() === CreateEditFormStep.FileUpload,
  );

  protected readonly isFileConfigurationVisible = computed(
    () => this.currentStep() === CreateEditFormStep.FileConfiguration,
  );

  protected readonly isDynamicFormVisible = computed(
    () => this.currentStep() === CreateEditFormStep.DynamicForm,
  );

  protected readonly hasDynamicFormViews = computed(() => this.dynamicFormViews().length > 0);

  /** The dynamic form view currently shown, based on the active tab key. */
  protected readonly activeDynamicFormView = computed(() => {
    const activeKey = this.activeDynamicViewKey();
    return this.dynamicFormViews().find((view) => view.key === activeKey) ?? null;
  });

  /** Severity for step 1: success once valid and user has moved past it. */
  protected readonly step1Severity = computed<StepSeverity>(() =>
    this.currentStep() !== CreateEditFormStep.TemplateDetails && this.detailsStepValid()
      ? StepSeverity.success
      : StepSeverity.default,
  );

  /** Severity for step 2: success once the user advances past the filter step. */
  protected readonly step2Severity = computed<StepSeverity>(() => {
    if (
      this.currentStep() !== CreateEditFormStep.FileUpload &&
      this.currentStep() !== CreateEditFormStep.FileConfiguration
    ) {
      return StepSeverity.default;
    }

    return StepSeverity.success;
  });

  /** Severity for step 3: success once the user advances from File Upload to Properties. */
  protected readonly step3Severity = computed<StepSeverity>(() =>
    this.currentStep() === CreateEditFormStep.FileConfiguration
      ? StepSeverity.success
      : StepSeverity.default,
  );

  /** Severity for step 4: success once custom properties are valid. */
  protected readonly step4Severity = computed<StepSeverity>(() =>
    this.currentStep() === CreateEditFormStep.FileConfiguration &&
    this.form.controls.templateDetails.controls.customProperties.valid
      ? StepSeverity.success
      : StepSeverity.default,
  );

  protected readonly currentStep = signal<CreateEditFormStep>(CreateEditFormStep.TemplateDetails);
  /** Current values for dynamic form fields, keyed by field key (== template property key). */
  protected readonly dynamicFieldValues = signal<Record<string, string>>({});
  /** Visible dynamic form views (each a top-level tab) after applying configuration rules. */
  protected readonly dynamicFormViews = computed<IResolvedDynamicView[]>(() => {
    const context = this.dynamicFormRuleContext();
    if (!context) {
      return [];
    }
    return this.dynamicFormFieldsService.applyRules(this.allDynamicFormViews(), {
      ...context,
      properties: { ...context.properties, ...this.dynamicFieldValues() },
    });
  });
  /** Key of the dynamic form view whose tab is active. */
  protected readonly activeDynamicViewKey = signal<string>('');
  /** Whether the user has attempted to save, used to reveal dynamic field validation errors. */
  protected readonly showDynamicFormValidation = signal(false);

  /** All product family table records for search filtering. */
  private allProductFamilyRecords: TableRecord[] = [];
  /** All resolved dynamic form views, including elements hidden by default or by rules. */
  private readonly allDynamicFormViews = signal<IResolvedDynamicView[]>([]);
  /** Template context (without properties) used to evaluate configuration rules. */
  private readonly dynamicFormRuleContext = signal<IDynamicFormTemplateContext | null>(null);
  protected readonly isEditMode = signal(false);
  private templateToEdit: IWorkitemTemplate | undefined;
  private readonly drawerDirective = viewChild.required('drawer', { read: NimbleDrawerDirective });
  private readonly tabsDirective = viewChild.required('formTabs', { read: NimbleTabsDirective });
  private readonly panelBodyRef = viewChild<ElementRef<HTMLElement>>('panelBody');
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly productFamilyDialogRef = viewChild.required('productFamilyDialog', {
    read: NimbleDialogDirective,
  });
  private readonly productDialogRef = viewChild.required('productDialog', {
    read: NimbleDialogDirective,
  });
  private readonly systemFilterDialogRef = viewChild.required('systemFilterDialog', {
    read: NimbleDialogDirective,
  });
  private readonly systemFilterDialogElementRef = viewChild.required('systemFilterDialog', {
    read: ElementRef,
  });
  private readonly productFamilyTableRef = viewChild('productFamilyTable', {
    read: NimbleTableDirective,
  });
  private readonly productTableRef = viewChild('productTable', {
    read: NimbleTableDirective,
  });
  private readonly productFamilySearchRef =
    viewChild<ElementRef<HTMLElement>>('productFamilySearch');
  private readonly productSearchRef = viewChild<ElementRef<HTMLElement>>('productSearch');
  @ViewChildren('dashboardKeyInput') private readonly dashboardKeyInputs!: QueryList<
    ElementRef<HTMLElement>
  >;
  @ViewChildren('propertyKeyInput') private readonly propertyKeyInputs!: QueryList<
    ElementRef<HTMLElement>
  >;
  @ViewChildren('templateGroupCombobox') private readonly templateGroupComboboxes!: QueryList<
    ElementRef<HTMLElement & { value: string }>
  >;
  @ViewChildren('testProgramCombobox') private readonly testProgramComboboxes!: QueryList<
    ElementRef<HTMLElement & { value: string }>
  >;
  private readonly destroy$ = new Subject<void>();
  private nextStagedFileUid = 1;
  protected isFilePickerActive = false;
  private readonly onDocumentKeydownCapture = (event: KeyboardEvent): void => {
    if (this.isFilePickerActive && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  private readonly onWindowFocusAfterFilePicker = (): void => {
    // Restore normal drawer-dismiss behavior after focus returns from the OS file picker.
    setTimeout(() => {
      this.isFilePickerActive = false;
      document.removeEventListener('keydown', this.onDocumentKeydownCapture, true);
    }, 0);
  };
  private pendingFamilySelection: string[] = [];
  private pendingProductSelection: string[] = [];
  private allProductRecords: TableRecord[] = [];
  private suppressWorkspaceCascade = false;
  private suppressEstimatedDurationAutofill = false;
  private lastAutofillSourceKey: string | null = null;
  /** Incremented on every open so async lookups from a previous template are discarded. */
  private panelSession = 0;
  private dynamicFormLoadId = 0;
  private readonly dynamicFormDirty = signal(false);
  private readonly dynamicFormFieldsValid = signal(true);
  private dynamicFormInitialValues: Record<string, string> = {};
  /** Context key of the last dynamic-form load, reset on each panel open to force a refresh. */
  private lastLoadedDynamicKey: string | null = null;
  private readonly templateDetailsValid = signal(false);
  /** Validity of the first (details) tab, excluding the resource filters shown on the Filter tab. */
  private readonly detailsStepValid = signal(false);
  private readonly fileConfigValid = signal(false);
  private readonly formDirty = signal(false);
  private readonly selectedWorkItemTypeName = signal('');
  private readonly workItemTypesIndex = signal<Record<string, IWorkItemTypeDefinition>>({});
  private systemFilterDialogObserver?: MutationObserver;

  /**
   * Creates an instance of TestplanCreateEditSlideoutComponent.
   * Initializes the reactive form and sets up dropdown observables.
   */
  public constructor(
    private readonly fb: FormBuilder,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly authService: AuthService,
    private readonly notificationBannerService: NotificationBannerService,
    private readonly productService: ProductService,
    private readonly workflowService: WorkflowService,
    private readonly dashboardService: DashboardService,
    private readonly testResultService: TestResultService,
    private readonly systemService: SystemService,
    private readonly assetService: AssetService,
    private readonly workItemTypesService: WorkItemTypesService,
    private readonly templateService: TestplanTemplateService,
    private readonly fileService: FileService,
    private readonly dynamicFormFieldsService: DynamicFormFieldsService,
    private readonly permissionService: PermissionService,
    private readonly resourceFilterLanguageService: ResourceFilterLanguageService,
    @Inject(LOCALE_ID) private readonly locale: string,
  ) {
    this.form = this.buildForm();
    this.resourceFilterLanguageService.language$.pipe(take(1), takeUntil(this.destroy$)).subscribe();

    merge(
      this.form.statusChanges,
      this.form.valueChanges,
      this.form.controls.templateDetails.statusChanges,
      this.form.controls.fileConfiguration.statusChanges,
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.syncFormSignals());

    this.workspaces$ = this.authService.getAllWorkspaces().pipe(
      map((response) =>
        [...response.workspaces].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.workspaces$
      .pipe(takeUntil(this.destroy$))
      .subscribe((workspaces) => {
        const idByName: Record<string, string> = {};
        for (const workspace of workspaces) {
          idByName[workspace.name] = workspace.id;
        }

        this.workspaceFilterValues.set(workspaces.map((workspace) => ({ label: workspace.name, value: workspace.id })));
        this.workspaceIdByName.set(idByName);
      });

    this.workItemTypes$ = this.workItemTypesService.getWorkItemTypes().pipe(
      map((types) =>
        [...types].sort((left, right) =>
          String(left.type).localeCompare(String(right.type), undefined, {
            sensitivity: 'base',
            numeric: true,
          }),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.form.controls.templateDetails.controls.type.valueChanges
      .pipe(startWith(this.form.controls.templateDetails.controls.type.value), takeUntil(this.destroy$))
      .subscribe((type) => {
        this.selectedWorkItemTypeName.set(String(type ?? ''));
      });

    const selectedWorkspace$ = this.form.controls.templateDetails.controls.workspace.valueChanges.pipe(
      startWith(this.form.controls.templateDetails.controls.workspace.value),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    const selectedType$ = this.form.controls.templateDetails.controls.type.valueChanges.pipe(
      startWith(this.form.controls.templateDetails.controls.type.value),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    const typeFilteredWorkflows$ = selectedType$.pipe(
      switchMap((selectedType) =>
        selectedType ? this.workflowService.queryWorkflows(String(selectedType)) : of<IWorkflow[]>([]),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.workflows$ = combineLatest([typeFilteredWorkflows$, selectedWorkspace$]).pipe(
      map(([workflows, workspaceId]) => {
        if (!workspaceId) {
          return [];
        }

        return workflows
          .filter((workflow) => workflow.workspace === workspaceId)
          .sort((a, b) => {
            const nameA = a.name ?? '';
            const nameB = b.name ?? '';
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
          });
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.testPrograms$ = combineLatest([this.templateService.templates$, selectedWorkspace$]).pipe(
      switchMap(([templates, workspaceId]) => {
        if (!workspaceId) {
          return of<string[]>([]);
        }

        const templatePrograms = [
          ...new Set(
            templates
              .filter((template) => template.workspace === workspaceId)
              .map((template) => template.testProgram?.trim())
              .filter((testProgram): testProgram is string => Boolean(testProgram)),
          ),
        ];

        return this.testResultService.queryProgramNamesByWorkspace(workspaceId).pipe(
          map((resultPrograms) =>
            [...new Set([...templatePrograms, ...resultPrograms])].sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
            ),
          ),
        );
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.dashboardOptions$ = selectedWorkspace$.pipe(
      switchMap((workspaceId) => {
        if (!workspaceId) {
          return of<IDashboardOption[]>([]);
        }

        return this.dashboardService.queryDashboardsByWorkspaceId(workspaceId).pipe(
          map((dashboards) =>
            dashboards.map((dashboard) => ({
              id: dashboard.uid,
              name: dashboard.title,
            })),
          ),
          catchError(() => of<IDashboardOption[]>([])),
        );
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    selectedWorkspace$
      .pipe(takeUntil(this.destroy$))
      .subscribe((workspaceId) => this.handleWorkspaceChange(workspaceId, true));

    const templateNameControl = this.form.controls.templateDetails.controls.name;
    const templateTypeControl = this.form.controls.templateDetails.controls.type;
    combineLatest([
      selectedWorkspace$,
      templateNameControl.valueChanges.pipe(startWith(templateNameControl.value)),
      templateTypeControl.valueChanges.pipe(startWith(templateTypeControl.value)),
      this.form.controls.templateDetails.controls.productFamilies.valueChanges.pipe(
        startWith(this.form.controls.templateDetails.controls.productFamilies.value),
      ),
    ])
      .pipe(
        debounceTime(250),
        map(([workspaceId, templateName, templateType, productFamilies]) => ({
          workspaceId: (workspaceId ?? '').trim(),
          templateName: (templateName ?? '').trim(),
          templateType: String(templateType ?? '').trim(),
          productFamilies: productFamilies ?? [],
        })),
        takeUntil(this.destroy$),
      )
      .subscribe((context) => {
        if (!context.workspaceId) {
          this.lastLoadedDynamicKey = null;
          this.clearDynamicFormViews();
          return;
        }

        // Reload when the context key changes, and always after a fresh panel open so
        // re-editing the same template (identical context) still refreshes the views.
        const key = [
          context.workspaceId,
          context.templateName,
          context.templateType,
          context.productFamilies.join('|'),
        ].join('::');
        if (key === this.lastLoadedDynamicKey) {
          return;
        }

        this.lastLoadedDynamicKey = key;
        this.loadDynamicFormViews(context);
      });

    this.workflows$.pipe(takeUntil(this.destroy$)).subscribe((workflows) => {
      const workflowControl = this.form.controls.templateDetails.controls.workflowId;
      const currentWorkflow = workflowControl.value;
      if (!currentWorkflow) {
        return;
      }

      const isValidWorkflow = workflows.some((workflow) => workflow.id === currentWorkflow);
      if (!isValidWorkflow) {
        workflowControl.setValue('');
      }
    });

    this.dashboardOptions$.pipe(takeUntil(this.destroy$)).subscribe((dashboardOptions) => {
      const dashboardIdControl = this.form.controls.templateDetails.controls.dashboard.controls.id;
      const currentDashboardId = dashboardIdControl.value;
      if (!currentDashboardId || dashboardOptions.length === 0) {
        return;
      }

      if (!dashboardOptions.some((option) => option.id === currentDashboardId)) {
        dashboardIdControl.setValue('');
      }
    });

    this.workItemTypes$.pipe(takeUntil(this.destroy$)).subscribe((types) => {
      this.workItemTypesIndex.set(
        Object.fromEntries(types.map((type) => [String(type.type), type])),
      );

      const typeControl = this.form.controls.templateDetails.controls.type;
      if (!typeControl.value) {
        const defaultType = types.find((type) => type.type === WorkItemType.Testplan)?.type ?? types[0]?.type;
        if (defaultType) {
          typeControl.setValue(defaultType as WorkItemType, { emitEvent: true });
        }
      } else {
        this.applyWorkItemTypeRules(String(typeControl.value));
      }
    });

    this.form.controls.templateDetails.controls.type.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((type) => this.applyWorkItemTypeRules(String(type ?? '')));

    this.templateGroups$ = selectedWorkspace$.pipe(
      switchMap((workspaceId) => this.templateService.queryTemplateGroupsByWorkspace(workspaceId)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    // Nimble comboboxes display the first option when their option list loads after the
    // (empty) control is initialized. Clear the display once options arrive so Group and
    // Test Program start uninitialized until the user picks a value.
    this.templateGroups$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() =>
        this.clearComboboxDisplayIfEmpty(
          this.templateGroupComboboxes,
          this.form.controls.templateDetails.controls.templateGroup,
        ),
      );
    });

    this.testPrograms$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() =>
        this.clearComboboxDisplayIfEmpty(
          this.testProgramComboboxes,
          this.form.controls.templateDetails.controls.testProgram,
        ),
      );
    });

    const testProgramControl = this.form.controls.templateDetails.controls.testProgram;
    const workspaceControl = this.form.controls.templateDetails.controls.workspace;
    const durationControl = this.form.controls.templateDetails.controls.estimatedDurationInSeconds;

    combineLatest([
      workspaceControl.valueChanges.pipe(startWith(workspaceControl.value)),
      testProgramControl.valueChanges.pipe(startWith(testProgramControl.value)),
    ])
      .pipe(
        debounceTime(300),
        map(([workspace, testProgram]) => [workspace.trim(), testProgram.trim()] as const),
        distinctUntilChanged(
          ([prevWorkspace, prevProgram], [nextWorkspace, nextProgram]) =>
            prevWorkspace === nextWorkspace && prevProgram === nextProgram,
        ),
        filter(([workspace, testProgram]) => Boolean(workspace) && Boolean(testProgram)),
        switchMap(([workspace, testProgram]) =>
          this.testResultService.queryFirstElapsedTimeInSeconds(workspace, testProgram).pipe(
            catchError(() => of(undefined)),
            map((duration) => ({ workspace, testProgram, duration })),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe(({ workspace, testProgram, duration }) => {
        if (duration === undefined) {
          return;
        }

        // Keep a saved or user-entered duration until the workspace or test program changes.
        const sourceKey = `${workspace}::${testProgram}`;
        if (this.lastAutofillSourceKey === sourceKey && durationControl.value.trim()) {
          return;
        }

        this.suppressEstimatedDurationAutofill = true;
        durationControl.setValue(String(duration));
        this.suppressEstimatedDurationAutofill = false;
        this.lastAutofillSourceKey = sourceKey;
      });

    durationControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.suppressEstimatedDurationAutofill) {
        return;
      }

      // Once the user edits the value, preserve it until workspace/test program changes.
      if (durationControl.dirty) {
        this.lastAutofillSourceKey = this.getAutofillSourceKey();
      }
    });
  }

  /**
   * Opens the slideout in create or edit mode.
   * Resets state and form before showing the drawer.
   */
  public openPanel(mode: 'create' | 'edit', template?: IWorkitemTemplate): void {
    this.panelSession += 1;
    this.isSaving.set(false);
    this.isEditMode.set(mode === 'edit');
    this.resetToConfigurationStep();
    this.templateToEdit = template;
    this.currentTemplateId.set(mode === 'edit' && template ? template.id : '');
    // Force the next context emission to reload dynamic form views, even when re-editing
    // the same template with an identical workspace/name/type context.
    this.lastLoadedDynamicKey = null;
    this.resetForm();
    this.syncTypeControlLock();

    if (mode === 'edit' && template) {
      this.beginConfigDataLoading();
      this.populateFormForEdit(template);
    } else {
      this.isConfigDataLoading.set(false);
    }
    this.resolveFilterLanguage(mode === 'edit' ? template : undefined);

    // Ensure the tab selection is reset even if the tab component keeps internal state.
    queueMicrotask(() => this.resetToConfigurationStep());

    void this.drawerDirective().show();

    // Reset the panel scroll to the top so the loading spinner and first fields are visible,
    // regardless of where the previously edited template left the scroll position.
    requestAnimationFrame(() => this.panelBodyRef()?.nativeElement.scrollTo({ top: 0 }));
  }

  /**
   * Shows a loading overlay while the workspace-scoped configuration queries (workflows,
   * template groups, test programs, dashboards) settle, so the previously edited template's
   * cached values are not briefly shown. Resolves when the streams stop emitting or after a cap.
   */
  private beginConfigDataLoading(): void {
    this.isConfigDataLoading.set(true);

    merge(
      combineLatest([
        this.workflows$,
        this.templateGroups$,
        this.testPrograms$,
        this.dashboardOptions$,
      ]).pipe(debounceTime(250)),
      timer(5000),
    )
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(() => this.isConfigDataLoading.set(false));
  }

  /** Cleans up subscriptions on component destroy. */
  public ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onDocumentKeydownCapture, true);
    window.removeEventListener('focus', this.onWindowFocusAfterFilePicker);
    this.systemFilterDialogObserver?.disconnect();
    this.systemFilterDialogObserver = undefined;
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Returns the dashboard parameters FormArray, used by the template for rendering rows. */
  protected get dashboardParameters(): FormArray<FormGroup<IDashboardParameterFormGroup>> {
    return this.form.controls.templateDetails.controls.dashboard.controls.parameters;
  }

  /** Returns the global parameters FormArray from the File Configuration step, used by the template for rendering rows. */
  protected get globalParameters(): FormArray<FormGroup<IGlobalParameterFormGroup>> {
    return this.form.controls.fileConfiguration.controls.globalParameters;
  }

  /** Returns the custom properties FormArray from the Template Details step. */
  protected get customProperties(): FormArray<FormGroup<ICustomPropertyFormGroup>> {
    return this.form.controls.templateDetails.controls.customProperties;
  }

  /** Appends a new empty key-value row to the custom properties FormArray. */
  protected addCustomProperty(): void {
    this.customProperties.push(
      this.fb.group<ICustomPropertyFormGroup>({
        key: this.fb.nonNullable.control('', Validators.required),
        value: this.fb.nonNullable.control(''),
      }),
    );
    this.changeDetector.detectChanges();
    this.propertyKeyInputs.last.nativeElement.focus();
  }

  /** Removes the custom property row at the given index. */
  protected removeCustomProperty(index: number): void {
    this.customProperties.removeAt(index);
    this.customProperties.markAsDirty();
    this.syncFormSignals();
  }

  /** Stable DOM/tab id for a resolved dynamic form view. */
  protected getDynamicViewTabId(view: IResolvedDynamicView): string {
    return `dff-tab-${view.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  /** Builds a unique, DOM-safe anchor id for a dynamic form help tooltip. */
  protected dffHelpAnchorId(...parts: string[]): string {
    return `dff-help-${parts.join('-').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  /** Switches to the given dynamic form view tab. */
  protected onDynamicViewTabClick(view: IResolvedDynamicView): void {
    this.activeDynamicViewKey.set(view.key);
    this.currentStep.set(CreateEditFormStep.DynamicForm);
    this.syncActiveTab(CreateEditFormStep.DynamicForm);
    this.scheduleDynamicSelectSync();
  }

  /** Current value for a dynamic field, falling back to its default. */
  protected getDynamicFieldValue(field: IResolvedDynamicField): string {
    return this.dynamicFieldValues()[field.key] ?? '';
  }

  protected isDynamicFieldSelect(field: IResolvedDynamicField): boolean {
    return field.type === 'ENUM' && field.allowedValues.length > 0;
  }

  protected isDynamicFieldMultiline(field: IResolvedDynamicField): boolean {
    return field.type === 'TEXT_AREA' || field.type === 'MULTILINE' || field.type === 'PARAGRAPH';
  }

  protected isDynamicFieldNumber(field: IResolvedDynamicField): boolean {
    return field.type === 'NUMBER' || field.type === 'INTEGER' || field.type === 'DOUBLE';
  }

  protected isDynamicFieldBoolean(field: IResolvedDynamicField): boolean {
    return field.type === 'BOOLEAN' || field.type === 'BOOL';
  }

  protected isDynamicFieldMissingRequiredValue(field: IResolvedDynamicField): boolean {
    return (
      this.showDynamicFormValidation() &&
      field.mandatory &&
      this.getDynamicFieldValue(field).trim().length === 0
    );
  }

  /** Updates a dynamic field value and refreshes dirty/validity state. */
  protected onDynamicFieldValueChange(field: IResolvedDynamicField, event: Event): void {
    const value = String((event.target as { value?: string }).value ?? '');
    this.setDynamicFieldValue(field, value);
  }

  /** Stores a BOOLEAN field's checkbox state as the 'true'/'false' strings DFF rules compare. */
  protected onDynamicBooleanChange(field: IResolvedDynamicField, event: Event): void {
    const checked = (event.target as { checked?: boolean }).checked === true;
    this.setDynamicFieldValue(field, checked ? 'true' : 'false');
  }

  private setDynamicFieldValue(field: IResolvedDynamicField, value: string): void {
    const visibleFieldsBefore = this.getVisibleDynamicFieldSignature();
    this.dynamicFieldValues.update((values) => ({ ...values, [field.key]: value }));
    this.syncDynamicFormState();
    this.ensureActiveDynamicViewVisible();

    // Rules may reveal new selects, which need their values re-applied once rendered.
    if (this.getVisibleDynamicFieldSignature() !== visibleFieldsBefore) {
      this.scheduleDynamicSelectSync();
    }
  }

  private getVisibleDynamicFieldSignature(): string {
    return this.getDynamicFieldList()
      .map((field) => field.key)
      .join('|');
  }

  /** Schedules a nimble-select value re-sync after the dynamic view renders. */
  private scheduleDynamicSelectSync(): void {
    requestAnimationFrame(() => this.syncDynamicSelectValues());
    // Options may register a frame later; re-apply once more so defaults reflect reliably.
    setTimeout(() => this.syncDynamicSelectValues(), 60);
  }

  /**
   * Forces each dynamic ENUM/BOOLEAN nimble-select to reflect its model value. Nimble-select
   * cannot resolve a selected option when its `value` is bound before the options render, so the
   * value is re-applied imperatively once the options exist (matching the query-builder approach).
   */
  private syncDynamicSelectValues(): void {
    const container = this.panelBodyRef()?.nativeElement;
    if (!container) {
      return;
    }

    const values = this.dynamicFieldValues();
    const selects = Array.from(
      container.querySelectorAll('nimble-select[data-dff-key]'),
    ) as (HTMLElement & { value: string })[];

    for (const select of selects) {
      const key = select.getAttribute('data-dff-key');
      if (!key) {
        continue;
      }

      const value = values[key] ?? '';
      // Reset first so nimble-select re-evaluates the selected option.
      select.value = '';
      select.value = value;
    }
  }

  protected getTypeDescription(): string {
    return this.selectedWorkItemType()?.description ?? '';
  }

  protected getTypeLabel(type: string): string {
    return getWorkItemTypeLabel(type);
  }

  /** Type cannot be changed during edit because update-workitem-templates does not support it yet. */
  protected isTypeLockedInEditMode(): boolean {
    return this.isEditMode();
  }

  /** Workspaces the user can create templates in, plus the edited template's own workspace. */
  protected workspaceOptions(workspaces: IAuthWorkspace[]): IAuthWorkspace[] {
    const current = this.isEditMode() ? this.templateToEdit?.workspace : undefined;
    return workspaces.filter(
      (workspace) =>
        workspace.id === current || this.permissionService.can(WORK_ITEM_TEMPLATE_ACTIONS.create, workspace.id),
    );
  }

  protected isControlDisabled(controlName: SupportedFieldName): boolean {
    const definition = this.selectedWorkItemType();
    if (!definition) {
      return false;
    }

    return definition.fields.some((field) => field.name === controlName && !field.supported);
  }

  protected isFieldMandatory(fieldName: SupportedFieldName): boolean {
    return (
      this.selectedWorkItemType()?.fields.some(
        (field) => field.name === fieldName && field.supported && field.mandatory,
      ) ?? false
    );
  }

  protected hasRequiredError(control: AbstractControl): boolean {
    return control.touched && control.hasError('required');
  }

  protected hasSupportedFilters(): boolean {
    return (
      !this.isControlDisabled('RESOURCES.SYSTEMS') ||
      !this.isControlDisabled('RESOURCES.DUTS') ||
      !this.isControlDisabled('RESOURCES.FIXTURES') ||
      !this.isControlDisabled('RESOURCES.ASSETS')
    );
  }

  /** Appends a new empty key-value parameter row to the dashboard parameters FormArray. */
  protected addDashboardParameter(): void {
    this.dashboardParameters.push(this.createParameterFormGroup('', ''));
    this.changeDetector.detectChanges();
    this.dashboardKeyInputs.last.nativeElement.focus();
  }

  /** Removes the parameter row at the given index and revalidates remaining keys for uniqueness. */
  protected removeDashboardParameter(index: number): void {
    this.dashboardParameters.removeAt(index);
    this.dashboardParameters.markAsDirty();
    this.revalidateParameterKeys();
  }

  /** Returns whether the key control of the given parameter row should show an error. */
  protected isParameterKeyInvalid(param: FormGroup<IDashboardParameterFormGroup>): boolean {
    const key = param.controls.key;
    return key.invalid && (key.dirty || key.touched);
  }

  /** Returns the appropriate error message for an invalid parameter key control. */
  protected getParameterKeyError(param: FormGroup<IDashboardParameterFormGroup>): string {
    const key = param.controls.key;
    if (key.hasError('required')) {
      return $localize`Key is required.`;
    }
    if (key.hasError('duplicateKey')) {
      return $localize`This key already exists.`;
    }
    return '';
  }

  /** Syncs the combobox display text with the form control on input and change events. */
  protected onTemplateGroupChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value ?? '';
    const control = this.form.controls.templateDetails.controls.templateGroup;
    if (control.value !== value) {
      control.setValue(value, { emitModelToViewChange: false });
    }
  }

  /** Clears the selected/typed template group value. */
  protected clearTemplateGroup(): void {
    const control = this.form.controls.templateDetails.controls.templateGroup;
    if (!control.value) {
      return;
    }

    control.setValue('');
    control.markAsDirty();
  }

  /** Resets a combobox's displayed text to match its control when the control has no value,
   *  preventing the Nimble combobox from showing the first option after options load. */
  private clearComboboxDisplayIfEmpty(
    comboboxes: QueryList<ElementRef<HTMLElement & { value: string }>> | undefined,
    control: FormControl<string>,
  ): void {
    const element = comboboxes?.first?.nativeElement;
    if (element && !control.value && element.value) {
      element.value = '';
    }
  }

  /** Syncs the editable test program combobox display text with the form control. */
  protected onTestProgramChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value ?? '';
    const control = this.form.controls.templateDetails.controls.testProgram;
    if (control.value !== value) {
      control.setValue(value, { emitModelToViewChange: false });
      this.lastAutofillSourceKey = null;
    }
  }

  /** Clears the selected/typed test program value. */
  protected clearTestProgram(): void {
    const control = this.form.controls.templateDetails.controls.testProgram;
    if (!control.value) {
      return;
    }

    control.setValue('');
    control.markAsDirty();
    this.lastAutofillSourceKey = null;
  }

  /** Clears a specific filter text field and resets any in-progress query draft for that filter. */
  protected clearFilter(controlName: FilterControlName): void {
    const control = this.form.controls.templateDetails.controls[controlName];
    if (!control.value) {
      return;
    }

    control.setValue('');
    control.markAsDirty();
    this.queryDraftByFilter.delete(controlName);
  }

  /** Opens the system filter query-builder dialog, pre-populated from the current filter string. */
  protected openSystemFilterDialog(): void {
    this.openFilterDialog('systemFilter');
  }

  /** Opens the query-builder dialog for the specified filter control. */
  protected openFilterDialog(controlName: FilterControlName): void {
    this.activeFilterControl = controlName;
    this.showSystemFilterValidation.set(false);
    const existingDraft = this.queryDraftByFilter.get(controlName);
    let parsed: ISystemFilterGroup[];
    if (existingDraft) {
      parsed = this.cloneGroups(existingDraft);
      this.systemFilterGroups.set(parsed);
    } else {
      const filterControl = this.form.controls.templateDetails.controls[controlName];
      parsed = this.parseActiveFilter(filterControl.value);
      this.systemFilterGroups.set(parsed);
      this.queryDraftByFilter.set(controlName, this.cloneGroups(parsed));
    }

    this.loadActiveFilterFields(this.flatConditions());

    void this.systemFilterDialogRef().show();
    requestAnimationFrame(() => {
      this.ensureSystemFilterDialogBodyStyles();
      this.observeSystemFilterDialogMutations();
      this.syncFilterConditionSelectValues();
    });
    setTimeout(() => this.ensureSystemFilterDialogBodyStyles(), 200);
    setTimeout(() => this.syncFilterConditionSelectValues(), 200);
  }

  /**
   * Re-applies each condition's property/operator/value onto the nimble-select elements after the
   * dialog renders. Nimble-select cannot resolve its selected option when its `value` is set before
   * the `@for` options exist, so freshly opened dialogs render empty selects. Setting the value
   * imperatively once the options are present forces the correct option to be selected.
   */
  private syncFilterConditionSelectValues(): void {
    const dialogElement = this.systemFilterDialogElementRef().nativeElement as HTMLElement;
    const rows = Array.from(dialogElement.querySelectorAll('.query-builder-row')) as HTMLElement[];
    const conditions = this.flatConditions();

    rows.forEach((row, index) => {
      const condition = conditions[index];
      if (!condition) {
        return;
      }

      const selects = Array.from(row.querySelectorAll('nimble-select')) as (HTMLElement & { value: string })[];
      const [propertySelect, operatorSelect, valueSelect] = selects;

      this.forceSelectValue(propertySelect, condition.property);
      this.forceSelectValue(operatorSelect, condition.operator);
      this.forceSelectValue(valueSelect, condition.value);
    });
  }

  /** Forces a nimble-select to reflect the given value, re-running option matching if needed. */
  private forceSelectValue(select: (HTMLElement & { value: string }) | undefined, value: string): void {
    if (!select || !value) {
      return;
    }

    // Reset first so nimble-select re-evaluates the selected option even when the stored value
    // already matches but was never reflected (selectedIndex === -1).
    select.value = '';
    select.value = value;
  }

  /** Returns an empty condition row. */
  private createEmptyCondition(): ISystemFilterCondition {
    return { property: '', propertyName: '', logicalOperator: 'AND', operator: DEFAULT_FILTER_OPERATION, value: '' };
  }

  /** Flattens all conditions across every group in render order. */
  private flatConditions(): ISystemFilterCondition[] {
    return this.systemFilterGroups().flatMap((group) => group.conditions);
  }

  /** Reorders a condition row within its group when its drag handle is dropped. */
  protected onConditionDropped(event: CdkDragDrop<ISystemFilterCondition[]>, groupIndex: number): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    this.systemFilterGroups.update((groups) =>
      groups.map((group, gi) => {
        if (gi !== groupIndex) {
          return group;
        }

        const conditions = [...group.conditions];
        moveItemInArray(conditions, event.previousIndex, event.currentIndex);
        return { ...group, conditions };
      }),
    );

    this.showSystemFilterValidation.set(false);
    this.syncActiveFilterDraft();
    requestAnimationFrame(() => this.syncFilterConditionSelectValues());
  }

  /** Adds an empty condition row to the specified group. */
  protected addSystemFilterCondition(groupIndex: number): void {    this.systemFilterGroups.update((groups) =>
      groups.map((group, i) =>
        i === groupIndex
          ? { ...group, conditions: [...group.conditions, this.createEmptyCondition()] }
          : group,
      ),
    );
    this.showSystemFilterValidation.set(false);
    this.syncActiveFilterDraft();
  }

  /** Adds a new condition group after the specified group, joined by a toggleable operator. */
  protected addSystemFilterGroup(afterGroupIndex: number): void {
    this.systemFilterGroups.update((groups) => {
      const next = [...groups];
      next.splice(afterGroupIndex + 1, 0, { logicalOperator: 'AND', conditions: [this.createEmptyCondition()] });
      return next;
    });
    this.showSystemFilterValidation.set(false);
    this.syncActiveFilterDraft();
  }

  /** Removes a condition row from a group; empty groups collapse, leaving at least one empty group. */
  protected removeSystemFilterCondition(groupIndex: number, conditionIndex: number): void {
    this.systemFilterGroups.update((groups) => {
      const next = groups
        .map((group, i) =>
          i === groupIndex
            ? { ...group, conditions: group.conditions.filter((_, ci) => ci !== conditionIndex) }
            : group,
        )
        .filter((group) => group.conditions.length > 0);

      return next.length > 0 ? next : [{ logicalOperator: 'AND', conditions: [this.createEmptyCondition()] }];
    });
    this.showSystemFilterValidation.set(false);
    this.syncActiveFilterDraft();
  }

  /** Updates one field of a condition row within a group. */
  protected updateSystemFilterCondition(
    groupIndex: number,
    conditionIndex: number,
    field: keyof ISystemFilterCondition,
    event: Event,
  ): void {
    const value = String((event.target as { value?: string }).value ?? '');
    this.systemFilterGroups.update((groups) =>
      groups.map((group, gi) => {
        if (gi !== groupIndex) {
          return group;
        }

        return {
          ...group,
          conditions: group.conditions.map((condition, ci) => {
            if (ci !== conditionIndex) {
              return condition;
            }

            if (field === 'property') {
              const updated = { ...condition, property: value };
              const operators = this.getOperatorOptions(updated);
              const nextOperator = operators.includes(updated.operator as FilterOperation)
                ? updated.operator
                : operators[0] ?? DEFAULT_FILTER_OPERATION;
              return { ...updated, operator: nextOperator, value: '', propertyName: '' };
            }

            return { ...condition, [field]: value };
          }),
        };
      }),
    );
    this.showSystemFilterValidation.set(false);
    this.syncActiveFilterDraft();
  }

  /** Toggles the And/Or operator joining a condition row to the previous row in its group. */
  protected toggleSystemFilterConditionOperator(groupIndex: number, conditionIndex: number): void {
    this.systemFilterGroups.update((groups) =>
      groups.map((group, gi) =>
        gi === groupIndex
          ? {
              ...group,
              conditions: group.conditions.map((condition, ci) =>
                ci === conditionIndex
                  ? { ...condition, logicalOperator: condition.logicalOperator === 'AND' ? 'OR' : 'AND' }
                  : condition,
              ),
            }
          : group,
      ),
    );
    this.syncActiveFilterDraft();
  }

  /** Toggles the And/Or operator joining a group to the previous group. */
  protected toggleSystemFilterGroupOperator(groupIndex: number): void {
    this.systemFilterGroups.update((groups) =>
      groups.map((group, gi) =>
        gi === groupIndex
          ? { ...group, logicalOperator: group.logicalOperator === 'AND' ? 'OR' : 'AND' }
          : group,
      ),
    );
    this.syncActiveFilterDraft();
  }

  /** Returns true when a condition row is invalid (missing property or value). */
  protected isSystemFilterConditionInvalid(condition: ISystemFilterCondition): boolean {
    if (condition.property.trim().length === 0 || condition.operator.trim().length === 0) {
      return true;
    }

    if (this.operatorNeedsValue(condition) && condition.value.trim().length === 0) {
      return true;
    }

    return this.isFilterProperty(condition) && (condition.propertyName ?? '').trim().length === 0;
  }

  /** Returns the query dialog title for the currently active filter control. */
  protected getActiveFilterDialogTitle(): string {
    const titleByControl: Record<FilterControlName, string> = {
      systemFilter: $localize`Configure System query`,
      dutFilter: $localize`Configure DUT query`,
      fixturesFilter: $localize`Configure Fixtures query`,
      assetsFilter: $localize`Configure Assets query`,
    };

    return titleByControl[this.activeFilterControl];
  }

  /** Returns true when all query conditions have both property and value populated. */
  protected isSystemFilterDialogValid(): boolean {
    return this.flatConditions().every(
      (condition) =>
        condition.property.trim().length > 0 &&
        (!this.operatorNeedsValue(condition) || condition.value.trim().length > 0) &&
        (!this.isFilterProperty(condition) || (condition.propertyName ?? '').trim().length > 0),
    );
  }

  /** Cancels system filter edits in the dialog. */
  protected cancelSystemFilterDialog(): void {
    const control = this.form.controls.templateDetails.controls[this.activeFilterControl];
    const committed = this.parseActiveFilter(control.value);
    this.systemFilterGroups.set(committed);
    this.showSystemFilterValidation.set(false);
    this.queryDraftByFilter.set(this.activeFilterControl, this.cloneGroups(committed));
    this.systemFilterDialogRef().close(undefined);
  }

  /**
   * Applies the dialog groups to the active filter field, rendered in the template's filter language:
   * Lucene for the search services, or Dynamic LINQ (`buildLinqFilter` / `conditionToLinq`).
   */
  protected applySystemFilterDialog(): void {
    if (!this.isSystemFilterDialogValid()) {
      this.showSystemFilterValidation.set(true);
      return;
    }

    this.showSystemFilterValidation.set(false);

    const groups = this.systemFilterGroups();
    const expression =
      this.filterLanguage() === 'LUCENE'
        ? groupsToLucene(groups, this.activeFilterKind()) ?? ''
        : this.groupsToLinq(groups);

    const control = this.form.controls.templateDetails.controls[this.activeFilterControl];
    control.setValue(expression);
    control.markAsDirty();
    this.queryDraftByFilter.set(this.activeFilterControl, this.cloneGroups(groups));
    this.systemFilterDialogRef().close(undefined);
  }

  /** Renders query-builder groups to one Dynamic LINQ expression for the active filter. */
  private groupsToLinq(groups: ISystemFilterGroup[]): string {
    const groupExpressions = groups
      .map((group) => ({ expression: this.groupToLinq(group), logicalOperator: group.logicalOperator }))
      .filter((group) => group.expression.length > 0);

    return this.combineGroupExpressions(groupExpressions);
  }

  /** The search index the active filter targets: systems, or assets for DUTs/fixtures/assets. */
  private activeFilterKind(): ResourceFilterKind {
    return this.activeFilterControl === 'systemFilter' ? 'systems' : 'assets';
  }

  /** Parses the active filter's text into query-builder groups using the current filter language. */
  private parseActiveFilter(expression: string): ISystemFilterGroup[] {
    if (this.filterLanguage() === 'LINQ') {
      return this.parseSystemFilter(expression);
    }

    const { groups } = parseLuceneGroups(expression, this.activeFilterKind());
    return groups.length > 0 ? groups : [{ logicalOperator: 'AND', conditions: [this.createEmptyCondition()] }];
  }

  /** Placeholder example for a filter field in the current filter language. */
  protected filterPlaceholder(controlName: FilterControlName): string {
    return $localize`e.g., ${FILTER_EXAMPLES[this.filterLanguage()][controlName]}:example:`;
  }

  protected readonly luceneTooltipExamples = {
    systems: 'minionDetails.serialNumber:"01E82ED0"',
    duts: 'ModelName:"cRIO-9045" AND SerialNumber:"01E82ED0"',
  };

  /**
   * Starts each panel session in the template's stored filter language (LINQ for new templates),
   * then switches to the language the server supports once the search probe resolves.
   */
  private resolveFilterLanguage(template?: IWorkitemTemplate): void {
    const session = this.panelSession;
    this.filterLanguage.set(template?.resources?.filterType ?? 'LINQ');

    this.resourceFilterLanguageService.language$
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((supported) => {
        if (session === this.panelSession) {
          this.switchFilterLanguage(supported);
        }
      });
  }

  /**
   * Converts every resource filter to `target`. All filters of a template share one language, so
   * when any filter cannot be converted faithfully the template keeps its current language.
   */
  private switchFilterLanguage(target: ResourceFilterType): void {
    const current = this.filterLanguage();
    if (current === target) {
      return;
    }

    const controls = this.form.controls.templateDetails.controls;
    const converted = new Map<FilterControlName, string>();
    for (const name of FILTER_CONTROL_NAMES) {
      const value = controls[name].value.trim();
      if (!value) {
        continue;
      }
      const result = this.convertFilter(name, value, current, target);
      if (result === null) {
        return;
      }
      converted.set(name, result);
    }

    converted.forEach((value, name) => controls[name].setValue(value, { emitEvent: false }));
    this.queryDraftByFilter.clear();
    this.filterLanguage.set(target);
  }

  /**
   * Converts one filter between LINQ and Lucene through the query-builder rows. Returns null unless
   * the source re-renders exactly from those rows, so nothing the builder cannot model is lost.
   */
  private convertFilter(
    controlName: FilterControlName,
    expression: string,
    from: ResourceFilterType,
    to: ResourceFilterType,
  ): string | null {
    const previousControl = this.activeFilterControl;
    const previousFields = this.activeFilterFields();
    this.activeFilterControl = controlName;
    this.activeFilterFields.set(
      controlName === 'systemFilter' ? createSystemFilterFields() : createAssetFilterFields(),
    );

    try {
      const kind = this.activeFilterKind();
      if (from === 'LINQ') {
        const groups = this.parseSystemFilter(expression);
        const faithful =
          normalizeFilterExpression(this.groupsToLinq(groups)) === normalizeFilterExpression(expression);
        return faithful ? groupsToLucene(groups, kind, true) : null;
      }

      const { groups, complete } = parseLuceneGroups(expression, kind);
      const faithful =
        complete &&
        normalizeFilterExpression(groupsToLucene(groups, kind, true) ?? '') ===
          normalizeFilterExpression(expression);
      return faithful && to === 'LINQ' ? this.groupsToLinq(groups) || null : null;
    } finally {
      this.activeFilterControl = previousControl;
      this.activeFilterFields.set(previousFields);
    }
  }

  /**
   * The Dynamic LINQ date-comparison style for the active resource. System queries
   * (`nisysmgmt`) document the `DateTime(...)/DateTime.parse(...)` form, while asset
   * queries (`niapm`, used for DUT/fixtures/assets) use the plain quoted comparison.
   */
  private get activeDateStyle(): DateStyle {
    return this.activeFilterControl === 'systemFilter' ? DateStyle.Parse : DateStyle.Compare;
  }

  /** Renders one condition group to LINQ, using `buildLinqFilter` for uniform And/Or and per-row joins otherwise. */
  private groupToLinq(group: ISystemFilterGroup): string {
    const dateStyle = this.activeDateStyle;
    const rendered = group.conditions
      .map((condition) => {
        const filterCondition = this.toFilterCondition(condition);
        return {
          text: filterCondition ? conditionToLinq(filterCondition, { dateStyle }) : '',
          op: condition.logicalOperator,
        };
      })
      .filter((part) => part.text.length > 0);

    if (rendered.length === 0) {
      return '';
    }

    const junctions = rendered.slice(1).map((part) => part.op);
    const isUniform = junctions.every((op) => op === junctions[0]);

    if (junctions.length === 0 || isUniform) {
      const logic: FilterLogic = junctions[0] === 'OR' ? 'or' : 'and';
      const conditions = group.conditions
        .map((condition) => this.toFilterCondition(condition))
        .filter((condition): condition is FilterCondition => condition !== null);
      return buildLinqFilter(conditions, logic, { dateStyle });
    }

    // Mixed And/Or within the group: join each row by its own junction operator.
    return rendered.reduce(
      (expression, part, index) =>
        index === 0 ? part.text : `${expression}${part.op === 'OR' ? ' || ' : ' && '}${part.text}`,
      '',
    );
  }

  /** Combines rendered group expressions, using `combineFilters` when all groups share one operator. */
  private combineGroupExpressions(groups: { expression: string; logicalOperator: 'AND' | 'OR' }[]): string {
    if (groups.length === 0) {
      return '';
    }
    if (groups.length === 1) {
      return groups[0].expression;
    }

    const junctions = groups.slice(1).map((group) => group.logicalOperator);
    if (junctions.every((op) => op === junctions[0])) {
      return combineFilters(
        groups.map((group) => group.expression),
        junctions[0] === 'OR' ? 'or' : 'and',
      );
    }

    // Mixed group operators: parenthesize each group and join by its own operator.
    return groups.reduce(
      (expression, group, index) =>
        index === 0
          ? `(${group.expression})`
          : `${expression}${group.logicalOperator === 'OR' ? ' || ' : ' && '}(${group.expression})`,
      '',
    );
  }

  /** Maps a dialog condition row to a standalone-library {@link FilterCondition}, or null when incomplete. */
  private toFilterCondition(condition: ISystemFilterCondition): FilterCondition | null {
    const field = this.normalizeFilterPath(condition.property.trim());
    if (!field) {
      return null;
    }

    const operation = condition.operator as FilterOperation;
    const meta = FILTER_OPERATION_META[operation];
    const dataType = this.getFieldDefinition(field)?.dataType ?? FilterDataType.String;
    const rawValue = condition.value.trim();
    const key = (condition.propertyName ?? '').trim();

    if (meta?.needsKey && !key) {
      return null;
    }
    if (meta?.needsValue && !rawValue) {
      return null;
    }

    // Match SystemLink's native keyword filter (substring match on any element).
    if (
      dataType === FilterDataType.StringArray &&
      (operation === FilterOperation.Contains || operation === FilterOperation.NotContains)
    ) {
      const any = `${field}.Any(element => element.Contains("${escapeLinqString(rawValue)}"))`;
      return { operation: FilterOperation.Raw, linq: operation === FilterOperation.NotContains ? `!${any}` : any };
    }

    if (field === 'packages' && this.activeFilterControl === 'systemFilter') {
      const comparator = PACKAGE_VERSION_COMPARATORS[operation];
      if (!comparator || !key || !rawValue) {
        return null;
      }
      const name = escapeLinqString(key);
      return {
        operation: FilterOperation.Raw,
        linq: `(packages.data.keys.Contains("${name}") && string(packages.data["${name}"].version) ${comparator} "${escapeLinqString(rawValue)}")`,
      };
    }

    if (field === 'Location' && this.activeFilterControl !== 'systemFilter') {
      const linq = this.assetLocationLinq(operation, rawValue);
      return linq ? { operation: FilterOperation.Raw, linq } : null;
    }

    return {
      field,
      operation,
      value: meta?.needsValue ? this.coerceFilterValue(dataType, rawValue) : undefined,
      key: meta?.needsKey ? key : undefined,
    };
  }

  /** Renders SystemLink's asset Location expression (parent system or physical location). */
  private assetLocationLinq(operation: FilterOperation, rawValue: string): string {
    const value = `"${escapeLinqString(rawValue)}"`;
    switch (operation) {
      case FilterOperation.Equals:
        return `(Location.MinionId = ${value} || Location.PhysicalLocation = ${value})`;
      case FilterOperation.NotEquals:
        return `(Location.MinionId != ${value} && Location.PhysicalLocation != ${value})`;
      case FilterOperation.IsEmpty:
        return `(${ASSET_LOCATION_BLANK})`;
      case FilterOperation.IsNotEmpty:
        return `(${ASSET_LOCATION_NOT_BLANK})`;
      default:
        return '';
    }
  }

  /** Coerces the raw string editor value to the type the LINQ builder should emit (bare number/boolean). */
  private coerceFilterValue(dataType: FilterDataType, rawValue: string): string | number | boolean {
    if (dataType === FilterDataType.Number) {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }
    if (dataType === FilterDataType.Boolean) {
      return rawValue.toLowerCase() === 'true';
    }
    return rawValue;
  }

  /** Persists the current active filter's in-progress query groups. */
  private syncActiveFilterDraft(): void {
    this.queryDraftByFilter.set(this.activeFilterControl, this.cloneGroups(this.systemFilterGroups()));
  }

  /** Creates a deep-enough copy of the query groups and their condition rows. */
  private cloneGroups(groups: ISystemFilterGroup[]): ISystemFilterGroup[] {
    return groups.map((group) => ({
      logicalOperator: group.logicalOperator,
      conditions: group.conditions.map((condition) => ({ ...condition })),
    }));
  }

  private loadActiveFilterFields(conditions: ISystemFilterCondition[]): void {
    const workspaceId = this.form.controls.templateDetails.controls.workspace.value;
    if (!workspaceId) {
      this.activeFilterFields.set(this.mergeFilterFields([], conditions));
      return;
    }

    const source$ = this.activeFilterControl === 'systemFilter'
      ? this.systemService.queryDistinctSystemFieldsByWorkspace(workspaceId)
      : this.assetService.queryDistinctAssetFieldsByWorkspace(workspaceId);

    source$
      .pipe(take(1), takeUntil(this.destroy$), catchError(() => of<FilterFieldDef[]>([])))
      .subscribe((fields) => {
        this.activeFilterFields.set(this.mergeFilterFields(fields, conditions));
      });
  }

  private mergeFilterFields(
    fields: FilterFieldDef[],
    conditions: ISystemFilterCondition[],
  ): FilterFieldDef[] {
    const merged = [...fields];
    const existing = new Set(fields.map((field) => field.dataField));
    for (const condition of conditions) {
      const path = condition.property.trim();
      if (!path || existing.has(path)) {
        continue;
      }

      merged.push(fieldDef(path, path, FilterDataType.String));
      existing.add(path);
    }

    const workspaceValues = this.workspaceFilterValues();
    if (workspaceValues.length > 0) {
      const workspaceIndex = merged.findIndex(
        (field) => field.dataField === 'workspace' || field.dataField === 'workspaceName',
      );
      const workspaceField: FilterFieldDef = fieldDef($localize`Workspace`, 'workspace', FilterDataType.Enum, {
        values: workspaceValues,
      });

      if (workspaceIndex >= 0) {
        merged[workspaceIndex] = workspaceField;
      } else {
        merged.unshift(workspaceField);
      }
    }

    return merged;
  }

  protected openDateTimePicker(input: HTMLInputElement): void {
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
      return;
    }

    input.focus();
    input.click();
  }

  protected getOperatorOptions(condition: ISystemFilterCondition): FilterOperation[] {
    const definition = this.getFieldDefinition(condition.property);
    if (definition?.operations && definition.operations.length > 0) {
      return definition.operations;
    }

    return defaultOperationsFor(definition?.dataType ?? FilterDataType.String);
  }

  /** Returns the operator dropdown label for a given operation, matching the SystemLink query builder. */
  protected getOperatorLabel(operation: string): string {
    return FILTER_OPERATION_META[operation as FilterOperation]?.label ?? operation;
  }

  /** Builds a compact one-line summary of a condition for the lightweight drag preview. */
  protected getConditionSummary(condition: ISystemFilterCondition): string {
    const field = this.getFieldDefinition(condition.property)?.label ?? (condition.property || $localize`Property`);
    const parts: string[] = [field];
    if (this.isFilterProperty(condition) && (condition.propertyName ?? '').trim()) {
      parts.push((condition.propertyName ?? '').trim());
    }
    parts.push(this.getOperatorLabel(condition.operator));
    if (this.operatorNeedsValue(condition) && condition.value.trim()) {
      const value = condition.value.trim();
      parts.push(this.getFilterValueOptions(condition).find((option) => option.value === value)?.label ?? value);
    }
    return parts.join('  ·  ');
  }

  /** True when the condition's operator requires a value editor (false for Is empty / has key). */
  protected operatorNeedsValue(condition: ISystemFilterCondition): boolean {
    return FILTER_OPERATION_META[condition.operator as FilterOperation]?.needsValue ?? true;
  }

  protected isFilterValueSelect(condition: ISystemFilterCondition): boolean {
    const dataType = this.getFieldDefinition(condition.property)?.dataType;
    return dataType === FilterDataType.Boolean || dataType === FilterDataType.Enum;
  }

  /** True when the selected field is a key/value property bag (needs a property-key input). */
  protected isFilterProperty(condition: ISystemFilterCondition): boolean {
    return this.getFieldDefinition(condition.property)?.dataType === FilterDataType.Properties;
  }

  protected isFilterValueDateTime(condition: ISystemFilterCondition): boolean {
    return this.getFieldDefinition(condition.property)?.dataType === FilterDataType.DateTime;
  }

  protected isFilterValueNumeric(condition: ISystemFilterCondition): boolean {
    return this.getFieldDefinition(condition.property)?.dataType === FilterDataType.Number;
  }

  protected getFilterValueOptions(condition: ISystemFilterCondition): FilterFieldEnumValue[] {
    const definition = this.getFieldDefinition(condition.property);
    if (!definition) {
      return [];
    }

    if (definition.dataType === FilterDataType.Boolean) {
      return [
        { label: $localize`True`, value: 'true' },
        { label: $localize`False`, value: 'false' },
      ];
    }

    if (definition.dataType === FilterDataType.Enum) {
      return definition.values ?? [];
    }

    return [];
  }

  private getFieldDefinition(path: string): FilterFieldDef | undefined {
    return this.activeFilterFields().find((field) => field.dataField === path);
  }

  /** Applies dialog-body style overrides to prevent hover-only scrollbars in the query dialog. */
  private ensureSystemFilterDialogBodyStyles(): void {
    const dialogElement = this.systemFilterDialogElementRef().nativeElement as HTMLElement & {
      shadowRoot?: ShadowRoot | null;
    };
    const shadowRoot = dialogElement.shadowRoot;

    if (!shadowRoot) {
      return;
    }

    if (!shadowRoot.querySelector('#system-filter-dialog-body-style')) {
      const style = document.createElement('style');
      style.id = 'system-filter-dialog-body-style';
      style.textContent = `
        dialog[part='control'] {
          width: min(750px, 98vw) !important;
          max-width: 98vw !important;
        }

        section {
          overflow: hidden !important;
          overflow-y: hidden !important;
          scrollbar-width: none;
        }

        section::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `;
      shadowRoot.appendChild(style);
    }

    const bodySection = shadowRoot.querySelector('section') as HTMLElement | null;
    bodySection?.style.setProperty('overflow', 'hidden', 'important');
    bodySection?.style.setProperty('overflow-y', 'hidden', 'important');

    const contentContainers = Array.from(
      this.systemFilterDialogElementRef().nativeElement.querySelectorAll('.query-builder-rows, .query-builder-row'),
    ) as HTMLElement[];

    contentContainers.forEach((container) => {
      container.style.setProperty('overflow', 'hidden', 'important');
      container.style.setProperty('overflow-y', 'hidden', 'important');
      container.style.setProperty('scrollbar-width', 'none');
    });

    const shadowScrollableCandidates = Array.from(shadowRoot.querySelectorAll('*')) as HTMLElement[];
    shadowScrollableCandidates.forEach((element) => {
      const computed = getComputedStyle(element);
      if (computed.overflowY === 'auto' || computed.overflowY === 'scroll') {
        element.style.setProperty('overflow-y', 'hidden', 'important');
      }
      if (computed.overflow === 'auto' || computed.overflow === 'scroll') {
        element.style.setProperty('overflow', 'hidden', 'important');
      }
    });

    this.applyNoSuggestionsToQueryInputs(dialogElement);
  }

  /** Disables browser suggestions/autocomplete on all query-builder inputs, including dynamically added rows. */
  private applyNoSuggestionsToQueryInputs(dialogElement: HTMLElement): void {
    const queryTextFields = Array.from(
      dialogElement.querySelectorAll('.query-builder-row nimble-text-field, .query-builder-row nimble-combobox'),
    ) as HTMLElement[];

    queryTextFields.forEach((textField, index) => {
      textField.setAttribute('autocomplete', 'new-password');
      textField.setAttribute('autocapitalize', 'off');
      textField.setAttribute('autocorrect', 'off');
      textField.setAttribute('spellcheck', 'false');
      textField.setAttribute('name', `query-filter-no-suggest-${index}`);
      textField.setAttribute('data-lpignore', 'true');
      textField.setAttribute('aria-autocomplete', 'none');

      const fieldShadowRoot = (textField as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      const nativeInput = fieldShadowRoot?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;

      if (fieldShadowRoot && !fieldShadowRoot.querySelector('#query-field-autofill-style')) {
        const style = document.createElement('style');
        style.id = 'query-field-autofill-style';
        style.textContent = `
          input,
          textarea {
            background-color: transparent !important;
          }

          input:-webkit-autofill,
          input:-webkit-autofill:hover,
          input:-webkit-autofill:focus,
          textarea:-webkit-autofill,
          textarea:-webkit-autofill:hover,
          textarea:-webkit-autofill:focus {
            -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
            box-shadow: 0 0 0 1000px transparent inset !important;
            background-color: transparent !important;
            -webkit-text-fill-color: currentColor !important;
            caret-color: currentColor !important;
          }
        `;
        fieldShadowRoot.appendChild(style);
      }

      if (nativeInput) {
        nativeInput.autocomplete = 'off';
        nativeInput.name = `query-filter-no-suggest-${index}`;
        nativeInput.autocapitalize = 'off';
        nativeInput.spellcheck = false;
        nativeInput.style.setProperty('background-color', 'transparent', 'important');
        nativeInput.style.setProperty('box-shadow', '0 0 0 1000px transparent inset', 'important');
        nativeInput.style.setProperty('-webkit-box-shadow', '0 0 0 1000px transparent inset', 'important');
        nativeInput.style.setProperty('-webkit-text-fill-color', 'currentColor', 'important');
        nativeInput.style.setProperty('caret-color', 'currentColor', 'important');
        nativeInput.setAttribute('autocorrect', 'off');
        nativeInput.setAttribute('autocomplete', 'off');
        nativeInput.setAttribute('data-lpignore', 'true');
        nativeInput.setAttribute('data-1p-ignore', 'true');
        nativeInput.setAttribute('data-form-type', 'other');
        nativeInput.setAttribute('list', '');
        nativeInput.setAttribute('aria-autocomplete', 'none');

        const reapplyOnInteraction = (): void => this.applyNoSuggestionsToQueryInputs(dialogElement);
        if (nativeInput.getAttribute('data-no-suggest-bound') !== 'true') {
          nativeInput.addEventListener('focus', reapplyOnInteraction);
          nativeInput.addEventListener('pointerdown', reapplyOnInteraction);
          nativeInput.setAttribute('data-no-suggest-bound', 'true');
        }
      }
    });
  }

  /** Re-applies scrollbar suppression when query rows are added/updated after dialog open. */
  private observeSystemFilterDialogMutations(): void {
    if (this.systemFilterDialogObserver) {
      return;
    }

    const dialogElement = this.systemFilterDialogElementRef().nativeElement as HTMLElement & {
      shadowRoot?: ShadowRoot | null;
    };
    const shadowRoot = dialogElement.shadowRoot;

    if (!shadowRoot) {
      return;
    }

    this.systemFilterDialogObserver = new MutationObserver(() => {
      this.ensureSystemFilterDialogBodyStyles();
    });

    this.systemFilterDialogObserver.observe(dialogElement, {
      childList: true,
      subtree: true,
    });

    this.systemFilterDialogObserver.observe(shadowRoot, {
      childList: true,
      subtree: true,
    });
  }

  /** Opens the product family selection dialog with current selections pre-applied. */
  protected openProductFamilyDialog(): void {
    if (!this.isPartNumberSelectionEnabled()) {
      return;
    }

    this.pendingFamilySelection = [...this.selectedProductFamilies()];
    this.productFamilyTableData$.next([...this.allProductFamilyRecords]);
    void this.productFamilyDialogRef().show();
    requestAnimationFrame(() => {
      void this.productFamilyTableRef()?.setSelectedRecordIds(this.pendingFamilySelection);
    });
  }
  /**
   * Parses a Dynamic LINQ filter into condition groups. Top-level tokens are split on `&&`/`||`
   * (respecting quotes and parentheses); each junction keeps its And/Or operator. Parenthesized
   * tokens become their own group, while consecutive bare conditions collapse into one group so a
   * plain `a && b` round-trips as a single group with two AND-joined rows.
   */
  private parseSystemFilter(filterExpression: string): ISystemFilterGroup[] {
    const expression = filterExpression.trim();
    if (!expression) {
      return [{ logicalOperator: 'AND', conditions: [this.createEmptyCondition()] }];
    }

    const groups: ISystemFilterGroup[] = [];
    let bareGroup: ISystemFilterGroup | null = null;

    for (const token of this.tokenizeTopLevel(expression)) {
      const operator: 'AND' | 'OR' = token.op === '||' ? 'OR' : 'AND';
      const stripped = this.stripOuterParentheses(token.text);
      const isGroup =
        stripped !== token.text && token.text.startsWith('(') && !this.parseCompoundClause(token.text);

      if (isGroup) {
        bareGroup = null;
        const conditions = this.tokenizeTopLevel(stripped).map((inner, index) => ({
          ...this.parseFilterClause(inner.text),
          logicalOperator: index === 0 ? 'AND' : inner.op === '||' ? 'OR' : 'AND',
        })) as ISystemFilterCondition[];

        if (conditions.length > 0) {
          groups.push({ logicalOperator: operator, conditions });
        }
        continue;
      }

      const condition: ISystemFilterCondition = { ...this.parseFilterClause(token.text), logicalOperator: operator };
      if (bareGroup) {
        bareGroup.conditions.push(condition);
      } else {
        bareGroup = { logicalOperator: operator, conditions: [{ ...condition, logicalOperator: 'AND' }] };
        groups.push(bareGroup);
      }
    }

    return groups.length > 0 ? groups : [{ logicalOperator: 'AND', conditions: [this.createEmptyCondition()] }];
  }

  /**
   * Splits an expression into top-level tokens, tracking the `&&`/`||` operator that precedes each
   * token. Operators inside quotes or parentheses are ignored. The first token's operator is `null`.
   */
  private tokenizeTopLevel(expression: string): { text: string; op: '&&' | '||' | null }[] {
    const tokens: { text: string; op: '&&' | '||' | null }[] = [];
    let depth = 0;
    let inQuote = false;
    let current = '';
    let pendingOp: '&&' | '||' | null = null;

    for (let i = 0; i < expression.length; i += 1) {
      const char = expression[i];

      if (inQuote && char === '\\') {
        current += char + (expression[i + 1] ?? '');
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuote = !inQuote;
        current += char;
        continue;
      }

      if (!inQuote) {
        if (char === '(') {
          depth += 1;
        } else if (char === ')') {
          depth = Math.max(0, depth - 1);
        } else if (depth === 0 && (char === '&' || char === '|') && expression[i + 1] === char) {
          if (current.trim().length > 0) {
            tokens.push({ text: current.trim(), op: pendingOp });
          }
          pendingOp = char === '&' ? '&&' : '||';
          current = '';
          i += 1;
          continue;
        } else if (depth === 0 && /\s/.test(char)) {
          // Dynamic LINQ also accepts word operators (`a AND b`), which SystemLink itself saves.
          const wordOp = /^\s+(and|or)\s+/i.exec(expression.slice(i));
          if (wordOp) {
            if (current.trim().length > 0) {
              tokens.push({ text: current.trim(), op: pendingOp });
            }
            pendingOp = wordOp[1].toLowerCase() === 'and' ? '&&' : '||';
            current = '';
            i += wordOp[0].length - 1;
            continue;
          }
        }
      }

      current += char;
    }

    if (current.trim().length > 0) {
      tokens.push({ text: current.trim(), op: pendingOp });
    }

    return tokens;
  }

  /** Removes a single balanced pair of outer parentheses wrapping the whole expression. */
  private stripOuterParentheses(expression: string): string {
    let result = expression.trim();
    while (result.startsWith('(') && result.endsWith(')')) {
      let depth = 0;
      let wrapsWhole = true;
      let inQuote = false;
      for (let i = 0; i < result.length; i += 1) {
        if (inQuote) {
          if (result[i] === '\\') {
            i += 1;
          } else if (result[i] === '"') {
            inQuote = false;
          }
          continue;
        }
        if (result[i] === '"') {
          inQuote = true;
        } else if (result[i] === '(') {
          depth += 1;
        } else if (result[i] === ')') {
          depth -= 1;
          if (depth === 0 && i < result.length - 1) {
            wrapsWhole = false;
            break;
          }
        }
      }

      if (!wrapsWhole) {
        break;
      }

      result = result.slice(1, -1).trim();
    }

    return result;
  }

  /** Parses a single LINQ clause into a condition row (without a junction operator). */
  private parseFilterClause(clause: string): Omit<ISystemFilterCondition, 'logicalOperator'> {
    const compound = this.parseCompoundClause(clause);
    if (compound) {
      return compound;
    }

    let expression = clause.trim();
    let negated = false;
    if (expression.startsWith('!')) {
      negated = true;
      expression = this.stripOuterParentheses(expression.slice(1).trim());
    }

    // Has key / does not have key: field.ContainsKey("key").
    const containsKeyMatch = expression.match(/^(.*?)\.ContainsKey\("(.*)"\)$/i);
    if (containsKeyMatch) {
      return {
        property: this.normalizeFilterPath((containsKeyMatch[1] ?? '').trim()),
        propertyName: this.unescapeLinqString(containsKeyMatch[2] ?? ''),
        operator: negated ? FilterOperation.NotContainsKey : FilterOperation.ContainsKey,
        value: '',
      };
    }

    // Is empty / Is not empty: string.IsNullOrEmpty(field).
    const emptyMatch = expression.match(/^string\.IsNullOrEmpty\((.*)\)$/i);
    if (emptyMatch) {
      const { path, propertyName } = this.splitPropertyPath((emptyMatch[1] ?? '').trim());
      return {
        property: this.normalizeFilterPath(path),
        propertyName,
        operator: negated ? FilterOperation.IsNotEmpty : FilterOperation.IsEmpty,
        value: '',
      };
    }

    // Date comparison: DateTime(field) <op> DateTime.parse("value").
    const dateMatch = expression.match(/^DateTime\((.*?)\)\s*(>=|<=|>|<)\s*DateTime\.parse\("(.*)"\)$/i);
    if (dateMatch) {
      const { path, propertyName } = this.splitPropertyPath((dateMatch[1] ?? '').trim());
      const rawOperator = dateMatch[2];
      const operator =
        rawOperator === '>'
          ? FilterOperation.IsAfter
          : rawOperator === '>='
            ? FilterOperation.IsOnOrAfter
            : rawOperator === '<'
              ? FilterOperation.IsBefore
              : FilterOperation.IsOnOrBefore;
      return {
        property: this.normalizeFilterPath(path),
        propertyName,
        operator,
        value: this.unescapeLinqString(dateMatch[3] ?? ''),
      };
    }

    // SystemLink keyword filter: field.Any(element => element.Contains("value")).
    const anyMatch = expression.match(/^(.*?)\.Any\(\s*(\w+)\s*=>\s*\2\.Contains\("(.*)"\)\s*\)$/i);
    if (anyMatch) {
      return {
        property: this.normalizeFilterPath((anyMatch[1] ?? '').trim()),
        propertyName: undefined,
        operator: negated ? FilterOperation.NotContains : FilterOperation.Contains,
        value: this.unescapeLinqString(anyMatch[3] ?? ''),
      };
    }

    // Contains (string or key/value): field.Contains("value") or field["key"].Contains("value").
    const containsMatch = expression.match(/^(.*?)\.Contains\("(.*)"\)$/i);
    if (containsMatch) {
      const { path, propertyName } = this.splitPropertyPath((containsMatch[1] ?? '').trim());
      const isProperty = propertyName !== undefined;
      const operator = isProperty
        ? negated
          ? FilterOperation.KeyValueNotContains
          : FilterOperation.KeyValueContains
        : negated
          ? FilterOperation.NotContains
          : FilterOperation.Contains;
      return {
        property: this.normalizeFilterPath(path),
        propertyName,
        operator,
        value: this.unescapeLinqString(containsMatch[2] ?? ''),
      };
    }

    // Starts with.
    const startsMatch = expression.match(/^(.*?)\.StartsWith\("(.*)"\)$/i);
    if (startsMatch) {
      const { path, propertyName } = this.splitPropertyPath((startsMatch[1] ?? '').trim());
      return {
        property: this.normalizeFilterPath(path),
        propertyName,
        operator: FilterOperation.StartsWith,
        value: this.unescapeLinqString(startsMatch[2] ?? ''),
      };
    }

    // Binary comparison.
    const match = expression.match(/^(.*?)\s*(==|!=|>=|<=|=|>|<)\s*(.*)$/);
    if (!match) {
      return { property: this.normalizeFilterPath(expression), propertyName: undefined, operator: DEFAULT_FILTER_OPERATION, value: '' };
    }

    const rawProperty = (match[1] ?? '').trim();
    const { path: extractedPath, propertyName } = this.splitPropertyPath(rawProperty);
    const isProperty = propertyName !== undefined;
    const normalizedProperty = this.normalizeFilterPath(extractedPath);
    const rawOperator = (match[2] ?? '=').trim();
    const rawValue = (match[3] ?? '').trim();
    const isQuoted = /^".*"$/.test(rawValue);
    const parsedValue = isQuoted ? this.unescapeLinqString(rawValue.slice(1, -1)) : rawValue;
    // Older saves used `workspaceName = "<name>"`, which nisysmgmt/niapm reject; map back to the ID.
    const value =
      extractedPath === 'workspaceName'
        ? this.workspaceIdByName()[parsedValue] ?? parsedValue
        : parsedValue;

    return {
      property: normalizedProperty,
      propertyName,
      operator: this.inferComparisonOperation(rawOperator, isProperty, isQuoted),
      value,
    };
  }

  /** Recognizes SystemLink's compound package-version and asset-location expressions as one row. */
  private parseCompoundClause(clause: string): Omit<ISystemFilterCondition, 'logicalOperator'> | null {
    const expression = this.stripOuterParentheses(clause);
    const row = (property: string, operator: FilterOperation, value = '', propertyName?: string) => ({
      property,
      propertyName,
      operator,
      value,
    });

    if (expression === ASSET_LOCATION_BLANK) {
      return row('Location', FilterOperation.IsEmpty);
    }
    if (expression === ASSET_LOCATION_NOT_BLANK) {
      return row('Location', FilterOperation.IsNotEmpty);
    }
    const locationEquals = ASSET_LOCATION_EQUALS.exec(expression);
    if (locationEquals) {
      return row('Location', FilterOperation.Equals, this.unescapeLinqString(locationEquals[1]));
    }
    const locationNotEquals = ASSET_LOCATION_NOT_EQUALS.exec(expression);
    if (locationNotEquals) {
      return row('Location', FilterOperation.NotEquals, this.unescapeLinqString(locationNotEquals[1]));
    }
    const packageVersion = PACKAGE_VERSION.exec(expression);
    if (packageVersion) {
      const operator = (Object.keys(PACKAGE_VERSION_COMPARATORS) as FilterOperation[]).find(
        (operation) => PACKAGE_VERSION_COMPARATORS[operation] === packageVersion[2],
      );
      return operator
        ? row('packages', operator, this.unescapeLinqString(packageVersion[3]), this.unescapeLinqString(packageVersion[1]))
        : null;
    }
    return null;
  }

  /** Normalizes a stored filter path to the field path used by the current field catalog. */
  private normalizeFilterPath(path: string): string {
    if (path === 'workspaceName') {
      return 'workspace';
    }
    // Earlier versions saved system properties as `properties["k"]`, which nisysmgmt rejects.
    if (path === 'properties' && this.activeFilterControl === 'systemFilter') {
      return 'properties.data';
    }
    // Earlier versions saved the asset Location as a physical-location-only comparison.
    if (path === 'Location.PhysicalLocation' && this.activeFilterControl !== 'systemFilter') {
      return 'Location';
    }
    return path;
  }

  /** Reverses {@link escapeLinqString} for a value read back from a LINQ string literal. */
  private unescapeLinqString(value: string): string {
    return value.replace(/\\(["\\])/g, '$1');
  }

  /** Maps a Dynamic LINQ comparison operator back to the matching query-builder operation. */
  private inferComparisonOperation(rawOperator: string, isProperty: boolean, isQuoted: boolean): FilterOperation {
    switch (rawOperator) {
      case '!=':
        return isProperty ? FilterOperation.KeyValueNotMatches : FilterOperation.NotEquals;
      case '>':
        return isQuoted ? FilterOperation.IsAfter : FilterOperation.GreaterThan;
      case '>=':
        return isQuoted ? FilterOperation.IsOnOrAfter : FilterOperation.GreaterThanOrEqual;
      case '<':
        return isQuoted ? FilterOperation.IsBefore : FilterOperation.LessThan;
      case '<=':
        return isQuoted ? FilterOperation.IsOnOrBefore : FilterOperation.LessThanOrEqual;
      case '=':
      case '==':
      default:
        return isProperty ? FilterOperation.KeyValueMatches : FilterOperation.Equals;
    }
  }

  /**
   * Splits a property accessor such as `properties.data["Lab"]` into its base path (`properties.data`)
   * and the bracketed key name (`Lab`). Returns the original path unchanged when there is no key.
   */
  private splitPropertyPath(rawPath: string): { path: string; propertyName?: string } {
    const match = rawPath.match(/^(.*)\["(.*)"\]$/);
    if (match) {
      return {
        path: (match[1] ?? rawPath).trim(),
        propertyName: this.unescapeLinqString(match[2] ?? ''),
      };
    }

    return { path: rawPath };
  }

  /** Tracks product family selection changes within the dialog. */
  protected onProductFamilySelection(event: Event): void {
    const detail = (event as CustomEvent).detail as {
      selectedRecordIds: string[];
    };
    const visibleIds = new Set(
      this.productFamilyTableData$.getValue().map((record) => record['id'] as string),
    );
    this.pendingFamilySelection = [
      ...this.pendingFamilySelection.filter((id) => !visibleIds.has(id)),
      ...detail.selectedRecordIds,
    ];
  }

  /** Confirms product family selection, updates form and chip display. */
  protected confirmProductFamilySelection(): void {
    const families = [...this.pendingFamilySelection];
    this.selectedProductFamilies.set(families);
    this.form.controls.templateDetails.controls.productFamilies.markAsDirty();
    this.form.controls.templateDetails.controls.productFamilies.setValue(families);
    this.clearProductFamilySearch();
    this.productFamilyDialogRef().close(undefined);
  }

  /** Cancels product family selection dialog. */
  protected cancelProductFamilyDialog(): void {
    this.clearProductFamilySearch();
    this.productFamilyDialogRef().close(undefined);
  }

  /** Filters the product family dialog table based on search text. */
  protected onProductFamilySearchInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value.toLowerCase();
    const filtered = text
      ? this.allProductFamilyRecords.filter((record) =>
          String(record['name']).toLowerCase().includes(text),
        )
      : [...this.allProductFamilyRecords];
    this.productFamilyTableData$.next(filtered);
    requestAnimationFrame(() => {
      const visibleIds = new Set(filtered.map((record) => record['id'] as string));
      const toSelect = this.pendingFamilySelection.filter((id) => visibleIds.has(id));
      void this.productFamilyTableRef()?.setSelectedRecordIds(toSelect);
    });
  }

  /** Removes a product family chip and updates the form. */
  protected removeProductFamily(family: string): void {
    const updated = this.selectedProductFamilies().filter((item) => item !== family);
    this.selectedProductFamilies.set(updated);
    this.form.controls.templateDetails.controls.productFamilies.markAsDirty();
    this.form.controls.templateDetails.controls.productFamilies.setValue(updated);
  }

  /** Fetches products for all selected families and opens the product selection dialog. If no families are selected, fetches all products in the workspace. */
  protected openProductDialog(): void {
    if (!this.isPartNumberSelectionEnabled()) {
      return;
    }

    const families = this.selectedProductFamilies();
    const workspaceId = this.form.controls.templateDetails.controls.workspace.value;
    const fetch$ =
      !workspaceId
        ? of<IProduct[]>([])
        : families.length === 0
          ? this.productService.queryProductsByWorkspace(workspaceId)
          : forkJoin(
              families.map((family) => this.productService.queryProductsByFamily(family, workspaceId)),
            ).pipe(map((arrays) => arrays.flat()));

    fetch$.pipe(take(1), takeUntil(this.destroy$)).subscribe(
      (products) => {
        this.allProductRecords = products
          .map((product) => ({
            id: product.partNumber,
            name: product.name ?? product.partNumber,
            partNumber: product.partNumber,
          }))
          .sort((a, b) =>
            String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true }),
          );
        this.productTableData$.next(this.allProductRecords);
        this.changeDetector.detectChanges();
        this.pendingProductSelection = this.selectedProducts().map((product) => product.partNumber);
        void this.productDialogRef().show();
        requestAnimationFrame(() => {
          void this.productTableRef()?.setSelectedRecordIds(this.pendingProductSelection);
        });
      },
      (error) => {
        console.error('Error fetching products:', error);
      },
    );
  }

  /** Tracks product selection changes within the dialog. */
  protected onProductSelection(event: Event): void {
    const detail = (event as CustomEvent).detail as { selectedRecordIds: string[] };
    const visibleIds = new Set(
      this.productTableData$.getValue().map((record) => record['id'] as string),
    );
    this.pendingProductSelection = [
      ...this.pendingProductSelection.filter((id) => !visibleIds.has(id)),
      ...detail.selectedRecordIds,
    ];
  }

  /** Confirms product selection, updates form and chip display. */
  protected confirmProductSelection(): void {
    const selectedIds = new Set(this.pendingProductSelection);
    const products: ISelectedProduct[] = this.allProductRecords
      .filter((record) => selectedIds.has(record['id'] as string))
      .map((record) => ({
        partNumber: record['id'] as string,
        displayName: `${record['name']} [${record['partNumber']}]`,
      }));

    this.selectedProducts.set(products);
    this.form.controls.templateDetails.controls.partNumbers.markAsDirty();
    this.form.controls.templateDetails.controls.partNumbers.setValue(
      products.map((product) => product.partNumber),
    );
    this.clearProductSearch();
    this.productDialogRef().close(undefined);
  }

  /** Cancels product selection dialog. */
  protected cancelProductDialog(): void {
    this.clearProductSearch();
    this.productDialogRef().close(undefined);
  }

  /** Removes a product chip and updates the form. */
  protected removeProduct(partNumber: string): void {
    const updated = this.selectedProducts().filter((product) => product.partNumber !== partNumber);
    this.selectedProducts.set(updated);
    this.form.controls.templateDetails.controls.partNumbers.markAsDirty();
    this.form.controls.templateDetails.controls.partNumbers.setValue(
      updated.map((product) => product.partNumber),
    );
  }

  /** Filters the product dialog table based on search text and preserves selections. */
  protected onProductSearchInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value.toLowerCase();
    const filtered = text
      ? this.allProductRecords.filter(
          (record) =>
            String(record['name']).toLowerCase().includes(text) ||
            String(record['partNumber']).toLowerCase().includes(text),
        )
      : [...this.allProductRecords];
    this.productTableData$.next(filtered);
    requestAnimationFrame(() => {
      const visibleIds = new Set(filtered.map((record) => record['id'] as string));
      const toSelect = this.pendingProductSelection.filter((id) => visibleIds.has(id));
      void this.productTableRef()?.setSelectedRecordIds(toSelect);
    });
  }

  /** Handles the dragover event on the upload zone to enable drop. */
  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  /** Handles the dragleave event on the upload zone. */
  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  /** Handles a file being dropped onto the upload zone. */
  protected onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.validateAndSetFiles(Array.from(files));
    }
  }

  /** Handles file selection from the native file input. */
  protected onFileSelected(event: Event): void {
    this.isFilePickerActive = false;
    document.removeEventListener('keydown', this.onDocumentKeydownCapture, true);
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.validateAndSetFiles(Array.from(files));
    }
    input.value = '';
  }

  /** Removes one selected file from the staged file list. */
  protected removeSelectedFile(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
    this.fileChanged.set(true);
  }

  protected isSelectedFileUploaded(file: IStagedFileUpload): boolean {
    return file.status === 'uploaded';
  }

  protected isSelectedFileUploading(file: IStagedFileUpload): boolean {
    return file.status === 'uploading';
  }

  protected selectedFileStateText(file: IStagedFileUpload): string {
    if (file.status === 'uploaded') {
      return $localize`Uploaded`;
    }
    if (file.status === 'uploading') {
      return $localize`Uploading`;
    }
    return file.errorMessage ? $localize`Failed: ${file.errorMessage}:errorMessage:` : $localize`Failed`;
  }

  /** Removes one existing stored file metadata row. */
  protected removeExistingFile(index: number): void {
    this.existingFiles.update((files) => files.filter((_, i) => i !== index));
    this.fileChanged.set(true);
  }

  /** Opens the native file picker by clicking the hidden file input. */
  protected onBrowseFiles(): void {
    this.isFilePickerActive = true;
    document.addEventListener('keydown', this.onDocumentKeydownCapture, true);
    window.removeEventListener('focus', this.onWindowFocusAfterFilePicker);
    window.addEventListener('focus', this.onWindowFocusAfterFilePicker, { once: true });
    this.fileInputRef()?.nativeElement.click();
  }

  /**
   * Formats a file size in bytes to a human-readable string.
   * @param bytes - The file size in bytes.
   */
  protected formatFileSize(bytes: number): string {
    return formatByteSize(bytes, this.locale);
  }

  /** Switches the visible section when a top tab is selected. */
  protected onStepTabClick(step: CreateEditFormStep): void {
    this.currentStep.set(step);
    this.syncActiveTab(step);
  }

  /** Closes the drawer without saving any changes. */
  protected onCancel(): void {
    this.panelSession += 1;
    this.resetToConfigurationStep();
    this.drawerDirective().close(undefined);
  }

  /** Validates all steps and dispatches create or update. */
  protected onSave(): void {
    if (this.isSaving()) {
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.controls.templateDetails.invalid) {
      const step = this.detailsStepValid()
        ? CreateEditFormStep.Filter
        : CreateEditFormStep.TemplateDetails;
      this.currentStep.set(step);
      this.syncActiveTab(step);
      return;
    }

    if (this.hasPendingUploads()) {
      return;
    }

    if (!this.areDynamicFormFieldsValid()) {
      this.showDynamicFormValidation.set(true);
      const firstInvalidView = this.dynamicFormViews().find((view) =>
        view.groups.some((group) =>
          group.fields.some(
            (field) => field.mandatory && this.getDynamicFieldValue(field).trim().length === 0,
          ),
        ),
      );
      if (firstInvalidView) {
        this.activeDynamicViewKey.set(firstInvalidView.key);
        this.currentStep.set(CreateEditFormStep.DynamicForm);
        this.syncActiveTab(CreateEditFormStep.DynamicForm);
        this.scheduleDynamicSelectSync();
      }
      return;
    }

    this.isSaving.set(true);
    const session = this.panelSession;

    const onSaveSuccess = (): void => {
      if (session === this.panelSession) {
        this.drawerDirective().close(undefined);
      }
    };

    const saveOperators = [
      takeUntil(this.destroy$),
      finalize(() => {
        if (session === this.panelSession) {
          this.isSaving.set(false);
        }
      }),
    ] as const;

    const uploadedFileIds = this.selectedFiles()
      .filter((file) => file.status === 'uploaded' && !!file.uploadedFileId)
      .map((file) => file.uploadedFileId as string);

    const save$: Observable<unknown> = this.isEditMode() && this.templateToEdit
      ? this.templateService.updateTemplate(this.buildUpdateRequest(uploadedFileIds))
      : this.templateService.createTemplate(this.buildCreateRequest(uploadedFileIds));

    save$.pipe(
      ...saveOperators,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
    ).subscribe({ next: onSaveSuccess, error: () => {} });
  }

  private loadDynamicFormViews(context: {
    workspaceId: string;
    templateName: string;
    templateType: string;
    productFamilies: string[];
  }): void {
    const loadId = ++this.dynamicFormLoadId;
    const ruleContext: IDynamicFormTemplateContext = {
      workspaceId: context.workspaceId,
      name: context.templateName,
      type: context.templateType,
      templateId: this.templateToEdit?.id,
      productFamilies: context.productFamilies,
      partNumbers: this.form.controls.templateDetails.controls.partNumbers.value ?? [],
      properties: this.getCurrentTemplateProperties(),
    };

    this.dynamicFormFieldsService
      .resolveViewsForTemplate(ruleContext)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((views) => {
        if (loadId !== this.dynamicFormLoadId) {
          return;
        }
        this.dynamicFormRuleContext.set({
          ...ruleContext,
          properties: { ...(this.templateToEdit?.properties ?? {}) },
        });
        this.applyDynamicFormViews(views);
      });
  }

  /** Merges persisted template properties with in-progress dynamic field edits for rule evaluation. */
  private getCurrentTemplateProperties(): Record<string, unknown> {
    return { ...(this.templateToEdit?.properties ?? {}), ...this.dynamicFieldValues() };
  }

  private applyDynamicFormViews(views: IResolvedDynamicView[]): void {
    const existingProperties = this.templateToEdit?.properties ?? {};
    const previousValues = this.dynamicFieldValues();
    const values: Record<string, string> = {};
    const initial: Record<string, string> = {};

    for (const view of views) {
      for (const group of view.groups) {
        for (const field of group.fields) {
          const persisted = existingProperties[field.key];
          const persistedValue =
            persisted === undefined || persisted === null ? undefined : String(persisted);
          const initialValue = persistedValue ?? field.defaultValue ?? '';

          initial[field.key] = initialValue;
          // Preserve any value the user already typed this session; else seed from template/default.
          values[field.key] = previousValues[field.key] ?? initialValue;
        }
      }
    }

    this.dynamicFormInitialValues = initial;
    this.dynamicFieldValues.set(values);
    this.allDynamicFormViews.set(views);
    this.pruneCustomPropertiesOfDynamicKeys();
    this.ensureActiveDynamicViewVisible();

    this.dynamicFormDirty.set(false);
    this.dynamicFormFieldsValid.set(this.areDynamicFormFieldsValid());

    // If the user is already viewing a dynamic form tab, refresh select values to reflect defaults.
    if (this.currentStep() === CreateEditFormStep.DynamicForm) {
      this.scheduleDynamicSelectSync();
    }
  }

  private clearDynamicFormViews(): void {
    this.dynamicFormLoadId += 1;
    this.dynamicFormInitialValues = {};
    this.dynamicFieldValues.set({});
    this.allDynamicFormViews.set([]);
    this.dynamicFormRuleContext.set(null);
    this.activeDynamicViewKey.set('');
    this.dynamicFormDirty.set(false);
    this.dynamicFormFieldsValid.set(true);
    this.showDynamicFormValidation.set(false);
    if (this.currentStep() === CreateEditFormStep.DynamicForm) {
      this.currentStep.set(CreateEditFormStep.TemplateDetails);
      this.syncActiveTab(CreateEditFormStep.TemplateDetails);
    }
  }

  private syncDynamicFormState(): void {
    const values = this.dynamicFieldValues();
    const isDirty = Object.keys({ ...this.dynamicFormInitialValues, ...values }).some(
      (key) => (values[key] ?? '') !== (this.dynamicFormInitialValues[key] ?? ''),
    );

    this.dynamicFormDirty.set(isDirty);
    this.dynamicFormFieldsValid.set(this.areDynamicFormFieldsValid());
  }

  private areDynamicFormFieldsValid(): boolean {
    const values = this.dynamicFieldValues();
    return this.dynamicFormViews().every((view) =>
      view.groups.every((group) =>
        group.fields.every(
          (field) => !field.mandatory || (values[field.key] ?? '').trim().length > 0,
        ),
      ),
    );
  }

  /** Keeps the active dynamic view tab valid after views are (re)resolved or hidden by rules. */
  private ensureActiveDynamicViewVisible(): void {
    const views = this.dynamicFormViews();
    if (views.some((view) => view.key === this.activeDynamicViewKey())) {
      return;
    }

    if (views.length > 0) {
      this.activeDynamicViewKey.set(views[0].key);
      if (this.currentStep() === CreateEditFormStep.DynamicForm) {
        this.syncActiveTab(CreateEditFormStep.DynamicForm);
      }
      return;
    }

    this.activeDynamicViewKey.set('');
    if (this.currentStep() === CreateEditFormStep.DynamicForm) {
      this.currentStep.set(CreateEditFormStep.TemplateDetails);
      this.syncActiveTab(CreateEditFormStep.TemplateDetails);
    }
  }

  /** Flattened list of dynamic fields in the given views (defaults to the visible views). */
  private getDynamicFieldList(
    views: IResolvedDynamicView[] = this.dynamicFormViews(),
  ): IResolvedDynamicField[] {
    return views.flatMap((view) => view.groups.flatMap((group) => group.fields));
  }

  /** All dynamic field keys (including hidden ones), used to hide them from the custom properties list. */
  private getDynamicFieldKeys(): Set<string> {
    return new Set(this.getDynamicFieldList(this.allDynamicFormViews()).map((field) => field.key));
  }

  /** Removes any custom-property rows whose key is managed by a dynamic form field. */
  private pruneCustomPropertiesOfDynamicKeys(): void {
    const dynamicKeys = this.getDynamicFieldKeys();
    if (dynamicKeys.size === 0) {
      return;
    }

    for (let index = this.customProperties.length - 1; index >= 0; index -= 1) {
      const key = this.customProperties.at(index).controls.key.value;
      if (dynamicKeys.has(key)) {
        this.customProperties.removeAt(index);
      }
    }
  }

  private clearProductFamilySearch(): void {
    const el = this.productFamilySearchRef()?.nativeElement as HTMLElement & { value?: string };
    if (el) {
      el.value = '';
    }
    this.productFamilyTableData$.next([...this.allProductFamilyRecords]);
  }

  private clearProductSearch(): void {
    const el = this.productSearchRef()?.nativeElement as HTMLElement & { value?: string };
    if (el) {
      el.value = '';
    }
    this.productTableData$.next([...this.allProductRecords]);
  }

  /** Handles workspace changes and refreshes all workspace-scoped option lists. */
  private handleWorkspaceChange(workspaceId: string, clearSelections: boolean): void {
    if (this.suppressWorkspaceCascade) {
      return;
    }

    if (clearSelections) {
      this.clearWorkspaceDependentSelections();
    }

    if (!workspaceId) {
      this.allProductFamilyRecords = [];
      this.productFamilyTableData$.next([]);
      return;
    }

    this.productService
      .queryProductFamiliesByWorkspace(workspaceId)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((families) => {
        this.allProductFamilyRecords = families.map((family) => ({ id: family, name: family }));
        this.productFamilyTableData$.next([...this.allProductFamilyRecords]);

        if (clearSelections) {
          return;
        }

        const availableFamilies = new Set(families);
        const retainedFamilies = this.selectedProductFamilies().filter((family) =>
          availableFamilies.has(family),
        );

        if (retainedFamilies.length !== this.selectedProductFamilies().length) {
          this.selectedProductFamilies.set(retainedFamilies);
          this.form.controls.templateDetails.controls.productFamilies.setValue(retainedFamilies);
          this.selectedProducts.set([]);
          this.form.controls.templateDetails.controls.partNumbers.setValue([]);
        }
      });
  }

  /** Clears selections for controls that depend on workspace. */
  private clearWorkspaceDependentSelections(): void {
    this.selectedProductFamilies.set([]);
    this.form.controls.templateDetails.controls.productFamilies.setValue([], { emitEvent: false });
    this.pendingFamilySelection = [];

    this.selectedProducts.set([]);
    this.form.controls.templateDetails.controls.partNumbers.setValue([], { emitEvent: false });
    this.pendingProductSelection = [];
    this.allProductRecords = [];
    this.productTableData$.next([]);

    this.form.controls.templateDetails.controls.workflowId.setValue('', { emitEvent: false });
  }

  /** Clears dynamic FormArrays, file state, and resets all controls to their initial empty state. */
  private resetForm(): void {
    this.suppressWorkspaceCascade = true;
    this.dashboardParameters.clear();
    this.globalParameters.clear();
    this.customProperties.clear();
    this.form.reset();
    this.selectedFiles.set([]);
    this.fileError.set(null);
    this.isDragOver.set(false);
    this.fileChanged.set(false);
    this.existingFiles.set([]);
    this.lastAutofillSourceKey = null;
    this.isParsingFile.set(false);
    this.selectedProductFamilies.set([]);
    this.selectedProducts.set([]);
    this.resetFilterDialogState();
    this.clearDynamicFormViews();
    this.clearWorkspaceDependentSelections();
    this.productFamilyTableData$.next([]);
    this.suppressWorkspaceCascade = false;
    this.syncTypeControlLock();
    this.syncFormSignals();
  }

  /**
   * Clears all query-builder state between slideout sessions so a newly selected template does not
   * reuse another template's in-progress filter draft, fields, or validation flags.
   */
  private resetFilterDialogState(): void {
    this.queryDraftByFilter.clear();
    this.systemFilterGroups.set([]);
    this.activeFilterFields.set([]);
    this.showSystemFilterValidation.set(false);
    this.activeFilterControl = 'systemFilter';
  }

  /**
   * Pre-populates the form with values from the template being edited.
   */
  private populateFormForEdit(template: IWorkitemTemplate): void {
    const session = this.panelSession;
    this.suppressWorkspaceCascade = true;
    this.form.patchValue({
      templateDetails: {
        name: template.name,
        type: (template.type ?? WorkItemType.Testplan) as WorkItemType,
        templateGroup: template.templateGroup ?? '',
        productFamilies: template.productFamilies ?? [],
        partNumbers: template.partNumbers ?? [],
        workspace: template.workspace ?? '',
        summary: template.summary ?? '',
        description: template.description ?? '',
        testProgram: template.testProgram ?? '',
        estimatedDurationInSeconds:
          template.timeline?.estimatedDurationInSeconds !== undefined &&
          template.timeline?.estimatedDurationInSeconds !== null
            ? String(template.timeline.estimatedDurationInSeconds)
            : '',
        systemFilter: template.resources?.systems?.filter ?? '',
        dutFilter: template.resources?.duts?.filter ?? '',
        fixturesFilter: template.resources?.fixtures?.filter ?? '',
        assetsFilter: template.resources?.assets?.filter ?? '',
        workflowId: template.workflowId ?? '',
        dashboard: {
          id: template.dashboard?.id ?? '',
        },
      },
      fileConfiguration: {
        testProgramFile: String(template.properties?.[FILE_PROPERTY_KEYS.testProgram] ?? ''),
        batteryFile: String(template.properties?.[FILE_PROPERTY_KEYS.batteryFile] ?? ''),
        mappingFile: String(template.properties?.[FILE_PROPERTY_KEYS.mappingFile] ?? ''),
      },
    });

    this.lastAutofillSourceKey = this.getAutofillSourceKey();
    this.rebuildDashboardParameters(template.dashboard);

    // Populate multi-select chip displays.
    this.selectedProductFamilies.set(template.productFamilies ?? []);
    const partNumbers = template.partNumbers ?? [];
    if (partNumbers.length > 0) {
      this.productService
        .fetchProductNameFromPartNumbers(partNumbers, template.workspace ?? '')
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe((nameMap) => {
          if (session !== this.panelSession) {
            return;
          }
          const workspaceNames = nameMap.get(template.workspace ?? '');
          this.selectedProducts.set(
            partNumbers.map((pn) => ({
              partNumber: pn,
              displayName: workspaceNames?.get(pn) ? `${workspaceNames.get(pn)} [${pn}]` : pn,
            })),
          );
        });
    }

    // Restore attached files from the template's native file IDs, then resolve each
    // file's name and size from the File Service for display.
    const attachedFileIds = (template.fileIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    this.existingFiles.set(
      attachedFileIds.map((id, index) => ({
        name: $localize`Attached file ${index + 1}:fileNumber:`,
        size: null,
        id,
      })),
    );
    if (attachedFileIds.length > 0) {
      this.fileService
        .getFilesByIds(attachedFileIds)
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe((metadata) => {
          if (session !== this.panelSession) {
            return;
          }
          const metadataById = new Map(metadata.map((file) => [file.id, file]));
          this.existingFiles.set(
            attachedFileIds.map((id, index) => {
              const file = metadataById.get(id);
              return {
                name: file?.name || $localize`Attached file ${index + 1}:fileNumber:`,
                size: file ? this.formatFileSize(file.size) : null,
                id,
              };
            }),
          );
        });
    }

    this.rebuildCustomProperties(template.properties);

    this.suppressWorkspaceCascade = false;
    this.handleWorkspaceChange(template.workspace ?? '', false);

    this.syncFormSignals();
  }

  /** Synchronizes form validity and dirty signals with the current reactive form state. */
  private syncFormSignals(): void {
    this.templateDetailsValid.set(this.form.controls.templateDetails.valid);
    this.detailsStepValid.set(
      Object.entries(this.form.controls.templateDetails.controls).every(
        ([name, control]) =>
          FILTER_CONTROL_NAMES.includes(name as FilterControlName) || control.valid || control.disabled,
      ),
    );
    this.fileConfigValid.set(this.form.controls.fileConfiguration.valid);
    this.formDirty.set(this.form.dirty);
  }

  /** Resets visible drawer navigation to the first tab/section. */
  private resetToConfigurationStep(): void {
    this.currentStep.set(CreateEditFormStep.TemplateDetails);
    this.syncActiveTab(CreateEditFormStep.TemplateDetails);
  }

  /** Keeps Nimble's internal active tab id aligned with the current step. */
  private syncActiveTab(step: CreateEditFormStep): void {
    if (step === CreateEditFormStep.DynamicForm) {
      const activeView = this.dynamicFormViews().find(
        (view) => view.key === this.activeDynamicViewKey(),
      );
      if (activeView) {
        this.tabsDirective().activeid = this.getDynamicViewTabId(activeView);
        return;
      }
    }

    const tabIdByStep: Record<CreateEditFormStep, string> = {
      [CreateEditFormStep.TemplateDetails]: 'configuration-tab',
      [CreateEditFormStep.Filter]: 'filter-tab',
      [CreateEditFormStep.Dashboard]: 'dashboard-tab',
      [CreateEditFormStep.FileUpload]: 'file-upload-tab',
      [CreateEditFormStep.DynamicForm]: 'configuration-tab',
      [CreateEditFormStep.FileConfiguration]: 'properties-tab',
    };

    this.tabsDirective().activeid = tabIdByStep[step];
  }

  /** Keeps the Type control state aligned with mode to avoid UI-only disable regressions. */
  private syncTypeControlLock(): void {
    const typeControl = this.form.controls.templateDetails.controls.type;

    if (this.isEditMode()) {
      typeControl.disable({ emitEvent: false });
    } else {
      typeControl.enable({ emitEvent: false });
    }

    typeControl.updateValueAndValidity({ emitEvent: false });
  }

  /** Clears and rebuilds the dashboard parameters FormArray from the template's dashboard variables. */
  private rebuildDashboardParameters(dashboard?: IDashboardReferenceDefinition): void {
    this.dashboardParameters.clear();

    const variables = dashboard?.variables;
    if (!variables) {
      return;
    }

    for (const [key, value] of Object.entries(variables)) {
      this.dashboardParameters.push(this.createParameterFormGroup(key, value));
    }
  }

  /** Clears and rebuilds the custom properties FormArray from existing template properties,
   *  filtering out any keys reserved for file configuration. */
  private rebuildCustomProperties(properties?: Record<string, unknown> | null): void {
    this.customProperties.clear();

    if (!properties) {
      return;
    }

    const dynamicFieldKeys = this.getDynamicFieldKeys();
    for (const [key, value] of Object.entries(properties)) {
      if (this.isHiddenPropertyKey(key) || dynamicFieldKeys.has(key)) {
        continue;
      }
      this.customProperties.push(
        this.fb.group<ICustomPropertyFormGroup>({
          key: this.fb.nonNullable.control(key, Validators.required),
          value: this.fb.nonNullable.control(String(value ?? '')),
        }),
      );
    }
  }

  /** Whether a property key is reserved for file configuration or global parameters. */
  private isHiddenPropertyKey(key: string): boolean {
    return (
      (Object.values(FILE_PROPERTY_KEYS) as string[]).includes(key) ||
      key.startsWith(GLOBAL_PARAM_PREFIX)
    );
  }

  /** Builds a create request payload from the current form values. */
  private buildCreateRequest(uploadedFileIds: string[] = []): ICreateWorkitemTemplateRequest {
    return {
      ...this.buildCommonPayload(uploadedFileIds),
      type: this.form.controls.templateDetails.controls.type.value as WorkItemType,
    };
  }

  /** Builds an update request payload from the current form values. */
  private buildUpdateRequest(uploadedFileIds: string[] = []): IUpdateWorkitemTemplateRequest {
    return {
      ...this.buildCommonPayload(uploadedFileIds),
      id: this.templateToEdit!.id,
    };
  }

  /** Builds the shared payload fields common to both create and update requests. */
  private buildCommonPayload(uploadedFileIds: string[] = []): Omit<ICreateWorkitemTemplateRequest, 'type'> {
    const details = this.form.controls.templateDetails.getRawValue();
    const fileConfig = this.form.controls.fileConfiguration.getRawValue();
    const estimatedDurationInSeconds = this.parseEstimatedDurationInSeconds(
      details.estimatedDurationInSeconds,
    );

    return {
      name: details.name,
      templateGroup: details.templateGroup,
      productFamilies: details.productFamilies.length > 0 ? details.productFamilies : null,
      partNumbers: details.partNumbers.length > 0 ? details.partNumbers : null,
      summary: details.summary || null,
      description: details.description || null,
      testProgram: details.testProgram || null,
      workspace: details.workspace || null,
      workflowId: details.workflowId || null,
      fileIds: this.resolveFileIdsForRequest(uploadedFileIds),
      timeline:
        estimatedDurationInSeconds === undefined
          ? undefined
          : { estimatedDurationInSeconds },
      properties: this.buildPropertiesPayload(fileConfig),
      resources: this.buildResourcesPayload(details),
      dashboard: this.buildDashboardPayload(details),
    };
  }

  /** Maps file configuration values and file metadata to template custom properties. */
  private buildPropertiesPayload(
    fileConfig: ReturnType<FormGroup<IFileConfigurationForm>['getRawValue']>,
  ): Record<string, string> {
    const properties: Record<string, string> = {};

    // Carry over keys the editor does not show; updates replace the whole properties map.
    if (this.isEditMode()) {
      for (const [key, value] of Object.entries(this.templateToEdit?.properties ?? {})) {
        if (this.isHiddenPropertyKey(key) && value !== null && value !== undefined) {
          properties[key] = String(value);
        }
      }
    }

    if (fileConfig.testProgramFile) {
      properties[FILE_PROPERTY_KEYS.testProgram] = fileConfig.testProgramFile;
    }
    if (fileConfig.batteryFile) {
      properties[FILE_PROPERTY_KEYS.batteryFile] = fileConfig.batteryFile;
    }
    if (fileConfig.mappingFile) {
      properties[FILE_PROPERTY_KEYS.mappingFile] = fileConfig.mappingFile;
    }

    // Persist each global parameter value with type and unit encoded in the key.
    for (const param of fileConfig.globalParameters) {
      if (param.name) {
        const keyUnit = param.unit || '_';
        properties[`${GLOBAL_PARAM_PREFIX}${param.type}#${keyUnit}#${param.name}`] = param.value;
      }
    }

    // Persist dynamic form field values under their field key (== template property key).
    // Values of rule-hidden fields are kept unless the field opts out via retainWhenHidden.
    const dynamicValues = this.dynamicFieldValues();
    const visibleDynamicKeys = new Set(this.getDynamicFieldList().map((field) => field.key));
    for (const field of this.getDynamicFieldList(this.allDynamicFormViews())) {
      if (!visibleDynamicKeys.has(field.key) && !field.retainWhenHidden) {
        continue;
      }
      const value = (dynamicValues[field.key] ?? '').trim();
      if (value) {
        properties[field.key] = value;
      }
    }

    // Include user-defined custom properties.
    for (const prop of this.customProperties.getRawValue()) {
      if (prop.key) {
        properties[prop.key] = prop.value;
      }
    }

    return Object.keys(properties).length > 0 ? properties : {};
  }

  /** Builds the fileIds array for template create/update from existing and newly uploaded files. */
  private resolveFileIdsForRequest(uploadedFileIds: string[]): string[] | null {
    const existingIds = this.existingFiles()
      .map((file) => file.id?.trim() ?? '')
      .filter((id) => id.length > 0);

    const newlyUploadedIds = uploadedFileIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (this.fileChanged()) {
      const merged = [...existingIds, ...newlyUploadedIds];
      // On edit with replace semantics, an empty array explicitly clears file associations.
      return merged;
    }

    if (existingIds.length > 0) {
      return existingIds;
    }

    return newlyUploadedIds.length > 0 ? newlyUploadedIds : null;
  }

  /** Builds the resources payload from system, DUT, fixtures, and assets filter fields. */
  private buildResourcesPayload(
    details: ReturnType<FormGroup<ITemplateDetailsForm>['getRawValue']>,
  ): ICreateWorkitemTemplateRequest['resources'] {
    const hasSystem = !!details.systemFilter;
    const hasDut = !!details.dutFilter;
    const hasFixtures = !!details.fixturesFilter;
    const hasAssets = !!details.assetsFilter;

    if (!hasSystem && !hasDut && !hasFixtures && !hasAssets) {
      return undefined;
    }

    return {
      filterType: this.filterLanguage(),
      ...(hasSystem ? { systems: { filter: details.systemFilter } } : {}),
      ...(hasDut ? { duts: { filter: details.dutFilter } } : {}),
      ...(hasFixtures ? { fixtures: { filter: details.fixturesFilter } } : {}),
      ...(hasAssets ? { assets: { filter: details.assetsFilter } } : {}),
    };
  }

  /** Builds the dashboard payload from the dashboard ID and parameter rows. */
  private buildDashboardPayload(
    details: ReturnType<FormGroup<ITemplateDetailsForm>['getRawValue']>,
  ): IDashboardReferenceDefinition | undefined {
    const dashboardId = details.dashboard.id;
    const params = details.dashboard.parameters;

    if (!dashboardId && params.length === 0) {
      return undefined;
    }

    const variables: Record<string, string> = {};
    for (const param of params) {
      variables[param.key] = param.value;
    }

    return {
      id: dashboardId || undefined,
      variables: Object.keys(variables).length > 0 ? variables : undefined,
    };
  }

  /**
   * Creates a typed FormGroup for a single dashboard parameter row.
   * The key control has required and duplicate-key validators; value has no constraints.
   */
  private createParameterFormGroup(
    key: string,
    value: string,
  ): FormGroup<IDashboardParameterFormGroup> {
    return this.fb.group<IDashboardParameterFormGroup>({
      key: this.fb.nonNullable.control(key, [Validators.required, this.duplicateKeyValidator()]),
      value: this.fb.nonNullable.control(value),
    });
  }

  /**
   * Validator that marks a key control invalid when another row in the FormArray
   * has the same non-empty key value.
   */
  private duplicateKeyValidator(): ValidatorFn {
    return (control: AbstractControl): { duplicateKey: true } | null => {
      const currentValue = (control.value as string).trim();
      if (!currentValue) {
        return null;
      }

      const duplicate = this.dashboardParameters.controls.some(
        (row) => row.controls.key !== control && row.controls.key.value.trim() === currentValue,
      );

      return duplicate ? { duplicateKey: true } : null;
    };
  }

  /** Triggers revalidation on all parameter key controls to refresh duplicate-key checks. */
  private revalidateParameterKeys(): void {
    for (const row of this.dashboardParameters.controls) {
      row.controls.key.updateValueAndValidity({ emitEvent: false });
    }
  }

  /**
   * Group-level validator that requires the dashboard ID to be filled
   * when at least one parameter row exists.
   */
  private dashboardIdRequiredValidator(): ValidatorFn {
    return (group: AbstractControl): { dashboardIdRequired: true } | null => {
      const formGroup = group as FormGroup<ICreateEditDashboardForm>;
      const hasParameters = formGroup.controls.parameters.length > 0;
      const hasId = !!formGroup.controls.id.value.trim();

      return hasParameters && !hasId ? { dashboardIdRequired: true } : null;
    };
  }

  /**
   * Validates the file against the accepted extension and max size constraints.
   * Sets the file signal on success or the error signal on failure.
   */
  private validateAndSetFiles(files: File[]): void {
    this.fileError.set(null);

    const validFiles: File[] = [];
    for (const file of files) {
      if (FILE_ACCEPT !== '*/*' && !file.name.toLowerCase().endsWith(FILE_ACCEPT)) {
        this.fileError.set($localize`Only ${FILE_ACCEPT}:fileExtension: files are accepted.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    for (const file of validFiles) {
      const staged: IStagedFileUpload = {
        uid: this.nextStagedFileUid,
        file,
        status: 'uploading',
        uploadedFileId: null,
        errorMessage: null,
      };
      this.nextStagedFileUid += 1;

      this.selectedFiles.update((existing) => [...existing, staged]);
      this.uploadStagedFile(staged.uid);
    }

    this.fileChanged.set(true);
  }

  private uploadStagedFile(uid: number): void {
    const staged = this.selectedFiles().find((file) => file.uid === uid);
    if (!staged) {
      return;
    }

    const workspaceId = this.form.controls.templateDetails.controls.workspace.value;
    if (!workspaceId) {
      this.selectedFiles.update((existing) =>
        existing.map((file) =>
          file.uid === uid
            ? {
                ...file,
                status: 'failed',
                errorMessage: $localize`Workspace is required before upload.`,
              }
            : file,
        ),
      );
      return;
    }

    this.fileService
      .uploadFile(staged.file, workspaceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (uploaded) => {
          this.selectedFiles.update((existing) =>
            existing.map((file) =>
              file.uid === uid
                ? {
                    ...file,
                    status: 'uploaded',
                    uploadedFileId: uploaded.id,
                    errorMessage: null,
                  }
                : file,
            ),
          );
        },
        error: (error: unknown) => {
          const status =
            typeof error === 'object' && error !== null && 'status' in error
              ? String((error as { status: unknown }).status)
              : '';
          const message = status
            ? $localize`Upload failed (HTTP ${status}:httpStatus:).`
            : $localize`Upload failed.`;

          this.selectedFiles.update((existing) =>
            existing.map((file) =>
              file.uid === uid
                ? {
                    ...file,
                    status: 'failed',
                    uploadedFileId: null,
                    errorMessage: message,
                  }
                : file,
            ),
          );
        },
      });
  }

  /** Constructs the fully-typed reactive form tree for all steps. */
  private buildForm(): FormGroup<ICreateEditTemplateForm> {
    return this.fb.group<ICreateEditTemplateForm>({
      templateDetails: this.fb.group<ITemplateDetailsForm>({
        name: this.fb.nonNullable.control('', Validators.required),
        type: this.fb.nonNullable.control<WorkItemType | ''>('', Validators.required),
        productFamilies: this.fb.nonNullable.control<string[]>([]),
        partNumbers: this.fb.nonNullable.control<string[]>([]),
        templateGroup: this.fb.nonNullable.control('', Validators.required),
        workspace: this.fb.nonNullable.control('', Validators.required),
        summary: this.fb.nonNullable.control(''),
        description: this.fb.nonNullable.control(''),
        testProgram: this.fb.nonNullable.control(''),
        estimatedDurationInSeconds: this.fb.nonNullable.control('', [Validators.pattern(/^\d*$/)]),
        systemFilter: this.fb.nonNullable.control(''),
        dutFilter: this.fb.nonNullable.control(''),
        fixturesFilter: this.fb.nonNullable.control(''),
        assetsFilter: this.fb.nonNullable.control(''),
        workflowId: this.fb.nonNullable.control(''),
        dashboard: this.fb.group<ICreateEditDashboardForm>(
          {
            id: this.fb.nonNullable.control(''),
            parameters: this.fb.array<FormGroup<IDashboardParameterFormGroup>>([]),
          },
          { validators: this.dashboardIdRequiredValidator() },
        ),
        customProperties: this.fb.array<FormGroup<ICustomPropertyFormGroup>>([]),
      }),
      fileConfiguration: this.fb.group<IFileConfigurationForm>({
        testProgramFile: this.fb.nonNullable.control(''),
        batteryFile: this.fb.nonNullable.control(''),
        mappingFile: this.fb.nonNullable.control(''),
        globalParameters: this.fb.array<FormGroup<IGlobalParameterFormGroup>>([]),
      }),
    });
  }

  /** Returns workspace+program key used to detect auto-fill source changes. */
  private getAutofillSourceKey(): string | null {
    const workspace = this.form.controls.templateDetails.controls.workspace.value.trim();
    const testProgram = this.form.controls.templateDetails.controls.testProgram.value.trim();
    if (!workspace || !testProgram) {
      return null;
    }

    return `${workspace}::${testProgram}`;
  }

  /** Parses and validates estimated duration in seconds from the form control. */
  private parseEstimatedDurationInSeconds(rawValue: string): number | undefined {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }

    return Math.round(parsed);
  }

  private applyWorkItemTypeRules(type: string): void {
    const definition = this.workItemTypesIndex()[type];
    if (!definition) {
      return;
    }

    const fieldRules = new Map<SupportedFieldName, { mandatory: boolean; supported: boolean }>();
    for (const field of definition.fields) {
      if (
        field.name === 'DESCRIPTION' ||
        field.name === 'TEST_PROGRAM' ||
        field.name === 'PART_NUMBER' ||
        field.name === 'TIMELINE.ESTIMATED_DURATION_IN_SECONDS' ||
        field.name === 'RESOURCES.SYSTEMS' ||
        field.name === 'RESOURCES.DUTS' ||
        field.name === 'RESOURCES.FIXTURES' ||
        field.name === 'RESOURCES.ASSETS'
      ) {
        fieldRules.set(field.name, {
          mandatory: field.mandatory,
          supported: field.supported,
        });
      }
    }

    const details = this.form.controls.templateDetails.controls;
    this.applyStringControlRule(details.description, fieldRules.get('DESCRIPTION'), []);
    this.applyStringControlRule(details.testProgram, fieldRules.get('TEST_PROGRAM'), []);
    this.applyStringControlRule(
      details.estimatedDurationInSeconds,
      fieldRules.get('TIMELINE.ESTIMATED_DURATION_IN_SECONDS'),
      [Validators.pattern(/^\d*$/)],
    );
    this.applyStringControlRule(details.systemFilter, fieldRules.get('RESOURCES.SYSTEMS'), []);
    this.applyStringControlRule(details.dutFilter, fieldRules.get('RESOURCES.DUTS'), []);
    this.applyStringControlRule(details.fixturesFilter, fieldRules.get('RESOURCES.FIXTURES'), []);
    this.applyStringControlRule(details.assetsFilter, fieldRules.get('RESOURCES.ASSETS'), []);
    const partNumberRule = fieldRules.get('PART_NUMBER');
    this.applyArrayControlRule(details.partNumbers, partNumberRule);
    this.applyArrayControlRule(
      details.productFamilies,
      partNumberRule ? { ...partNumberRule, mandatory: false } : undefined,
    );

    if (details.partNumbers.disabled) {
      this.selectedProductFamilies.set([]);
      this.selectedProducts.set([]);
      details.productFamilies.setValue([], { emitEvent: false });
      details.partNumbers.setValue([], { emitEvent: false });
    }

    this.syncFormSignals();
  }

  private applyStringControlRule(
    control: FormControl<string>,
    rule: { mandatory: boolean; supported: boolean } | undefined,
    baseValidators: ValidatorFn[],
  ): void {
    const validators = [...baseValidators];
    const supported = rule?.supported ?? true;
    if (supported && rule?.mandatory) {
      validators.push(Validators.required);
    }

    control.setValidators(validators);

    if (!supported) {
      control.setValue('', { emitEvent: false });
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

  private applyArrayControlRule(
    control: FormControl<string[]>,
    rule: { mandatory: boolean; supported: boolean } | undefined,
  ): void {
    const supported = rule?.supported ?? true;
    control.setValidators(supported && rule?.mandatory ? [nonEmptyArrayValidator] : []);

    if (!supported) {
      control.setValue([], { emitEvent: false });
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

}
