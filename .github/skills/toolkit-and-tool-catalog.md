# Skill: Toolkit and Tool Catalog

Use this guide when working on toolkit discovery, the toolkit modal, toolkit selection persistence, toolkit.toml authoring, icon and README resolution, or the V1/V2 catalog endpoint chain.

Do not use this for tool confirmation flow during streaming. That belongs to `chat-runtime-memory-and-trace.md`.

---

## 1. End-to-end catalog flow

The toolkit catalog flows through:

1. Python discovery in `miso_runtime/server/miso_adapter.py`
2. Flask route in `miso_runtime/server/routes.py`
3. Electron main service in `electron/main/services/miso/service.js`
4. IPC handler in `electron/main/ipc/register_handlers.js`
5. preload bridge in `electron/preload/bridges/miso_bridge.js`
6. renderer facade in `src/SERVICEs/api.miso.js`
7. toolkit modal in `src/COMPONENTs/toolkit/toolkit_modal.js`

Two catalog versions exist:

- V1 (`GET /toolkits/catalog`): basic metadata for quick loads
- V2 (`GET /toolkits/catalog/v2`): enriched with icons, README, per-tool metadata for the modal

The modal uses V2 via the `LIST_TOOL_MODAL_CATALOG` IPC channel.

---

## 2. Backend toolkit discovery

Discovery in `miso_adapter.py` has two passes:

1. Walk `miso.builtin_toolkits` submodules for any Toolkit subclass
2. Scan top-level `miso` exports listed in `_KNOWN_TOOLKIT_EXPORTS`

```python
_KNOWN_TOOLKIT_EXPORTS = {
    "toolkit": "core",
    "builtin_toolkit": "builtin",
    "workspace_toolkit": "builtin",
    "external_api_toolkit": "builtin",
    "mcp": "integration",
}
```

The values (`"core"`, `"builtin"`, `"integration"`) become the `kind` field in V1 and the `source` field in V2.

Deduplication key: `module:class_name`.

---

## 3. toolkit.toml format

Each toolkit can have a `toolkit.toml` beside its Python module:

```toml
[toolkit]
name = "Display Name"
description = "What this toolkit does"
icon = "icon.svg"
readme = "README.md"
tags = ["tag1", "tag2"]
color = "#ffffff"
backgroundcolor = "#000000"

[display]
category = "builtin"     # maps to source field
order = 10               # display sort order
hidden = false           # hide from catalog

[[tools]]
name = "tool_name"
title = "Human Title"
description = "What it does"
hidden = false
observe = false
requires_confirmation = false
icon_path = "tool_icon.svg"
```

Parsed by `_read_toolkit_toml()` using `tomllib` (Python 3.11+ stdlib).

---

## 4. V2 catalog entry shape

```js
{
  toolkitId: string,          // Python class __name__
  toolkitName: string,        // From toolkit.toml [toolkit] name
  toolkitDescription: string, // From toolkit.toml or docstring
  toolkitIcon: {},            // Icon payload (see §5)
  source: "builtin" | "local" | "plugin" | "integration",
  toolCount: number,
  defaultEnabled: boolean,
  tools: [
    {
      name: string,
      title: string,            // From __tool_metadata__ or toolkit.toml
      description: string,
      icon: {},
      hidden: boolean,
      observe: boolean,
      requiresConfirmation: boolean,
    },
  ],
  displayOrder: number,       // From [display] order
  hidden: boolean,            // From [display] hidden
  tags: string[],             // From [toolkit] tags
}
```

Sorted by `displayOrder` then `toolkitName`.

---

## 5. Icon resolution chain

`_get_toolkit_icon_payload()` resolves icons in this order:

1. Class attribute `icon_path`
2. Class attribute `icon`
3. `__tool_metadata__` → `icon_path`
4. toolkit.toml `[toolkit] icon` field
5. Auto-discover `icon.svg` or `icon.png` beside the module

Icon payload types:

- SVG: `{ type: "file", mimeType: "image/svg+xml", content: "<svg>...", encoding: "utf8" }`
- PNG: `{ type: "file", mimeType: "image/png", content: "base64...", encoding: "base64" }`
- Builtin: `{ type: "builtin", name: "icon_name", color: "#fff", backgroundColor: "#000" }`

---

## 6. README resolution chain

`_resolve_toolkit_readme()` resolves README in this order:

1. toolkit.toml `[toolkit] readme` (relative to toolkit dir)
2. `README.md` in toolkit module directory
3. `README.md` in parent package directory
4. Empty string fallback

The detail endpoint returns the README markdown content for the slide-in panel.

---

## 7. Per-tool metadata enrichment

`_enumerate_toolkit_tools_v2()` merges from three sources (highest priority first):

