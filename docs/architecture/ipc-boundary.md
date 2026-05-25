# IPC Boundary

> Electron Inter-Process Communication architecture in PuPu.

---

## Boundary Model

React renderer code **never** accesses `ipcRenderer` directly. All system access goes through a three-layer bridge architecture:

```
┌──────────────────────────────────────────────────────┐
│ RENDERER (React)                                      │
│   src/SERVICEs/bridges/*_bridge.js                   │
│   Wraps window.*API with timeouts and error handling │
├──────────────────────────────────────────────────────┤
│ PRELOAD (contextBridge)                               │
│   electron/preload/bridges/*_bridge.js               │
│   Factory functions → contextBridge.exposeInMainWorld │
├──────────────────────────────────────────────────────┤
│ MAIN PROCESS                                          │
│   electron/main/ipc/register_handlers.js             │
│   ipcMain.handle / ipcMain.on → service methods      │
│   electron/main/services/*/service.js                │
└──────────────────────────────────────────────────────┘
```

---

## IPC Patterns

### invoke / handle (Request-Response)

Used for operations that return data.

```
Renderer:  ipcRenderer.invoke(channel, payload)  →  Promise<result>
Main:      ipcMain.handle(channel, (event, payload) => result)
```

### send / on (Fire-and-Forget or Events)

Used for one-way messages or continuous events.

```
Renderer → Main:  ipcRenderer.send(channel, payload)
Main → Renderer:  webContents.send(channel, data)
Renderer listens: ipcRenderer.on(channel, callback)
```

---

## Exposed Window APIs

Nine global objects are exposed via `contextBridge.exposeInMainWorld`:

| Global | Source Bridge | Purpose |
|--------|-------------|---------|
| `window.runtime` | inline | `{ isElectron: true, platform: string }` |
| `window.osInfo` | inline | `{ platform: string }` |
| `window.appInfoAPI` | `app_info_bridge.js` | App version |
| `window.appUpdateAPI` | `app_update_bridge.js` | Auto-update lifecycle |
| `window.ollamaAPI` | `ollama_bridge.js` | Ollama status, install, restart |
| `window.ollamaLibraryAPI` | `ollama_library_bridge.js` | Model library search |
| `window.unchainAPI` | `unchain_bridge.js` + stream client | Chat, tools, characters, memory, workspace, files |
| `window.themeAPI` | `theme_bridge.js` | System theme detection |
| `window.windowStateAPI` | `window_state_bridge.js` | Minimize, maximize, close |

---

## Channel Registry

All IPC channels are defined in `electron/shared/channels.js`.

### APP Channels
| Channel | Pattern |
|---------|---------|
| `app:get-version` | invoke/handle |

### UPDATE Channels
| Channel | Pattern |
|---------|---------|
| `update:get-state` | invoke/handle |
| `update:check-and-download` | invoke/handle |
| `update:install-now` | invoke/handle |
| `update:state-changed` | main→renderer event |

### OLLAMA Channels
| Channel | Pattern |
|---------|---------|
| `ollama-get-status` | invoke/handle |
| `ollama:list-installed-models` | invoke/handle |
| `ollama-restart` | invoke/handle |
| `ollama:install` | invoke/handle |
| `ollama:install-progress` | main→renderer event |
| `ollama:library-search` | invoke/handle |

### UNCHAIN Channels

**Status & Config:**
| Channel | Pattern |
|---------|---------|
| `unchain:get-status` | invoke/handle |
| `unchain:get-model-catalog` | invoke/handle |
| `unchain:get-toolkit-catalog` | invoke/handle |
| `unchain:list-tool-modal-catalog` | invoke/handle |
| `unchain:get-toolkit-detail` | invoke/handle |
| `unchain:set-chrome-terminal-open` | invoke/handle |
| `unchain:sync-build-feature-flags-snapshot` | invoke/handle |

**Tool:**
| Channel | Pattern |
|---------|---------|
| `unchain:tool-confirmation` | invoke/handle |

**Workspace:**
| Channel | Pattern |
|---------|---------|
| `unchain:pick-workspace-root` | invoke/handle |
| `unchain:validate-workspace-root` | invoke/handle |

