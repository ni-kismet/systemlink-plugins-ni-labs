import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { finalize, map, Observable, shareReplay, Subject, takeUntil } from 'rxjs';
import { DrawerLocation, NimbleDrawerDirective } from '@ni/nimble-angular';
import { IAuthWorkspace } from '../../../core/models/auth.models';
import { IWorkitemTemplate } from '../../../core/models/workitem-templates.models';
import { AuthService } from '../../../core/services/auth/auth.service';
import { TestplanTemplateService } from '../../services/testplan-template/testplan-template.service';
import {
  PermissionService,
  WORK_ITEM_TEMPLATE_ACTIONS,
} from '../../../core/services/permission/permission.service';

/** Reactive form controls backing the duplicate slideout. */
interface IDuplicateTemplateForm {
  name: FormControl<string>;
  description: FormControl<string>;
  workspace: FormControl<string>;
}

/** Slideout drawer for duplicating a test plan template with a new name, description, and workspace. */
@Component({
  selector: 'app-testplan-duplicate-slideout',
  templateUrl: './testplan-duplicate-slideout.component.html',
  styleUrl: './testplan-duplicate-slideout.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestplanDuplicateSlideoutComponent implements OnDestroy {
  /** The reactive form holding the editable duplicate fields. */
  public readonly form: FormGroup<IDuplicateTemplateForm>;

  /** Workspace options for the workspace dropdown. */
  protected readonly workspaces$: Observable<IAuthWorkspace[]>;

  protected readonly drawerLocation = DrawerLocation.right;

  /** Whether a duplicate operation is in progress. */
  protected readonly isSaving = signal(false);

  private readonly drawerDirective = viewChild.required('drawer', { read: NimbleDrawerDirective });
  private readonly workspaceSelectRef = viewChild<ElementRef<HTMLElement & { value: string }>>(
    'workspaceSelect',
  );

  private sourceTemplate: IWorkitemTemplate | undefined;
  private panelSession = 0;
  private readonly destroy$ = new Subject<void>();

  /** Creates an instance of TestplanDuplicateSlideoutComponent. */
  public constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly templateService: TestplanTemplateService,
    private readonly permissionService: PermissionService,
  ) {
    this.workspaces$ = this.authService
      .getAllWorkspaces()
      .pipe(
        map((response) => response.workspaces),
        shareReplay(1),
      );

    this.form = this.fb.group<IDuplicateTemplateForm>({
      name: this.fb.nonNullable.control('', Validators.required),
      description: this.fb.nonNullable.control(''),
      workspace: this.fb.nonNullable.control('', Validators.required),
    });
  }

  /** Cleans up subscriptions. */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Opens the slideout for the given source template. Name defaults to empty, description to the
   * template's current value, and workspace to the template's current (source) workspace.
   */
  public openPanel(template: IWorkitemTemplate): void {
    this.panelSession += 1;
    this.sourceTemplate = template;
    this.isSaving.set(false);

    const sourceWorkspace = template.workspace ?? '';
    const workspace = this.permissionService.can(WORK_ITEM_TEMPLATE_ACTIONS.create, sourceWorkspace)
      ? sourceWorkspace
      : '';

    this.form.reset({
      name: '',
      description: template.description ?? '',
      workspace,
    });

    void this.drawerDirective().show();
    this.syncWorkspaceSelectValue(workspace);
  }

  /** Whether the duplicate button should be disabled. */
  protected readonly isSaveDisabled = (): boolean => this.isSaving() || this.form.invalid;

  /** Only workspaces the user can create templates in. */
  protected workspaceOptions(workspaces: IAuthWorkspace[]): IAuthWorkspace[] {
    return workspaces.filter((workspace) =>
      this.permissionService.can(WORK_ITEM_TEMPLATE_ACTIONS.create, workspace.id),
    );
  }

  /** Closes the slideout without duplicating. */
  protected onCancel(): void {
    this.panelSession += 1;
    this.drawerDirective().close(undefined);
  }

  /** Keeps the form control in sync with the workspace select value. */
  protected onWorkspaceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value ?? '';
    this.form.controls.workspace.setValue(value);
    this.form.controls.workspace.markAsDirty();
  }

  /** Builds and submits the duplicate request, copying all settings from the source template. */
  protected onDuplicate(): void {
    this.form.markAllAsTouched();

    if (this.isSaving() || this.form.invalid || !this.sourceTemplate) {
      return;
    }

    const { name, description, workspace } = this.form.getRawValue();
    const session = this.panelSession;
    this.isSaving.set(true);

    this.templateService
      .duplicateTemplate(this.sourceTemplate, {
        name,
        description: description || null,
        workspace: workspace || null,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (session === this.panelSession) {
            this.isSaving.set(false);
          }
        }),
      )
      .subscribe({
        next: () => {
          if (session === this.panelSession) {
            this.drawerDirective().close(undefined);
          }
        },
        // Errors surface via the global notification banner interceptor.
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        error: () => {},
      });
  }

  /**
   * Re-applies the workspace value to the nimble-select imperatively after the options render,
   * since nimble-select cannot resolve a selected option bound before its options exist.
   */
  private syncWorkspaceSelectValue(value: string): void {
    const session = this.panelSession;
    const apply = (): void => {
      if (session !== this.panelSession) {
        return;
      }
      const select = this.workspaceSelectRef()?.nativeElement;
      if (select) {
        select.value = '';
        select.value = value;
      }
    };

    requestAnimationFrame(apply);
    setTimeout(apply, 60);
  }
}
