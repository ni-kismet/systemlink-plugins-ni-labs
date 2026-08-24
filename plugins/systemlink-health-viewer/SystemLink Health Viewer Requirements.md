# OOTB Dashboard / Web App Requirements Template

**Purpose:** Capture the business problem, intended use, scope, success criteria, ownership, and stakeholder alignment needed to approve an Out-of-the-Box (OOTB) SystemLink dashboard or web application before development, enhancement, or reuse begins.

**Document intent:** This is a reviewed requirements artifact. It is not intended to be a project tracker or continuously updated status document.

**Scope of this document:** This document captures the business and functional **WHY / WHAT** for an OOTB dashboard or web application. It focuses on the business problem, intended users, scope, information needs, success criteria, ownership, and stakeholder alignment. Technical implementation details belong in the HLD and developer guidance.

**What belongs elsewhere:** Technical design, UI layout, filtering, drilldown, deployment, security implementation, data mappings, detailed testing approach, and coding standards belong in the HLD, developer guide, or review checklist.

[[_TOC_]]

---

## 1. Asset Summary

| Field | Value |
|---|---|
| Asset Name | SystemLink Health Viewer |
| Asset Type | Web App |
| Approach | Build New |
| Existing Asset or Example, if applicable | N/A |
| Epic | https://dev.azure.com/ni/DevCentral/_workitems/edit/3911381 |
| Business Owner | Moyer |
| Technical Owner | Michael Castaneda |
| Reviewer(s) | Fred, Mark, Chris |
| Stakeholder(s) | Josh, Moyer, R&D Product Owner |

**Summary**

The SystemLink Health Viewer is a read-only Angular web app (built with NI Nimble components) that runs embedded inside SystemLink and continuously verifies the health of the SystemLink platform's underlying services. It issues lightweight, same-origin API checks against a configurable set of service endpoints and presents a consolidated view of which services are functional or failed, along with response codes, latency, and service-registry state. It exists as an OOTB asset so administrators and support engineers can confirm platform health and triage service-level issues from a single page instead of manually probing each service.

**Intended-use statement:**

_This asset is intended for SystemLink administrators and support engineers who need to confirm platform health at a glance and quickly identify which service is responsible when the environment is degraded or upgraded._

---

## 2. Business Problem

1. **What business problem is being addressed?**
   There is no simple, consolidated way to confirm that the many services that make up a SystemLink deployment are actually responding and healthy. When something is wrong, it is difficult to quickly determine which service is at fault.

2. **Who experiences this problem?**
   Teams responsible for deploying, operating, and troubleshooting SystemLink environments.

3. **How is the work performed today?**
   Health is verified ad hoc, typically by manually navigating the SystemLink UIs, checking logs, or reproducing a user-reported failure to infer which service is down. This requires knowledge of each service's endpoints.

4. **What is inefficient, manual, inconsistent, unclear, or difficult today?**
   Probing dozens of services one at a time is slow, error-prone, and requires specialized knowledge. There is no single, repeatable pass/fail snapshot, so results are inconsistent between people and hard to communicate.

5. **What information, visibility, or workflow is missing?**
   A single at-a-glance view of every relevant SystemLink service showing functional/failed status, HTTP response code, response latency, service-registry state, and the raw response payload for troubleshooting.

6. **Why is this worth addressing as an OOTB dashboard or web app?**
   Platform health checking is a universal need across every SystemLink deployment. A reusable, configuration-driven OOTB web app removes the need for custom scripts or per-engagement tooling and gives every customer and field team the same consistent triage experience.


---

## 3. Intended Users and Use

1. **Who is the intended audience for this asset?**
   SystemLink administrators, IT/DevOps and support engineers, and NI field/service personnel operating or supporting a SystemLink environment.

2. **What job, workflow, or decision does this asset support?**
   It supports platform health verification and incident triage: confirming the environment is fully operational, and, when it is not, quickly identifying which specific service(s) are failing so the right remediation can be taken.

3. **What specific information or capability does the application provide to the user to complete the workflow?**
   Per-service functional/failed status, HTTP response code, response latency, service-registry state, and the trimmed response payload; plus aggregate indicators such as total tests, functional count, failed count, overall health/availability percentage, and average latency. Search and status filtering help isolate a specific service or just the failures.


---

## 4. Scope

### In Scope

1. Which SystemLink editions and versions must be supported?
Valinor (SL Base, Full, Pro) and SLE

2. Does this app require any configuration?
Yes

3. How will this application be configured? At runtime/build?
At build-time

4. Provide a list of in-scope functionality:
- Read-only, same-origin health checks against a configurable set of SystemLink service endpoints, defined in `assets/test-mapping.json`.
- A consolidated table showing, per check: service name, method/command, endpoint, service-registry state, response code, latency, functional/failed status, and access to the raw response output.
- Summary indicators: total tests, functional count, failed count, overall health/availability percentage, and average latency.
- Search across services, endpoints, and output; status filtering (all / functional / failed) driven by the summary cards.
- On-demand manual refresh of all checks.
- Detail view (modal) showing the trimmed response payload for a selected check.
- Service-registry awareness (checks can require or be gated by registry presence/state).
- Nimble theme-aware UI (light/dark) matching the host SystemLink shell.
- Reads app configuration/version from the host (`/api/config`).
- Valinor (SL Base, Full, Pro) and SLE

