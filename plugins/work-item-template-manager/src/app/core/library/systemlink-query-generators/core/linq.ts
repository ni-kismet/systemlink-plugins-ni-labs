/**
 * Dynamic LINQ filter-string generation.
 *
 * TypeScript port of the dependency-free SystemLink query-generators core.
 * Converts filter conditions into the Dynamic LINQ strings the SystemLink query
 * services accept (e.g. `Name.Contains("x") && workspace = "y"`). No Angular or
 * NI-package dependency, so the same code runs in any bundler or Node >= 18.
 */

/** The kind of data a filter field holds. Drives the default operation set. */
export const FieldType = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  DateTime: 'datetime',
  Enum: 'enum',
  /** A collection of strings, filtered with `.Contains(...)`. */
  StringArray: 'stringArray',
  /** A key/value bag, filtered with `field["key"] = "value"`. */
  Properties: 'properties',
} as const;

/** A field data type value (one of {@link FieldType}). */
export type FieldType = (typeof FieldType)[keyof typeof FieldType];

/** A comparison operation applied to a field when building a LINQ filter. */
export const Op = {
  Equals: 'equals',
  NotEquals: 'notEquals',
  Contains: 'contains',
  NotContains: 'notContains',
  StartsWith: 'startsWith',
  EndsWith: 'endsWith',
  IsEmpty: 'isEmpty',
  IsNotEmpty: 'isNotEmpty',
  GreaterThan: 'greaterThan',
  GreaterThanOrEqual: 'greaterThanOrEqual',
  LessThan: 'lessThan',
  LessThanOrEqual: 'lessThanOrEqual',
  IsAfter: 'isAfter',
  IsOnOrAfter: 'isOnOrAfter',
  IsBefore: 'isBefore',
  IsOnOrBefore: 'isOnOrBefore',
  /** `keywords.Contains("value")` — membership in a string collection. */
  ListContains: 'listContains',
  ListNotContains: 'listNotContains',
  /** `properties["key"] = "value"` */
  KeyValueMatches: 'keyValueMatches',
  /** `properties["key"] != "value"` */
  KeyValueNotMatches: 'keyValueNotMatches',
  /** `properties["key"].Contains("value")` */
  KeyValueContains: 'keyValueContains',
  /** `!properties["key"].Contains("value")` */
  KeyValueNotContains: 'keyValueNotContains',
  /** `properties.ContainsKey("key")` */
  ContainsKey: 'containsKey',
  /** `!properties.ContainsKey("key")` */
  NotContainsKey: 'notContainsKey',
  /** Pre-built LINQ, emitted verbatim. */
  Raw: 'raw',
} as const;

/** A comparison operation value (one of {@link Op}). */
export type Op = (typeof Op)[keyof typeof Op];

/** How multiple conditions are joined into a single LINQ expression. */
export type FilterLogic = 'and' | 'or';

/** A selectable enum value for a filter field. */
export interface FieldEnumValue {
  /** User-visible label. */
  label: string;
  /** The value emitted into the LINQ string. */
  value: string;
}

/** A framework-agnostic filter-field definition. */
export interface FieldDef {
  /** User-visible label. */
  label: string;
  /** The resource data field this maps to when building LINQ. */
  dataField: string;
  /** The data type, used to pick sensible default operations. */
  type: FieldType;
  /**
   * Backward-compatible alias for {@link FieldDef.type}. Populated by
   * {@link fieldDef} so existing consumers that read `dataType` keep working.
   */
  dataType?: FieldType;
  /** Operations offered for this field. Defaults to `defaultOperationsFor(type)`. */
  operations?: Op[];
  /** Enum values (only meaningful when `type` is `Enum`). */
  values?: FieldEnumValue[];
  /** Optional documentation note about the field's supported behavior. */
  note?: string;
}

/** A single filter condition (or a nested, parenthesized group of conditions). */
export interface Condition {
  /** The resource data field / property path (e.g. `name`, `properties.Name`). */
  field?: string;
  /** The operation to apply. */
  operation?: Op;
  /** The comparison value. Strings are quoted, numbers/booleans are emitted bare. */
  value?: string | number | boolean;
  /** The dictionary key, required for the key-value / key operations. */
  key?: string;
  /** Pre-built LINQ fragment, used when `operation` is `Op.Raw`. */
  linq?: string;
  /** A nested list of conditions, rendered recursively and parenthesized. */
  group?: Condition[];
  /** How the nested `group` conditions are joined. */
  logic?: FilterLogic;
}

