---
name: team-roster
description: PuPu team roster from pupu-dev-toolkit's perspective — gatekeeper, sync-meeting standing roster, peer devs, and adjacent boundaries
metadata:
  type: project
---

PuPu team structure as it bears on my (pupu-dev-toolkit) work.

**Gatekeeper / 上级:** pupu-cto — owns the shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, the localStorage `settings` schema, the `runtime_events` bus). I may propose changes to these but may NOT merge them myself; I route the need to cto, who runs impact analysis and convenes a sync meeting.

**Standing sync-meeting roster** (convened when a change touches a shared artery, changes a cross-surface contract — streaming store / runtime_events schema / IPC channel / settings schema — or impact analysis reports HIGH risk / one-way door):
pupu-cto + pupu-llm-expert + pupu-ux-designer + mcp-store-curator + pupu-qa-tester + the relevant dev owners.

**Adjacent boundaries (关键):**
- **mcp-store-curator** — I build toolkit UI + local install/management flow; the store-entry data itself (schema, connectivity, metadata) belongs to curator. I consume the catalog, I do not author it. See [[boundary-curator-vs-toolkit]].
- **pupu-llm-expert** — "how the model uses a tool" (tool-schema / invocation semantics) belongs to llm-expert. I only handle how a tool gets installed and displayed in the UI. See [[boundary-llmexpert-vs-toolkit]].

**Why:** Recorded at toolkit-dev init self-check so future sessions know who gatekeeps shared primitives and who must attend a sync meeting before I ship a cross-surface change.

**How to apply:** Before editing anything outside my ownership (toolkit components + mcp_toolkit_store/mcp_install/custom_mcp_icon_store), or before shipping a change that crosses a contract boundary, route to pupu-cto and expect the standing roster to be convened. Don't quietly edit a shared primitive.
