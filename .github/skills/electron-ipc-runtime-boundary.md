# Skill: Extend Electron IPC, Preload, and Main Services

Use this guide when a feature crosses the renderer/Electron boundary, or when you need to add a new preload API, IPC channel, or main-process service method.

Primary source files:

- preload exposure root: `electron/preload/index.js`
- preload bridge factories: `electron/preload/bridges/*.js`
- preload stream client: `electron/preload/stream/miso_stream_client.js`
- shared channel constants: `electron/shared/channels.js`
- IPC registration: `electron/main/ipc/register_handlers.js`
- main services: `electron/main/services/*`
- renderer wrappers: `src/SERVICEs/api*.js` and `src/SERVICEs/bridges/*.js`

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

Use `invoke` / `handle` for one-shot request/response operations:

- version lookup
- update state
- workspace validation
- runtime storage inspection
- memory projection

Use `send` / `on` when the operation is evented or streaming:

- `miso:stream:start`
- `miso:stream:start-v2`
- `miso:stream:cancel`
- `miso:stream:event`

For Miso streaming, do not hand-roll your own listener management. The current implementation lives in `electron/preload/stream/miso_stream_client.js`.

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

---

## 4. Service ownership rules

Use this rule of thumb:

- Miso sidecar lifecycle, status, catalogs, streaming, tool confirmation: `electron/main/services/miso/service.js`
- workspace picker, runtime storage, devtools toggle: `electron/main/services/runtime/service.js`
- Ollama lifecycle and library search: `electron/main/services/ollama/service.js`
- updater: `electron/main/services/update/service.js`
- window chrome and shell interactions: `electron/main/window/main_window.js`

Do not put filesystem or process-management logic in preload.

---

## 5. Tests to update

Current Electron coverage lives here:

- preload API contract: `electron/tests/preload/api_contract.test.js`
- preload stream behavior: `electron/tests/preload/miso_stream_client.test.js`
- IPC channel contract: `electron/tests/main/ipc_channels.test.js`
- runtime service behavior: `electron/tests/main/runtime_service.test.js`
- main window behavior: `electron/tests/main/main_window.test.js`

If you change exposed methods or channels, update the matching preload and main tests.

---

## 6. High-risk pitfalls

- Do not hardcode IPC channel strings outside `electron/shared/channels.js`.
- Do not import `ipcRenderer` in renderer React code.
- Do not add a new `window.*API` shape in tests only; wire it in `electron/preload/index.js`.
- Do not bypass `miso_stream_client.js` for stream start/cancel flows.
- Do not move validation or filesystem work into preload just because the UI needs it.
- Do not forget to update both `.js` and `.cjs` test entrypoints if the existing suite already mirrors both.

---

## 7. Quick checks

```bash
rg -n "contextBridge\\.exposeInMainWorld|create.*Bridge|createMisoStreamClient" electron/preload
```

```bash
rg -n "CHANNELS\\.|ipcMain\\.(handle|on)" electron/main electron/shared
```

```bash
rg -n "window\\.[A-Za-z]+API|ipcRenderer" src --glob '!**/SERVICEs/**'
```
