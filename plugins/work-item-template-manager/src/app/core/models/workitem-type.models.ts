import { WorkItemType } from '../constants/workitem-types.constant';

export interface IWorkItemTypeFieldRule {
  name: string;
  mandatory: boolean;
  supported: boolean;
}

export interface IWorkItemTypeDefinition {
  type: WorkItemType | string;
  description: string;
  fields: IWorkItemTypeFieldRule[];
}

export interface IGetWorkItemTypesResponse {
  workItemTypes: IWorkItemTypeDefinition[];
}
