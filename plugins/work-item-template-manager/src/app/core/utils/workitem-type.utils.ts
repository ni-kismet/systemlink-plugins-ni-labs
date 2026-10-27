import { WorkItemType } from '../constants/workitem-types.constant';

// Same English text as SystemLink so its translations apply.
const WORK_ITEM_TYPE_LABELS: Record<string, string> = {
  [WorkItemType.Testplan]: $localize`Test plan`,
  workorder: $localize`Work order`,
  [WorkItemType.Job]: $localize`Job`,
  [WorkItemType.Maintenance]: $localize`Maintenance`,
  [WorkItemType.Calibration]: $localize`Calibration`,
  [WorkItemType.Reservation]: $localize`Reservation`,
  transportorder: $localize`Transport order`,
};

/** Display label for a work item type value; unknown (custom) types are shown capitalized. */
export function getWorkItemTypeLabel(type: string | null | undefined): string {
  if (!type) {
    return '';
  }
  return WORK_ITEM_TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}