/**
 * How date comparisons are rendered. SystemLink services are not consistent:
 * `nifile`, `nisysmgmt` and `niworkitem` expect the `DateTime(...)` /
 * `DateTime.parse(...)` form, while `nitestmonitor` and `niapm` accept a plain
 * quoted comparison. Each generator picks the form its service documents.
 */
export const DateStyle = {
  /** `startedAt > "2026-01-01T00:00:00Z"` */
  Compare: 'compare',
  /** `DateTime(created) > DateTime.parse("2026-01-01T00:00:00Z")` */
  Parse: 'parse',
} as const;

/** A date-rendering style value (one of {@link DateStyle}). */
export type DateStyle = (typeof DateStyle)[keyof typeof DateStyle];

/** Options that influence how a condition is rendered to LINQ. */
export interface ConditionRenderOptions {
  /** The date-comparison rendering style. Defaults to `DateStyle.Compare`. */
  dateStyle?: DateStyle;
}

const AND = '&&';
const OR = '||';

/**
 * Escapes a value for safe embedding inside a double-quoted LINQ string
 * literal, so a value containing a quote cannot terminate the literal and
 * inject additional filter clauses.
 */
export function escapeLinqString(value: string): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Renders a value as a LINQ literal: numbers/booleans bare, everything else quoted. */
function literal(value: string | number | boolean | null | undefined): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return `"${escapeLinqString(String(value ?? ''))}"`;
}

/** Renders a value as a quoted LINQ string literal. */
function quoted(value: string | number | boolean | null | undefined): string {
  return `"${escapeLinqString(String(value ?? ''))}"`;
}

/** Renders a date comparison in the style the target service documents. */
function dateComparison(
  field: string,
  operator: string,
  value: Condition['value'],
  dateStyle: DateStyle,
): string {
  if (dateStyle === DateStyle.Parse) {
    return `DateTime(${field}) ${operator} DateTime.parse(${quoted(value)})`;
  }
  return `${field} ${operator} ${quoted(value)}`;
}

/**
 * Renders one condition to a LINQ expression, or `''` when the condition cannot
 * be rendered (e.g. a key/value operation with no key).
 */
export function conditionToLinq(condition: Condition, options: ConditionRenderOptions = {}): string {
  const { field, operation, value, key } = condition;
  const dateStyle = options.dateStyle ?? DateStyle.Compare;

  if (operation === Op.Raw) {
    return condition.linq ? String(condition.linq) : '';
  }
  if (!field) {
    return '';
  }

  switch (operation) {
    case Op.Equals:
      return `${field} = ${literal(value)}`;
    case Op.NotEquals:
      return `${field} != ${literal(value)}`;
    case Op.Contains:
      return `${field}.Contains(${literal(value)})`;
    case Op.NotContains:
      return `!${field}.Contains(${literal(value)})`;
    case Op.StartsWith:
      return `${field}.StartsWith(${literal(value)})`;
    case Op.EndsWith:
      return `${field}.EndsWith(${literal(value)})`;
    case Op.IsEmpty:
      return `string.IsNullOrEmpty(${field})`;
    case Op.IsNotEmpty:
      return `!string.IsNullOrEmpty(${field})`;
    case Op.GreaterThan:
      return `${field} > ${literal(value)}`;
    case Op.GreaterThanOrEqual:
      return `${field} >= ${literal(value)}`;
    case Op.LessThan:
      return `${field} < ${literal(value)}`;
    case Op.LessThanOrEqual:
      return `${field} <= ${literal(value)}`;
    case Op.IsAfter:
      return dateComparison(field, '>', value, dateStyle);
    case Op.IsOnOrAfter:
      return dateComparison(field, '>=', value, dateStyle);
    case Op.IsBefore:
      return dateComparison(field, '<', value, dateStyle);
    case Op.IsOnOrBefore:
      return dateComparison(field, '<=', value, dateStyle);
    case Op.ListContains:
      return `${field}.Contains(${literal(value)})`;
    case Op.ListNotContains:
      return `!${field}.Contains(${literal(value)})`;
    case Op.KeyValueMatches:
      return key ? `${field}[${quoted(key)}] = ${literal(value)}` : '';
    case Op.KeyValueNotMatches:
      return key ? `${field}[${quoted(key)}] != ${literal(value)}` : '';
    case Op.KeyValueContains:
      return key ? `${field}[${quoted(key)}].Contains(${literal(value)})` : '';
    case Op.KeyValueNotContains:
      return key ? `!${field}[${quoted(key)}].Contains(${literal(value)})` : '';
    case Op.ContainsKey:
      return key ? `${field}.ContainsKey(${quoted(key)})` : '';
    case Op.NotContainsKey:
      return key ? `!${field}.ContainsKey(${quoted(key)})` : '';
    default:
      return '';
  }
}

