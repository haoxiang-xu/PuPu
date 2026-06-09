---
name: boundary-curator-vs-toolkit
description: Ownership line between pupu-dev-toolkit (UI + local install) and mcp-store-curator (store-entry data)
metadata:
  type: project
---

The line between my surface and mcp-store-curator's.

**Mine (pupu-dev-toolkit):** the toolkit UI and the local install / management flow — how tools get browsed, installed, displayed, and managed locally. Code: `src/COMPONENTs/toolkit/` (installed / store / custom_mcp pages, toolkit_card, toolkit_icon), `mcp_toolkit_store.js`, `mcp_install.js`, `custom_mcp_icon_store.js`.

**Curator's:** the store-entry data itself — its schema, connectivity, and metadata. I consume that catalog; I do not author or define it.

**Why:** Clear handoff so catalog-data questions go to curator and UI/install questions stay with me.

**How to apply:** If a task wants me to change what an entry *contains* or how the catalog is shaped/fetched, that's curator — propose/route, don't author. If it's how an entry *renders or installs locally*, that's mine. See [[team-roster]].
