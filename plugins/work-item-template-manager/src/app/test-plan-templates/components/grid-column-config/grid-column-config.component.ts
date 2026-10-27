import { ChangeDetectionStrategy, Component, effect, input } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { IGridColumn } from '../../models/grid-column-config.models';

/** Manages the column selection and ordering within the grid config drawer. */
@Component({
  selector: 'app-grid-column-config',
  templateUrl: './grid-column-config.component.html',
  styleUrl: './grid-column-config.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GridColumnConfigComponent {
  public readonly allColumns = input<IGridColumn[]>([]);
  public readonly visibleColumnIds = input<string[]>([]);
  public readonly form: FormGroup;
  private initialColumns: string[] = [];

  /** Creates an instance of GridColumnConfigComponent. */
  public constructor(private readonly formBuilder: FormBuilder) {
    this.form = this.formBuilder.group({ columns: this.formBuilder.array<string>([]) });

    effect(() => {
      const columns = this.visibleColumnIds().filter((column) => column !== 'name');
      this.initialColumns = [...columns];
      this.rebuildArray(columns);
    });
  }

  /** The reactive FormArray holding the current ordered column selections. */
  public get columnsFA(): FormArray<FormControl<string>> {
    return this.form.get('columns') as FormArray<FormControl<string>>;
  }

  /** Whether there are still un-selected columns available to add. */
  public get canAddMoreColumn(): boolean {
    return this.availableProperties(null).length > 0;
  }

  /** Resets the form array to the initial state. */
  public reset(): void {
    this.rebuildArray(this.initialColumns);
  }

  /** Returns the current selected column IDs, always prepending 'name'. */
  public getSelectedColumns(): string[] {
    const chosen = this.columnsFA.value.filter(Boolean) as string[];

    return ['name', ...chosen];
  }

  /** Appends a new column selector pre-filled with the first available column. */
  public addSelect(): void {
    const first = this.availableProperties(null)[0];

    if (first) {
      this.columnsFA.push(new FormControl<string>(first.id, { nonNullable: true }));
    }
  }

  /** Removes the column selector at the specified index. */
  public removeSelect(index: number): void {
    this.columnsFA.removeAt(index);
    this.columnsFA.updateValueAndValidity();
  }

  /** Handles drag-and-drop reordering of column selectors. */
  public drop(event: CdkDragDrop<FormControl[]>): void {
    moveItemInArray(this.columnsFA.controls, event.previousIndex, event.currentIndex);
    this.columnsFA.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    this.form.markAsDirty();
  }

  /** Returns columns not yet selected by other controls. */
  public availableProperties(currentControl: FormControl<string | null> | null): IGridColumn[] {
    const currentValue = currentControl?.value ?? null;
    const selectedValues = this.columnsFA.value.filter(
      (value): value is string => typeof value === 'string' && value !== currentValue,
    );

    return this.allColumns().filter(
      (column) => column.id !== 'name' && !selectedValues.includes(column.id),
    );
  }

  /** Returns whether the current value of the given control still exists in the full column list. */
  public isAvailable(control: FormControl): boolean {
    return this.allColumns().some((column) => column.id === control.value);
  }

  /** Replaces the columns FormArray with freshly built controls. */
  private rebuildArray(columns: string[]): void {
    const controls = columns.map((column) =>
      this.formBuilder.control(column, { nonNullable: true }),
    );
    this.form.setControl('columns', this.formBuilder.array(controls));
    this.form.markAsPristine();
  }
}
