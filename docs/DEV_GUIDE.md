# PuPu Developer Guide

> Unified developer reference for the PuPu desktop AI client.
> Last verified against codebase: 2026-04-02

---

## What is PuPu?

PuPu is a cross-platform desktop AI client built with **React 19 + Electron 40** (frontend) and a **Python Flask sidecar** (`unchain_runtime`) for chat orchestration, memory, workspace context, and character management.

It supports multiple model providers (OpenAI, Anthropic, Gemini, Ollama) and provides features like multi-conversation management, file attachments, tool orchestration, sub-agent delegation, and AI character personas.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend UI | React 19.1.0, JavaScript (no TypeScript) |
| Desktop Shell | Electron 40.6.0, electron-builder 26.8.1 |
| Backend Sidecar | Python 3.12, Flask |
| Agent Framework | Unchain SDK (Agent, Modules) |
| Vector Memory | Qdrant (optional) |
| Styling | Inline styles (no CSS modules) |
| Routing | Custom mini router (not react-router-dom) |
| Animations | react-spring 10.0.3 |
| 3D | Three.js 0.183.0 |
| Drag & Drop | @dnd-kit |
| Code Highlight | highlight.js 11.9.0 |
| Markdown | react-showdown 2.3.1 |

---

## Project Structure

```
PuPu/
├── src/                          # React application
│   ├── PAGEs/                    # Route-level pages
│   │   ├── chat/                 # Main chat interface
│   │   │   └── hooks/            # Core hooks (use_chat_stream.js)
│   │   └── chat_page/            # Alternative chat layout
│   ├── COMPONENTs/               # Domain feature components (19 dirs)
│   │   ├── agents/               # Agent orchestration UI
│   │   ├── chat/                 # Core chat logic
│   │   ├── chat-bubble/          # Message rendering
│   │   ├── chat-header/          # Chat controls
│   │   ├── chat-input/           # Message input + attachments
│   │   ├── chat-messages/        # Message list container
│   │   ├── settings/             # Global settings UI
│   │   ├── side-menu/            # Conversation tree sidebar
│   │   ├── toolkit/              # Toolkit selection modal
│   │   ├── workspace/            # Workspace folder selection
│   │   ├── memory-inspect/       # Memory debug inspector
│   │   ├── init-setup/           # First-run wizard
│   │   ├── title_bar/            # Electron title bar
│   │   ├── terminal/             # Terminal output
│   │   ├── dialog/               # Dialog primitives
│   │   ├── context_menu/         # Context menus
│   │   └── file_drop_zone/       # File drag-and-drop
│   ├── BUILTIN_COMPONENTs/       # Reusable UI primitives (32 dirs)
│   │   ├── mini_react/           # Custom router, storage, hooks
│   │   ├── icon/                 # SVG icon system
│   │   ├── input/                # Input fields
│   │   ├── modal/                # Modal container
│   │   ├── card/                 # Card layout
│   │   ├── code/                 # Code block renderer
│   │   ├── markdown/             # Markdown renderer
│   │   ├── flow_editor/          # Node-based flow editor
│   │   ├── explorer/             # File explorer UI
│   │   └── ...                   # spinner, tag, select, switch, etc.
│   ├── SERVICEs/                 # API facades, storage, bridges
│   │   ├── api.unchain.js        # Unchain/Miso API facade
│   │   ├── api.ollama.js         # Ollama API facade
│   │   ├── api.shared.js         # Shared utilities, error class
│   │   ├── api.system.js         # System info APIs
│   │   ├── chat_storage.js       # Chat persistence (localStorage)
│   │   ├── chat_storage/         # Storage internals (5 files)
│   │   ├── bridges/              # Electron IPC bridge wrappers
│   │   ├── system_prompt_sections.js
│   │   ├── feature_flags.js
│   │   └── ...
│   ├── CONTAINERs/               # Context providers
│   │   └── config/               # ConfigContext (isDark, theme, fonts)
│   └── App.js                    # Root + route definitions
├── electron/                     # Electron desktop layer
│   ├── main/                     # Main process
│   │   ├── index.js              # Service initialization
│   │   ├── ipc/                  # IPC handler registration
│   │   ├── window/               # Main window management
│   │   └── services/             # Runtime, Unchain, Ollama, Update
│   ├── preload/                  # Renderer bridge
│   │   ├── index.js              # contextBridge.exposeInMainWorld
│   │   ├── bridges/              # 7 bridge factories
│   │   └── stream/               # SSE stream client
│   └── shared/                   # IPC channel constants
├── unchain_runtime/              # Python Flask backend
│   ├── server/                   # Flask application (25 Python files)
│   │   ├── app.py                # Flask factory
│   │   ├── routes.py             # API endpoints (~55KB)
│   │   ├── unchain_adapter.py    # Agent orchestration (~99KB)
│   │   ├── memory_*.py           # Memory subsystem (4 files)
│   │   ├── character_*.py        # Character subsystem (7 files)
│   │   └── route_*.py            # Route modules (6 files)
│   ├── miso/                     # Compiled Miso binaries
│   └── scripts/                  # Build scripts per platform
├── scripts/                      # Build & dev scripts
├── assets/                       # Static assets
├── public/                       # Static web assets
└── docs/                         # This documentation
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Full development (React + Electron)
npm start

# React-only dev server (port 2907)
npm run start:web

# Python backend standalone
cd unchain_runtime/server && python main.py

# Run tests
npm test                                    # Frontend (Jest)
npm test -- --testPathPattern="chat_storage" # Filtered
cd unchain_runtime/server && python -m pytest tests/ -q --tb=short  # Backend
```

