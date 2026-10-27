export enum SlUnaryOperator {
  StringIsBlank = 'strisblank',
  StringIsNotBlank = 'strisnotblank',
  ListIsEmpty = 'list_is_empty',
  ListIsNotEmpty = 'list_is_not_empty',
}

export enum SlBinaryOperator {
  Equals = '===',
  NotEquals = '!==',
  BooleanEquals = 'boolean_equals',
  BooleanDoesNotEqual = 'boolean_not_equals',
  IsGreaterThan = '>',
  IsGreaterThanOrEqual = '>=',
  IsSmallerThan = '<',
  IsSmallerThanOrEqual = '<=',
  StringIncludes = 'strincludes',
  StringDoesNotInclude = 'strnotincludes',
  IsInList = 'is_in_list',
  IsNotInList = 'is_not_in_list',
  ListElementContains = 'list_element_contains',
  NoListElementContains = 'no_list_element_contains',
  ContainsKey = 'contains_key',
  NotContainsKey = 'not_contains_key',
  StartsWith = 'startswith',
}

export enum SlDateOperator {
  DateIsGreaterThan = 'date>',
  DateIsGreaterThanOrEqual = 'date>=',
  DateIsSmallerThan = 'date<',
  DateIsSmallerThanOrEqual = 'date<=',
}

export enum SlDateTimeOperator {
  DateTimeIsGreaterThan = 'datetime>',
  DateTimeIsSmallerThan = 'datetime<',
  DateTimeIsEmpty = 'datetime_is_blank',
  DateTimeIsNotEmpty = 'datetime_is_not_blank',
}

export enum SlKeyValueOperator {
  KeyValueMatches = 'key_value_matches',
  KeyValueDoesNotMatch = 'key_value_not_matches',
  KeyValueContains = 'key_value_contains',
  KeyValueDoesNotContain = 'key_value_not_contains',
  KeyValueIsGreaterThan = 'key_value_>',
  KeyValueIsGreaterThanOrEqual = 'key_value_>=',
  KeyValueIsLessThan = 'key_value_<',
  KeyValueIsLessThanOrEqual = 'key_value_<=',
  KeyValueIsNumericallyEqual = 'key_value_===',
  KeyValueIsNumericallyNotEqual = 'key_value_!==',
  KeyValueStartsWith = 'key_value_starts_with',
  KeyValueDoesNotStartWith = 'key_value_not_starts_with',
}

export enum SlLogicalOperator {
  And = 'and',
  Or = 'or',
}

export type SlBinaryOperand = string | boolean | number;
export type SlDateOperand = string;

export interface ISlKeyValueOperand {
  key: string;
  value: string | number;
}

export type SlQueryExpression =
  | [string, SlUnaryOperator | string]
  | [string, SlBinaryOperator | string, SlBinaryOperand]
  | [string, SlDateOperator | SlDateTimeOperator | string, SlDateOperand]
  | [string, SlKeyValueOperator | string, ISlKeyValueOperand];

export type SlFirstLevelQueryObject = SlLogicalOperator | SlQueryExpression;
export type SlFirstLevelQueryObjects = SlFirstLevelQueryObject[];

export type SlQueryFilterObject = SlLogicalOperator | SlFirstLevelQueryObjects;
export type SlQueryFilterObjects = SlQueryFilterObject[];

export function isOperatorInEnum(operator: string, enumType: Record<string, string>): boolean {
  return Object.values(enumType).includes(operator);
}

export function binaryOperandToString(operand: SlBinaryOperand): string {
  switch (typeof operand) {
    case 'string':
      return operand;
    case 'number':
      return `${operand}`;
    case 'boolean':
      return operand ? 'true' : 'false';
    default:
      throw new Error(`Unsupported type on a SlBinaryOperand: ${typeof operand}`);
  }
}

export function keyValueOperandToString(operand: ISlKeyValueOperand): string {
  switch (typeof operand.value) {
    case 'string':
      return operand.value;
    case 'number':
      return `${operand.value}`;
    default:
      throw new Error(`Unsupported type on a ISlKeyValueOperand: ${typeof operand.value}`);
  }
}

/**
 * True when the filter structure has no query expressions.
 */
export function isEmptyFilter(queryFilterObjects: SlQueryFilterObjects | undefined | null): boolean {
  return !queryFilterObjects?.[0]?.[0];
}

/**
 * Shared empty filter object used to clear builder state.
 */
export class SlQueryFilterObjectFilters {
  public static get emptyFilter(): SlQueryFilterObjects {
    return [[]];
  }
}
