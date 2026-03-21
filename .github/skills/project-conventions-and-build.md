# Skill: Project Conventions, Build, and Dev Setup

Use this guide when you need to understand the project's language conventions, file organization, naming patterns, build pipeline, dev commands, or test framework.

---

## 1. Language and type system

This project uses **JavaScript only**. No TypeScript anywhere.

Runtime validation:

- `typeof` checks, `Array.isArray`, explicit null guards
- No PropTypes — manual prop validation where needed
- Custom `isObject()` helper used across services

---

## 2. Styling convention

Primary pattern: **inline styles** (CSS-in-JS objects).

```js
style={{
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 8,
  backgroundColor: isDark ? "#1e1e1e" : "#ffffff",
}}
```

Theme context:

- `ConfigContext` from `src/CONTAINERs/config/context.js`
- Components receive `isDark` boolean
- Dark/light palettes defined per component, not in a central theme file
- Some CSS classes exist for global concerns (e.g., `.scrollable`)

---

## 3. File organization

```
src/
  PAGEs/              — Route-level pages (chat/, demo/)
  COMPONENTs/         — Domain-specific feature components
  BUILTIN_COMPONENTs/ — Reusable UI primitives (input/, modal/, card/, icon/, etc.)
  SERVICEs/           — API, storage, utilities
  CONTAINERs/         — Context providers, config
electron/
  main/               — Main process entry, services, IPC
  preload/            — Bridge factories, stream client
  shared/             — Channel constants (shared main↔preload)
miso_runtime/
  server/             — Flask backend (routes, adapter, memory)
  miso/               — Broth engine wrapper
  scripts/            — PyInstaller build scripts
```

---

## 4. Naming conventions

| What           | Convention                  | Examples                                               |
| -------------- | --------------------------- | ------------------------------------------------------ |
| Directories    | kebab-case                  | `chat-bubble/`, `chat-input/`, `side-menu/`            |
| Files          | snake_case.js               | `chat_storage.js`, `toolkit_modal.js`                  |
| Test files     | `*.test.js` co-located      | `api.ollama.test.js`, `chat_storage.selection.test.js` |
| Components     | PascalCase exports          | `ChatBubble`, `ToolkitModal`, `SettingsSection`        |
| Hooks          | camelCase with `use` prefix | `useChatStream`, `useEditableMessage`                  |
| Callback props | `on` prefix                 | `onEditMessage`, `onSend`, `onDeleteMessage`           |

---

## 5. Component patterns

- **Hook composition**: custom hooks extract business logic from components
- **Config props**: descriptive names (`showAttachments`, `disableActionButtons`)
- **Context**: `ConfigContext` for theme/UI config (isDark, fonts, etc.)
- **No class components**: all function components with hooks

---

## 6. Dev commands

| Command                                 | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| `npm start` or `npm run start:electron` | Full dev: React dev server (port 2907) + Electron |
| `npm run start:web`                     | React-only dev server (port 2907)                 |
| `npm run electron:start`                | Electron only (expects React already running)     |
| `npm test`                              | Jest test runner (react-scripts test)             |

Python backend:

```bash
bash scripts/init_python312_venv.sh
source .venv/bin/activate
cd miso_runtime/server && python main.py
```

---

## 7. Build pipeline

| Command                            | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `npm run build`                    | Web only (version prep + react-scripts build) |
| `npm run build:electron`           | Full: miso + web + electron-builder           |
| `npm run build:electron:mac`       | macOS ARM64                                   |
| `npm run build:electron:mac:intel` | macOS x64 (`MISO_TARGET_ARCH=x86_64`)         |
| `npm run build:electron:win`       | Windows NSIS                                  |
| `npm run build:electron:linux`     | Linux AppImage + deb                          |
| `npm run build:miso`               | PyInstaller bundle (auto-detect platform)     |

Pipeline order:

1. `version:prepare-build` — generates version file
2. `build:miso:*` — PyInstaller bundles Python server
3. `build:web` — react-scripts build → `build/`
4. electron-builder → packages into distributable

electron-builder config lives in `package.json` under `"build"`:

- appId: `com.red.pupu`
- Output: `dist/`
- Publish: GitHub releases (`haoxiang-xu/PuPu`)
- extraResources: `miso_runtime/` bundled with app

---

## 8. Test framework

- **Jest** + React Testing Library (`@testing-library/react` ^16.3, `@testing-library/jest-dom` ^6.6)
- **react-scripts** test runner
- ESLint config: `react-app` + `react-app/jest`

Test file patterns:

| Scope           | Pattern                                           | Examples                                          |
| --------------- | ------------------------------------------------- | ------------------------------------------------- |
| Service tests   | `api.*.test.js`                                   | `api.ollama.test.js`, `api.workspaceRoot.test.js` |
| Storage tests   | `chat_storage.*.test.js`                          | `chat_storage.selection.test.js`                  |
| Bridge tests    | `bridges/bridges.test.js`                         | ~20+ normalization tests                          |
| Component tests | co-located `*.test.js`                            | `assistant_message_body.test.js`                  |
| Electron tests  | `electron/tests/main/`, `electron/tests/preload/` | `api_contract.test.js`, `ipc_channels.test.js`    |

Electron tests have both `.js` and `.cjs` variants that must be kept in sync.

---

## 9. Key dependencies

| Package          | Version | Purpose            |
| ---------------- | ------- | ------------------ |
| React            | ^19.1.0 | UI framework       |
| react-router-dom | ^7.6.1  | Routing            |
| Electron         | ^40.6.0 | Desktop shell      |
| electron-builder | ^26.8.1 | Build tooling      |
| electron-updater | ^6.6.2  | Auto-updates       |
| @dnd-kit/\*      | ^6-10   | Drag-and-drop      |
| highlight.js     | ^11.9.0 | Code highlighting  |
| react-showdown   | ^2.3.1  | Markdown rendering |
| react-spring     | ^10.0.3 | Animations         |

Python backend:

- Flask, httpx, qdrant-client, numpy, PyInstaller
- Full list: `miso_runtime/server/requirements.txt`

---

## 10. Init setup flow

Five-step onboarding wizard in `src/COMPONENTs/init-setup/`:

1. **Welcome** — splash screen
2. **Provider Selection** — 3D carousel (Ollama, OpenAI, Anthropic)
3. **API Key Config** — provider-specific key entry
4. **Workspace Setup** — default workspace directory picker
5. **Completion** — sets `settings.app.setup_completed = true`

---

## 11. High-risk pitfalls

- Do not introduce TypeScript files. The project is pure JS by design.
- Do not use CSS modules or styled-components. Use inline styles.
- Do not create new context providers without verifying they are needed. `ConfigContext` already covers theme and UI config.
- Do not co-mingle Electron main-process and renderer code. The preload bridge is the only crossing point.
- Do not add new dependencies without checking the `package.json` build section for extraResources implications.
- Do not run `react-scripts build` without `version:prepare-build` first.

---

## 12. Quick checks

```bash
rg -n "from.*ConfigContext|useContext.*ConfigContext" \
  src/PAGEs src/COMPONENTs --include="*.js" | head -20
```

```bash
cat package.json | grep -A2 '"start"'
```

```bash
rg -rn "\.test\.js$" --files src/SERVICEs electron/tests | head -20
```
