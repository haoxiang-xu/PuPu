---
name: registry-entry-cannot-get-user-icon
description: custom_mcp_icon_store hard-gates on the `mcp.custom.` prefix, so a registry store entry can NEVER receive a user-uploaded icon — an entry with no logo shows grey forever.
metadata:
  type: project
---

`custom_mcp_icon_store.js` gates every read and write on `isCustomToolkitId` (`toolkitId.startsWith("mcp.custom.")`). A registry-listed toolkit id therefore cannot hold a user-uploaded icon — `setCustomMcpIcon("mcp.memory.memory", ...)` is silently a no-op, which `custom_mcp_icon_store.test.js` asserts as intended behavior.

**Why this matters now:** under [[store-icon-honesty-policy]] registry entries may legitimately ship no icon and render the grey mcp glyph. For a *custom* MCP the user's remedy is to upload an image; for a *registry* entry there is no remedy at any layer of the UI. So the grey tile is permanent, not a prompt to act. Fallback `iconPolicy` metadata (e.g. a GitHub owner avatar) also loses to `DEFAULT_MCP_ICON` — only an explicit `iconPolicy: "replace"` overrides it — so the repo-avatar path cannot quietly fill the gap either. That is consistent with the policy (a borrowed org avatar is exactly what was rejected), but it means no automatic path exists.

**How to apply:** Behavior for a missing icon is otherwise *identical* between custom MCP and registry entries — both land on `DEFAULT_MCP_ICON` via `resolveMcpIcon` — so no parity fix is needed. If the grey wall ever becomes a real user complaint, the cheap lever is relaxing this gate to allow a user icon override for any installed toolkitId. That is NOT free: it touches this store plus main-process `asset_metadata`, and the id-namespace assumption is load-bearing in the migration path. Raise it as a proposal to pupu-cto, do not slip it into an icon change.
