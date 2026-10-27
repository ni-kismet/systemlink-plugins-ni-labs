import { ChangeDetectionStrategy, Component, effect, input } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { IGridColumn } from '../../models/grid-column-config.models';

/** Manages the grouping field selection and ordering within the grid config drawer. */
@Component({
  selector: 'app-grid-grouping-config',
  templateUrl: './grid-grouping-config.component.html',
  styleUrl: './grid-grouping-config.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GridGroupingConfigComponent {
  public readonly allColumns = input<IGridColumn[]>([]);
  public readonly groupByIds = input<string[]>([]);
  public readonly form: FormGroup;
  private initialGroups: string[] = [];

  /** Creates an instance of GridGroupingConfigComponent. */
  public constructor(private readonly formBuilder: FormBuilder) {
    this.form = this.formBuilder.group({ groups: this.formBuilder.array<string>([]) });

    effect(() => {
      const groups = this.groupByIds();
      this.initialGroups = [...groups];
      this.rebuildArray(groups);
    });
  }

  /** The reactive FormArray holding the current ordered group selections. */
  public get groupsFA(): FormArray<FormControl<string>> {
    return this.form.get('groups') as FormArray<FormControl<string>>;
  }

  /** Whether there are still un-selected fields available to add. */
  public get canAddMore(): boolean {
    return this.availableFields(null).length > 0;
  }

  /** Resets the form array to the initial state. */
  public reset(): void {
    this.rebuildArray(this.initialGroups);
  }

  /** Returns the current selected group field IDs. */
  public getSelectedGroups(): string[] {
    return this.groupsFA.value.filter(Boolean) as string[];
  }

  /** Returns fields not yet selected by other group controls. */
  public availableFields(currentControl: FormControl<string | null> | null): IGridColumn[] {
    const currentValue = currentControl?.value ?? null;
    const selectedValues = this.groupsFA.value.filter(
      (value): value is string => typeof value === 'string' && value !== currentValue,
    );

    return this.allColumns().filter(
      (column) => column.id !== 'name' && !selectedValues.includes(column.id),
    );
  }

  /** Appends a new group selector pre-filled with the first available field. */
  public addGroup(): void {
    const first = this.availableFields(null)[0];

    if (first) {
      this.groupsFA.push(new FormControl<string>(first.id, { nonNullable: true }));
    }
  }

  /** Removes the group selector at the specified index. */
  public removeGroup(index: number): void {
    this.groupsFA.removeAt(index);
    this.groupsFA.updateValueAndValidity();
  }

  /** Handles drag-and-drop reordering of group selectors. */
  public drop(event: CdkDragDrop<FormControl[]>): void {
    moveItemInArray(this.groupsFA.controls, event.previousIndex, event.currentIndex);
    this.groupsFA.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  /** Replaces the groups FormArray with freshly built controls. */
  private rebuildArray(groups: string[]): void {
    const controls = groups.map((group) => this.formBuilder.control(group, { nonNullable: true }));
    this.form.setControl('groups', this.formBuilder.array(controls));
  }
}
