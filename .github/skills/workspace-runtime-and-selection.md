# Skill: Workspace Runtime, Named Workspaces, and Chat Selection

Use this guide when you change workspace settings, named workspaces, per-chat workspace selection, or runtime storage UI.

Primary source files:

- settings helpers: `src/COMPONENTs/settings/runtime.js`
- workspace editor UI: `src/COMPONENTs/workspace/workspace_editor.js`
- workspace modal: `src/COMPONENTs/workspace/workspace_modal.js`
- init setup workspace step: `src/COMPONENTs/init-setup/steps/workspace.js`
- chat input workspace hook: `src/COMPONENTs/chat-input/hooks/use_chat_input_workspaces.js`
- chat input workspace options: `src/COMPONENTs/chat-input/utils/build_workspace_options.js`
- chat session persistence: `src/SERVICEs/chat_storage.js`
- payload injection: `src/SERVICEs/api.miso.js`
- runtime bridge helpers: `src/SERVICEs/bridges/miso_bridge.js`
- Electron runtime service: `electron/main/services/runtime/service.js`
- sidecar workspace toolkit attach: `miso_runtime/server/miso_adapter.py`

---

## 1. Current storage model

Workspace state is split across settings and chat sessions.

Settings storage under localStorage key `"settings"`:

- `runtime.workspace_root`: default workspace root path
- `runtime.workspaces`: named workspaces array

Named workspace items currently look like:

```js
{
  id: string,
  name: string,
  path: string,
}
```

Chat session storage:

- `chat.selectedWorkspaceIds: string[]`

Important nuance:

- `src/COMPONENTs/init-setup/steps/workspace.js` currently reads and writes `settings.runtime.workspace_root` directly
- `src/COMPONENTs/settings/runtime.js` is the main reusable helper module for runtime/workspace settings

If the storage contract changes, update both places.

---

## 2. End-to-end workspace flow

The current flow is:

1. user saves default root or named workspaces in `WorkspaceEditor`
2. chat input loads named workspaces through `readWorkspaces()`
3. chat input stores per-chat selection as `selectedWorkspaceIds`
4. `chat_storage.js` persists those IDs on the chat session
5. `api.miso.startStreamV2(...)` resolves IDs to absolute paths
6. `api.miso.js` injects `workspaceRoot`, `workspace_root`, and `workspace_roots`
7. `miso_adapter.py` attaches `multi_workspace_toolkit(...)` or `python_workspace_toolkit(...)`

The sidecar should see resolved paths, not workspace IDs.

---

## 3. Runtime bridge methods

Workspace and runtime UI should go through `runtimeBridge` in `src/SERVICEs/bridges/miso_bridge.js`.

Current methods:

- `validateWorkspaceRoot(path)`
- `pickWorkspaceRoot(defaultPath)`
- `openRuntimeFolder(path)`
- `getRuntimeDirSize(dirPath)`
- `getMemorySize()`
- `deleteRuntimeEntry(dirPath, entryName)`
- `clearRuntimeDir(dirPath)`
- `setChromeTerminalOpen(open)` for dev-only runtime control

Electron ownership:

- preload bridge: `electron/preload/bridges/miso_bridge.js`
- main implementation: `electron/main/services/runtime/service.js`

---

## 4. Validation and picker rules

Current validation behavior:

- `~` and `~/...` are expanded in the main process
- empty path can be valid in flows that allow clearing the default root
- validation checks existence and directory-ness

Current picker behavior:

- available only when the Electron bridge exists
- should fall back gracefully in browser-like environments or tests

Do not implement path validation in React-only code when a runtime bridge already exists.

---

## 5. Chat selection rules

Per-chat workspace selection lives in the chat session, not in global settings.

Rules:

- `selectedWorkspaceIds` is stored on the chat session
- workspace definitions remain in `settings.runtime.workspaces`
- `api.miso.js` strips `selectedWorkspaceIds` from payload options after resolving paths

Implications:

- renaming a workspace should keep the same `id` if you want existing chats to keep working
- deleting a workspace means old chats can retain dangling IDs until they are re-saved

---

## 6. High-risk pitfalls

- Do not store raw workspace paths in chat sessions.
- Do not send `selectedWorkspaceIds` to the sidecar as if it were a backend contract.
- Do not assume the default workspace root and named workspaces are the same thing.
- Do not change the runtime settings schema without updating the init setup workspace step too.
- Do not assume `pickWorkspaceRoot` or `validateWorkspaceRoot` is always available outside Electron.
- Do not bypass `writeWorkspaces(...)` / `writeWorkspaceRoot(...)` when the helper module already exists.

---

## 7. Quick checks

```bash
rg -n "workspace_root|workspaces|readWorkspaces|writeWorkspaces|makeWorkspaceId" \
  src/COMPONENTs/settings/runtime.js \
  src/COMPONENTs/workspace/workspace_editor.js \
  src/COMPONENTs/init-setup/steps/workspace.js
```

```bash
rg -n "selectedWorkspaceIds|workspace_roots|workspace_root|workspaceRoot" \
  src/PAGEs/chat/chat.js \
  src/SERVICEs/chat_storage.js \
  src/SERVICEs/api.miso.js \
  miso_runtime/server/miso_adapter.py
```

```bash
rg -n "pickWorkspaceRoot|validateWorkspaceRoot|openRuntimeFolder|getRuntimeDirSize" \
  src/SERVICEs/bridges/miso_bridge.js \
  electron/preload/bridges/miso_bridge.js \
  electron/main/services/runtime/service.js
```
