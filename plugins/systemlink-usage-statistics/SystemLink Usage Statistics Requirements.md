# SystemLink Usage Statistics — OOTB Web App Requirements

**Purpose:** Capture the business problem, intended use, scope, and success criteria for the SystemLink Usage Statistics web app so stakeholders can align before development and enhancement continues.

**Document intent:** Describe the *why* and *what* of this asset — the business need it serves and the outcomes it must deliver.

**Scope of this document:** Business-facing requirements only. It defines the problem, users, boundaries, security posture, and success criteria.

**What belongs elsewhere:** Technical design, UI layout, API routes, data mappings, security implementation, and deployment/CI details belong in the HLD / developer guide.

[[_TOC_]]

## 1. Asset Summary

| Field | Value |
| --- | --- |
| Asset Name | SystemLink Usage Statistics |
| Asset Type | Hosted SystemLink web app (Angular / Nimble) |
| Technical Owner | Mike Castaneda |
| Stakeholder(s) | SystemLink administrators, account/customer success teams, solutions engineering, IT/infrastructure owners |

**Summary:** SystemLink Usage Statistics provides a single, in-shell view of how much a SystemLink instance is being used. It counts the core resources across services — assets and systems, tags, test results and steps, products, files, data tables, users, workspaces, roles, work items, workflows, routines, notebooks, dashboards, feeds, and packages — and presents them as a searchable, categorized list that can be exported to CSV. For administrators, each refresh is also recorded as a historical snapshot so growth over time (daily rate) can be reviewed per metric.

**Intended-use statement:** _An administrator or customer-facing engineer opens SystemLink Usage Statistics from the SystemLink shell to see, in one place, how much data and configuration the instance holds today, how fast it is growing, and to export that snapshot for capacity planning, health reviews, or customer reporting._

## 2. Business Problem

1. **What business problem is being addressed?** There is no single place in SystemLink that shows the overall footprint and adoption of an instance. Understanding "how big is this system and how is it being used" requires visiting many separate apps or querying many services individually.
2. **Who experiences this problem?** SystemLink administrators, IT/infrastructure owners responsible for capacity and sizing, and NI/Emerson customer-facing teams (account management, customer success, solutions engineering) conducting health checks or adoption reviews.
3. **How is the work performed today?** Manually — opening each SystemLink app (Assets, Systems, Test Insights, Files, Work Items, Routines, Dashboards, etc.) and noting counts, or scripting calls against each service's API / `slcli`.
4. **What is inefficient, manual, inconsistent, unclear, or difficult today?** Collecting counts is slow and error-prone; many apps don't show totals at all; results differ depending on who collects them and how; and there is no record of how counts change over time, so growth trends can't be assessed.
5. **What information, visibility, or workflow is missing?** A consolidated, repeatable inventory of instance usage across all core services, the size extremes that drive sizing decisions (largest file, largest data table), a historical trend per metric, and an easy way to share the snapshot.
6. **Why is this worth addressing as an OOTB dashboard or web app?** Usage and growth visibility is a recurring need for every deployment (sizing, upgrade planning, license/adoption conversations, support triage). A hosted app makes it available on any instance without scripts or special tooling, and produces consistent results.

## 3. Intended Users and Use

1. **Who is the intended audience for this asset?** Primarily SystemLink administrators; secondarily any SystemLink user who needs a read-only view of instance usage, and customer-facing engineers working with an administrator.
2. **What job, workflow, or decision does this asset support?** Capacity and sizing planning, periodic instance health/adoption reviews, upgrade and migration preparation, and support triage (understanding scale before investigating performance issues).
3. **What specific information or capability does the application provide to the user to complete the workflow?**
   - Current counts for 30+ usage metrics grouped into categories: Assets & Systems, Configuration, Data (Test & File), Users & Access, Operations, and Analytics.
   - Size extremes relevant to sizing: largest file, largest data table (rows and columns).
   - A per-metric status indicating whether the count was retrieved, failed, or was not permitted for the current user.
   - For administrators: a daily growth rate per metric and a historical value table for any selected metric.
   - Search across metrics and CSV export of the current snapshot and of a metric's history.

## 4. Scope

### In Scope

1. **Which SystemLink editions and versions must be supported?** SystemLink Enterprise. Metrics backed by optional services (DataFrame, Locations) are hidden automatically where those services are not installed. _Specific minimum version TBD._
2. **Does this app require any configuration?** No. It runs same-origin with the signed-in user's session and requires no setup.
3. **How will this application be configured? At runtime/build?** No runtime configuration UI. Behavior is determined at build time; the workspace used for historical statistics follows the workspace the app is opened in (default `Default`).
4. **Provide a list of in-scope functionality:**
   - Collect and display current counts for core SystemLink resources across services:
     - **Assets & Systems:** assets; total, connected, disconnected, and virtual systems; locations; tags.
     - **Configuration:** software states, package feeds, packages.
     - **Data (Test & File):** products, test results, test steps, data tables, largest data table rows/columns, files, largest file size, data spaces.
     - **Users & Access:** users, workspaces, roles.
     - **Operations:** total work items with a breakdown by work item type, workflows, work item templates.
     - **Analytics:** dashboards, published notebooks, enabled routines, disabled routines, routines with alarm actions.
   - Show results progressively as each metric arrives, with a clear status per metric (retrieved / failed / not authorized).
   - Hide metrics whose backing service is not installed on the instance.
   - Search metrics by name, description, or value.
   - Filter metrics by workspace (default **All**). Instance-wide metrics (users, workspaces, roles) are hidden when a single workspace is selected.
   - Manual refresh.
   - Export the current snapshot to CSV.
   - For administrators only, with **All** workspaces selected: record each refresh as a historical snapshot, show a daily growth rate per metric, and view/export a metric's history. History is not kept per workspace.

