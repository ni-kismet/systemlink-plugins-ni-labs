# ATML File Manager

A SystemLink webapp for working with ATML (IEEE 1671 / IEEE 1636) test-result
files. It browses File Service files, renders ATML as a readable result summary
and step tree, and imports ATML files as native Test Monitor results so they show
up in Test Insights alongside the rest of your data.

## Features

- **File browsing** — list and search File Service files by workspace, with paging
  for large result sets.
- **ATML rendering** — parse IEEE 1671/1636 test results into a summary header
  (UUT, operator, station, outcome) and an expandable, filterable step tree with
  measurements, limits, and report text.
- **Generic XML fallback** — files that are valid XML but not recognized ATML are
  shown as a raw XML tree with a clear "not a recognized ATML format" banner.
- **Import to Test Monitor** — turn an ATML file into a native Test Monitor result
  and step hierarchy, with duplicate detection (via an `ATML Checksum` file
  property) and optional replace-on-reimport.
- **Deep links to Test Insights** — imported results link straight to their Test
  Insights steps view, and the viewed file's details update in place after import.
- **Permission-aware** — import actions are gated by the caller's workspace
  privileges so users only act where they are entitled.
- **Theme sync** — follows the SystemLink light/dark theme using NI Nimble
  components.

## SystemLink APIs Used

| API / SDK call | Purpose |
|-----|---------|
| `/nifile/v1/service-groups/Default/query-files` | List files in a workspace |
| `/nifile/v1/service-groups/Default/search-files` | Search files and dedup by checksum |
| `/nifile/v1/service-groups/Default/files/{id}/data` | Download file content for rendering |
| `/nifile/v1/service-groups/Default/upload-files` | Upload ATML files |
| `/nifile/v1/service-groups/Default/delete-files` | Remove replaced files on reimport |
| `/nifile/v1/service-groups/Default/files/{id}/update-metadata` | Set file properties (`ATML Checksum`, `testResultId`) |
| `/nitestmonitor/v2/results` | Create Test Monitor results from ATML |
| `/nitestmonitor/v2/steps` | Create the step hierarchy under a result |
| `/nitestmonitor/v2/query-results` | Find existing results for dedup and replace |
| `/nitestmonitor/v2/delete-results` | Delete results when replacing an import |
| `/nitestmonitor/v2/update-results` | Update result metadata and total time |
| `/niuser/v1/workspaces` | Populate the workspace filter |
| `/niauth/v1/auth` | Load caller privileges to gate import actions |
