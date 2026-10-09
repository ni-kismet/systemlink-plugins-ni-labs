# SystemLink Usage Statistics

A SystemLink webapp that shows, in one place, how much a SystemLink instance is
being used. It counts the core resources across services — assets and systems,
tags, test data, files, data tables, users, work items, routines, notebooks,
dashboards, feeds, and packages — for the whole instance or a single workspace,
and records administrator snapshots so growth over time can be reviewed.

## Features

- **Consolidated usage inventory** — 30+ metrics grouped into Assets and System
  Management, Configuration Management, Data Management, User Management,
  Operations and Scheduling, and Analytics and Visualizations.
- **Workspace filter** — view counts for **All** workspaces (default) or a single
  workspace; instance-wide metrics (users, workspaces, roles) are hidden when a
  workspace is selected.
- **Sizing extremes** — largest file and largest data table (rows and columns).
- **Progressive loading** — metrics stream in as they resolve, each with a
  retrieved / failed / not-authorized status.
- **Optional-service aware** — metrics backed by services that are not installed
  (DataFrame, Locations) are hidden automatically.
- **Growth history (administrators)** — with **All** selected, each refresh is
  recorded as `SystemLink.Statistics.*` tags, a daily growth rate is shown per
  metric, and a metric's history can be viewed and exported.
- **Search and CSV export** — filter metrics by name, description, or value and
  export the current snapshot or a metric's history.
- **Localized** — follows the SystemLink UI language (English, German, French,
  Japanese, Chinese), reusing SystemLink's own translations where available.
- **Theme sync** — follows the SystemLink light/dark theme using NI Nimble
  components.

## SystemLink APIs Used

| API / SDK call | Purpose |
| --- | --- |
| `/niserviceregistry/v1/services` | Detect optional services (DataFrame, Locations) |
| `/niauth/v1/auth` | Determine whether the current user is an administrator |
| `/niauth/v1/policy-templates` | Count roles |
| `/niuser/v1/workspaces` | Populate the workspace filter, count workspaces, resolve the current workspace |
| `/niuser/v1/users/query` | Count users |
| `/nitestmonitor/v2/query-results` | Count test results |
| `/nitestmonitor/v2/query-steps` | Count test steps |
| `/nitestmonitor/v2/query-products` | Count products |
| `/niapm/v1/query-assets` | Count assets |
| `/nisysmgmt/v1/get-systems-summary` | Count connected, disconnected, and virtual systems |
| `/nisysmgmt/v1/query-systems` | Count systems by state within a workspace |
| `/nisystemsstate/v1/states` | Count software states |
| `/nilocation/v1/locations` | Count locations |
| `/nitag/v2/tags-count`, `/nitag/v2/tags` | Count tags |
| `/nitag/v2/update-tags`, `/nitag/v2/update-current-values` | Record usage snapshots (administrators only) |
| `/nitaghistorian/v2/tags/query-history` | Read snapshot history for daily rates (administrators only) |
| `/nidataframe/v1/query-tables` | Count data tables and find the largest rows/columns |
| `/nifile/v1/service-groups/Default/files`, `/query-files`, `/query-files-linq` | Count files and find the largest file |
| `/niapp/v1/webapps/query` | Count data spaces |
| `/niworkitem/v1/workitemtypes`, `/niworkitem/v1/query-workitems` | Count work items by type |
| `/niworkitem/v1/query-workflows`, `/niworkorder/v1/query-workflows` | Count workflows |
| `/niworkitem/v1/query-workitem-templates` | Count work item templates |
| `/niroutine/v1/routines`, `/niroutine/v2/routines` | Count enabled, disabled, and alarm-action routines |
| `/nifeed/v1/feeds`, `/nifeed/v1/feeds/{id}/packages` | Count feeds and packages |
| `/ninotebook/v1/notebook/query` | Count published notebooks |
| `/dashboardhost/api/search` | Count dashboards (per workspace via folder UID) |
