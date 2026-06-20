# Window APIs

> All `window.*API` objects exposed to the React renderer via `contextBridge`.

---

## Overview

The Electron preload script exposes production bridge objects on `window`. React code accesses these through bridge wrappers in `src/SERVICEs/bridges/`. In non-production test runs, it also exposes `window.__pupuTestBridge`.

---

## window.runtime

Static runtime info (no bridge file).

```javascript
{
  isElectron: true,
  platform: string,  // process.platform
}
```

---

## window.osInfo

Static OS info (no bridge file).

```javascript
{
  platform: string,  // process.platform
}
```

---

## window.appInfoAPI

Source: `electron/preload/bridges/app_info_bridge.js`

| Method | Returns |
|--------|---------|
| `getVersion()` | `Promise<string>` — app version |

---

## window.appUpdateAPI

Source: `electron/preload/bridges/app_update_bridge.js`

| Method | Returns |
|--------|---------|
| `checkAndDownload()` | `Promise<void>` — triggers check + download |
| `installNow()` | `Promise<void>` — installs + restarts |
| `getState()` | `Promise<UpdateState>` — `{ stage, version, progress, error }` |
| `onStateChange(callback)` | `() => void` — unsubscribe function |

Update stages: `idle`, `checking`, `no_update`, `downloading`, `downloaded`, `error`.

---

## window.ollamaAPI

Source: `electron/preload/bridges/ollama_bridge.js`

| Method | Returns |
|--------|---------|
| `getStatus()` | `Promise<string>` — status |
| `listInstalledModels()` | `Promise<Model[]>` |
| `restart()` | `Promise<void>` |
| `install()` | `Promise<void>` — downloads Ollama |
| `onInstallProgress(callback)` | `() => void` — unsubscribe |

---

## window.ollamaLibraryAPI

Source: `electron/preload/bridges/ollama_library_bridge.js`

| Method | Returns |
|--------|---------|
| `search(query, category)` | `Promise<SearchResults>` |

---

## window.unchainAPI

Source: `electron/preload/bridges/unchain_bridge.js` + `stream/unchain_stream_client.js`

The largest API surface. Organized by domain:

### Status & Config

| Method | Returns |
|--------|---------|
| `getStatus()` | `Promise<UnchainStatus>` |
| `getModelCatalog()` | `Promise<ModelCatalog>` |
| `getToolkitCatalog()` | `Promise<ToolkitCatalog>` |
| `listToolModalCatalog()` | `Promise<ToolkitCatalog>` |
| `getToolkitDetail(toolkitId, toolName)` | `Promise<ToolkitDetail>` |
| `setChromeTerminalOpen(open)` | `Promise<void>` (dev only) |
| `syncBuildFeatureFlagsSnapshot(flags)` | `Promise<void>` (dev only) |

### Streaming

| Method | Returns |
|--------|---------|
| `startStream(payload, handlers)` | `{ requestId, cancel }` (V1 legacy) |
| `startStreamV2(payload, handlers)` | `{ requestId, cancel }` (V2 frame protocol) |
| `startStreamV4(payload, handlers)` | `{ requestId, cancel }` (V4 RuntimeEvent protocol, current default) |
| `cancelStream(requestId)` | `void` |

The preload bridge exposes `startStream`, `startStreamV2`, and `startStreamV4`.
There is no separate `startStreamV3` bridge method; the renderer's V3 fallback
path (see [../architecture/runtime-events-v3.md](../architecture/runtime-events-v3.md))
is selected in `use_chat_stream.js`. Stream-path selection priority is
**V4 > V3 > V2**.

### Tool Confirmation

| Method | Returns |
|--------|---------|
| `respondToolConfirmation(payload)` | `Promise<Response>` |

### Workspace

| Method | Returns |
|--------|---------|
| `pickWorkspaceRoot(defaultPath)` | `Promise<string>` — selected path |
| `validateWorkspaceRoot(path)` | `Promise<{ valid, reason? }>` |

