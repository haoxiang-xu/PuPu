# Workspace System

> Named workspaces, per-chat selection, and path resolution.

---

## Overview

Workspaces let users attach local folders as context for AI conversations. The agent can read/write files within selected workspace directories.

---

## Concepts

| Concept | Description |
|---------|-------------|
| **Default workspace root** | Global setting, primary workspace path |
| **Named workspaces** | User-defined workspace entries with ID, optional name, and path |
| **Per-chat workspace selection** | Each chat selects which workspaces to include |
| **Path resolution** | Workspace IDs → absolute paths at stream time |

---

## Settings Storage

Stored in `localStorage.settings.runtime`:

```javascript
{
  workspace_root: "/path/to/default",
  workspaces: [
    {
      id: string,       // unique ID (generated)
      name: string,     // optional display name
      path: string,     // absolute path
    },
  ],
}
```

---

## Per-Chat Selection

Each chat session stores:

```javascript
{
  selectedWorkspaceIds: string[],  // max 20 items
}
```

These reference workspace IDs from settings, **not** raw paths.

---

## End-to-End Flow

```
1. User configures workspaces in Settings > Runtime
2. User selects workspaces per chat via Workspace Editor
3. selectedWorkspaceIds saved on chat session
4. At stream time:
   api.unchain.startStreamV2(payload, ...)
     → injectWorkspaceRootIntoPayload(payload)
       → Resolves selectedWorkspaceIds to absolute paths from settings
       → Builds allRoots: selected paths first, then the global default
         root appended as fallback if distinct
       → Injects the multi-root trio into options:
           workspace_roots[]   (array — the source of truth, multi-root)
           workspace_root      (allRoots[0] — back-compat single root)
           workspaceRoot       (allRoots[0] — back-compat single root)
       → Strips internal selectedWorkspaceIds from options
5. Backend receives resolved paths (not IDs)
6. unchain_adapter.py attaches the single workspace toolkit
   (see Backend Toolkit Resolution below)
```

### Injection short-circuit branches

`injectWorkspaceRootIntoPayload` returns early (without injecting the
trio) in these cases — `selectedWorkspaceIds` is still stripped from
options in every branch:

| Condition (on `payload.options`) | Behavior |
|----------------------------------|----------|
| `disable_workspace_root === true` (or camel `disableWorkspaceRoot`) | Skip injection entirely |
| `explicitWorkspaceRoot` — caller already set `workspaceRoot`/`workspace_root` | Respect caller's root, skip injection |
| `allRoots.length === 0` (no selected paths, no default root) | Nothing to inject |

---

## Backend Toolkit Resolution

The backend exposes a **single** workspace toolkit, id `workspace_toolkit`
(frontend alias `access_workspace_toolkit`; `workspace` and the class name
`WorkspaceToolkit` also alias to it). There is **no** `multi_workspace_toolkit`
or `python_workspace_toolkit` — multi-root is handled internally, not via a
separate toolkit id.

`_build_workspace_toolkits(options)` in `unchain_adapter.py` resolves the
roots from the injected `workspace_roots` and builds one toolkit:

1. **Native multi-root** — if `unchain.toolkits.WorkspaceToolkit` accepts
   `workspace_roots=[...]` and there is more than one root, construct it
   directly with all roots.
2. **Single root** — when exactly one resolved root, build a single-root
   `WorkspaceToolkit` for that path.
3. **Multi-root fallback** — when the native constructor does not accept
   multiple roots, try `_try_build_workspace_toolkit_for_roots`, then fall
   back to `_build_multi_workspace_proxy_toolkit`, which aggregates per-root
   single-root toolkits behind a proxy.

In every branch the result is tagged `toolkit_id="workspace_toolkit"` and its
tools are marked for confirmation. A `LegacyWorkspaceToolkit` shim
(`adapter_workspace_tools.py`) provides the single-root toolkit when the
unchain core constructor is unavailable.

---

## Runtime Bridge Methods

| Method | Timeout | Description |
|--------|---------|-------------|
| `validateWorkspaceRoot(path)` | 6s | Check path exists and is directory |
| `pickWorkspaceRoot(defaultPath)` | 20s | Native folder picker dialog |
| `openRuntimeFolder(path)` | 10s | Open in file manager |
| `getRuntimeDirSize(dirPath)` | 15s | Calculate directory size |

Implemented in `electron/main/services/runtime/service.js`.

---

## Validation Rules

- `~` and `~/...` are expanded in the main process
- Empty path is valid in flows that allow clearing
- Validation checks: existence + is-directory
- `pickWorkspaceRoot` only available in Electron (not web mode)

---

## Important Rules

- **Never store raw paths in chat sessions** — use workspace IDs
- **Never send `selectedWorkspaceIds` to the sidecar** — resolve to paths first
- Default workspace root and named workspaces are separate concepts
- Renaming a workspace should keep the same ID (existing chats reference it)
- Deleting a workspace leaves dangling IDs on old chats until re-saved
- Don't bypass `writeWorkspaces()`/`writeWorkspaceRoot()` helpers
- Don't change runtime settings schema without updating the init setup step

---

## Key Files

| File | Role |
|------|------|
| `src/COMPONENTs/settings/runtime.js` | Workspace settings UI |
| `src/COMPONENTs/workspace/workspace_editor.js` | Per-chat workspace selector |
| `src/COMPONENTs/init-setup/steps/workspace.js` | First-run workspace setup |
| `src/SERVICEs/api.unchain.js` | `injectWorkspaceRootIntoPayload()` |
| `src/SERVICEs/bridges/unchain_bridge.js` | Runtime bridge methods |
| `electron/main/services/runtime/service.js` | Path validation, folder picker |
| `unchain_runtime/server/unchain_adapter.py` | Workspace tool attachment |
| `unchain_runtime/server/adapter_workspace_tools.py` | Workspace tool definitions |
