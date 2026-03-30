# PuPu - Claude Code Project Instructions

## Project Overview

PuPu is a cross-platform desktop AI client built with **React 19 + Electron 40** (frontend) and a **Python Flask sidecar** (miso_runtime) for chat memory, workspace context, and character management.

- **JavaScript only** — no TypeScript, no PropTypes
- **Inline styles** — no CSS modules, no styled-components
- **Custom router** — `BUILTIN_COMPONENTs/mini_react/mini_router.js` (not react-router-dom for internal routing)
- **All function components** — no class components

## Architecture

```
src/
  PAGEs/              — Route-level pages (chat/, demo/)
  COMPONENTs/         — Domain feature components (chat-bubble, settings, toolkit, etc.)
  BUILTIN_COMPONENTs/ — Reusable UI primitives (input/, modal/, card/, icon/, spinner/, etc.)
  SERVICEs/           — API facade, storage, bridges, utilities
  CONTAINERs/         — Context providers (ConfigContainer → isDark, fonts, window size)
electron/
  main/               — Main process: services (runtime, miso, ollama, update), IPC handlers
  preload/            — Bridge factories (contextBridge.exposeInMainWorld), stream client
  shared/             — IPC channel constants
miso_runtime/
  server/             — Flask backend: routes.py, miso_adapter.py, memory_factory.py, character_store.py
```

### Request Flow (Chat Streaming)

```
ChatInterface (use_chat_stream.js)
  → api.miso.startStreamV2(payload, handlers)
    → Electron IPC (miso_bridge.js → register_handlers.js)
      → misoService.handleStreamStartV2 (HTTP POST to Flask)
        → routes.py: chat_stream_v2() → SSE stream
          → miso_adapter.py: stream_chat_events()
            → unchain Agent.run() in worker thread
              → Provider SDK (OpenAI/Anthropic/Gemini/Ollama)
```

SSE frames flow back through the same path: Flask → Electron main → IPC → preload stream client → React onFrame/onToken/onDone handlers.

### IPC Boundary

React code **never** touches `ipcRenderer` directly. All system access goes through:
- `window.misoAPI` — chat streaming, tool confirmation, model/toolkit catalogs
- `window.ollamaAPI` — Ollama status, model install
- `window.themeAPI` — system theme detection
- `window.windowStateAPI` — minimize, maximize, close
- `window.appInfoAPI` — version info
- `window.appUpdateAPI` — auto-update

## Naming Conventions

| Entity | Convention | Examples |
|--------|-----------|----------|
| Directories | kebab-case | `chat-bubble/`, `side-menu/` |
| Files | snake_case.js | `chat_storage.js`, `miso_bridge.js` |
| Tests | `*.test.js` co-located | `api.ollama.test.js` |
| Components | PascalCase | `ChatBubble`, `ToolkitModal` |
| Hooks | `useXxx` | `useChatStream`, `useEditableMessage` |
| Callbacks | `onXxx` | `onSend`, `onEditMessage` |

## Styling

Always inline styles with `isDark` from ConfigContext:

```js
const { isDark } = useContext(ConfigContext);
style={{ backgroundColor: isDark ? "#1e1e1e" : "#ffffff" }}
```

No central theme file — palettes defined per component.

## Key Files

| File | Purpose |
|------|---------|
| `src/PAGEs/chat/chat.js` | Main chat page |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Core streaming hook (~1900 lines) |
| `src/SERVICEs/api.miso.js` | Miso API facade (payload injection, streaming) |
| `src/SERVICEs/chat_storage.js` | Chat persistence to localStorage |
| `src/COMPONENTs/settings/` | Settings UI (model providers, memory, workspace) |
| `src/COMPONENTs/toolkit/` | Toolkit selection and management UI |
| `src/COMPONENTs/chat-bubble/` | Message rendering (markdown, code, trace frames) |
| `src/COMPONENTs/side-menu/` | Conversation tree sidebar |
| `src/BUILTIN_COMPONENTs/mini_react/` | Custom router, storage, hooks |
| `electron/main/services/miso/service.js` | Miso server lifecycle + SSE relay |
| `electron/preload/stream/miso_stream_client.js` | IPC stream listener |
| `miso_runtime/server/routes.py` | Flask API endpoints (55KB) |
| `miso_runtime/server/miso_adapter.py` | Agent creation + chat orchestration (99KB) |
| `miso_runtime/server/memory_factory.py` | Memory manager creation + Qdrant setup |

## Dev Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Full dev: React (port 2907) + Electron |
| `npm run start:web` | React-only dev server |
| `npm test` | Jest test runner |
| `npm run build:electron:mac` | macOS ARM64 build |

Python backend standalone:
```bash
cd miso_runtime/server && python main.py
```

## Existing Documentation

Detailed skill docs live in `.github/skills/` — 14 markdown files covering:
- Project conventions and build pipeline
- Chat runtime, memory, and trace flow
- System prompt V2 architecture (3-layer override)
- Character system (personas, schedules, profiles)
- Toolkit and tool catalog
- Electron IPC boundary
- Miso server endpoints
- Chat storage reference
- Workspace runtime and selection
- Model providers and Ollama
- Side menu / chat tree
- Modal and settings page patterns
- Backend API facade

**Read these before making architectural changes.** They are the source of truth for patterns and conventions.

## High-Risk Pitfalls

- Do NOT introduce TypeScript files
- Do NOT use CSS modules or styled-components — inline styles only
- Do NOT access `ipcRenderer` from renderer code — use bridges
- Do NOT create new context providers without checking if ConfigContext already covers it
- Do NOT run `react-scripts build` without `version:prepare-build` first
- Electron tests have both `.js` and `.cjs` variants — keep them in sync
- localStorage writes must go through dedicated helpers in SERVICEs, never direct from components
