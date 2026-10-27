import { IGridColumn } from '../models/grid-column-config.models';

/** Full ordered list of all configurable columns. 'name' is always pinned first. */
export const AVAILABLE_COLUMNS: IGridColumn[] = [
  { id: 'name', label: $localize`Name`, fieldName: 'name', visible: true },
  { id: 'templateId', label: $localize`Template ID`, fieldName: 'id', visible: false },
  { id: 'productFamily', label: $localize`Product Family`, fieldName: 'productFamily', visible: true },
  { id: 'product', label: $localize`Product`, fieldName: 'product', visible: true },
  { id: 'category', label: $localize`Group`, fieldName: 'category', visible: true },
  { id: 'workspace', label: $localize`Workspace`, fieldName: 'workspace', visible: true },
  { id: 'summary', label: $localize`Summary`, fieldName: 'summary', visible: false },
  { id: 'description', label: $localize`Description`, fieldName: 'description', visible: false },
  { id: 'testProgram', label: $localize`Test Program`, fieldName: 'testProgram', visible: false },
  { id: 'partNumbers', label: $localize`Part Numbers`, fieldName: 'partNumbers', visible: false },
  { id: 'type', label: $localize`Type`, fieldName: 'typeLabel', visible: false },
  { id: 'workflowId', label: $localize`Workflow ID`, fieldName: 'workflowId', visible: false },
  { id: 'systemsFilter', label: $localize`Systems Filter`, fieldName: 'systemsFilter', visible: false },
  { id: 'dutsFilter', label: $localize`DUTs Filter`, fieldName: 'dutsFilter', visible: false },
  { id: 'fixturesFilter', label: $localize`Fixtures Filter`, fieldName: 'fixturesFilter', visible: false },
  { id: 'assetsFilter', label: $localize`Assets Filter`, fieldName: 'assetsFilter', visible: false },
  { id: 'createdBy', label: $localize`Created By`, fieldName: 'createdBy', visible: false },
  { id: 'updatedBy', label: $localize`Updated By`, fieldName: 'updatedBy', visible: false },
  { id: 'createdAt', label: $localize`Created At`, fieldName: 'createdAt', visible: false, type: 'date' },
  { id: 'updatedAt', label: $localize`Updated At`, fieldName: 'updatedAt', visible: true, type: 'date' },
];
