---
name: license-posture-mcp-store
description: License model of the MCP store — we point/fetch third-party servers at runtime, we do NOT bundle their code; what this means for our Apache-2.0 obligations
metadata:
  type: project
---

PuPu's MCP store is a **pointer/runtime-fetch model, not a bundling model** — this is the single most important license fact, and it sharply limits our obligations.

**Evidence (2026-06-14, branch codex/runtime-events-v4):**
- `src/SERVICEs/mcp_toolkit_registry.json` (18 entries) stores only metadata: id, license string, sourceRepo URL, and an `mcp` recipe. stdio entries carry `command: npx -y <pkg>@ver` or `uvx <pkg>`; http/hosted entries carry no command at all (we just call a remote endpoint).
- `src/SERVICEs/mcp_install.js` `installMcpEntry()` posts the recipe to the Flask backend; the third-party server is **fetched and executed at runtime on the user's machine** by npx/uvx. We never vendor or redistribute their source.
- No MCP server package appears in `package.json` or `unchain_runtime/server/requirements.txt`. Confirmed by grep: none declared as our deps.

**Why this is load-bearing:** Bundling third-party code into our installer would pull their license obligations (notably the GPL-3.0 `netdata-cloud` entry, and any copyleft) into *our* distributed artifact. Because we only point/fetch, those obligations stay with the user's runtime install, not our release. The GPL-3.0 entry is a **hosted/remote** type (no command) — we call an endpoint, we ship nothing. So copyleft in the store is **not** a distribution problem for us as long as this model holds.

**How to apply:** If anyone ever proposes vendoring/pre-bundling an MCP server into the app (offline support, faster install, pinning), that is a **one-way-door license change** — it converts a pointer into a distribution and must trigger a full license review of that specific server before merge. Guard this seam.

Related: [[adr-mcp-version-pinning]], [[invariant-no-mtproto-userauth-mcp]], [[mcp-store-current-inventory]]
