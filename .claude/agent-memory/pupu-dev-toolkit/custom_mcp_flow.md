---
name: custom-mcp-flow
description: Custom MCP end-to-end flow facts — id derived from display name (no edit flow), error codes collapse to "Install failed", HTTP has no header/auth support, icon is frontend-local
metadata:
  type: project
---

Custom MCP add/install/delete flow. Assessed 2026-06-14 for release go/no-go (verdict: GO with follow-ups).

End-to-end path (all wired, no break):
`custom_mcp_page.js` form -> `normalizeCustomMcpRecipe` (mcp_install.js:128) -> `handleInstall` (toolkits_page.js:185) -> `installMcpEntry` -> `api.unchain.installMcpToolkit` -> electron service.js:672 -> route_mcp.py -> backend `install_mcp_toolkit(custom_recipe=)` -> `_custom_entry` validate (mcp_toolkits.py:122) -> `_discover_tools` REAL connectivity probe -> store -> installed list (independent api-catalog path).

Non-obvious facts to know before touching this surface:

1. **No real edit flow.** custom_mcp_page is add-only. "Edit" in practice = delete + recreate. This is WHY the id-from-name design (#2) is currently safe.

2. **toolkitId is derived from display name**: `mcp.custom.${toSlug(name)}` (mcp_install.js:141). This contradicts the ADR "toolkitId carries no display info" principle, BUT is safe today because there is no inline edit (rename = delete+rebuild). If a true inline edit is ever added, this MUST be resolved first vs [[adr-toolkitid-stability]] (renaming would silently change the id = orphan persisted refs). Duplicate names -> same id -> backend rejects with `mcp_already_installed` 409 (never overwrites/reuses — ADR-compliant).

3. **All custom install errors collapse to one message.** custom_mcp_page.js:374 only checks installError truthiness -> always shows `toolkit.store_install_error` ("Install failed"). Backend emits informative codes (`mcp_already_installed` 409, `mcp_install_failed` 502, validation msgs) and toolkits_page.js:199 carries `code`, but the custom page discards it. Store detail panel (store_toolkit_detail_panel.js:604) at least special-cases `mcp_workspace_required`; custom page does not. P1 UX follow-up: map codes to distinct i18n strings (needs new keys, i18n owner).

4. **HTTP custom MCP has NO header/auth support** — by design and front/back consistent. Backend `_custom_entry:158` rejects headers ("not supported yet"); front HTTP form has no header/secret inputs. Limits HTTP custom to unauthenticated remote servers.

5. **Custom MCP icon is frontend-local** (`custom_mcp_icon_store.js`, localStorage keyed by toolkitId). Survives refresh because toolkitId is stable, but does NOT travel with the backend store record — clearing localStorage / new machine / reinstall loses the uploaded icon (toolkit itself persists). No export/migration. `readIconFile` downscales raster to <=128px PNG; jpeg/webp accepted in input get transcoded to png so they store fine despite store VALID_MIME being png/svg only.

Schema alignment: custom recipe is emitted snake_case by `normalizeCustomMcpRecipe` (NOT camelCase->snake like store entries), backend `_custom_entry` consumes every field. No missing fields.
