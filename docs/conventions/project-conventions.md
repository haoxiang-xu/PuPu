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

### ConfigContext Shape

```javascript
{
  syncWithSystemTheme: boolean,
  setSyncWithSystemTheme: (value) => void,
  availableThemes: string[],
  theme: { backgroundColor: string } | null,
  setTheme: (theme) => void,
  onThemeMode: "dark_mode" | "light_mode",
  setOnThemeMode: (mode) => void,
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

### Settings Storage

```javascript
const STORAGE_KEY = "settings";

export const readMySettings = () => {
  try {
    const root = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return root?.my_section || {};
  } catch { return {}; }
};

export const writeMySettings = (updates) => {
  const root = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  root.my_section = { ...(root.my_section || {}), ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
};
```

> Never write to localStorage directly from components. Always use SERVICEs helpers.

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
7. **Storage writes** — always through SERVICEs helpers
8. **Toolkit IDs** — use canonical names, not aliases
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
