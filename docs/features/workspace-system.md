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
| **Named workspaces** | User-defined workspace entries with ID, label, and path |
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
      label: string,    // display name
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
       → Resolves IDs to absolute paths from settings
       → Injects: workspaceRoot, workspace_root, workspace_roots
5. Backend receives resolved paths (not IDs)
6. unchain_adapter.py attaches workspace tools
   (multi_workspace_toolkit or python_workspace_toolkit)
```

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