/**
 * Joins conditions into a single LINQ string. Nested groups (objects with a
 * `group` array) are rendered recursively and parenthesized. Empty /
 * unrenderable conditions are skipped.
 */
export function buildLinqFilter(
  conditions: Condition[],
  logic: FilterLogic = 'and',
  options: ConditionRenderOptions = {},
): string {
  const joiner = logic === 'or' ? OR : AND;
  return (conditions ?? [])
    .map((condition) => {
      if (condition && Array.isArray(condition.group)) {
        const inner = buildLinqFilter(condition.group, condition.logic ?? 'and', options);
        return inner ? `(${inner})` : '';
      }
      return conditionToLinq(condition, options);
    })
    .filter((part) => part.length > 0)
    .join(` ${joiner} `);
}

/**
 * Combines already-built LINQ sub-expressions, wrapping each non-empty part in
 * parentheses. Useful for AND-ing together independently built filters.
 */
export function combineFilters(
  filters: (string | null | undefined)[],
  logic: FilterLogic = 'and',
): string {
  const joiner = logic === 'or' ? OR : AND;
  return (filters ?? [])
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => `(${part})`)
    .join(` ${joiner} `);
}

/** The operations that make sense for a given field type. */
export function defaultOperationsFor(fieldType: FieldType): Op[] {
  switch (fieldType) {
    case FieldType.String:
      return [
        Op.Contains,
        Op.NotContains,
        Op.Equals,
        Op.NotEquals,
        Op.StartsWith,
        Op.EndsWith,
        Op.IsEmpty,
        Op.IsNotEmpty,
      ];
    case FieldType.Number:
      return [
        Op.Equals,
        Op.NotEquals,
        Op.GreaterThan,
        Op.GreaterThanOrEqual,
        Op.LessThan,
        Op.LessThanOrEqual,
      ];
    case FieldType.Boolean:
    case FieldType.Enum:
      return [Op.Equals, Op.NotEquals];
    case FieldType.DateTime:
      return [Op.IsAfter, Op.IsOnOrAfter, Op.IsBefore, Op.IsOnOrBefore];
    case FieldType.StringArray:
      return [Op.ListContains, Op.ListNotContains];
    case FieldType.Properties:
      return [
        Op.KeyValueMatches,
        Op.KeyValueNotMatches,
        Op.KeyValueContains,
        Op.KeyValueNotContains,
        Op.ContainsKey,
        Op.NotContainsKey,
      ];
    default:
      return [Op.Equals, Op.NotEquals];
  }
}

/** Optional overrides when building a {@link FieldDef}. */
export interface FieldDefOptions {
  /** Override the default operation set for the field type. */
  operations?: Op[];
  /** Enum values (for `FieldType.Enum`). */
  values?: FieldEnumValue[];
  /** Optional documentation note about the field's supported behavior. */
  note?: string;
}

/**
 * Builds a {@link FieldDef}, filling in default operations for the field type
 * when not overridden.
 */
export function fieldDef(
  label: string,
  dataField: string,
  type: FieldType,
  options: FieldDefOptions = {},
): FieldDef {
  return {
    label,
    dataField,
    type,
    dataType: type,
    operations: options.operations ?? defaultOperationsFor(type),
    values: options.values,
    note: options.note,
  };
}

/* -------------------------------------------------------------------------- */
/* Backward-compatible aliases                                                */
/*                                                                            */
/* The app previously imported these names from `filters/linq`. They map 1:1  */
/* onto the SystemLink-consistent names above (identical string values), so   */
/* existing consumers keep compiling against the ported library.              */
/* -------------------------------------------------------------------------- */

/** Backward-compatible alias for {@link FieldType}. */
export const FilterDataType = FieldType;
/** Backward-compatible alias for {@link FieldType}. */
export type FilterDataType = FieldType;

/** Backward-compatible alias for {@link Op}. */
export const FilterOperation = Op;
/** Backward-compatible alias for {@link Op}. */
export type FilterOperation = Op;

/** Backward-compatible alias for {@link Condition}. */
export type FilterCondition = Condition;

/** Backward-compatible alias for {@link FieldDef}. */
export type FilterFieldDef = FieldDef;

/** Backward-compatible alias for {@link FieldEnumValue}. */
export type FilterFieldEnumValue = FieldEnumValue;
