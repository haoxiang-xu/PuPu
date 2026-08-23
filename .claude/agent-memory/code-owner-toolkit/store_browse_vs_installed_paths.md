---
name: store-browse-vs-installed-paths
description: Store-browse list and installed-toolkit list are independent render paths; searchMcpStoreEntries only filters browse
metadata:
  type: project
---

The MCP store **browse** list and the **installed**-toolkit list are independent render paths. Filtering one does NOT affect the other.

- Store browse funnel: `listMcpStoreEntries()` -> `searchMcpStoreEntries(entries, query, category)` (`src/SERVICEs/mcp_toolkit_store.js`) -> `toolkit_store_page.js:43`. Single production caller.
- Installed list: `toolkit_installed_page.js` builds from the `api` catalog via its own `loadCatalog` (imports `api`), and from `mcp_toolkit_store` imports ONLY `withMcpStoreIcon` for icon resolution. It does NOT call `searchMcpStoreEntries`/`listMcpStoreEntries`.
- In `toolkit_store_page.js`, the `installedIds` prop is only forwarded to `StoreToolkitCard` to badge a store card as installed — it is not a render source.

**Why:** This separation is what lets the store hide deprecated/superseded entries (e.g. `productivity.slack` with `status:"deprecated"`) while an already-installed deprecated instance keeps working / shows as archived — graceful degrade. A filter on the browse funnel is browse-only by construction.

**How to apply:** When asked to hide/sort/gate entries in the store grid, the browse funnel (`searchMcpStoreEntries`) is the safe single choke point — it cannot break installed instances. If a request needs to also affect installed toolkits, that is a DIFFERENT path (api catalog -> installed page) and must be handled there, separately. `normalizeEntry` spreads `...entry`, so registry fields like `status`/`deprecated` are visible on normalized entries.
