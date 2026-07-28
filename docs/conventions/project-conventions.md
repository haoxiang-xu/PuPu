# Project Conventions

> Naming, styling, file organization, component patterns, and pitfalls.

---

## Language & Framework Rules

| Rule | Detail |
|------|--------|
| **JavaScript only** | No TypeScript, no `.ts`/`.tsx` files, no PropTypes |
| **Function components** | No class components |
| **Inline styles** | No CSS modules, no styled-components, no CSS files |
| **Custom router** | `BUILTIN_COMPONENTs/mini_react/mini_router.js`, not react-router-dom |
| **No new context providers** | Use ConfigContext unless there's a strong reason not to |

---

## Naming Conventions

| Entity | Convention | Examples |
|--------|-----------|----------|
| Directories | kebab-case | `chat-bubble/`, `side-menu/` |
| Files | snake_case.js | `chat_storage.js`, `unchain_bridge.js` |
| Tests | `*.test.js` co-located | `api.ollama.test.js` |
| Components | PascalCase | `ChatBubble`, `ToolkitModal` |
| Hooks | `useXxx` | `useChatStream`, `useEditableMessage` |
| Callbacks | `onXxx` | `onSend`, `onEditMessage`, `onClose` |
| IPC channels | group:action or group-action | `unchain:get-status`, `ollama-get-status` |

---

## Styling

Always use inline styles with `isDark` from ConfigContext:

```javascript
import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

const MyComponent = () => {
  const { isDark } = useContext(ConfigContext);
  return (
    <div style={{ backgroundColor: isDark ? "#1e1e1e" : "#ffffff" }}>
      ...
    </div>
  );
};
```

- No central theme file — palettes defined per component
- Dark mode toggle via `isDark` boolean from ConfigContext
- Theme object available for `backgroundColor` via `theme` from ConfigContext
- Window size available via `window_size` from ConfigContext

### Context Providers

ConfigContext has been split into fine-grained contexts to avoid re-rendering on
unrelated state changes (e.g. window resize). Defined in
`src/CONTAINERs/config/context.js`:

- `ThemeContext` — `syncWithSystemTheme`, `setSyncWithSystemTheme`, `availableThemes`, `theme`, `setTheme`, `onThemeMode`, `setOnThemeMode`
- `LocaleContext` — `locale`, `setLocale`
- `EnvironmentContext` — `window_size`, `env_browser`, `device_type`
- `NavigationContext` — `onFragment`, `setOnFragment`
- `ConfigContext` — compatibility view with theme, locale, navigation, and an
  immutable startup environment snapshot

> New code should subscribe to the granular context it needs; `ConfigContext`
> does not publish environment updates. Components that must react to resize,
> browser, or device changes use `EnvironmentContext`.

### ConfigContext Shape (merged view)

```javascript
{
  syncWithSystemTheme: boolean,
  setSyncWithSystemTheme: (value) => void,
  availableThemes: string[],
  theme: { backgroundColor: string } | null,
  setTheme: (theme) => void,
  onThemeMode: "dark_mode" | "light_mode",
  setOnThemeMode: (mode) => void,
  locale: string,
  setLocale: (locale) => void,
  window_size: { width, height },
  env_browser: string,
  device_type: string,
  onFragment: "side_menu" | "main",
  setOnFragment: (fragment) => void,
}
```

---

## File Organization

### Source Directories

| Directory | Purpose | Example |
|-----------|---------|---------|
| `src/PAGEs/` | Route-level pages | `chat/chat.js` |
| `src/COMPONENTs/` | Domain feature components | `chat-bubble/`, `settings/` |
| `src/BUILTIN_COMPONENTs/` | Reusable UI primitives | `input/`, `modal/`, `icon/` |
| `src/SERVICEs/` | API facades, storage, bridges | `api.unchain.js`, `chat_storage.js` |
| `src/CONTAINERs/` | Context providers | `config/container.js` |

### Component Directory Structure

```
src/COMPONENTs/<name>/
  <name>.js           # Main component
  <name>.test.js      # Tests
  hooks/              # Custom hooks (if complex)
  components/         # Sub-components (if needed)
  utils/              # Helpers (if needed)
```

### Service File Patterns

- `api.<domain>.js` — API facade for a domain
- `<feature>_storage.js` — localStorage persistence
- `bridges/<name>_bridge.js` — Electron IPC bridge wrapper

---

## Component Patterns

### Standard Component

