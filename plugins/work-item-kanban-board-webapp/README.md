# Work Item Kanban Board

A SystemLink webapp that displays work items as a drag-and-drop Kanban board, organized by state columns (New, Defined, Reviewed, Scheduled, In Progress, Pending Approval, Closed).

## Features

- **Drag-and-drop** work items between state columns to update their state
- **Filter** by work item type, workspace, assignee, or free-text search
- **Inline editing** — double-click a card title or assignee to edit in place
- **Detail drawer** — click a card to open a side panel for full editing (name, state, assignee, part number, description, custom properties)
- **Theme sync** — automatically follows the SystemLink light/dark theme
- **Nimble icons** — uses icon components for work item type identification

## SystemLink APIs Used

| API / SDK call | Purpose |
|-----|---------|
| `/niworkitem/v1/query-workitems` | Load all work items |
| `/niworkitem/v1/update-workitems` | Update state, assignee, and other fields |
| `getWorkItemTypes()` via `@ni/systemlink-clients-ts/work-item` | Populate the type filter |
| `/niuser/v1/users/query` | Resolve user IDs to display names |
| `/niuser/v1/workspaces` | Populate the workspace filter |

## Local development

Install dependencies from the repository root, then start the local Vite server:

```bash
npm run start --workspace @ni-kismet/ni-labs-work-item-kanban-board
```

Vite development builds use simulated work items, users, and workspaces automatically. Changes made through drag-and-drop or the drawer are kept in the current browser session. To force demo mode in a production build, add `?demo=1` to the URL; use `?demo=0` to force the real SystemLink API path during local development.

Run the local smoke checks with:

```bash
npm test --workspace @ni-kismet/ni-labs-work-item-kanban-board
```
