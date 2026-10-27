/** A single configurable column descriptor for the table grid. */
export interface IGridColumn {
  id: string;
  label: string;
  fieldName: string;
  visible: boolean;
  type?: 'text' | 'date';
}

/** IGridColumn extended with pre-computed rendering properties for table display. */
export type IRenderedColumn = IGridColumn & {
  hidden: boolean;
  groupIndex: number | null;
  sortDirection: 'ascending' | 'descending' | null;
  sortIndex: number | null;
};
