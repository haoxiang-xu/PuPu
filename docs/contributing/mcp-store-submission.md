# Submitting an MCP server to the PuPu store

PuPu ships a built-in MCP tool store. Anyone can propose a new server. There are
two ways in.

## Option A — Issue form (recommended, no code)

Open a **[🧩 Submit an MCP server](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-mcp-server.yml)**
issue and fill in the fields. It receives `mcp-submission`, and
`considering`. Maintainers evaluate the proposal and can help prepare a catalog
entry; submission does not promise acceptance or a release date. For Skills and
Toolkits, use the [matching community form](./community-submissions.md).

## Option B — Pull request (for developers)

1. Fork the repo and create your contribution branch from the upstream `dev`
   branch. If your fork only contains `main`, fetch upstream `dev` first.
2. Add an entry to `src/SERVICEs/mcp_toolkit_registry.json` following the schema
   in `src/SERVICEs/mcp_toolkit_registry.schema.json` and the existing entries.
3. Run validation locally:

   ```bash
   npm run validate:mcp
   ```

4. Open a PR against **`haoxiang-xu/PuPu` with `base: dev`** and your contribution
   branch as the head. GitHub may default to `main`; change the base to `dev`
   before submitting. CI re-runs validation on every change to the catalog.

`main` is the release branch. Maintainers promote `dev` to `main`; ordinary
contribution PRs targeting `main` fail the source-branch check.

## What we require

- **Pin the version.** Install commands must pin (`@1.2.3`), never bare `@latest`.
- **`toolkitId` format:** `mcp.<server>.<slug>` (lowercase, hyphenated).
- **Confirmation defaults:** any tool with side effects should set
  `requiresConfirmation: true`. Tell us which tools are safe to auto-run.
- **Secrets / OAuth:** declare them, their scopes, and where data is sent.
- **Provider and costs:** say who operates the service, whether its hosted
  backend is public, which tools are paid, and any known limitations.
- **Evidence:** distinguish your actual tests from the provider's claims.

## Submission and installation status

Start an unaccepted entry as `trustLevel: needs_review`, `status: needs_review`,
and `installable: false`. These fields mean a maintainer has not yet made the
catalog decision; they are not a demand for a guarantee of the entire service.

When an entry is accepted as a working third-party integration, maintainers can
set `trustLevel: community`, `status: available`, and `installable: true`.
Change all three together: the validator rejects an installable entry that is
still marked `needs_review`. A specific integration defect may justify keeping
an entry unavailable, but lack of comprehensive provider verification alone does
not require a permanent installation block.

The current schema also contains `official` and `verified`; contributors should
not self-award those values. `community` does not promise accuracy or paid-service
delivery. Provider provenance and specific test records are being separated in
[#278](https://github.com/haoxiang-xu/PuPu/issues/278).

## What happens after you submit

1. **Validation** — schema, IDs, category, version pins, and consistent status
   fields are checked in CI for catalog PRs.
2. **Review** — maintainers inspect the actual diff, permissions, integration
   behavior, costs, limitations, and available evidence.
3. **Decision** — maintainers decide inclusion and installation availability,
   apply labels, and merge accepted contributions to `dev`.

Related PRs use `mcp-submission`; choose MCP in the PR template
and maintainers can apply those labels. A catalog merge with installation still
set to false does not make the integration usable. A release must include the
accepted, enabled configuration; in local development, restart the backend
when the registry changes because it is loaded at process startup.

By contributing you agree to the terms in [docs/CLA.md](../CLA.md).
