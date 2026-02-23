# Skill: Add/Update Backend API Functions in `src/SERVICEs/api.js`

This guide defines the only accepted pattern for frontend-to-backend calls in this repo.
If you add a new backend call, implement it in `src/SERVICEs/api.js` first.

---

## 1. Scope and boundary

Use this skill when you need to:

- call Electron preload bridges (`window.misoAPI`, `window.ollamaAPI`)
- call local HTTP endpoints (for example Ollama on `http://localhost:11434`)
- standardize API errors and timeouts

Do **not** call bridges or `fetch` directly from page/component files unless there is an approved exception.

---

## 2. Required file

- API facade file: `src/SERVICEs/api.js`
- Consumer files (pages/components) must import from the facade:

```js
import { api } from "../../SERVICEs/api";
```

---

## 3. Public facade contract

`api.js` must export:

- `FrontendApiError`
- `api` object (grouped by domain)
- default export `api`

Current grouping pattern:

```js
export const api = {
  miso: { ... },
  ollama: { ... },
};
```

When adding a new backend domain, add a new top-level group (for example `api.files`, `api.auth`), not ad-hoc exports.

---

## 4. Non-negotiable implementation rules

1. Every request path must have timeout protection (`withTimeout`).
2. Every thrown error must be a `FrontendApiError`.
3. Bridge methods must be checked with `assertBridgeMethod` or `hasBridgeMethod`.
4. Any API payload with variable shape must be normalized before returning to UI.
5. Keep bridge availability checks inside facade (`isBridgeAvailable`) when possible.
6. If a method is intentionally optional (for compatibility), return safe defaults instead of crashing.

---

## 5. Canonical method templates

### 5.1 Bridge-based request

```js
someMethod: async () => {
  try {
    const method = assertBridgeMethod("bridgeName", "methodName");
    const result = await withTimeout(
      () => method(),
      5000,
      "some_timeout_code",
      "Some request timed out",
    );
    return normalizeResult(result);
  } catch (error) {
    throw toFrontendApiError(
      error,
      "some_failed_code",
      "Some request failed",
    );
  }
},
```

### 5.2 HTTP request

```js
someHttpMethod: async (input) => {
  try {
    const response = await withTimeout(
      () => fetch("http://localhost:xxxx/path", { method: "POST" }),
      5000,
      "some_http_timeout",
      "HTTP request timed out",
    );

    if (!response.ok) {
      throw new FrontendApiError("http_error", `Request failed (${response.status})`, null, {
        status: response.status,
      });
    }

    const json = await safeJson(response);
    return normalizeJson(json);
  } catch (error) {
    throw toFrontendApiError(error, "some_http_failed", "HTTP request failed");
  }
},
```

---

## 6. Error model

Use `FrontendApiError(code, message, cause, details)` with:

- stable `code` for programmatic branching
- user-safe `message`
- optional `details` for debug context (`status`, `model`, etc.)

Do not leak raw unknown exceptions from facade methods.

---

## 7. Compatibility policy

If preload has not exposed a method yet:

- check with `hasBridgeMethod(...)`
- return safe fallback if the feature is optional
- throw `bridge_unavailable` if the feature is required

Example already used in repo:
- `api.miso.getModelCatalog()` returns an empty normalized catalog when bridge method is missing.

---

## 8. Consumer-side rules

Page/component code should:

- call `api.<domain>.<method>()`
- handle errors with `try/catch`
- only branch on `FrontendApiError.code` where needed
- avoid direct usage of `window.misoAPI`, `window.ollamaAPI`, and raw `fetch`

---

## 9. Add-a-method checklist

- [ ] Method added under the correct `api.<domain>` group in `src/SERVICEs/api.js`
- [ ] Timeout added via `withTimeout`
- [ ] Errors wrapped with `toFrontendApiError`
- [ ] Response normalized
- [ ] Consumer files switched to facade call
- [ ] No new direct bridge/fetch call leaked into pages/components

Quick check:

```bash
rg -n "window\\.misoAPI|window\\.ollamaAPI|fetch\\(" src --glob '!**/SERVICEs/api.js' --glob '!**/PAGEs/demo/**'
```