### Out of Scope

- Any create, edit, or delete of the resources being counted (the app is an inventory, not a management tool).
- Per-user or per-system usage breakdowns and attribution (who created what).
- Historical snapshots or growth rates for individual workspaces.
- Activity/telemetry analytics such as logins, page views, API call volume, or feature usage.
- Server infrastructure metrics (CPU, memory, disk, database size, pod health).
- License entitlement or compliance reporting.
- Scheduled/unattended collection of statistics; history is only recorded when an administrator opens or refreshes the app.
- Alerting or notifications on thresholds or growth.
- Cross-instance aggregation or comparison.

## 5. Security and Permissions

### 5.1 Authentication and session model

- **Hosted, same-origin app.** All requests target the same origin the app is served from; there are no cross-origin or third-party calls.
- **Session-based auth.** The app sends the user's existing SystemLink browser session with each request. It never collects, stores, or transmits usernames, passwords, tokens, or API keys.
- **Optional API-key mode (non-default).** A build-time API-key mode exists for local/dev use only; it is not used in the hosted deployment.
- **Least privilege / delegated authorization.** The app performs no privilege elevation. Every call executes as the signed-in user, so each count is bounded by that user's own entitlements; metrics the user cannot read are shown as not authorized.
- **Administrator-only writes.** The only write behavior (recording historical snapshots as tags) and the history/daily-rate views are enabled only when the current user is identified as a server administrator.
- **No sensitive data at rest.** The app persists nothing sensitive in the browser. The only persisted data are aggregate counts written to tags.

### 5.2 Service-level access summary

| Service | Read/Write | Why |
| --- | --- | --- |
| Service Registry (`niserviceregistry`) | Read | Detect optional services (DataFrame, Locations) so unsupported metrics are hidden. |
| Auth (`niauth`) | Read | Determine whether the current user is an administrator; count roles. |
| User (`niuser`) | Read | Count users and workspaces; resolve the current workspace. |
| Test Monitor (`nitestmonitor`) | Read | Count products, test results, and test steps. |
| Asset Management (`niapm`) | Read | Count assets. |
| Systems Management (`nisysmgmt`) | Read | Count total, connected, disconnected, and virtual systems. |
| Systems State (`nisystemsstate`) | Read | Count software states. |
| Locations (`nilocation`) — optional | Read | Count locations. |
| Tag (`nitag`) | Read/Write | Read to count tags; write (administrators only) to record usage snapshots under `SystemLink.Statistics.*`. |
| Tag Historian (`nitaghistorian`) | Read | Read snapshot history for daily rate and history views (administrators only). |
| DataFrame (`nidataframe`) — optional | Read | Count data tables; find largest table rows/columns. |
| File (`nifile`) | Read | Count files; find largest file. |
| Web App (`niapp`) | Read | Count data spaces. |
| Work Item (`niworkitem`) | Read | Count work items by type, workflows, and templates. |
| Work Order (`niworkorder`) | Read | Count workflows (legacy location). |
| Routine (`niroutine`) | Read | Count enabled, disabled, and alarm-action routines. |
| Feed (`nifeed`) | Read | Count feeds and packages. |
| Notebook (`ninotebook`) | Read | Count published notebooks. |
| Dashboard Host (`dashboardhost` / Grafana) | Read | Count dashboards. |

### 5.3 Data handling notes

- **Aggregate data only.** The app reads resources solely to count them or find size extremes; it does not display or export individual record contents (no test data, file contents, or user details).
- **Narrow write scope.** Writes are limited to the app's own `SystemLink.Statistics.*` integer tags in the current workspace (retained for 365 days). No other resource type is created, modified, or deleted.
- **CSV exports** contain only metric names, statuses, counts, descriptions, and timestamps, and are generated locally in the browser.

## 6. Success Criteria

- An administrator can see an accurate, consolidated picture of instance usage across all core services in a single view, without scripts or visiting multiple apps.
- Usage snapshots are consistent and repeatable, so two people reviewing the same instance get the same answer.
- Administrators can see how key metrics are trending over time and identify fast-growing areas for capacity planning.
- A usage snapshot can be shared outside SystemLink (CSV) for health reviews, upgrade planning, or customer reporting.
- The app works on instances with different installed services, hiding what doesn't apply and clearly flagging metrics that could not be retrieved or are not permitted.
- Opening the app does not noticeably disrupt the instance or other users.
- The app behaves predictably in the SystemLink shell (theme-aware, stable layout, no disruptive refresh).