**Storage:**
| Channel | Pattern |
|---------|---------|
| `unchain:open-runtime-folder` | invoke/handle |
| `unchain:get-runtime-dir-size` | invoke/handle |
| `unchain:delete-runtime-entry` | invoke/handle |
| `unchain:clear-runtime-dir` | invoke/handle |
| `unchain:get-memory-size` | invoke/handle |
| `unchain:get-character-storage-size` | invoke/handle |
| `unchain:delete-character-storage-entry` | invoke/handle |

**Memory:**
| Channel | Pattern |
|---------|---------|
| `unchain:get-memory-projection` | invoke/handle |
| `unchain:get-long-term-memory-projection` | invoke/handle |
| `unchain:replace-session-memory` | invoke/handle |
| `unchain:get-session-memory-export` | invoke/handle |

**Characters:**
| Channel | Pattern |
|---------|---------|
| `unchain:list-seed-characters` | invoke/handle |
| `unchain:list-characters` | invoke/handle |
| `unchain:get-character` | invoke/handle |
| `unchain:save-character` | invoke/handle |
| `unchain:delete-character` | invoke/handle |
| `unchain:preview-character-decision` | invoke/handle |
| `unchain:build-character-agent-config` | invoke/handle |
| `unchain:export-character` | invoke/handle |
| `unchain:import-character` | invoke/handle |

**File I/O:**
| Channel | Pattern |
|---------|---------|
| `unchain:show-save-dialog` | invoke/handle |
| `unchain:show-open-dialog` | invoke/handle |
| `unchain:write-file` | invoke/handle |
| `unchain:read-file` | invoke/handle |

**Streaming:**
| Channel | Pattern |
|---------|---------|
| `unchain:stream:start` | renderer→main (send/on) |
| `unchain:stream:start-v2` | renderer→main (send/on) |
| `unchain:stream:cancel` | renderer→main (send/on) |
| `unchain:stream:event` | main→renderer event |

**Logging:**
| Channel | Pattern |
|---------|---------|
| `unchain:runtime-log` | main→renderer event |

### THEME Channels
| Channel | Pattern |
|---------|---------|
| `theme-set-background-color` | renderer→main (send/on) |
| `theme-set-mode` | renderer→main (send/on) |

### WINDOW STATE Channels
| Channel | Pattern |
|---------|---------|
| `window-state-event-handler` | renderer→main (send/on) |
| `window-state-event-listener` | main→renderer event |

---

## Main Process Services

Five services are initialized in `electron/main/index.js`:

| Service | Factory | Responsibilities |
|---------|---------|-----------------|
| `windowService` | `createWindowService` | Main window lifecycle, single-instance lock |
| `runtimeService` | `createRuntimeService` | File system, workspace, dialogs |
| `ollamaService` | `createOllamaService` | Ollama server lifecycle, model install |
| `unchainService` | `createUnchainService` | Flask sidecar lifecycle, HTTP proxy, SSE relay |
| `updateService` | `createUpdateService` | electron-updater auto-update |

### Service Lifecycle

```
app.whenReady()
  → ollamaService.startOllama()
  → unchainService.startMiso()       # Legacy method name; starts the Unchain Flask sidecar on port 5879-5895
  → registerIpcHandlers(services)
  → windowService.createMainWindow()
  → updateService (if supported)

app.before-quit / will-quit
  → ollamaService.stopOllama()
  → unchainService.stopMiso()        # Legacy method name; stops the Unchain Flask sidecar
```

---

## Adding a New IPC Capability

1. **Define channel** in `electron/shared/channels.js`
2. **Create preload bridge** in `electron/preload/bridges/<name>_bridge.js`
3. **Register in preload** in `electron/preload/index.js` via `contextBridge.exposeInMainWorld`
4. **Add IPC handler** in `electron/main/ipc/register_handlers.js`
5. **Implement service** (if needed) in `electron/main/services/<name>/service.js`
6. **Create renderer bridge** in `src/SERVICEs/bridges/<name>_bridge.js`
7. **Add tests** for both preload and main process

---

## Key Rules

- React code **never** imports from `electron`
- All bridge availability must be checked before use (graceful fallback for web mode)
- Timeouts must be set on all bridge calls (3-30s depending on operation)
- Stream channels use `send/on` pattern, not `invoke/handle`
- Auth token for Flask sidecar is a 256-bit hex string, generated per session
