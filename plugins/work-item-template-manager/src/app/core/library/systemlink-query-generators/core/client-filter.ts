/**
 * Client-side evaluation of filter conditions.
 *
 * A few SystemLink services (`nisystemsstate`, `nifeed`, `nilocation`) expose
 * plain GET list endpoints with a handful of fixed query parameters instead of
 * a Dynamic LINQ `filter`. Their generators send whatever the service supports
 * server-side and evaluate the remaining conditions here, so callers get the
 * same fluent API across every resource.
 */
import { Condition, FilterLogic, Op } from './linq';

/** A generic record whose fields can be read by dotted path. */
type UnknownRecord = Record<string, unknown>;

/** Reads a dotted path (`a.b.c`) off an object, returning undefined if absent. */
export function getPath(item: unknown, path: string): unknown {
  return String(path)
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        current === null || current === undefined
          ? undefined
          : (current as UnknownRecord)[segment],
      item,
    );
}

/** Coerces a value to something comparable, parsing date strings to timestamps. */
function toComparable(value: unknown): number | string | boolean | null | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : timestamp;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return value === null || value === undefined ? value : String(value);
}

/** Compares two values with a relational operator, normalizing dates first. */
function compare(left: unknown, right: unknown, operator: '>' | '>=' | '<' | '<='): boolean {
  const a = toComparable(left);
  const b = toComparable(right);
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  switch (operator) {
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    default:
      return false;
  }
}

/** Renders any value as a string, treating null/undefined as empty. */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Evaluates a single condition against an item. */
export function matchesCondition(item: unknown, condition: Condition): boolean {
  if (condition && Array.isArray(condition.group)) {
    return matchesConditions(item, condition.group, condition.logic ?? 'and');
  }

  const { field, operation, value, key } = condition;
  if (operation === Op.Raw) {
    // A raw LINQ fragment cannot be evaluated locally; treat it as a pass so it
    // never silently drops records.
    return true;
  }
  if (!field) {
    return true;
  }

  const actual = getPath(item, field);
  const bag = actual as UnknownRecord | null | undefined;

  switch (operation) {
    case Op.Equals:
      return text(actual) === text(value);
    case Op.NotEquals:
      return text(actual) !== text(value);
    case Op.Contains:
      return text(actual).toLowerCase().includes(text(value).toLowerCase());
    case Op.NotContains:
      return !text(actual).toLowerCase().includes(text(value).toLowerCase());
    case Op.StartsWith:
      return text(actual).toLowerCase().startsWith(text(value).toLowerCase());
    case Op.EndsWith:
      return text(actual).toLowerCase().endsWith(text(value).toLowerCase());
    case Op.IsEmpty:
      return text(actual).length === 0;
    case Op.IsNotEmpty:
      return text(actual).length > 0;
    case Op.GreaterThan:
      return compare(actual, value, '>');
    case Op.GreaterThanOrEqual:
      return compare(actual, value, '>=');
    case Op.LessThan:
      return compare(actual, value, '<');
    case Op.LessThanOrEqual:
      return compare(actual, value, '<=');
    case Op.IsAfter:
      return compare(actual, value, '>');
    case Op.IsOnOrAfter:
      return compare(actual, value, '>=');
    case Op.IsBefore:
      return compare(actual, value, '<');
    case Op.IsOnOrBefore:
      return compare(actual, value, '<=');
    case Op.ListContains:
      return Array.isArray(actual) && actual.some((entry) => text(entry) === text(value));
    case Op.ListNotContains:
      return !Array.isArray(actual) || !actual.some((entry) => text(entry) === text(value));
    case Op.KeyValueMatches:
      return text(bag?.[key ?? '']) === text(value);
    case Op.KeyValueNotMatches:
      return text(bag?.[key ?? '']) !== text(value);
    case Op.KeyValueContains:
      return text(bag?.[key ?? '']).toLowerCase().includes(text(value).toLowerCase());
    case Op.KeyValueNotContains:
      return !text(bag?.[key ?? '']).toLowerCase().includes(text(value).toLowerCase());
    case Op.ContainsKey:
      return !!bag && Object.prototype.hasOwnProperty.call(bag, key ?? '');
    case Op.NotContainsKey:
      return !bag || !Object.prototype.hasOwnProperty.call(bag, key ?? '');
    default:
      return true;
  }
}

/** Evaluates a list of conditions against an item. */
export function matchesConditions(
  item: unknown,
  conditions: Condition[],
  logic: FilterLogic = 'and',
): boolean {
  const list = conditions ?? [];
  if (list.length === 0) {
    return true;
  }
  return logic === 'or'
    ? list.some((condition) => matchesCondition(item, condition))
    : list.every((condition) => matchesCondition(item, condition));
}
