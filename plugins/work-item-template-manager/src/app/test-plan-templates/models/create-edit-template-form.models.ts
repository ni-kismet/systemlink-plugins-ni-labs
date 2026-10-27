import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { WorkItemType } from '../../core/constants/workitem-types.constant';

/** Typed form group for a single key-value dashboard parameter row. */
export interface IDashboardParameterFormGroup {
  key: FormControl<string>;
  value: FormControl<string>;
}

/** Typed form group for the dashboard configuration block. */
export interface ICreateEditDashboardForm {
  id: FormControl<string>;
  parameters: FormArray<FormGroup<IDashboardParameterFormGroup>>;
}

/** Typed form group for a single global parameter row parsed from the uploaded file. */
export interface IGlobalParameterFormGroup {
  name: FormControl<string>;
  type: FormControl<string>;
  unit: FormControl<string>;
  value: FormControl<string>;
}

/** Typed form group for a single key-value custom property row. */
export interface ICustomPropertyFormGroup {
  key: FormControl<string>;
  value: FormControl<string>;
}

/** Typed form group for the Template Details step — all primary template fields. */
export interface ITemplateDetailsForm {
  name: FormControl<string>;
  type: FormControl<WorkItemType | ''>;
  productFamilies: FormControl<string[]>;
  partNumbers: FormControl<string[]>;
  templateGroup: FormControl<string>;
  workspace: FormControl<string>;
  summary: FormControl<string>;
  description: FormControl<string>;
  testProgram: FormControl<string>;
  estimatedDurationInSeconds: FormControl<string>;
  systemFilter: FormControl<string>;
  dutFilter: FormControl<string>;
  fixturesFilter: FormControl<string>;
  assetsFilter: FormControl<string>;
  workflowId: FormControl<string>;
  dashboard: FormGroup<ICreateEditDashboardForm>;
  customProperties: FormArray<FormGroup<ICustomPropertyFormGroup>>;
}

/** Typed form group for the file configuration step — file path fields and global parameters. */
export interface IFileConfigurationForm {
  testProgramFile: FormControl<string>;
  batteryFile: FormControl<string>;
  mappingFile: FormControl<string>;
  globalParameters: FormArray<FormGroup<IGlobalParameterFormGroup>>;
}

/** Root typed form group for the create/edit testplan template slideout. */
export interface ICreateEditTemplateForm {
  templateDetails: FormGroup<ITemplateDetailsForm>;
  fileConfiguration: FormGroup<IFileConfigurationForm>;
}
