# IPC Channels

> Complete registry of all Electron IPC channels.

See [IPC Boundary](../architecture/ipc-boundary.md) for the architecture overview.

---

## Channel Patterns

| Pattern | Direction | Use Case |
|---------|-----------|----------|
| `invoke/handle` | Renderer ↔ Main | Request-response (returns Promise) |
| `send/on` | Renderer → Main | Fire-and-forget commands |
| `webContents.send` | Main → Renderer | Event broadcasts |

---

## All Channels

### APP (1 channel)

| Channel | Pattern | Handler |
|---------|---------|---------|
| `app:get-version` | invoke/handle | Returns app version string |

### UPDATE (4 channels)

| Channel | Pattern | Handler |
|---------|---------|---------|
| `update:get-state` | invoke/handle | Returns `{ stage, version, progress, error }` |
| `update:check-and-download` | invoke/handle | Triggers update check + download |
| `update:install-now` | invoke/handle | Installs downloaded update + restart |
| `update:state-changed` | main→renderer | Broadcasts update state changes |

### OLLAMA (6 channels)

| Channel | Pattern | Handler |
|---------|---------|---------|
| `ollama-get-status` | invoke/handle | Returns Ollama server status |
| `ollama:list-installed-models` | invoke/handle | Lists locally installed models |
| `ollama-restart` | invoke/handle | Restarts Ollama server |
| `ollama:install` | invoke/handle | Downloads + installs Ollama |
| `ollama:install-progress` | main→renderer | Broadcasts install progress |
| `ollama:library-search` | invoke/handle | Searches ollama.com model library |

### UNCHAIN (44 channels)

**Status & Config (7):**

| Channel | Pattern |
|---------|---------|
| `unchain:get-status` | invoke/handle |
| `unchain:get-model-catalog` | invoke/handle |
| `unchain:get-toolkit-catalog` | invoke/handle |
| `unchain:list-tool-modal-catalog` | invoke/handle |
| `unchain:get-toolkit-detail` | invoke/handle |
| `unchain:set-chrome-terminal-open` | invoke/handle |
| `unchain:sync-build-feature-flags-snapshot` | invoke/handle |

**Tool (1):**

| Channel | Pattern |
|---------|---------|
| `unchain:tool-confirmation` | invoke/handle |

**Workspace (2):**

| Channel | Pattern |
|---------|---------|
| `unchain:pick-workspace-root` | invoke/handle |
| `unchain:validate-workspace-root` | invoke/handle |

**Storage (5):**

| Channel | Pattern |
|---------|---------|
| `unchain:open-runtime-folder` | invoke/handle |
| `unchain:get-runtime-dir-size` | invoke/handle |
| `unchain:delete-runtime-entry` | invoke/handle |
| `unchain:clear-runtime-dir` | invoke/handle |
| `unchain:get-memory-size` | invoke/handle |

**Character Storage (2):**

| Channel | Pattern |
|---------|---------|
| `unchain:get-character-storage-size` | invoke/handle |
| `unchain:delete-character-storage-entry` | invoke/handle |

**Memory (4):**

| Channel | Pattern |
|---------|---------|
| `unchain:get-memory-projection` | invoke/handle |
| `unchain:get-long-term-memory-projection` | invoke/handle |
| `unchain:replace-session-memory` | invoke/handle |
| `unchain:get-session-memory-export` | invoke/handle |

**Characters (9):**

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

**File I/O (4):**

| Channel | Pattern |
|---------|---------|
| `unchain:show-save-dialog` | invoke/handle |
| `unchain:show-open-dialog` | invoke/handle |
| `unchain:write-file` | invoke/handle |
| `unchain:read-file` | invoke/handle |

**Streaming (4):**

| Channel | Pattern |
|---------|---------|
| `unchain:stream:start` | renderer→main (send) |
| `unchain:stream:start-v2` | renderer→main (send) |
| `unchain:stream:cancel` | renderer→main (send) |
| `unchain:stream:event` | main→renderer (event) |

**Logging (1):**

| Channel | Pattern |
|---------|---------|
| `unchain:runtime-log` | main→renderer (event) |

### THEME (2 channels)

| Channel | Pattern |
|---------|---------|
| `theme-set-background-color` | renderer→main (send) |
| `theme-set-mode` | renderer→main (send) |

### WINDOW STATE (2 channels)

| Channel | Pattern |
|---------|---------|
| `window-state-event-handler` | renderer→main (send) |
| `window-state-event-listener` | main→renderer (event) |

---

## Total: 59 channels

| Group | Count |
|-------|-------|
| APP | 1 |
| UPDATE | 4 |
| OLLAMA | 6 |
| UNCHAIN | 44 |
| THEME | 2 |
| WINDOW STATE | 2 |

---

## Key Files

| File | Role |
|------|------|
| `electron/shared/channels.js` | Channel constant definitions |
| `electron/main/ipc/register_handlers.js` | Handler registration |
