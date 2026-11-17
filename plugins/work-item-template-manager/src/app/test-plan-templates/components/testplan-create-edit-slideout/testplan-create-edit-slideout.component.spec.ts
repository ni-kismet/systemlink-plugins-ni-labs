import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NimbleDrawerDirective } from '@ni/nimble-angular';
import { delay, of, Subject } from 'rxjs';
import { WorkItemType } from '../../../core/constants/workitem-types.constant';
import {
  ICreateWorkitemTemplatesResponse,
  IUpdateWorkitemTemplateRequest,
  IWorkitemTemplate,
} from '../../../core/models/workitem-templates.models';
import { AssetService } from '../../../core/services/asset/asset.service';
import { AuthService } from '../../../core/services/auth/auth.service';
import { DashboardService } from '../../../core/services/dashboard/dashboard.service';
import { DynamicFormFieldsService } from '../../../core/services/dynamic-form-fields/dynamic-form-fields.service';
import { FileService } from '../../../core/services/file/file.service';
import { NotificationBannerService } from '../../../core/services/notification-banner/notification-banner.service';
import { PermissionService } from '../../../core/services/permission/permission.service';
import { ProductService } from '../../../core/services/product/product.service';
import { ResourceFilterLanguageService } from '../../../core/services/resource-filter-language/resource-filter-language.service';
import { SystemService } from '../../../core/services/system/system.service';
import { TestResultService } from '../../../core/services/test-result/test-result.service';
import { WorkflowService } from '../../../core/services/workflow/workflow.service';
import { WorkItemTypesService } from '../../../core/services/workitem-types/workitem-types.service';
import { TestplanTemplateService } from '../../services/testplan-template/testplan-template.service';
import { TestplanTemplatesModule } from '../../test-plan-templates.module';
import { TestplanCreateEditSlideoutComponent } from './testplan-create-edit-slideout.component';
describe('create/edit drawer request lifetime', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestplanTemplatesModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('does not close a reopened drawer or reset its saving state for an old save', fakeAsync(() => {
    const fixture = TestBed.createComponent(TestplanCreateEditSlideoutComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const drawer = fixture.debugElement
      .query(By.directive(NimbleDrawerDirective))
      .injector.get(NimbleDrawerDirective);
    spyOn(drawer, 'show').and.stub();
    const close = spyOn(drawer, 'close').and.stub();
    const first = new Subject<ICreateWorkitemTemplatesResponse>();
    const second = new Subject<ICreateWorkitemTemplatesResponse>();
    const save = spyOn(TestBed.inject(TestplanTemplateService), 'createTemplate').and.returnValues(
      first,
      second,
    );

    component.openPanel('create');
    component.form.controls.templateDetails.patchValue(
      {
        name: 'A',
        type: WorkItemType.Testplan,
        templateGroup: 'group',
        workspace: 'workspace',
      },
      { emitEvent: false },
    );
    component['onSave']();
    component['onSave']();
    expect(save).toHaveBeenCalledTimes(1);
    component['onCancel']();
    close.calls.reset();

    component.openPanel('create');
    expect(component['isSaving']()).toBeFalse();
    component.form.controls.templateDetails.patchValue(
      {
        name: 'B',
        type: WorkItemType.Testplan,
        templateGroup: 'group',
        workspace: 'workspace',
      },
      { emitEvent: false },
    );
    component['onSave']();
    first.next({});
    first.complete();
    expect(close).not.toHaveBeenCalled();
    expect(component['isSaving']()).toBeTrue();

    second.next({});
    second.complete();
    expect(close).toHaveBeenCalledTimes(1);
    expect(component['isSaving']()).toBeFalse();
    tick(5000);
  }));

  it('scopes edit chip lookups to the template workspace', fakeAsync(() => {
    const fixture = TestBed.createComponent(TestplanCreateEditSlideoutComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const drawer = fixture.debugElement
      .query(By.directive(NimbleDrawerDirective))
      .injector.get(NimbleDrawerDirective);
    spyOn(drawer, 'show').and.stub();
    const lookup = spyOn(
      TestBed.inject(ProductService),
      'fetchProductNameFromPartNumbers',
    ).and.returnValue(
      of(
        new Map([
          ['A', new Map([['shared', 'Product A']])],
          ['B', new Map([['shared', 'Product B']])],
        ]),
      ),
    );
    const template: IWorkitemTemplate = {
      id: 'template',
      name: 'Template',
      workspace: 'B',
      partNumbers: ['shared', 'missing'],
      type: WorkItemType.Testplan,
      templateGroup: 'group',
      summary: null,
      description: null,
      productFamilies: null,
      testProgram: null,
      createdBy: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
      properties: null,
      workflowId: null,
    };

    component.openPanel('edit', template);

    expect(lookup).toHaveBeenCalledWith(['shared', 'missing'], 'B');
    expect(component['selectedProducts']()).toEqual([
      { partNumber: 'shared', displayName: 'Product B [shared]' },
      { partNumber: 'missing', displayName: 'missing' },
    ]);
    tick(5000);
  }));
});

/** Service stub whose unspecified methods/observables emit an empty array. */
function stubService(overrides: Record<string, unknown> = {}): unknown {
  return new Proxy(overrides, {
    get(target, prop): unknown {
      if (prop in target) {
        return target[prop as string];
      }
      if (typeof prop !== 'string' || prop === 'then' || prop === 'ngOnDestroy') {
        return undefined;
      }
      return prop.endsWith('$') ? of([]) : (): unknown => of([]);
    },
  });
}

interface ISlideoutInternals {
  isSaveDisabled(): boolean;
  selectedProductFamilies(): string[];
  selectedProducts(): { partNumber: string }[];
  removeProductFamily(family: string): void;
  removeProduct(partNumber: string): void;
  hasRequiredError(control: unknown): boolean;
  onSave(): void;
  onTestProgramChange(event: Event): void;
  unavailableWorkflowId(): string;
  unavailableDashboardId(): string;
}

describe('TestplanCreateEditSlideoutComponent (edit mode)', () => {
  let fixture: ComponentFixture<TestplanCreateEditSlideoutComponent>;
  let component: TestplanCreateEditSlideoutComponent;
  let slideout: ISlideoutInternals;
  let updateTemplate: jasmine.Spy;
  let queryElapsedTime: jasmine.Spy;
  let workspaceFamilies: string[];
  let partNumberMandatory: boolean;

  const template = {
    id: 'template-1',
    name: 'Template',
    type: WorkItemType.Testplan,
    templateGroup: 'Group',
    workspace: 'ws',
    productFamilies: ['FamA', 'FamB'],
    partNumbers: ['PN1'],
    summary: 'Summary',
    description: 'Description',
    testProgram: 'Program A',
    workflowId: 'wf1',
    timeline: { estimatedDurationInSeconds: 60 },
    resources: {
      filterType: 'LINQ',
      systems: { filter: 'Systems' },
      duts: { filter: 'Duts' },
    },
    dashboard: { id: 'dash1', variables: { key: 'value' } },
  } as unknown as IWorkitemTemplate;

  beforeEach(async () => {
    workspaceFamilies = ['FamA', 'FamB'];
    partNumberMandatory = false;
    updateTemplate = jasmine.createSpy('updateTemplate').and.returnValue(of({}));
    queryElapsedTime = jasmine.createSpy('queryFirstElapsedTimeInSeconds').and.returnValue(of(999));
    await TestBed.configureTestingModule({
      imports: [TestplanTemplatesModule],
      providers: [
        {
          provide: AuthService,
          useValue: stubService({
            getAllWorkspaces: () => of({ workspaces: [{ id: 'ws', name: 'WS' }] }),
          }),
        },
        { provide: NotificationBannerService, useValue: stubService() },
        {
          provide: ProductService,
          useValue: stubService({
            queryProductFamiliesByWorkspace: () => of(workspaceFamilies),
            fetchProductNameFromPartNumbers: () =>
              of(new Map([['ws', new Map([['PN1', 'Product 1']])]])),
          }),
        },
        {
          provide: WorkflowService,
          useValue: stubService({
            queryWorkflows: () =>
              of([{ id: 'wf1', workspace: 'ws', name: 'Workflow' }]).pipe(delay(100)),
          }),
        },
        {
          provide: DashboardService,
          useValue: stubService({
            queryDashboardsByWorkspaceId: () =>
              of([{ uid: 'dash1', title: 'Dashboard' }]).pipe(delay(100)),
          }),
        },
        {
          provide: TestResultService,
          useValue: stubService({ queryFirstElapsedTimeInSeconds: queryElapsedTime }),
        },
        { provide: SystemService, useValue: stubService() },
        { provide: AssetService, useValue: stubService() },
        {
          provide: WorkItemTypesService,
          useValue: stubService({
            getWorkItemTypes: () =>
              of([
                {
                  type: WorkItemType.Testplan,
                  fields: [
                    { name: 'PART_NUMBER', supported: true, mandatory: partNumberMandatory },
                  ],
                },
              ]),
          }),
        },
        {
          provide: TestplanTemplateService,
          useValue: stubService({ templates$: of([]), updateTemplate }),
        },
        { provide: FileService, useValue: stubService() },
        {
          provide: DynamicFormFieldsService,
          useValue: stubService({ applyRules: (views: unknown) => views }),
        },
        { provide: PermissionService, useValue: stubService({ can: () => of(true) }) },
        {
          provide: ResourceFilterLanguageService,
          useValue: stubService({ language$: of('LINQ') }),
        },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(TestplanCreateEditSlideoutComponent);
    component = fixture.componentInstance;
    slideout = component as unknown as ISlideoutInternals;
    fixture.detectChanges();
  }

  function openForEdit(): void {
    component.openPanel('edit', template);
    tick(1000);
    fixture.detectChanges();
  }

  function lastUpdateRequest(): IUpdateWorkitemTemplateRequest {
    return updateTemplate.calls.mostRecent().args[0] as IUpdateWorkitemTemplateRequest;
  }

  it('keeps saved families and products that are not found in the workspace', fakeAsync(() => {
    workspaceFamilies = ['FamA'];
    createComponent();
    openForEdit();

    expect(slideout.selectedProductFamilies()).toEqual(['FamA', 'FamB']);
    expect(slideout.selectedProducts().map((product) => product.partNumber)).toEqual(['PN1']);
    expect(component.form.controls.templateDetails.controls.partNumbers.value).toEqual(['PN1']);
    expect(slideout.isSaveDisabled()).toBeTrue();
    flush();
  }));

  it('sends empty arrays when all families and products are removed', fakeAsync(() => {
    createComponent();
    openForEdit();

    slideout.removeProductFamily('FamA');
    slideout.removeProductFamily('FamB');
    slideout.removeProduct('PN1');
    tick(1000);
    expect(slideout.isSaveDisabled()).toBeFalse();

    slideout.onSave();
    tick(1000);

    expect(lastUpdateRequest().productFamilies).toEqual([]);
    expect(lastUpdateRequest().partNumbers).toEqual([]);
    flush();
  }));

  it('shows the required error when the last mandatory product is removed', fakeAsync(() => {
    partNumberMandatory = true;
    createComponent();
    openForEdit();

    slideout.removeProduct('PN1');
    tick(1000);

    expect(slideout.isSaveDisabled()).toBeTrue();
    expect(
      slideout.hasRequiredError(component.form.controls.templateDetails.controls.partNumbers),
    ).toBeTrue();
    flush();
  }));

  it('sends explicit clears for emptied fields', fakeAsync(() => {
    createComponent();
    openForEdit();
    const details = component.form.controls.templateDetails.controls;

    details.summary.setValue('');
    details.description.setValue('');
    details.testProgram.setValue('');
    details.workflowId.setValue('');
    details.estimatedDurationInSeconds.setValue('');
    details.systemFilter.setValue('');
    details.dashboard.controls.id.setValue('');
    details.dashboard.controls.parameters.clear();
    details.summary.markAsDirty();
    tick(1000);
    slideout.onSave();
    tick(1000);

    expect(lastUpdateRequest()).toEqual(
      jasmine.objectContaining({
        summary: '',
        description: '',
        testProgram: '',
        workflowId: '',
        timeline: null,
        resources: jasmine.objectContaining({ systems: null, duts: { filter: 'Duts' } }),
        dashboard: { id: '', variables: {} },
      }),
    );
    flush();
  }));

  it('clears all resources when every filter is emptied', fakeAsync(() => {
    createComponent();
    openForEdit();
    const details = component.form.controls.templateDetails.controls;

    details.systemFilter.setValue('');
    details.dutFilter.setValue('');
    details.systemFilter.markAsDirty();
    tick(1000);
    slideout.onSave();
    tick(1000);

    expect(lastUpdateRequest().resources).toBeNull();
    flush();
  }));

  it('keeps a saved workflow and dashboard that are not in the option lists', fakeAsync(() => {
    createComponent();
    component.openPanel('edit', {
      ...template,
      workflowId: 'wf-missing',
      dashboard: { id: 'dash-missing' },
    });
    tick(1000);
    fixture.detectChanges();
    const details = component.form.controls.templateDetails.controls;

    expect(details.workflowId.value).toBe('wf-missing');
    expect(details.dashboard.controls.id.value).toBe('dash-missing');
    expect(slideout.unavailableWorkflowId()).toBe('wf-missing');
    expect(slideout.unavailableDashboardId()).toBe('dash-missing');
    expect(slideout.isSaveDisabled()).toBeTrue();
    flush();
  }));

  it('auto-fills the estimated duration only when the test program changes', fakeAsync(() => {
    createComponent();
    openForEdit();
    const durationControl =
      component.form.controls.templateDetails.controls.estimatedDurationInSeconds;

    expect(queryElapsedTime).not.toHaveBeenCalled();
    expect(durationControl.value).toBe('60');

    slideout.onTestProgramChange({ target: { value: 'Program A' } } as unknown as Event);
    tick(1000);
    expect(queryElapsedTime).not.toHaveBeenCalled();

    slideout.onTestProgramChange({ target: { value: 'Program B' } } as unknown as Event);
    tick(1000);
    expect(queryElapsedTime).toHaveBeenCalledOnceWith('ws', 'Program B');
    expect(durationControl.value).toBe('999');
    flush();
  }));
});
