# Frontend API Facades

> Renderer-side API facades that wrap bridge calls with timeouts, normalization, and error handling.

---

## Overview

Frontend code uses API facades (in `src/SERVICEs/`) instead of calling bridges directly. Facades add:
- **Timeout protection** (3-120s depending on operation)
- **Error normalization** (all errors become `FrontendApiError`)
- **Data normalization** (catalogs, status, capabilities)
- **Payload injection** (API keys, memory, workspace, system prompt)

---

## api.unchain.js

Factory: `createUnchainApi()` → returns `unchainApi` object.

### Bridge Check

```javascript
unchainApi.isBridgeAvailable()  // → boolean
```

### Model & Catalog

| Method | Timeout | Description |
|--------|---------|-------------|
| `getStatus()` | 5s | Miso sidecar status |
| `getModelCatalog()` | 5s | All providers + capabilities |
| `getToolkitCatalog()` | 5s | Toolkit list |
| `listToolModalCatalog()` | 5s | Toolkit list for modal |
| `getToolkitDetail(toolkitId, toolName)` | 5s | Individual toolkit detail |
| `listModels(provider?)` | 5s | Model list (optionally filtered) |
| `retrieveModelList(provider?)` | 5s | Alias for listModels |

### Streaming

| Method | Description |
|--------|-------------|
| `startStream(payload, handlers)` | V1 legacy stream |
| `startStreamV2(payload, handlers)` | V2 frame-based stream |
| `cancelStream(requestId)` | Cancel active stream |
| `respondToolConfirmation(payload)` | Submit tool confirmation |

`startStreamV2` applies `normalizeMisoV2Payload(payload)` before sending, which chains:
1. `injectProviderApiKeyIntoPayload`
2. `injectMemoryIntoPayload`
3. `injectWorkspaceRootIntoPayload`
4. `injectSystemPromptV2IntoPayload`

### Characters

| Method | Timeout | Description |
|--------|---------|-------------|
| `listSeedCharacters()` | 15s | Builtin characters |
| `listCharacters()` | 15s | User characters |
| `getCharacter(characterId)` | 15s | Single character |
| `saveCharacter(payload)` | 20s | Create/update |
| `deleteCharacter(characterId)` | 30s | Delete |
| `previewCharacterDecision(payload)` | 20s | Preview evaluation |
| `buildCharacterAgentConfig(payload)` | 20s | Generate config |
| `exportCharacter(characterId, filePath)` | 30s | Export archive |
| `importCharacter(filePath)` | 30s | Import archive |

### Memory

| Method | Timeout | Description |
|--------|---------|-------------|
| `getMemoryProjection(sessionId)` | — | Session memory vectors |
| `getSessionMemoryExport(sessionId)` | — | Export session memory |
| `replaceSessionMemory(payload)` | — | Replace session |
| `getLongTermMemoryProjection()` | — | Long-term vectors |

---

## api.ollama.js

Factory: `createOllamaApi()` → returns `ollamaApi` object.

| Method | Timeout | Description |
|--------|---------|-------------|
| `isBridgeAvailable()` | — | Check bridge availability |
| `install()` | 120s | Download + install Ollama |
| `onInstallProgress(callback)` | — | Subscribe to progress |
| `getStatus()` | 5s | Server status |
| `restart()` | 10s | Restart server |
| `listModels()` | — | All models (filters embeddings) |
| `listChatModels()` | — | Chat models only |
| `listEmbeddingModels()` | — | Embedding models only |
| `searchLibrary({ query, category })` | — | Search ollama.com |
| `pullModel({ name, onProgress, signal })` | 60s | Download model (SSE) |
| `deleteModel(name)` | 5s | Remove model |

---

## api.system.js

Factory: `createSystemApi()` → returns namespaced object.

### appInfo

| Method | Timeout | Description |
|--------|---------|-------------|
| `getVersion()` | 3s | App version string |

### appUpdate

| Method | Timeout | Description |
|--------|---------|-------------|
| `isBridgeAvailable()` | — | Check availability |
| `getState()` | 4s | Update state |
| `checkAndDownload()` | 15s | Trigger update |
| `installNow()` | 6s | Install + restart |
| `onStateChange(callback)` | — | Subscribe |

### runtime

Delegates to `src/SERVICEs/bridges/unchain_bridge.js` methods for workspace validation, folder operations, storage management.

### theme

Delegates to `src/SERVICEs/bridges/theme_bridge.js`.

### windowState

Delegates to `src/SERVICEs/bridges/window_state_bridge.js`.

---

## Error Handling

All facades use `FrontendApiError`:

```javascript
class FrontendApiError extends Error {
  name = "FrontendApiError"
  code: string       // e.g. "timeout", "bridge_unavailable"
  cause?: Error      // original error
  details?: any      // additional context
}
```

Common error codes:
- `bridge_unavailable` — bridge not loaded (web mode)
- `timeout` — operation timed out
- `network_error` — HTTP/fetch failure
- `api_error` — backend returned error

Utility functions:
- `toFrontendApiError(error, fallbackCode, fallbackMessage, details)` — wraps any error
- `withTimeout(task, timeoutMs, timeoutCode, timeoutMessage)` — adds timeout to Promise

---

## Bridge Access Utilities

```javascript
getWindowBridge(bridgeName)              // → bridge object | null
hasBridgeMethod(bridgeName, methodName)  // → boolean
assertBridgeMethod(bridgeName, methodName) // → bound method | throws
```

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/api.unchain.js` | Unchain/Miso API facade |
| `src/SERVICEs/api.ollama.js` | Ollama API facade |
| `src/SERVICEs/api.system.js` | System API facade |
| `src/SERVICEs/api.shared.js` | Shared utilities, error class |
| `src/SERVICEs/api.js` | Main API entry (combines all) |
