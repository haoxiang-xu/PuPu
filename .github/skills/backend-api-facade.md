# Skill: Extend Backend APIs Through Domain Modules

Use this guide when you need to add or change renderer-to-backend calls.

The current API layering is:

- domain implementation: `src/SERVICEs/api.miso.js`
- domain implementation: `src/SERVICEs/api.ollama.js`
- domain implementation: `src/SERVICEs/api.system.js`
- compatibility export surface: `src/SERVICEs/api.js`
- shared helpers: `src/SERVICEs/api.shared.js`

`src/SERVICEs/api.js` is not the main implementation home anymore. It keeps the legacy `api` shape stable while delegating to domain modules.

---

## 1. Current boundary

Renderer code should call:

```js
import { api } from "../../SERVICEs/api";
```

Page and component files should not:

- call `window.misoAPI` directly
- call `window.ollamaAPI` directly
- add raw `fetch(...)` calls for sidecar or preload-backed backend work

If a new backend capability is needed, implement it in the correct domain module first, then expose it through `api.js`.

---

## 2. Which file to edit

Use this rule:

- Miso sidecar / chat runtime / toolkits / streaming: `src/SERVICEs/api.miso.js`
- Ollama HTTP helpers and model utilities: `src/SERVICEs/api.ollama.js`
- App/runtime/theme/window integrations: `src/SERVICEs/api.system.js`
- Shared timeout/error helpers: `src/SERVICEs/api.shared.js`
- Aggregated export only: `src/SERVICEs/api.js`

Example from the current repo:

- `api.miso.startStreamV2(payload, handlers)` lives in `api.miso.js`
- `api.js` only wires `miso: createMisoApi()`

---

## 3. Required pattern

When adding a new backend-facing method:

1. Put the real implementation in the domain module.
2. Use `withTimeout(...)` for async work where applicable.
3. Normalize bridge/HTTP responses before returning to UI.
4. Convert thrown errors to `FrontendApiError`.
5. Expose the method through the aggregated `api` object in `src/SERVICEs/api.js`.

Minimal pattern:

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

---

## 4. `api.js` contract

Today `src/SERVICEs/api.js` is a compatibility aggregator. Keep it small.

It should:

- instantiate domain APIs
- preserve the public `api` shape used across the renderer
- re-export shared helpers used elsewhere

It should not become the dumping ground for:

- bridge-specific request logic
- Miso streaming implementation details
- provider-specific payload shaping
- page-specific hacks

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

- Do not add new bridge or HTTP logic directly in pages. If you do, error handling and compatibility drift immediately.
- Do not treat `src/SERVICEs/api.js` as the implementation home. It only aggregates domain modules.
- Do not bypass `FrontendApiError` wrapping. UI code branches on stable error codes.
- Do not skip response normalization. The facade layer exists to hide bridge and backend inconsistencies from the renderer.
- Do not make optional bridge methods hard failures unless the feature is actually required. Follow the current compatibility pattern in `api.miso.getModelCatalog()` and `api.miso.getToolkitCatalog()`.

---

## 6. Add-a-method checklist

- [ ] Picked the correct domain module (`api.miso.js`, `api.ollama.js`, or `api.system.js`)
- [ ] Added timeout protection where the call can hang
- [ ] Wrapped failures in `FrontendApiError`
- [ ] Normalized the returned payload
- [ ] Exposed the method through `src/SERVICEs/api.js`
- [ ] Updated the UI to call `api.<domain>.<method>()`
- [ ] Did not add direct bridge or sidecar fetch logic to page/component code

Quick check:

```bash
rg -n "window\\.(misoAPI|ollamaAPI)|fetch\\(" src \
  --glob '!**/SERVICEs/api*.js' \
  --glob '!**/PAGEs/demo/**'
```