1. `__tool_metadata__` attribute on the Python method
2. `[[tools]]` entry in toolkit.toml matched by name
3. Basic introspection from `_enumerate_toolkit_tools()`

Confirmation auto-detection: tools named `write_file`, `delete_file`, `move_file`, or `terminal_exec` always get `requiresConfirmation: true`.

---

## 8. IPC channels for toolkits

Three channels in `electron/shared/channels.js`:

| Channel                        | IPC Pattern | Endpoint                             |
| ------------------------------ | ----------- | ------------------------------------ |
| `MISO.GET_TOOLKIT_CATALOG`     | invoke      | `/toolkits/catalog` (V1)             |
| `MISO.LIST_TOOL_MODAL_CATALOG` | invoke      | `/toolkits/catalog/v2` (V2)          |
| `MISO.GET_TOOLKIT_DETAIL`      | invoke      | `/toolkits/{id}/metadata?tool_name=` |

Renderer entrypoints:

```js
api.miso.getToolkitCatalog(); // V1
api.miso.getToolkitCatalog(); // V2 via LIST_TOOL_MODAL_CATALOG
api.miso.getToolkitDetail(toolkitId); // detail with README
```

---

## 9. Frontend toolkit modal

Primary source: `src/COMPONENTs/toolkit/toolkit_modal.js`

Structure:

- Three tabs via `SECTIONS`: Toolkits, Skills (coming soon), MCP (coming soon)
- `ToolkitsPage` renders the V2 catalog
- Detail panel slides in from right (260ms, `cubic-bezier(0.32, 0.72, 0, 1)`)

Constants in `src/COMPONENTs/toolkit/constants.js`:

```js
BASE_TOOLKIT_IDENTIFIERS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]); // Filtered out of catalog listings

KIND_CONFIG = {
  core: { label: "Core", color: "#a78bfa" },
  builtin: { label: "Built-in", color: "#34d399" },
  integration: { label: "Integration", color: "#fb923c" },
};

SOURCE_CONFIG = {
  builtin: { label: "Built-in", color: "#34d399" },
  local: { label: "Local", color: "#60a5fa" },
  plugin: { label: "Plugin", color: "#fb923c" },
};
```

---

## 10. Default toolkit selection store

Primary source: `src/SERVICEs/default_toolkit_store.js`

Storage key: `localStorage["default_toolkits"]`

Schema:

```js
{
  version: 1,
  scopes: {
    "global": ["ToolkitId1", "ToolkitId2"],
  },
}
```

Limits: max 100 IDs per scope, max 200 chars per ID.

Public API:

- `getDefaultToolkitSelection(scopeKey = "global")` — read enabled IDs
- `setDefaultToolkitEnabled(scopeKey, toolkitId, enabled)` — toggle one ID
- `removeInvalidToolkitIds(scopeKey, validIds)` — prune after catalog refresh

Per-chat selections are stored in `chat.selectedToolkits` (max 50 IDs) and persisted in `chat_storage.js`. New chats inherit from the global defaults.

---

## 11. High-risk pitfalls

- Do not create a second catalog fetch path outside `api.miso.*`.
- Do not hardcode toolkit IDs in frontend code. Use the catalog as source of truth.
- Do not skip `BASE_TOOLKIT_IDENTIFIERS` filtering; base abstract classes must not appear in user-facing lists.
- Do not assume all toolkits have a `toolkit.toml`. Many rely on class-level introspection only.
- Do not confuse V1 and V2 catalog shapes. The modal needs V2; quick status checks can use V1.
- Do not modify `_KNOWN_TOOLKIT_EXPORTS` without also updating the discovery walk in `get_toolkit_catalog()` and `get_toolkit_catalog_v2()`.
- Do not add new confirmation-required tools without also adding them to `_CONFIRMATION_REQUIRED_TOOL_NAMES` in `miso_adapter.py`.

---

## 12. Quick checks

```bash
rg -n "get_toolkit_catalog|get_toolkit_metadata|_KNOWN_TOOLKIT_EXPORTS|_CONFIRMATION_REQUIRED_TOOL_NAMES" \
  miso_runtime/server/miso_adapter.py
```

```bash
rg -n "GET_TOOLKIT_CATALOG|LIST_TOOL_MODAL_CATALOG|GET_TOOLKIT_DETAIL" \
  electron/shared/channels.js \
  electron/main/ipc/register_handlers.js
```

```bash
rg -n "BASE_TOOLKIT_IDENTIFIERS|KIND_CONFIG|SOURCE_CONFIG|default_toolkits" \
  src/COMPONENTs/toolkit \
  src/SERVICEs/default_toolkit_store.js
```
