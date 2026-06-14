---
name: sqlite-entry-2026-06
description: SQLite MCP store entry (mcp.workspace.sqlite, community, uvx pinned ==2025.4.25) — local-file workspace tool, no secret, append_insight gated as resource-write
metadata:
  type: project
---

**SQLite entry added 2026-06-13** (CEO onboarding round 2026-06-12, Step 5 / final). Filesystem-sibling local-file workspace tool; markitdown/fetch-sibling for uvx/stdio shape. Postgres was DEFERRED this round (not added).

- id `workspace.sqlite` / toolkitId `mcp.workspace.sqlite` / category `workspace`.
- Package `mcp-server-sqlite` — official MCP **reference** server, **PyPI/uvx only (NOT npm)**, lives in the **archived** repo `modelcontextprotocol/servers-archived` (`src/sqlite`). Hence `trustLevel: community` (official-but-archived), MIT.
- mcp: `uvx mcp-server-sqlite==2025.4.25 --db-path ${WORKSPACE}`. **Version pinned** per the CTO standing rule ([[discord-entry-and-version-pin-rule]]); community stdio never @latest. **uvx pins via `package==version`** (verified live: `uvx mcp-server-sqlite==2025.4.25` resolves/installs; `--help` confirms `--db-path`).
- **db path is a CLI ARG, not env** (`--db-path`, default `./sqlite_mcp_server.db`). Wired like filesystem: `workspace{required:true, placeholder:"${WORKSPACE}", binding:"agent_workspace_root"}` + `${WORKSPACE}` token in args. Backend (`mcp_toolkits.py` ~L450) does plain `text.replace(placeholder, workspace_root)` per arg, so the placeholder lands inside the db-path arg fine.
- **NO secret** — `secrets: []`. Local file, no connection string/password.
- **6 tools** (verified verbatim from wheel `server.py handle_list_tools` AND a live `uvx` MCP handshake/list_tools). 3 ungated reads: `read_query` (SELECT-only, enforced in handler), `list_tables`, `describe_table`. 3 gated: `write_query` (INSERT/UPDATE/DELETE), `create_table` (DDL), **`append_insight`** — gated because it does `db.insights.append(...)` then `send_resource_updated(memo://insights)`, i.e. it WRITES to a server-side resource the agent reads back (security rule: writes-to-resource → gate). policySummary.confirmationRequiredTools=3, reviewed=true, defaultEnabledTools=0.
- readmeMarkdown carries: (1) point at a **non-production / disposable** `.db` — agent reads every table/row = exfiltration; (2) community/archived reference server, version-pinned. Test asserts strings "non-production" + "community".
- Test "sqlite is registered as a community workspace MCP" in mcp_toolkit_store.test.js (telegram/fetch style): ids, workspace binding, pinned uvx recipe, secrets:[], 6 tools / 3 gated (write_query+create_table+append_insight explicitly), read_query ungated, policySummary, readme strings, search-by-tool.
- Registry now **19 entries** (HEAD still 15; all of Fetch/Discord/Telegram/Slack-softdelete/SQLite uncommitted working-tree). Validator `node scripts/validate-mcp-registry.cjs` green at 19. Did NOT commit.

**Why**: completes round-2026-06-12 onboarding (Step 5/final); first community-trust uvx local-file entry.
**How to apply**: template for future uvx local-PATH-arg servers (db/file path → workspace placeholder as ARG, not env). Any resource-mutating tool (send_resource_updated / append-to-resource) gets gated even if it looks like a harmless note. See [[catalog-source-of-truth]].
