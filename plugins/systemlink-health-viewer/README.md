# SystemLink Health Viewer

A SystemLink webapp that probes SystemLink service endpoints and visualizes their
health, availability, and latency in a read-only dashboard built with Angular and
Nimble components.

## Features

- **Service summary cards** — total, functional, and failed services, overall
  availability, and average latency at a glance
- **Per-endpoint health checks** — reports response code, latency, and a compact
  response preview for each configured service, with full output in the details modal
- **Configurable probes** — the set of endpoints to check is driven by a
  `test-mapping.json` asset, so services can be added or disabled without code changes
- **Service registry awareness** — cross-references the SystemLink service registry
  to reflect each service's installed/live state
- **Search and status filters** — quickly narrow the list by name or health status
- **Endpoint output details modal** — inspect the full response for any check
- **Theme sync** — automatically follows the SystemLink light/dark theme
- **Same-origin, read-only** — resolves endpoints relative to the hosting webapp; no
  data is modified

## SystemLink APIs Used

| API / SDK call | Purpose |
|-----|---------|
| `/niserviceregistry/v1/services` | Discover installed services and their live status |
| `/niauth/v1/auth` | Resolve the session's edition entitlements to select applicable checks |
| Configurable endpoints from `assets/test-mapping.json` | Probe each service's health (e.g. `/niauth/v1/policies`, `/nidataframe/v1/tables`, `/ninotebook/v1/notebook/query`, `/nitaghistorian/v2/tags/query-history`, `/nilocation/v1/locations`, and others) |