### Storage

| Method | Returns |
|--------|---------|
| `openRuntimeFolder(path)` | `Promise<void>` — opens in file manager |
| `getRuntimeDirSize(dirPath)` | `Promise<{ size }>` |
| `deleteRuntimeEntry(dirPath, entryName)` | `Promise<void>` |
| `clearRuntimeDir(dirPath)` | `Promise<void>` |
| `getMemorySize()` | `Promise<{ size }>` |
| `getCharacterStorageSize()` | `Promise<{ size }>` |
| `deleteCharacterStorageEntry(entryName)` | `Promise<void>` |

### Memory

| Method | Returns |
|--------|---------|
| `getMemoryProjection(sessionId)` | `Promise<Projection>` |
| `getLongTermMemoryProjection()` | `Promise<Projection>` |
| `replaceSessionMemory(payload)` | `Promise<Response>` |
| `getSessionMemoryExport(sessionId)` | `Promise<Export>` |

### Characters

| Method | Returns |
|--------|---------|
| `listSeedCharacters()` | `Promise<{ characters, count }>` |
| `listCharacters()` | `Promise<{ characters, count }>` |
| `getCharacter(characterId)` | `Promise<Character>` |
| `saveCharacter(payload)` | `Promise<Character>` |
| `deleteCharacter(characterId)` | `Promise<Response>` |
| `previewCharacterDecision(payload)` | `Promise<Preview>` |
| `buildCharacterAgentConfig(payload)` | `Promise<AgentConfig>` |
| `exportCharacter(characterId, filePath)` | `Promise<Response>` |
| `importCharacter(filePath)` | `Promise<Character>` |

### File I/O

| Method | Returns |
|--------|---------|
| `showSaveDialog(options)` | `Promise<{ filePath, canceled }>` |
| `showOpenDialog(options)` | `Promise<{ filePaths, canceled }>` |
| `writeFile(filePath, content)` | `Promise<void>` |
| `readFile(filePath)` | `Promise<string>` |

---

## window.screenshotAPI

Source: `electron/preload/bridges/screenshot_bridge.js`

| Method | Returns |
|--------|---------|
| `capture()` | `Promise<ScreenshotResult>` |
| `checkAvailability()` | `Promise<{ available }>` |

---

## window.chatStorageAPI

Source: `electron/preload/bridges/chat_storage_bridge.js`

| Method | Returns |
|--------|---------|
| `bootstrap()` | `ChatStorageSnapshot | null` |
| `write(payload)` | `void` |

---

## window.__pupuTestBridge

Source: `electron/preload/test_bridge_preload.js`

Available only outside production unless `PUPU_TEST_API_DISABLE=1`.

| Method | Returns |
|--------|---------|
| `register(command, handler)` | `() => void` — unregister function |
| `pushLog(entry)` | `void` |
| `pushEvent(event)` | `void` |
| `markReady()` | `void` |

---

## window.themeAPI

Source: `electron/preload/bridges/theme_bridge.js`

| Method | Returns |
|--------|---------|
| `setBackgroundColor(color)` | `void` — fire-and-forget |
| `setThemeMode(mode)` | `void` — fire-and-forget |

---

## window.windowStateAPI

Source: `electron/preload/bridges/window_state_bridge.js`

| Method | Returns |
|--------|---------|
| `windowStateEventHandler(action)` | `void` — minimize/maximize/close |
| `windowStateEventListener(callback)` | `() => void` — unsubscribe |

---

## Key Files

| File | Role |
|------|------|
| `electron/preload/index.js` | `contextBridge.exposeInMainWorld` calls |
| `electron/preload/bridges/*.js` | Bridge factory functions |
| `electron/preload/stream/unchain_stream_client.js` | Stream client |
| `src/SERVICEs/bridges/*.js` | Renderer-side wrappers with timeouts |
