# Node License Management

A read-only SystemLink web app that reports how the node license count is being
consumed across a fleet. It classifies every node as managed (licensed),
unmanaged, inactive, or virtual, shows a 12-month trend, and lets you drill into
per-node detail with links back to the source system and its latest test result.

## Features

- **License summary tiles** — at-a-glance counts of total, managed (licensed),
  unmanaged, inactive, and virtual nodes; each tile filters the detail table.
- **12-month trend** — stacked bar chart of managed vs. unmanaged nodes over the
  trailing year, plus a managed/unmanaged distribution pie.
- **Per-node detail table** — Nimble table with alias, minion ID, host name, node
  type, status, registered, and last-active columns, with links to the system and
  its most recent test result.
- **Node classification** — de-duplicates systems and test-result hosts, resolves
  misclassified `SYSTEM_ID` results, and flags nodes inactive after 12 months
  without a connection.
- **SLE and SLS compatible** — probes for virtual-node support and adapts the
  system queries so the app runs on both SystemLink Enterprise and Server.
- **CSV export** — exports the full, unfiltered node list.
- **Theme sync** — automatically follows the SystemLink light/dark theme.

## SystemLink APIs Used

| API / SDK call | Purpose |
|-----|---------|
| `/nisysmgmt/v1/query-systems` | Load managed and virtual systems and their grains |
| `/nitestmonitor/v2/query-result-values` | Find distinct result host names and `SYSTEM_ID`s per month |
| `/nitestmonitor/v2/query-results` | Resolve each node's latest test result for last-active dates and result links |

## Local Demo Mode

Start the app from this directory with `npm start`, then open:

`http://127.0.0.1:4200/#/?demo=true`

Demo mode is enabled only on `localhost`, `127.0.0.1`, or `::1`. It uses local fixture data and
does not make SystemLink API requests. Remove `?demo=true` from the URL to use live data locally.

