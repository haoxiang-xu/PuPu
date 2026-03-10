# Skill: Extend Backend APIs and Renderer Bridges

Use this guide when a renderer feature needs new backend, runtime, or Electron-backed capability.

The current boundary is split in two:

- domain APIs for feature flows: `src/SERVICEs/api.miso.js`, `src/SERVICEs/api.ollama.js`, `src/SERVICEs/api.system.js`
- low-level renderer bridge helpers: `src/SERVICEs/bridges/miso_bridge.js`, `src/SERVICEs/bridges/ollama_bridge.js`, `src/SERVICEs/bridges/theme_bridge.js`, `src/SERVICEs/bridges/window_state_bridge.js`
- shared error/timeout helpers: `src/SERVICEs/api.shared.js`
- compatibility export surface: `src/SERVICEs/api.js`

`src/SERVICEs/api.js` is still only the small public aggregator.

---

## 1. Current renderer boundary

Feature and page code should call one of these:

```js
import { api } from "../../SERVICEs/api";
import { runtimeBridge } from "../../SERVICEs/bridges/miso_bridge";
import { themeBridge } from "../../SERVICEs/bridges/theme_bridge";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
```

Page and component files should not:

- call `window.misoAPI` / `window.ollamaAPI` / `window.themeAPI` directly
- import `ipcRenderer`
- add raw `fetch(...)` calls for preload-backed or sidecar-backed app work

Use `api.*` for business/domain flows. Use `src/SERVICEs/bridges/*.js` for native runtime helpers that intentionally stay close to the Electron bridge.

---

## 2. Which file to edit

Use this rule:

- Miso chat runtime / model catalog / toolkits / memory projection / streaming: `src/SERVICEs/api.miso.js`
- Ollama install, status, library, HTTP helpers: `src/SERVICEs/api.ollama.js`
- app info / updater namespaces exposed on `api`: `src/SERVICEs/api.system.js`
- workspace validation, runtime storage, devtools toggle, theme, window chrome: `src/SERVICEs/bridges/*.js`
- shared wrappers and error types: `src/SERVICEs/api.shared.js`
- aggregated export only: `src/SERVICEs/api.js`

If the new capability crosses the Electron process boundary, also update:

- channel names: `electron/shared/channels.js`
- preload bridge factory: `electron/preload/bridges/*.js`
- preload exposure: `electron/preload/index.js` when adding a new global API namespace
- handler registry: `electron/main/ipc/register_handlers.js`
- main service implementation: `electron/main/services/*`

---

## 3. Required pattern

When adding a new async renderer-facing method:

1. Put the real implementation in the correct domain API or bridge helper.
2. Use `assertBridgeMethod(...)` and `hasBridgeMethod(...)` appropriately.
3. Use `withTimeout(...)` when the call can hang.
4. Normalize the returned payload before the UI sees it.
5. Wrap failures with `toFrontendApiError(...)` or throw `FrontendApiError`.
6. Expose the method through `api.js` only when it belongs on the public `api` surface.

Minimal API pattern:

```js
export const createDomainApi = () => ({
  someMethod: async () => {
    try {
      const method = assertBridgeMethod("bridgeName", "methodName");
      const result = await withTimeout(
        () => method(),
        5000,
        "some_timeout",
        "Request timed out",
      );
      return normalizeResult(result);
    } catch (error) {
      throw toFrontendApiError(error, "some_failed", "Request failed");
    }
  },
});
```

Minimal renderer-bridge pattern:

```js
export const runtimeBridge = {
  someMethod: async () => {
    const method = assertBridgeMethod("misoAPI", "someMethod");
    const response = await withTimeout(
      () => method(),
      6000,
      "some_timeout",
      "Request timed out",
    );
    return normalizeResponse(response);
  },
};
```

---

## 4. `api.js` contract

Keep `src/SERVICEs/api.js` small.

It should:

- instantiate domain APIs
- preserve the public `api` shape used across the renderer
- re-export shared helpers used in tests and callers

It should not become the implementation home for:

- bridge-specific request logic
- Miso stream listener wiring
- provider-specific payload shaping
- runtime helper code that already has a bridge wrapper

Current shape:

```js
export const api = {
  appInfo: system.appInfo,
  appUpdate: system.appUpdate,
  system,
  runtime: system.runtime,
  theme: system.theme,
  windowState: system.windowState,
  miso: createMisoApi(),
  ollama: createOllamaApi(),
};
```

---

## 5. High-risk pitfalls

- Do not add new bridge or HTTP logic directly in pages. Error handling and compatibility drift immediately.
- Do not treat `src/SERVICEs/api.js` as the implementation home.
- Do not bypass `FrontendApiError` wrapping. UI code branches on stable error codes.
- Do not skip preload, channels, and main-service updates when adding a new Electron capability.
- Do not make optional bridge methods hard failures unless the feature is actually required. Follow the current compatibility pattern in `api.miso.getModelCatalog()` and `api.miso.getToolkitCatalog()`.
- Do not duplicate runtime helpers in multiple pages when a renderer bridge module already exists.

---

## 6. Add-a-capability checklist

- [ ] Picked the correct domain API or renderer bridge module
- [ ] Added timeout protection where the call can hang
- [ ] Wrapped failures in `FrontendApiError`
- [ ] Normalized the returned payload
- [ ] Updated `electron/shared/channels.js` if a new IPC capability was added
- [ ] Updated preload and main-service layers if the capability crosses Electron
- [ ] Exposed the method through `src/SERVICEs/api.js` only when appropriate
- [ ] Updated UI code to call `api.*` or `src/SERVICEs/bridges/*`
- [ ] Did not add direct `window.*API` or raw sidecar `fetch(...)` in page/component code

Quick checks:

```bash
rg -n "window\\.(misoAPI|ollamaAPI|themeAPI|windowStateAPI)|ipcRenderer|fetch\\(" src \
  --glob '!**/SERVICEs/api*.js' \
  --glob '!**/SERVICEs/bridges/*.js' \
  --glob '!**/PAGEs/demo/**'
```

```bash
rg -n "CHANNELS\\.|ipcMain\\.(handle|on)|ipcRenderer\\.(invoke|send)" electron
```
