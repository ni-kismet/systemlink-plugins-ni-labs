import { FilterOperation } from '../library/systemlink-query-generators';

/** UI metadata for a {@link FilterOperation}: dropdown label plus which editors it needs. */
export interface IFilterOperationMeta {
  /** Text shown in the operator dropdown, using SystemLink query-builder wording. */
  label: string;
  /** False for unary operations (Is empty / has key) that need no value editor. */
  needsValue: boolean;
  /** True for key-based operations that need a property-key input. */
  needsKey: boolean;
}

/**
 * Display label + editor requirements for every {@link FilterOperation}.
 *
 * The standalone LINQ library intentionally ships no UI strings, so the app owns
 * the operator labels here.
 */
export const FILTER_OPERATION_META: Record<FilterOperation, IFilterOperationMeta> = {
  [FilterOperation.Equals]: { label: $localize`equals`, needsValue: true, needsKey: false },
  [FilterOperation.NotEquals]: { label: $localize`does not equal`, needsValue: true, needsKey: false },
  [FilterOperation.Contains]: { label: $localize`contains`, needsValue: true, needsKey: false },
  [FilterOperation.NotContains]: { label: $localize`does not contain`, needsValue: true, needsKey: false },
  [FilterOperation.StartsWith]: { label: $localize`starts with`, needsValue: true, needsKey: false },
  [FilterOperation.EndsWith]: { label: $localize`ends with`, needsValue: true, needsKey: false },
  [FilterOperation.IsEmpty]: { label: $localize`is blank`, needsValue: false, needsKey: false },
  [FilterOperation.IsNotEmpty]: { label: $localize`is not blank`, needsValue: false, needsKey: false },
  [FilterOperation.GreaterThan]: { label: $localize`greater than`, needsValue: true, needsKey: false },
  [FilterOperation.GreaterThanOrEqual]: { label: $localize`greater than or equal to`, needsValue: true, needsKey: false },
  [FilterOperation.LessThan]: { label: $localize`less than`, needsValue: true, needsKey: false },
  [FilterOperation.LessThanOrEqual]: { label: $localize`less than or equal to`, needsValue: true, needsKey: false },
  [FilterOperation.IsAfter]: { label: $localize`is after`, needsValue: true, needsKey: false },
  [FilterOperation.IsOnOrAfter]: { label: $localize`is on or after`, needsValue: true, needsKey: false },
  [FilterOperation.IsBefore]: { label: $localize`is before`, needsValue: true, needsKey: false },
  [FilterOperation.IsOnOrBefore]: { label: $localize`is on or before`, needsValue: true, needsKey: false },
  [FilterOperation.ListContains]: { label: $localize`contains`, needsValue: true, needsKey: false },
  [FilterOperation.ListNotContains]: { label: $localize`does not contain`, needsValue: true, needsKey: false },
  [FilterOperation.KeyValueMatches]: { label: $localize`matches`, needsValue: true, needsKey: true },
  [FilterOperation.KeyValueNotMatches]: { label: $localize`does not match`, needsValue: true, needsKey: true },
  [FilterOperation.KeyValueContains]: { label: $localize`contains`, needsValue: true, needsKey: true },
  [FilterOperation.KeyValueNotContains]: { label: $localize`does not contain`, needsValue: true, needsKey: true },
  [FilterOperation.ContainsKey]: { label: $localize`has key`, needsValue: false, needsKey: true },
  [FilterOperation.NotContainsKey]: { label: $localize`does not have key`, needsValue: false, needsKey: true },
  [FilterOperation.Raw]: { label: $localize`raw`, needsValue: false, needsKey: false },
};
