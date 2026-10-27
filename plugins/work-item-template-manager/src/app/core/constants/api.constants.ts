/** SystemLink API endpoint paths. */
export const API_ROUTES = {
  getUser: '/niauth/v1/user',
  getAuth: '/niauth/v1/auth',
  queryUsers: '/niuser/v1/users/query',
  queryProducts: '/nitestmonitor/v2/query-products',
  querySystems: '/nisysmgmt/v1/query-systems',
  queryAssets: '/niapm/v1/query-assets',
  searchSystems: '/nisysmgmt/v1/materialized/search-systems',
  searchAssets: '/niapm/v1/materialized/search-assets',
  getLocations: '/nilocation/v1/locations',
  queryResults: '/nitestmonitor/v2/query-results',
  queryResultValues: '/nitestmonitor/v2/query-result-values',
  queryWorkItemTemplates: '/niworkitem/v1/query-workitem-templates',
  deleteWorkItemTemplates: '/niworkitem/v1/delete-workitem-templates',
  createOrUpdateItems: '/niuserdata/v1/items',
  queryUserDataItems: '/niuserdata/v1/query-items',
  createWorkItemTemplates: '/niworkitem/v1/workitem-templates',
  updateWorkItemTemplates: '/niworkitem/v1/update-workitem-templates',
  queryWorkflows: '/niworkitem/v1/query-workflows',
  getWorkItemTypes: '/niworkitem/v1/workitemtypes',
  uploadFile: '/nifile/v1/service-groups/Default/upload-files',
  searchFiles: '/nifile/v1/service-groups/Default/search-files',
  searchDashboards: '/dashboardhost/api/search',
  dashboardLogin: '/dashboardhost/login',
} as const;

/** User-facing notification messages for API error banners. */
export const API_ERROR_MESSAGES = {
  unknownError: $localize`An unknown error occurred`,
  failedToGetUser: $localize`Failed to get user information`,
  failedToQueryProducts: $localize`Failed to query products`,
  failedToQuerySystems: $localize`Failed to query systems`,
  failedToQueryAssets: $localize`Failed to query assets`,
  failedToQueryResults: $localize`Failed to query test results`,
  failedToQueryTemplates: $localize`Failed to query testplan templates`,
  failedToDeleteTemplates: $localize`Failed to delete testplan templates`,
  partiallyFailedToDeleteTemplates: $localize`Some testplan templates could not be deleted`,
  failedToQueryUserDataItems: $localize`Failed to query user data items`,
  failedToCreateOrUpdateUserDataItems: $localize`Failed to create or update user data items`,
  failedToCreateTemplate: $localize`Failed to create testplan template`,
  failedToCreateTemplateNamed: (name: string) =>
    $localize`Failed to create testplan template "${name}:name:". Please try again.`,
  failedToUpdateTemplate: $localize`Failed to update testplan template`,
  failedToUpdateTemplateNamed: (name: string) =>
    $localize`Failed to update testplan template "${name}:name:". Please try again.`,
  failedToUploadFile: $localize`Failed to upload file`,
  failedToUploadNamedFile: (name: string) =>
    $localize`Failed to upload file "${name}:name:". Please try again.`,
  failedToQueryWorkflows: $localize`Failed to query workflows`,
  failedToQueryWorkItemTypes: $localize`Failed to query work item types`,
  failedToQueryDashboards: $localize`Failed to query dashboards`,
  noPrivilegeToCreateTemplate: $localize`You do not have sufficient privilege to create work item templates.`,
  noPrivilegeToUpdateTemplate: $localize`You do not have sufficient privilege to update work item templates.`,
  noPrivilegeToDeleteTemplate: $localize`You do not have sufficient privilege to delete work item templates.`,
} as const;

/** Number of products requested per API batch. */
export const PRODUCT_BATCH_SIZE = 1000;

/** Number of part numbers grouped into a single product filter request. */
export const PART_NUMBER_FILTER_BATCH_SIZE = 100;

/** Default batch size for user data query pagination. */
export const USER_DATA_BATCH_SIZE = 500;

/** Number of templates requested per API batch. */
export const TEMPLATE_BATCH_SIZE = 1000;

/** Number of workflows requested per API batch. */
export const WORKFLOW_BATCH_SIZE = 100;

/** Default batch size for user queries. */
export const USER_BATCH_SIZE = 500;
