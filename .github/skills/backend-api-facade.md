# Skill: Extend Backend APIs and Renderer Bridges

Use this guide when the change lives primarily in renderer-facing service code under `src/SERVICEs/api*.js` or `src/SERVICEs/bridges/*.js`.

Do not use this as the main guide for `electron/**` channel wiring, preload exposure, or main-process service ownership. That boundary belongs to `electron-ipc-runtime-boundary.md`. This skill starts after the Electron contract already exists.

---

## 1. Current renderer ownership

The renderer boundary is currently split into:

- domain APIs for feature flows: `src/SERVICEs/api.miso.js`, `src/SERVICEs/api.ollama.js`, `src/SERVICEs/api.system.js`
- low-level renderer bridge helpers: `src/SERVICEs/bridges/miso_bridge.js`, `src/SERVICEs/bridges/ollama_bridge.js`, `src/SERVICEs/bridges/theme_bridge.js`, `src/SERVICEs/bridges/window_state_bridge.js`
- shared timeout and error helpers: `src/SERVICEs/api.shared.js`
- public compatibility surface: `src/SERVICEs/api.js`

Page and component code should call one of these:

```js
import { api } from "../../SERVICEs/api";
import { runtimeBridge } from "../../SERVICEs/bridges/miso_bridge";
import { themeBridge } from "../../SERVICEs/bridges/theme_bridge";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
```

Page and component code should not:

- call `window.misoAPI` / `window.ollamaAPI` / `window.themeAPI` / `window.windowStateAPI` directly
- import `ipcRenderer`
- add raw `fetch(...)` calls for preload-backed or sidecar-backed app work

Use `api.*` for business and domain flows. Use `src/SERVICEs/bridges/*.js` only for native runtime helpers that intentionally stay close to the preload bridge.

---

## 2. Which file to edit

Use this rule:

- Miso chat runtime, model catalog, toolkit catalog, memory projection, memory replacement, stream start/cancel: `src/SERVICEs/api.miso.js`
- Ollama install, status, list/search/pull/delete helpers: `src/SERVICEs/api.ollama.js`
- app info and updater namespaces exposed on `api`: `src/SERVICEs/api.system.js`
- runtime validation, runtime storage, devtools toggle, theme, window chrome: `src/SERVICEs/bridges/*.js`
- shared wrappers and error types: `src/SERVICEs/api.shared.js`
- aggregated export only: `src/SERVICEs/api.js`

If the renderer capability does not exist in preload or main yet, switch to `electron-ipc-runtime-boundary.md` first and add the boundary there.

---

## 3. Required pattern

When adding a new renderer-facing method:

1. Put the real implementation in the correct domain API or bridge helper.
2. Use `assertBridgeMethod(...)` and `hasBridgeMethod(...)` for preload-backed methods.
3. Use `withTimeout(...)` around bridge calls or HTTP calls that can hang.
4. Normalize the payload before the UI sees it.
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
    const response = await invokeMiso("someMethod", [], {
      timeoutMs: 6000,
      timeoutCode: "some_timeout",
      timeoutMessage: "Request timed out",
      failureCode: "some_failed",
      failureMessage: "Request failed",
    });
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
- stream listener wiring
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

- Do not add new bridge or sidecar logic directly in page code.
- Do not treat `src/SERVICEs/api.js` as the implementation home.
- Do not bypass `FrontendApiError` wrapping. UI code branches on stable error codes.
- Do not call `window.ollamaLibraryAPI.search(...)` outside `src/SERVICEs/api.ollama.js`.
- Do not skip renderer-side normalization for memory projection, runtime storage, or stream handles.
- Do not make optional bridge methods hard failures unless the feature is actually required. Follow the current compatibility pattern in `api.miso.getModelCatalog()` and `api.miso.getToolkitCatalog()`.

---

## 6. Quick checks

```bash
rg -n "window\\.(misoAPI|ollamaAPI|themeAPI|windowStateAPI)|ipcRenderer|fetch\\(" src \
  --glob '!**/SERVICEs/api*.js' \
  --glob '!**/SERVICEs/bridges/*.js' \
  --glob '!**/PAGEs/demo/**'
```

```bash
rg -n "getModelCatalog|getToolkitCatalog|getMemoryProjection|getLongTermMemoryProjection|replaceSessionMemory|startStreamV2" \
  src/SERVICEs/api.miso.js
```

```bash
rg -n "listModels|listChatModels|listEmbeddingModels|searchLibrary|pullModel|deleteModel" \
  src/SERVICEs/api.ollama.js
```