### Out of Scope

- Writing, modifying, or deleting any SystemLink data or configuration (the app is strictly read-only).
- Continuous/automated background monitoring, alerting, notifications, or paging.
- Historical trending, persistence, or storage of health results over time.
- Root-cause analysis, log aggregation, or automated remediation of failing services.
- Infrastructure/host-level metrics (CPU, memory, disk, container status).
- Authentication/identity management (the app relies on the host session and same-origin routing).
- Cross-origin or multi-deployment monitoring from a single instance.
- A UI to configure the `assets/test-mapping.json`. 
- Does not support dynamic changes to the endpoints at runtime.
- No automatic refresh
- SLS Support
- Testing S3 File Storage

## 5. Alignment and Ownership

1. **Does an equivalent solution already exist?**
   No known OOTB equivalent within SystemLink; health is currently verified manually or with ad hoc scripts. Should align on a single solution and delete older implementations.

2. **Is there an existing dashboard, web app, prototype, customer-specific asset, or R&D implementation that should be reused, enhanced, or incorporated?**
   There are various implementations. This implementation consolidates several strategies across all of the implementations.

3. **Does this asset overlap with another roadmap item, customer deliverable, or internal initiative?**
   _TBD._ Potential overlap with any platform observability/monitoring roadmap work should be reviewed.

4. **If an R&D solution planned, is it in progress, or when will it be available? Provide the AzDO ticket.**
   _TBD._ To be confirmed.

5. **Who owns the asset after release or publication?**
   Mark and Chris

6. **Who should review the asset before development proceeds?**
   _TBD_ — recommended reviewers include SystemLink platform/architecture and field/support representatives.

7. **Is this intended as a permanent solution for a product-gap?**
  _TBD

8. **Will this app be sold?**
   No

9. **Are there known dependencies, risks, or open questions that could affect whether this should proceed?**
   - Checks and their required entitlements are configuration-driven; the endpoint list must be kept current as services evolve.
   - Results reflect API reachability/response codes, not deep functional correctness of each service.
   - Endpoints or entitlements may vary by SystemLink edition and deployment, so some checks may not apply everywhere.

## 5. Security and Permissions

The app is read-only and issues same-origin requests using the signed-in user's existing SystemLink session; it does not manage or store credentials. The specific services exercised are driven by `assets/test-mapping.json` and each check declares the entitlements (e.g. `SystemLink_Edition_Base/Full/Pro/Enterprise`) required to run. Read access is needed to the following services (representative list from the current configuration):

| Service | Read/Write |
|---|---|
| Service Registry (`/niserviceregistry`) | Read |
| Security / Auth (`/niauth`) | Read |
| Comments (`/nicomments`) | Read |
| DataFrame (`/nidataframe`) | Read |
| Dashboard Host (`/dashboardhost`) | Read |
| Dynamic Form Fields (`/nidynamicformfields`) | Read |
| JupyterHub (`/jupyterhub`) | Read |
| Notebook / Notebook Execution (`/ninotebook`) | Read |
| Notification (`/ninotification`) | Read |
| Repository (`/nirepo`) | Read |
| Routine Executor / Routines (`/niroutineexecutor`) | Read |
| Tag Historian / Tags (`/nitaghistorian`, `/nitag`) | Read |
| User Data (`/niuserdata`) | Read |
| Systems State / Systems Management (`/nisystemsstate`, `/nisysmgmt`) | Read |
| Locations | Read |
| Test Monitor (`/nitestmonitor`) | Read |
| Asset Performance Management | Read |
| File Ingestion (`/nifile`) | Read |
| Feeds (`/nifeed`) | Read |
| Work Item | Read |
| Alarm Service | Read |
| Web App Services | Read |
| Specification (`/nispec`) | Read | <- delete the endpoints>
| AI Assistant | Read |
| NI License | Read |
| TDM Reader | Read |


## 6. Success Criteria
_Define what business success means if this asset is delivered. These should describe outcomes, not implementation details._


- Users can determine overall SystemLink platform health at a glance without manually checking each service. 
- Users can quickly identify which specific service(s) are failing and view enough detail (response code, latency, payload) to begin triage. 
- The asset provides a reusable, configuration-driven OOTB example that can be adopted in any SystemLink deployment without custom development. 
- The asset reduces reliance on ad hoc scripts, manual API probing, or direct service inspection to verify health. 
- New services can be added to the health checks via configuration (`test-mapping.json`) without code changes.


---

## Appendix A: Belongs Outside This Requirements Document
The following items should be captured in the HLD, developer guide, coding standards, review checklist, or release process instead of this requirements document:

- UI layout and page design
- Dashboard or web app navigation
- Filtering, sorting, drilldown, and export mechanics
- Visualization selection
- Technical architecture
- Data architecture and mappings
- API design or backend service changes
- Security implementation details
- Deployment and configuration
- CI/CD, repository, and package structure
- Unit, system, regression, and compatibility testing details
- Code review and static analysis requirements
- Operational runbooks and support procedures
