# Work Item Template Manager

A hosted SystemLink web app for creating and maintaining work item templates (test plans, work orders, and other work item types) without using the API or CLI.

## Features

- Searchable grid of all work item templates with cascading filters (workspace, type, product family, product, group), configurable columns, and grouping. Preferences are saved per user.
- Create, edit, duplicate (into another workspace), and delete (single or multiple) templates.
- Product families and products (names resolved per workspace), workflow, test program, estimated duration, summary, and description.
- Resource filters for systems, DUTs, fixtures, and assets using a visual query builder or a typed expression. Filters are written in Lucene when the server has advanced search (Elasticsearch) enabled, and in LINQ otherwise; the app detects this automatically and converts existing filters when it can do so without loss.
- Dashboard selection with dashboard parameters.
- File attachments (upload new or attach existing files) and custom properties.
- Dynamic Form Fields: customer-configured request forms appear as tabs and follow their display, read-only, and required rules, matching the native SystemLink work item form.
- Localized to follow the SystemLink UI language (German, French, Japanese, Chinese; English otherwise).
- Follows SystemLink's theme, defaulting to dark if the browser blocks access to stored preferences.

## Requirements

- SystemLink Enterprise with the Work Item service.
- Dynamic Form Fields tabs require the Dynamic Form Fields service. Without it the app runs without those tabs.

## Permissions

The app runs as the signed-in user and never handles credentials. Actions are limited by the user's own permissions:

| Service | Access | Used for |
| --- | --- | --- |
| Work Item (templates) | Read/Write | List, create, update, duplicate, and delete templates (`workitemtemplate:Query/Create/Update/Delete`) |
| Work Item (workflows, types) | Read | Workflow selection and per-type field rules |
| Dynamic Form Fields | Read | Render custom request forms |
| File | Read/Write | Template attachments |
| User Data | Read/Write | Grid column and filter preferences |
| Test Monitor | Read | Products, test programs, estimated duration |
| Systems Management, Asset Management | Read | Resource filter builder values; search availability (Lucene vs. LINQ) |
| Location | Read | Physical-location options in resource filters (also proxied during development) |
| User, Auth | Read | User names, workspaces, permissions |
| Dashboard host | Read | Dashboard selection |

Create, edit, duplicate, and delete controls are hidden or disabled when the user lacks the matching permission in the template's workspace.

## Development

```bash
npm install
cp .env.example .env   # set SYSTEMLINK_TARGET_URL and SYSTEMLINK_API_KEY for the dev proxy
npm start
```

Build the web app into `dist/work-item-template-manager/browser`:

```bash
npm run build
```

Update translations (extract strings and sync from SystemLink's own translations):

```bash
npm run i18n
```

## License

MIT
