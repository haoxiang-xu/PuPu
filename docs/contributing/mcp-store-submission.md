# Submitting an MCP server to the PuPu store

PuPu ships a built-in MCP tool store. Anyone can propose a new server. There are
two ways in.

## Option A — Issue form (recommended, no code)

Open a **[🧩 Submit an MCP server](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-mcp-server.yml)**
issue and fill in the fields. A maintainer (with the store curator) turns it into
a catalog entry and opens the PR for you.

## Option B — Pull request (for developers)

1. Fork the repo.
2. Add an entry to `src/SERVICEs/mcp_toolkit_registry.json` following the schema
   in `src/SERVICEs/mcp_toolkit_registry.schema.json` and the existing entries.
3. Run validation locally:

   ```bash
   npm run validate:mcp
   ```

4. Open a PR. CI re-runs validation on every change to the catalog.

## What we require

- **Pin the version.** Install commands must pin (`@1.2.3`), never bare `@latest`.
- **`toolkitId` format:** `mcp.<server>.<slug>` (lowercase, hyphenated).
- **Confirmation defaults:** any tool with side effects should set
  `requiresConfirmation: true`. Tell us which tools are safe to auto-run.
- **Secrets / OAuth:** declare them. Entries with auth surface get a deeper
  review and do not start above `needs_review`.

## Trust levels

New entries land as **`needs_review`** and ship only after a human security
review by the maintainers. After review an entry is promoted to:

| Level | Meaning |
|-------|---------|
| `needs_review` | Submitted; pending / in security review (default landing state) |
| `community` | Reviewed; community-sourced |
| `verified` | Reviewed; well-known / trusted source |
| `official` | Maintainer-backed (maintainers only) |

Every trust level except `official` carries a visible badge in the store UI
(`verified`, `community`, and `needs_review` all render a colored badge);
`official` entries render no badge.

## What happens after you submit

1. **Validation** — schema, `toolkitId` format/uniqueness, category, trustLevel
   (automatic, in CI).
2. **Security review** — source trust, secrets/OAuth surface, tool permissions,
   supply-chain (command/args target, pinned version). Always a human gate.
3. **Triage** — maintainer sets the final trust level and merges.

By contributing you agree to the terms in [docs/CLA.md](../CLA.md).
