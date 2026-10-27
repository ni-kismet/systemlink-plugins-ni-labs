import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { NimbleDrawerDirective, NimbleDrawerModule } from '@ni/nimble-angular';
import { Observable, of, Subject } from 'rxjs';
import { IAuthResponse } from '../../../core/models/auth.models';
import {
  ICreateWorkitemTemplatesResponse,
  IWorkitemTemplate,
} from '../../../core/models/workitem-templates.models';
import { AuthService } from '../../../core/services/auth/auth.service';
import { PermissionService } from '../../../core/services/permission/permission.service';
import { TestplanTemplateService } from '../../services/testplan-template/testplan-template.service';
import { TestplanDuplicateSlideoutComponent } from './testplan-duplicate-slideout.component';

describe('duplicate drawer request lifetime', () => {
  const template: IWorkitemTemplate = {
    id: 'A',
    name: 'A',
    workspace: 'workspace',
    summary: null,
    description: null,
    productFamilies: null,
    partNumbers: null,
    templateGroup: null,
    testProgram: null,
    type: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    properties: null,
    workflowId: null,
  };
  let service: jasmine.SpyObj<TestplanTemplateService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<TestplanTemplateService>('TestplanTemplateService', [
      'duplicateTemplate',
    ]);
    await TestBed.configureTestingModule({
      declarations: [TestplanDuplicateSlideoutComponent],
      imports: [ReactiveFormsModule, NimbleDrawerModule],
      providers: [
        {
          provide: AuthService,
          useValue: { getAllWorkspaces: (): Observable<IAuthResponse> => of({ workspaces: [] }) },
        },
        { provide: PermissionService, useValue: { can: (): boolean => true } },
        { provide: TestplanTemplateService, useValue: service },
      ],
    })
      .overrideComponent(TestplanDuplicateSlideoutComponent, {
        set: { template: '<nimble-drawer #drawer></nimble-drawer>' },
      })
      .compileComponents();
  });

  for (const outcome of ['success', 'error'] as const) {
    it(`ignores an old request's ${outcome} after Cancel and reopening`, fakeAsync(() => {
      const fixture = TestBed.createComponent(TestplanDuplicateSlideoutComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const drawer = fixture.debugElement
        .query(By.directive(NimbleDrawerDirective))
        .injector.get(NimbleDrawerDirective);
      spyOn(drawer, 'show').and.stub();
      const close = spyOn(drawer, 'close').and.stub();
      const first = new Subject<ICreateWorkitemTemplatesResponse>();
      const second = new Subject<ICreateWorkitemTemplatesResponse>();
      service.duplicateTemplate.and.returnValues(first, second);

      component.openPanel(template);
      component.form.controls.name.setValue('copy A');
      component['onDuplicate']();
      component['onDuplicate']();
      expect(service.duplicateTemplate).toHaveBeenCalledTimes(1);
      component['onCancel']();
      close.calls.reset();

      component.openPanel({ ...template, id: 'B', name: 'B' });
      expect(component['isSaving']()).toBeFalse();
      component.form.controls.name.setValue('copy B');
      component['onDuplicate']();

      if (outcome === 'success') {
        first.next({});
        first.complete();
      } else {
        first.error(new Error('request A failed'));
      }
      expect(close).not.toHaveBeenCalled();
      expect(component['isSaving']()).toBeTrue();

      second.next({});
      second.complete();
      expect(close).toHaveBeenCalledTimes(1);
      expect(component['isSaving']()).toBeFalse();
      tick(61);
    }));
  }
});
