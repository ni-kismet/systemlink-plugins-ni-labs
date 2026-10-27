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
- **Localized** — follows the SystemLink UI language (English, German, French,
  Japanese, Chinese), reusing SystemLink's own translations where available.
- **Theme sync** — automatically follows the SystemLink light/dark theme.

## Localization

The saved `language` preference takes precedence over legacy `skyline-api-languages`,
then the browser language, then English. Preferences are normalized (for example,
`de-DE` becomes `de`); unsupported values fall through to the next candidate.
Korean uses English application text with Korean date/number formatting.
Reload the plugin after changing the SystemLink language.

Run `npm run i18n` to extract messages and synchronize German, French, Japanese,
and Chinese catalogs against SystemLink and `src/locale/manual/<lang>.json`.
For another server, extract first, then run
`node scripts/i18n-sync.mjs --server https://<systemlink-host>`.
If translations are missing (including during a server outage), synchronization
exits nonzero and preserves every existing localized catalog. The error count and
`src/locale/missing.<lang>.json` reports identify the entries to supply.
Manual translations, including the browser title, still need native-speaker review.

Run `npm run test:i18n` for offline catalog/placeholder checks and regression
checks covering preference precedence, runtime translations, and sync failures.
`npm test` runs both the generated-client request/retry regression checks and
these localization checks, including localized HTTP failures through the SDK.

PR #17 includes the final PR #12 SDK fixes to preserve retries, request bodies,
same-origin credentials, and network errors alongside localization.
Merge PR #12 before PR #17 so the SDK migration is reviewed and recorded separately.

## SystemLink APIs Used

| API / SDK call                    | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `/nisysmgmt/v1/query-systems`     | Load managed and virtual systems and their grains                       |
| `/nitestmonitor/v2/query-results` | Find host/`SYSTEM_ID` pairs per month and resolve latest result details |

These requests use the generated SystemLink clients with same-origin credentials.
HTTP 429/503 responses retry with backoff; each attempt sends a fresh clone of the
request so POST bodies and JSON headers are preserved.
Network failures propagate unchanged rather than becoming empty SDK responses.

Run `npm test` from this directory to check the SDK endpoints, credentials,
headers, POST-body replay, retry limits, and network-error propagation.

## Local Demo Mode

Start the app from this directory with `npm start`, then open:

`http://127.0.0.1:4200/#/?demo=true`

Demo mode is enabled only on `localhost`, `127.0.0.1`, or `::1`. It uses local fixture data and
does not make SystemLink API requests. Remove `?demo=true` from the URL to use live data locally.