### Build

```bash
npm run build:electron:mac         # macOS ARM64
npm run build:electron:mac:intel   # macOS Intel
npm run build:electron:win         # Windows
npm run build:electron:linux       # Linux
```

> Always run `npm run version:prepare-build` before `react-scripts build`.

---

## Documentation Map

| Document | Covers |
|----------|--------|
| **[Architecture](architecture/)** | |
| [Request Flow & Streaming](architecture/request-flow-and-streaming.md) | End-to-end chat streaming, SSE protocol, V2 frame types |
| [IPC Boundary](architecture/ipc-boundary.md) | Electron IPC patterns, bridge layers, channel registry |
| [System Prompt V2](architecture/system-prompt-v2.md) | 3-layer prompt override architecture |
| [Memory System](architecture/memory-system.md) | Embedding resolution, Qdrant integration, session vs long-term memory |
| [Storage Model](architecture/storage-model.md) | localStorage persistence, schema versioning, tree structure |
| **[Data Models](data-models/)** | |
| [Chat Session & Messages](data-models/chat-session-and-messages.md) | Session shape, message shape, attachments, trace frames, subagent meta |
| [Model & Toolkit Catalog](data-models/model-and-toolkit-catalog.md) | Model catalog, toolkit catalog V2, provider structure |
| [Character Spec](data-models/character-spec.md) | Character identity, avatar, schedule, memory profiles |
| [Tree & Explorer](data-models/tree-and-explorer.md) | Folder/chat nodes, tree store, explorer projection |
| **[API Reference](api-reference/)** | |
| [Flask Endpoints](api-reference/flask-endpoints.md) | All HTTP routes on the Python sidecar |
| [IPC Channels](api-reference/ipc-channels.md) | All Electron IPC channels and patterns |
| [Window APIs](api-reference/window-apis.md) | All `window.*API` bridges exposed to React |
| [Frontend API Facades](api-reference/frontend-api-facades.md) | `api.unchain.js`, `api.ollama.js`, `api.system.js` |
| **[Features](features/)** | |
| [Character System](features/character-system.md) | Personas, schedules, avatars, seeding, import/export |
| [Toolkit & Tool Catalog](features/toolkit-and-tool-catalog.md) | Toolkit discovery, TOML format, tool metadata, auto-approval |
| [Workspace System](features/workspace-system.md) | Named workspaces, per-chat selection, path resolution |
| [Agent Orchestration](features/agent-orchestration.md) | Sub-agent events, delegation, prompt sections |
| **[Conventions](conventions/)** | |
| [Project Conventions](conventions/project-conventions.md) | Naming, styling, file org, component patterns, pitfalls |
| [Build & Testing](conventions/build-and-testing.md) | Build pipeline, test commands, CI setup |

---

## Key Architectural Decisions

1. **JavaScript only** - no TypeScript, no PropTypes
2. **Inline styles** - no CSS modules, no styled-components; dark mode via `isDark` from ConfigContext
3. **Custom router** - `BUILTIN_COMPONENTs/mini_react/mini_router.js`, not react-router-dom
4. **Function components only** - no class components
5. **Bridge-isolated IPC** - React never touches `ipcRenderer`; all access through `window.*API`
6. **localStorage persistence** - chat storage in localStorage with 4.5MB limit and LRU eviction
7. **SSE streaming** - Flask sidecar streams events via SSE, relayed through Electron IPC
8. **Unchain SDK** - agent orchestration via Unchain framework with modular prompt composition

---

## High-Risk Pitfalls

- **No TypeScript** - do not introduce `.ts` or `.tsx` files
- **No CSS modules** - inline styles only, using `isDark` from ConfigContext
- **No direct ipcRenderer** - use bridges; renderer code must never import electron
- **No new context providers** - check if ConfigContext covers it first
- **Build order** - run `version:prepare-build` before `react-scripts build`
- **Test sync** - Electron tests have `.js` and `.cjs` variants; keep them in sync
- **Storage writes** - always go through SERVICEs helpers, never direct localStorage from components
- **Toolkit IDs** - use canonical names (e.g. `WorkspaceToolkit`), not aliases
- **Workspace paths** - never store raw paths in chat sessions; use IDs resolved at stream time
