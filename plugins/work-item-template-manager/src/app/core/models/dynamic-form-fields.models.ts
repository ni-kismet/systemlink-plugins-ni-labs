/** Allowed value entry for ENUM dynamic form fields. */
export interface IDynamicFormFieldAllowedValue {
  key: string;
  displayText: string;
  helpText?: string;
  deprecated?: boolean;
  i18n?: IDynamicFormI18nEntry[];
}

/** Localized label overrides for a view/group/field. */
export interface IDynamicFormI18nEntry {
  localeId: string;
  displayText?: string;
  helpText?: string;
  placeHolder?: string;
}

/** State overrides applied by a configuration rule to the targeted views/groups/fields. */
export interface IDynamicFormRuleChangeState {
  visible?: boolean;
  editable?: boolean;
  mandatory?: boolean;
}

/** A set of view/group/field keys and the state change applied to them. */
export interface IDynamicFormRuleChange {
  fields?: string[];
  groups?: string[];
  views?: string[];
  change: IDynamicFormRuleChangeState;
}

/** Configuration rule: when `expression` matches, its changes are applied. */
export interface IDynamicFormRule {
  name: string;
  description?: string;
  expression: string;
  changes: IDynamicFormRuleChange[];
}

/** Raw field definition returned by GET /nidynamicformfields/v1/fields. */
export interface IDynamicFormFieldRaw {
  id: string;
  workspace: string;
  key: string;
  type: string;
  displayText: string;
  helpText?: string;
  placeHolder?: string;
  i18n?: IDynamicFormI18nEntry[];
  editable?: boolean;
  mandatory?: boolean;
  visible?: boolean;
  retainWhenHidden?: boolean;
  defaultValue?: unknown;
  allowedValues?: IDynamicFormFieldAllowedValue[];
}

/** Raw group definition returned by GET /nidynamicformfields/v1/groups. */
export interface IDynamicFormGroupRaw {
  id: string;
  workspace: string;
  key: string;
  displayText: string;
  helpText?: string;
  i18n?: IDynamicFormI18nEntry[];
  editable?: boolean;
  visible?: boolean;
  fields: string[];
}

/** A single view within a configuration. */
export interface IDynamicFormConfigurationView {
  key: string;
  displayText: string;
  helpText?: string;
  i18n?: IDynamicFormI18nEntry[];
  order?: number;
  editable?: boolean;
  visible?: boolean;
  displayLocations?: string[];
  groups: string[];
}

/** Raw configuration returned by GET /nidynamicformfields/v1/configurations. */
export interface IDynamicFormConfigurationRaw {
  id: string;
  workspace: string;
  resourceType: string;
  key: string;
  name: string;
  displayRule?: string;
  views: IDynamicFormConfigurationView[];
  rules?: IDynamicFormRule[];
}

/** Resolved field ready for rendering, with its editor type and value hooks. */
export interface IResolvedDynamicField {
  key: string;
  displayText: string;
  /** Localized "<field> cannot be empty." error, matching SystemLink. */
  requiredText: string;
  helpText: string;
  placeHolder: string;
  type: string;
  mandatory: boolean;
  editable: boolean;
  visible: boolean;
  retainWhenHidden: boolean;
  defaultValue: string;
  allowedValues: IDynamicFormFieldAllowedValue[];
}

/** Resolved group with its display metadata and fields. */
export interface IResolvedDynamicGroup {
  key: string;
  displayText: string;
  helpText: string;
  visible: boolean;
  editable: boolean;
  fields: IResolvedDynamicField[];
}

/** Resolved view rendered as a top-level tab. */
export interface IResolvedDynamicView {
  /** Unique key across configurations (`<configurationId>-<viewKey>`). */
  key: string;
  /** The view key as referenced by configuration rules. */
  viewKey: string;
  displayText: string;
  helpText: string;
  order: number;
  visible: boolean;
  editable: boolean;
  /** Rules of the owning configuration, evaluated against the current values. */
  rules: IDynamicFormRule[];
  groups: IResolvedDynamicGroup[];
}

/** Template context used to evaluate configuration display rules. */
export interface IDynamicFormTemplateContext {
  workspaceId: string;
  name: string;
  type: string;
  templateId?: string;
  productFamilies: string[];
  partNumbers: string[];
  properties: Record<string, unknown>;
}
