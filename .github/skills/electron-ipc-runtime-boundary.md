# Skill: Extend Electron IPC, Preload, and Main Services

Use this guide when the task requires edits inside `electron/**`: new preload bridges, IPC channel constants, `ipcMain` wiring, stream client behavior, or main-process service implementation.

Do not trigger this for renderer-only refactors inside `src/SERVICEs/api*.js` or `src/SERVICEs/bridges/*.js` when the Electron contract already exists. That belongs to `backend-api-facade.md`. If the feature spans both, do the Electron boundary first, then update the renderer facade.

---

## 1. Current boundary model

React code should not talk to `ipcRenderer` directly.

The current layers are:

1. renderer wrapper in `src/SERVICEs/api*.js` or `src/SERVICEs/bridges/*.js`
2. preload bridge factory in `electron/preload/bridges/*.js`
3. global exposure in `electron/preload/index.js`
4. channel names in `electron/shared/channels.js`
5. handler wiring in `electron/main/ipc/register_handlers.js`
6. implementation in a main service under `electron/main/services/*`

Current globals exposed into `window` include:

- `runtime`
- `osInfo`
- `appInfoAPI`
- `appUpdateAPI`
- `ollamaAPI`
- `ollamaLibraryAPI`
- `misoAPI`
- `themeAPI`
- `windowStateAPI`

---

## 2. Which IPC pattern to use

Use `invoke` / `handle` for one-shot request and response operations:

- version lookup
- update state
- workspace validation and picker
- runtime storage inspection
- memory projection and memory replacement

Use `send` / `on` when the operation is evented or streaming:

- `miso:stream:start`
- `miso:stream:start-v2`
- `miso:stream:cancel`
- `miso:stream:event`
- install or update progress events

For Miso streaming, do not hand-roll listener management. The current implementation lives in `electron/preload/stream/miso_stream_client.js`.

---

## 3. Add-a-capability workflow

When adding a new capability, update layers in this order:

1. Choose the owning main service in `electron/main/services/*`
2. Add channel constants in `electron/shared/channels.js`
3. Register `ipcMain.handle(...)` or `ipcMain.on(...)` in `electron/main/ipc/register_handlers.js`
4. Add or update the preload bridge factory in `electron/preload/bridges/*.js`
5. If this is a new global namespace, expose it in `electron/preload/index.js`
6. Add the renderer wrapper in `src/SERVICEs/api*.js` or `src/SERVICEs/bridges/*.js`
7. Update the UI to call the renderer wrapper, not `window.*API`

Examples already in the repo:

- workspace validation path: `runtimeBridge.validateWorkspaceRoot(...)`
- Miso status path: `api.miso.getStatus()`
- stream v2 path: `api.miso.startStreamV2(...)`
- session memory replace path: `api.miso.replaceSessionMemory(...)`

---

## 4. Service ownership rules

Use this rule of thumb:

- Miso sidecar lifecycle, status, catalogs, memory projection, session memory replace, streaming, tool confirmation: `electron/main/services/miso/service.js`
- workspace picker, runtime storage, devtools toggle: `electron/main/services/runtime/service.js`
- Ollama lifecycle and library search: `electron/main/services/ollama/service.js`
- updater: `electron/main/services/update/service.js`
- window chrome and shell interactions: `electron/main/window/main_window.js`

Do not put filesystem or process-management logic in preload.

---

## 5. Tests to update

Current Electron coverage lives here:

- preload API contract: `electron/tests/preload/api_contract.test.js` and `electron/tests/preload/api_contract.test.cjs`
- preload stream behavior: `electron/tests/preload/miso_stream_client.test.js` and `electron/tests/preload/miso_stream_client.test.cjs`
- IPC channel contract: `electron/tests/main/ipc_channels.test.js` and `electron/tests/main/ipc_channels.test.cjs`
- runtime service behavior: `electron/tests/main/runtime_service.test.js` and `electron/tests/main/runtime_service.test.cjs`
- main window behavior: `electron/tests/main/main_window.test.js` and `electron/tests/main/main_window.test.cjs`

If you change exposed methods or channels, update the matching `.js` and `.cjs` tests that already mirror that surface.

---

## 6. High-risk pitfalls

- Do not hardcode IPC channel strings outside `electron/shared/channels.js`.
- Do not import `ipcRenderer` in renderer React code.
- Do not add a new `window.*API` shape in tests only; wire it in `electron/preload/index.js`.
- Do not bypass `miso_stream_client.js` for stream start or cancel flows.
- Do not move validation or filesystem work into preload just because the UI needs it.
- Do not treat `public/preload.js` as the implementation source of truth. The maintained source is under `electron/preload/**`.

---

## 7. Quick checks

```bash
rg -n "contextBridge\\.exposeInMainWorld|create.*Bridge|createMisoStreamClient" \
  electron/preload
```

```bash
rg -n "CHANNELS\\.|ipcMain\\.(handle|on)" \
  electron/main \
  electron/shared
```

```bash
rg -n "GET_MEMORY_PROJECTION|GET_LONG_TERM_MEMORY_PROJECTION|REPLACE_SESSION_MEMORY|STREAM_START_V2" \
  electron/shared/channels.js \
  electron/main/ipc/register_handlers.js \
  electron/main/services/miso/service.js \
  electron/preload/bridges/miso_bridge.js
```
