# @ni-kismet/systemlink-plugins-ni-labs

This repository is a source repo for NI Labs plugins that are distributed through the Plugin Manager for SystemLink catalog.

It is set up to:
- build one or more plugin webapps from this repo
- package each plugin as a `.nipkg` with embedded Plugin Manager metadata
- publish the reviewed `.nipkg` as a GitHub release asset in this repo
- dispatch a thin submission manifest to `ni-kismet/systemlink-plugin-manager`

## Repository layout

```text
.
├── .github/workflows/publish-to-plugin-manager.yml
├── plugins/
│   └── ni-labs-welcome/
│       ├── app/
│       ├── nipkg.config.json
│       └── package.json
└── scripts/
    ├── build-static-plugin.mjs
    ├── create-submission-manifest.mjs
    └── list-plugins.mjs
```

## How publishing works

Each plugin lives under `plugins/<plugin-name>/` and must provide:
- an application payload under `app/` that builds to an `index.html` at the web root
- a `package.json` with at least a `build` script
- a `nipkg.config.json` containing the package metadata that will be embedded into the `.nipkg`

The GitHub Actions workflow:
1. discovers plugins from `plugins/*/nipkg.config.json`
2. builds and packages the selected plugin(s)
3. computes a thin submission manifest with `schemaVersion`, `nipkgFile`, `sha256`, `sourceRepo`, `releaseTag`, and `sourceCommit`
4. uploads the `.nipkg` to a GitHub release in this repo
5. sends a `repository_dispatch` event to `ni-kismet/systemlink-plugin-manager`

## Required secret

Create a classic PAT with `repo` scope and store it in this repository as:
- `PLUGIN_MANAGER_DISPATCH_TOKEN`

That token is used only to dispatch the submission event to the app-store repository.

## Local development

Install dependencies at the repo root:

```bash
npm ci
```

Build all plugins:

```bash
npm run build
```

Package all plugins:

```bash
npm run package
```

Build the thin submission manifest for a plugin:

```bash
npm run submission-manifest --workspace @ni-kismet/ni-labs-welcome
```

## Adding a new plugin

1. Copy `plugins/ni-labs-welcome/` to a new directory under `plugins/`
2. Update that plugin's `package.json`
3. Update `nipkg.config.json` with the real package metadata
4. Replace the contents of `app/`
5. Commit the change and either:
   - push a tag matching `<package>-v<version>` to publish a single plugin release, or
   - run the `Publish to Plugin Manager` workflow manually

## Tag convention

Per-plugin release tags use this format:

```text
<package-name>-v<semver>
```

For example:

```text
ni-labs-welcome-v0.1.0
```

The workflow filters plugins by that tag automatically on tag pushes.
