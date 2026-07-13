# Workspace System

> Named workspaces, per-chat selection, and path resolution.

---

## Overview

Workspaces let users attach local folders as context for AI conversations. The selected paths are passed to Unchain's `core` toolkit so the agent can use file, search, edit, shell, and LSP tools inside the chosen project.

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
6. unchain_adapter.py attaches the `core` toolkit when selected
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

The backend no longer exposes a public Workspace Toolkit. The active built-in
for code and project operations is `core`.

Legacy selections such as `workspace`, `workspace_toolkit`,
`access_workspace_toolkit`, and `WorkspaceToolkit` are compatibility aliases
that normalize to `core` before the backend constructs toolkits. The backend
resolves `workspace_roots`, passes the first resolved root as `workspace_root`
to `CoreToolkit`, and leaves confirmation behavior to the toolkit's own tool
metadata (`write`, `edit`, and `shell` require confirmation).

Multi-root selection remains part of the UI/storage model, but PuPu no longer
builds a Workspace proxy toolkit. Additional roots are preserved in the
payload for compatibility and future runtime/toolkit support; current Core
construction uses the primary resolved root.

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
| `unchain_runtime/server/unchain_adapter.py` | Toolkit alias normalization and CoreToolkit construction |