```javascript
import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

const MyComponent = ({ onAction, data }) => {
  const { isDark } = useContext(ConfigContext);

  return (
    <div style={{ backgroundColor: isDark ? "#1e1e1e" : "#fff" }}>
      {/* content */}
    </div>
  );
};

export default MyComponent;
```

### Hook Extraction

Extract complex logic into custom hooks:

```javascript
// hooks/use_my_feature.js
const useMyFeature = (initialData) => {
  const [state, setState] = useState(initialData);
  // ... logic
  return { state, actions };
};
```

### Modal Pattern

```javascript
const MyModal = ({ isOpen, onClose }) => {
  const { isDark } = useContext(ConfigContext);
  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: isDark ? "#1e1e1e" : "#ffffff",
        borderRadius: 12, padding: 24,
        minWidth: 400, maxWidth: 600,
      }} onClick={(e) => e.stopPropagation()}>
        {/* content */}
      </div>
    </div>
  );
};
```

---

## Storage Patterns

### Settings Storage (SQLite-authoritative)

App Settings are authoritative in `settings.db` (main process), accessed through
the renderer settings repository (`src/SERVICEs/settings_repository.js`). Store
helpers read from the repository's synchronous memory snapshot and persist
through it — they do **not** touch `localStorage` except as the built-in
fallback the repository provides for browser/Jest/degraded mode.

```javascript
import {
  readNamespace,
  replaceNamespace,
} from "../../SERVICEs/settings_repository";

const NAMESPACE = "my_section";

// getter stays synchronous (reads the memory snapshot)
export const readMySettings = () => readNamespace(NAMESPACE, {});

// mutation persists via async IPC; returns a Promise
export const writeMySettings = (updates) =>
  replaceNamespace(NAMESPACE, { ...readMySettings(), ...updates });
```

Rules:

- **Settings go through the repository / store helpers**, never raw
  `localStorage` from components. The repository owns the SQL-vs-fallback
  decision; components must not branch on it.
- **The intentional `localStorage` fallback inside store helpers stays** — it
  keeps browser dev and Jest working. Do not delete it.
- **Secrets never go through the ordinary settings path.** Provider keys are
  read/written only through the secret adapter (`settings_secret_adapter.js`) and
  stored as `safeStorage` ciphertext in `settings.db`; they are stripped from the
  settings snapshot and injected in the main process.
- **"Reset settings" runs a SQL transaction**, never `localStorage.clear()`
  (which would also destroy the boot palette, crash-recovery outboxes, and
  legacy secrets).
- After a successful migration, legacy `localStorage` keys are **dual-keep
  read-only**, not double-written; SQL migration state is authoritative.

Structured stores (token usage, toolkit prefs, computer-use prefs, MCP icons)
follow the same pattern but persist to their own `settings.db` tables via
dedicated IPC channels.

---

## Routing

Custom mini router in `BUILTIN_COMPONENTs/mini_react/mini_router.js`:

```javascript
<Router>
  <Routes>
    <Route path="/" element={<ChatInterface />} />
    <Route path="/mini" element={<DemoPage />} />
  </Routes>
</Router>
```

`react-router-dom` is in dependencies but **not used** for internal routing.

---

## High-Risk Pitfalls

1. **No TypeScript** — do not introduce `.ts`/`.tsx` files
2. **No CSS modules** — inline styles only with `isDark`
3. **No direct ipcRenderer** — use bridges; renderer must never import electron
4. **No new context providers** — check ConfigContext first
5. **Build order** — run `version:prepare-build` before `react-scripts build`
6. **Test sync** — Electron tests have `.js` and `.cjs` variants; keep in sync
7. **Storage writes** — always through SERVICEs helpers; App Settings go through
   the settings repository (SQLite-authoritative), secrets only through the
   secret adapter, and "reset settings" uses a SQL transaction, never
   `localStorage.clear()`
8. **Toolkit IDs** — use canonical `toolkitId` values, not aliases
9. **Workspace paths** — use IDs in sessions, resolve to paths at stream time
10. **Character chats** — force empty toolkits, workspaces, orchestration, overrides

---

## Key Files

| File | Role |
|------|------|
| `src/App.js` | Root component, route definitions |
| `src/CONTAINERs/config/container.js` | ConfigContext provider |
| `src/BUILTIN_COMPONENTs/mini_react/mini_router.js` | Custom router |
| `src/BUILTIN_COMPONENTs/mini_react/mini_storage.js` | Storage utilities |
| `src/BUILTIN_COMPONENTs/mini_react/mini_use.js` | Custom hooks |
| `src/BUILTIN_COMPONENTs/mini_react/mini_material.js` | Material utilities |
