import { Pipe, PipeTransform } from '@angular/core';
import { IGridColumn } from '../models/grid-column-config.models';

/** Resolves a column ID to its display label. */
@Pipe({
  name: 'labelForId',
  standalone: false,
})
export class LabelForIdPipe implements PipeTransform {
  /** Returns the label for the given column ID, falling back to the ID itself. */
  public transform(id: string, columns: IGridColumn[]): string {
    return columns.find((column) => column.id === id)?.label ?? id;
  }
}
