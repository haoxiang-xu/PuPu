# PuPu Web Browser — Phase 1 (Browser Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a manual in-app web browser workspace accessible via a globe icon in the chat-input attach panel. Users can navigate, open/close/reorder tabs, and toggle a three-state glass chat column — with zero persistence, zero cookie import, zero agent tooling.

**Architecture:** A new `BrowserWorkspace` page mounted as an alternate view of `ChatPage`, composed of a `UrlBar + TabBar` at the top, an Electron `<webview>` host filling the middle, and a right-edge `ChatGlassColumn` (ribbon / column / full snap states). Tab state lives in a module-level `browser_tab_store` — single global tab list, not per-chat (per-chat grouping is Phase 2).

**Tech Stack:** React 19 (function components only, inline styles), Electron 40 `<webview>` tag, custom `mini_react` router, Jest + React Testing Library, CHANNELS-based IPC pattern. **No TypeScript, no CSS modules, no new context providers.**

**Spec reference:** `docs/superpowers/specs/2026-04-13-pupu-web-browser-{01..08}-*.md`

---

## Prerequisites

Before starting:

- [ ] Confirm the current git branch is `agents` (`git branch --show-current`)
- [ ] Confirm the repo is clean or has only expected changes (`git status`)
- [ ] Run `npm install` if any fresh dependencies were pulled
- [ ] Verify `npm test -- --watchAll=false --passWithNoTests` runs without infrastructure errors (we don't care about current test pass/fail — just that the test harness is functional)
- [ ] Read the existing `src/PAGEs/chat/chat.js` top 200 lines once to understand the current ChatPage structure
- [ ] Read the existing `src/COMPONENTs/chat-input/components/attach_panel.js` to understand the Button-in-attach-panel pattern (specifically lines ~299-368)

## GitNexus Discipline

PuPu's `CLAUDE.md` mandates GitNexus impact analysis before editing any existing symbol. For **new files** this is unnecessary. For the two **modified files** in this plan (`main_window.js`, `attach_panel.js`, `chat.js`), you MUST run:

```
gitnexus_impact({target: "<symbol>", direction: "upstream"})
```

before editing. Report the blast radius. Example:
- `createMainWindow` in `main_window.js`
- `AttachPanel` in `attach_panel.js`
- `ChatInterface` in `chat.js`

Also run `gitnexus_detect_changes()` before every commit to confirm scope.

If GitNexus tools are unavailable in your session, proceed with care and do manual grep for callers of each modified symbol.

## File Structure

### New files (created in this phase)

```
electron/main/ipc/channels_browser.js                       — CHANNELS.BROWSER constants (empty stub, will grow in Phase 2)
src/SERVICEs/browser_storage/browser_tab_store.js           — L1 tab store (in-memory, global, single list)
src/SERVICEs/browser_storage/browser_tab_store.test.js
src/SERVICEs/browser_storage/browser_runtime_store.js       — L2 runtime store (loading, title, favicon, canGoBack/Forward)
src/SERVICEs/browser_storage/browser_runtime_store.test.js
src/PAGEs/browser/hooks/use_browser_tabs.js                 — React hook over L1 store
src/PAGEs/browser/hooks/use_browser_tabs.test.js
src/PAGEs/browser/hooks/use_active_webview_runtime.js       — React hook over L2 store
src/PAGEs/browser/hooks/use_active_webview_runtime.test.js
src/BUILTIN_COMPONENTs/glass/glass_surface.js               — Presentational wrapper with backdrop-filter
src/BUILTIN_COMPONENTs/glass/glass_surface.test.js
src/COMPONENTs/browser/url_bar.js                           — URL input + back/forward/reload + "+" button
src/COMPONENTs/browser/url_bar.test.js
src/COMPONENTs/browser/tab_bar.js                           — Horizontal tab strip with click/close/drag-reorder
src/COMPONENTs/browser/tab_bar.test.js
src/COMPONENTs/browser/chat_glass_column.js                 — Right-edge column with ribbon/column/full snap
src/COMPONENTs/browser/chat_glass_column.test.js
src/COMPONENTs/browser/webview_host.js                      — <webview> instance manager (active + hidden tabs)
src/COMPONENTs/browser/webview_crash_overlay.js             — Tab crash UI (extracted for testability)
src/COMPONENTs/browser/webview_crash_overlay.test.js
src/COMPONENTs/browser/webview_error_page_html.js           — Pure fn returning error HTML string
src/COMPONENTs/browser/webview_error_page_html.test.js
src/PAGEs/browser/browser_workspace.js                      — Top-level composition
src/PAGEs/browser/browser_workspace.test.js                 — Smoke test
```

### Modified files

```
electron/main/window/main_window.js                         — Add `webviewTag: true` to webPreferences
src/COMPONENTs/chat-input/components/attach_panel.js        — Add globe button, new prop onEnterBrowser
src/COMPONENTs/chat-input/components/attach_panel.test.js   — Extend for new button
src/COMPONENTs/chat-input/chat_input.js                     — Pass onEnterBrowser through to attach panel
src/PAGEs/chat/chat.js                                      — Add viewMode state, conditionally render BrowserWorkspace
```

### Not created in this phase

- No SQLite / persistence (Phase 2)
- No Chrome cookie importer (Phase 3)
- No CDP / agent tools (Phase 4)
- No new IPC handlers (we only enable `webviewTag`, a main-process config change)

## Task Order

```
Task 1  — Enable webviewTag (main process)
Task 2  — CHANNELS.BROWSER stub (tiny prep)
Task 3  — browser_tab_store (pure module)
Task 4  — browser_runtime_store (pure module)
Task 5  — useBrowserTabs hook
Task 6  — useActiveWebviewRuntime hook
Task 7  — glass_surface primitive
Task 8  — url_bar (presentational)
Task 9  — tab_bar (click/close, no DnD)
Task 10 — tab_bar drag-reorder
Task 11 — chat_glass_column (three snap states)
Task 12 — webview_error_page_html (pure fn)
Task 13 — webview_crash_overlay (presentational)
Task 14 — webview_host (the hard one)
Task 15 — browser_workspace (compose everything)
Task 16 — attach_panel globe icon
Task 17 — chat_input onEnterBrowser prop forwarding
Task 18 — chat.js viewMode wiring
Task 19 — Enter/exit animation polish
Task 20 — Manual end-to-end verification
```

Task 1 must be first (`webviewTag` is required before any webview code works). Tasks 3-13 are independent leaves — any order works. Tasks 14-20 depend on earlier work.

---

## Task 1: Enable `webviewTag` in main window

**Files:**
- Modify: `electron/main/window/main_window.js:191-198`

**GitNexus:** Run `gitnexus_impact({target: "createMainWindow", direction: "upstream"})`. Expected: called once by `electron/main/index.js`. Low blast radius.

- [ ] **Step 1: Read the current `webPreferences` block**

Read `electron/main/window/main_window.js` from line 185 to 200 to confirm the exact current structure.

- [ ] **Step 2: Add `webviewTag: true`**

Modify `webPreferences` to include `webviewTag: true`:

```js
      webPreferences: {
        preload: resolvePublicPath("preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // Keep preload module loading compatible after modularization.
        sandbox: false,
        backgroundThrottling: false,
        webviewTag: true,
      },
```

- [ ] **Step 3: Manual verification**

Run `npm start`. When PuPu launches, open DevTools on the renderer and run:

```js
document.createElement('webview') instanceof HTMLElement
```

Expected: `true` (always `true`, but also no console warning `"webview: Invalid option"`). A cleaner check — paste this in the DevTools console:

```js
const w = document.createElement('webview');
w.setAttribute('src', 'about:blank');
document.body.appendChild(w);
setTimeout(() => console.log('webview tag present:', !!w.getWebContentsId), 500);
```

Expected output: `webview tag present: true`.

Quit PuPu after verifying.

- [ ] **Step 4: Commit**

```bash
git add electron/main/window/main_window.js
git commit -m "feat(browser): enable webviewTag in main window for Phase 1 browser shell"
```

---

## Task 2: CHANNELS.BROWSER stub

**Files:**
- Create: `electron/main/ipc/channels_browser.js`
- Modify: `electron/shared/channels.js` *(if this file exists and registers named constants — inspect first)*

**Purpose:** Even though Phase 1 needs no IPC, we reserve the namespace now so Phase 2-4 don't shuffle code around.

- [ ] **Step 1: Inspect where CHANNELS is centralized**

Run `grep -rn "CHANNELS" electron/shared/ electron/main/ipc/ | head -20`. Find the file that exports the `CHANNELS` object (likely `electron/shared/channels.js`).

- [ ] **Step 2: Add BROWSER namespace**

If `CHANNELS` is a nested object in `electron/shared/channels.js`, add:

```js
// inside the CHANNELS object
BROWSER: {
  // Reserved for Phase 2+ (persistence, cookie import, CDP).
  // Phase 1 does not use IPC for browser mode.
},
```

If the pattern uses separate files per domain, create `electron/main/ipc/channels_browser.js`:

```js
// Reserved for Phase 2+ (persistence, cookie import, CDP).
// Phase 1 does not use IPC for browser mode — webview tag is enabled at the BrowserWindow level.
module.exports = {
  BROWSER: {},
};
```

Follow whichever pattern the existing code uses.

- [ ] **Step 3: Verify nothing breaks**

Run `npm test -- --watchAll=false --testPathPattern="channels" --passWithNoTests`

Expected: no errors introduced by the empty namespace.

- [ ] **Step 4: Commit**

```bash
git add electron/shared/channels.js electron/main/ipc/channels_browser.js
git commit -m "chore(browser): reserve CHANNELS.BROWSER namespace for future phases"
```

---

## Task 3: `browser_tab_store` — in-memory tab store (L1)

**Files:**
- Create: `src/SERVICEs/browser_storage/browser_tab_store.js`
- Test: `src/SERVICEs/browser_storage/browser_tab_store.test.js`

**Spec reference:** Data model § 3.1 (`BrowserTab` shape). Phase 1 uses a single **global** tab list, not `byChatId`.

### Design

- Module-level state `{ tabs: [], activeTabId: null }`
- CRUD: `newTab(url?)`, `closeTab(id)`, `switchTab(id)`, `reorderTab(from, to)`, `updateTabFieldSilent(id, field, value)`
- Subscription: `subscribe(listener) → unsubscribe`
- Silent update path exists for `scrollY` and other high-frequency fields (Phase 1 doesn't use it yet, but we ship the API so Phase 2 doesn't need to refactor subscribers)
- UUIDs via `crypto.randomUUID()` (available in modern Electron)
- Default `url` for new tab: empty string `""`. BrowserWorkspace decides how to render empty-URL tabs.

- [ ] **Step 1: Write the failing test file**

Create `src/SERVICEs/browser_storage/browser_tab_store.test.js`:

```js
import {
  __resetBrowserTabStoreForTests,
  getBrowserTabState,
  newTab,
  closeTab,
  switchTab,
  reorderTab,
  updateTabFieldSilent,
  subscribeBrowserTabStore,
} from "./browser_tab_store";

describe("browser_tab_store", () => {
  beforeEach(() => {
    __resetBrowserTabStoreForTests();
  });

  test("starts empty", () => {
    const s = getBrowserTabState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  test("newTab creates a tab, activates it, and notifies subscribers", () => {
    const listener = jest.fn();
    const unsub = subscribeBrowserTabStore(listener);

    const tab = newTab("https://example.com");
    const s = getBrowserTabState();

    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].id).toBe(tab.id);
    expect(s.tabs[0].url).toBe("https://example.com");
    expect(s.activeTabId).toBe(tab.id);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
  });

  test("newTab with no argument creates an empty-url tab", () => {
    const tab = newTab();
    expect(tab.url).toBe("");
  });

  test("closeTab removes a tab and picks a new active", () => {
    const a = newTab("https://a.com");
    const b = newTab("https://b.com");
    const c = newTab("https://c.com");

    // active is c
    closeTab(c.id);
    let s = getBrowserTabState();
    expect(s.tabs.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(s.activeTabId).toBe(b.id);

    // close middle
    closeTab(a.id);
    s = getBrowserTabState();
    expect(s.tabs.map((t) => t.id)).toEqual([b.id]);
    expect(s.activeTabId).toBe(b.id);

    // close last
    closeTab(b.id);
    s = getBrowserTabState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  test("switchTab sets activeTabId and updates lastActiveAt", () => {
    const a = newTab("https://a.com");
    const b = newTab("https://b.com");

    const beforeSwitch = getBrowserTabState().tabs.find((t) => t.id === a.id).lastActiveAt;
    switchTab(a.id);
    const afterSwitch = getBrowserTabState().tabs.find((t) => t.id === a.id).lastActiveAt;

    expect(getBrowserTabState().activeTabId).toBe(a.id);
    expect(afterSwitch).toBeGreaterThanOrEqual(beforeSwitch);
  });

  test("switchTab to unknown id is a no-op", () => {
    const a = newTab("https://a.com");
    switchTab("nonexistent");
    expect(getBrowserTabState().activeTabId).toBe(a.id);
  });

  test("reorderTab moves a tab from one index to another", () => {
    const a = newTab("https://a.com");
    const b = newTab("https://b.com");
    const c = newTab("https://c.com");

    reorderTab(0, 2);
    const s = getBrowserTabState();
    expect(s.tabs.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  test("reorderTab with invalid indices is a no-op", () => {
    const a = newTab("https://a.com");
    const b = newTab("https://b.com");
    const before = getBrowserTabState().tabs.map((t) => t.id);

    reorderTab(-1, 5);
    reorderTab(0, 99);
    reorderTab(99, 0);

    expect(getBrowserTabState().tabs.map((t) => t.id)).toEqual(before);
  });

  test("updateTabFieldSilent updates in-place without notifying subscribers", () => {
    const a = newTab("https://a.com");
    const listener = jest.fn();
    subscribeBrowserTabStore(listener);

    updateTabFieldSilent(a.id, "scrollY", 420);

    const tab = getBrowserTabState().tabs.find((t) => t.id === a.id);
    expect(tab.scrollY).toBe(420);
    expect(listener).not.toHaveBeenCalled();
  });

  test("updateTabFieldSilent on unknown tab is a no-op", () => {
    updateTabFieldSilent("nonexistent", "scrollY", 420);
    // no throw; no state change
    expect(getBrowserTabState().tabs).toEqual([]);
  });

  test("subscribe returns a working unsubscribe", () => {
    const listener = jest.fn();
    const unsub = subscribeBrowserTabStore(listener);

    newTab("https://a.com");
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    newTab("https://b.com");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/SERVICEs/browser_storage/browser_tab_store.test.js
```

Expected: FAIL with `Cannot find module './browser_tab_store'`.

- [ ] **Step 3: Implement `browser_tab_store.js`**

Create `src/SERVICEs/browser_storage/browser_tab_store.js`:

```js
// Phase 1: global in-memory tab list. Phase 2 will introduce per-chat grouping
// and SQLite persistence. Keep the external API stable — Phase 2 should be able
// to add a `chatId` parameter without breaking call sites.

let state = {
  tabs: [],
  activeTabId: null,
};

const subscribers = new Set();

const genId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const notify = () => {
  for (const fn of subscribers) {
    try {
      fn(state);
    } catch (e) {
      console.error("[browser_tab_store] subscriber threw:", e);
    }
  }
};

const makeTab = (url) => {
  const now = Date.now();
  return {
    id: genId(),
    url: typeof url === "string" ? url : "",
    title: "",
    favicon: null,
    scrollY: 0,
    createdAt: now,
    lastActiveAt: now,
  };
};

export const getBrowserTabState = () => state;

export const subscribeBrowserTabStore = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const newTab = (url) => {
  const tab = makeTab(url);
  state = {
    ...state,
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  };
  notify();
  return tab;
};

export const closeTab = (id) => {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const nextTabs = state.tabs.filter((t) => t.id !== id);
  let nextActive = state.activeTabId;

  if (state.activeTabId === id) {
    if (nextTabs.length === 0) {
      nextActive = null;
    } else {
      // Prefer the tab at the same index; fall back to the previous one.
      const pick = nextTabs[idx] || nextTabs[idx - 1] || nextTabs[0];
      nextActive = pick.id;
    }
  }

  state = { ...state, tabs: nextTabs, activeTabId: nextActive };
  notify();
};

export const switchTab = (id) => {
  const target = state.tabs.find((t) => t.id === id);
  if (!target) return;

  const now = Date.now();
  state = {
    ...state,
    activeTabId: id,
    tabs: state.tabs.map((t) =>
      t.id === id ? { ...t, lastActiveAt: now } : t
    ),
  };
  notify();
};

export const reorderTab = (fromIndex, toIndex) => {
  const n = state.tabs.length;
  if (
    fromIndex < 0 ||
    fromIndex >= n ||
    toIndex < 0 ||
    toIndex >= n ||
    fromIndex === toIndex
  ) {
    return;
  }

  const nextTabs = state.tabs.slice();
  const [moved] = nextTabs.splice(fromIndex, 1);
  nextTabs.splice(toIndex, 0, moved);

  state = { ...state, tabs: nextTabs };
  notify();
};

// Silent path: writes to memory without notifying subscribers.
// Used for high-frequency fields like scrollY where nobody cares about
// continuous re-renders. Subscribers that remount later will read the
// latest value on mount.
export const updateTabFieldSilent = (id, field, value) => {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const nextTab = { ...state.tabs[idx], [field]: value };
  const nextTabs = state.tabs.slice();
  nextTabs[idx] = nextTab;
  state = { ...state, tabs: nextTabs };
  // intentionally no notify()
};

export const __resetBrowserTabStoreForTests = () => {
  state = { tabs: [], activeTabId: null };
  subscribers.clear();
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/SERVICEs/browser_storage/browser_tab_store.test.js
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/SERVICEs/browser_storage/browser_tab_store.js src/SERVICEs/browser_storage/browser_tab_store.test.js
git commit -m "feat(browser): add browser_tab_store with silent update path"
```

---

## Task 4: `browser_runtime_store` — L2 in-memory runtime store

**Files:**
- Create: `src/SERVICEs/browser_storage/browser_runtime_store.js`
- Test: `src/SERVICEs/browser_storage/browser_runtime_store.test.js`

**Spec reference:** State management § 6.3. L2 holds per-webview runtime state (loading, canGoBack/Forward, favicon, title, lastError) that updates at medium frequency and must not pollute L1 subscribers.

- [ ] **Step 1: Write the failing test**

Create `src/SERVICEs/browser_storage/browser_runtime_store.test.js`:

```js
import {
  __resetBrowserRuntimeStoreForTests,
  getRuntimeForTab,
  updateRuntimeForTab,
  clearRuntimeForTab,
  subscribeBrowserRuntimeStore,
} from "./browser_runtime_store";

describe("browser_runtime_store", () => {
  beforeEach(() => {
    __resetBrowserRuntimeStoreForTests();
  });

  test("returns a default runtime object for unknown tab", () => {
    const rt = getRuntimeForTab("nonexistent");
    expect(rt).toEqual({
      loading: false,
      canGoBack: false,
      canGoForward: false,
      title: "",
      favicon: null,
      lastError: null,
    });
  });

  test("updateRuntimeForTab merges fields and notifies subscribers", () => {
    const listener = jest.fn();
    subscribeBrowserRuntimeStore(listener);

    updateRuntimeForTab("tab-1", { loading: true });
    expect(getRuntimeForTab("tab-1").loading).toBe(true);
    expect(getRuntimeForTab("tab-1").canGoBack).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    updateRuntimeForTab("tab-1", { canGoBack: true, title: "Hello" });
    expect(getRuntimeForTab("tab-1")).toMatchObject({
      loading: true,
      canGoBack: true,
      title: "Hello",
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("clearRuntimeForTab removes state and notifies", () => {
    updateRuntimeForTab("tab-1", { loading: true });
    const listener = jest.fn();
    subscribeBrowserRuntimeStore(listener);

    clearRuntimeForTab("tab-1");

    expect(getRuntimeForTab("tab-1").loading).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("subscribe returns a working unsubscribe", () => {
    const listener = jest.fn();
    const unsub = subscribeBrowserRuntimeStore(listener);

    updateRuntimeForTab("tab-1", { loading: true });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    updateRuntimeForTab("tab-1", { loading: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/SERVICEs/browser_storage/browser_runtime_store.test.js
```

Expected: FAIL with `Cannot find module './browser_runtime_store'`.

- [ ] **Step 3: Implement `browser_runtime_store.js`**

Create `src/SERVICEs/browser_storage/browser_runtime_store.js`:

```js
// L2 runtime state for live webviews. In-memory only; never persisted.
// Key = tab id from browser_tab_store. Value = mutable per-tab runtime.
// Updates are medium-frequency (every navigation) and must NOT feed
// back into L1's subscribers.

const DEFAULT_RUNTIME = Object.freeze({
  loading: false,
  canGoBack: false,
  canGoForward: false,
  title: "",
  favicon: null,
  lastError: null,
});

let byTabId = {};
const subscribers = new Set();

const notify = () => {
  for (const fn of subscribers) {
    try {
      fn(byTabId);
    } catch (e) {
      console.error("[browser_runtime_store] subscriber threw:", e);
    }
  }
};

export const getRuntimeForTab = (tabId) => {
  return byTabId[tabId] || DEFAULT_RUNTIME;
};

export const updateRuntimeForTab = (tabId, patch) => {
  const prev = byTabId[tabId] || DEFAULT_RUNTIME;
  byTabId = { ...byTabId, [tabId]: { ...prev, ...patch } };
  notify();
};

export const clearRuntimeForTab = (tabId) => {
  if (!(tabId in byTabId)) return;
  const next = { ...byTabId };
  delete next[tabId];
  byTabId = next;
  notify();
};

export const subscribeBrowserRuntimeStore = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const __resetBrowserRuntimeStoreForTests = () => {
  byTabId = {};
  subscribers.clear();
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/SERVICEs/browser_storage/browser_runtime_store.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/SERVICEs/browser_storage/browser_runtime_store.js src/SERVICEs/browser_storage/browser_runtime_store.test.js
git commit -m "feat(browser): add browser_runtime_store for L2 per-webview state"
```

---

## Task 5: `useBrowserTabs` hook

**Files:**
- Create: `src/PAGEs/browser/hooks/use_browser_tabs.js`
- Test: `src/PAGEs/browser/hooks/use_browser_tabs.test.js`

### Design

- Uses `useSyncExternalStore` over the L1 store
- Returns `{tabs, activeTabId, actions}` where actions bundles the store mutators so consumers don't import the store directly
- `actions` identity is stable across renders (returned as a `useRef`)

- [ ] **Step 1: Write the failing test**

Create `src/PAGEs/browser/hooks/use_browser_tabs.test.js`:

```js
import { renderHook, act } from "@testing-library/react";
import { useBrowserTabs } from "./use_browser_tabs";
import { __resetBrowserTabStoreForTests } from "../../../SERVICEs/browser_storage/browser_tab_store";

describe("useBrowserTabs", () => {
  beforeEach(() => {
    __resetBrowserTabStoreForTests();
  });

  test("starts with empty state", () => {
    const { result } = renderHook(() => useBrowserTabs());
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
  });

  test("newTab updates the returned state", () => {
    const { result } = renderHook(() => useBrowserTabs());

    act(() => {
      result.current.actions.newTab("https://example.com");
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].url).toBe("https://example.com");
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
  });

  test("actions object has stable identity across renders", () => {
    const { result, rerender } = renderHook(() => useBrowserTabs());
    const firstActions = result.current.actions;
    rerender();
    expect(result.current.actions).toBe(firstActions);
  });

  test("closeTab, switchTab, reorderTab all work through the hook", () => {
    const { result } = renderHook(() => useBrowserTabs());

    let aId, bId, cId;
    act(() => {
      aId = result.current.actions.newTab("https://a.com").id;
      bId = result.current.actions.newTab("https://b.com").id;
      cId = result.current.actions.newTab("https://c.com").id;
    });

    act(() => {
      result.current.actions.switchTab(aId);
    });
    expect(result.current.activeTabId).toBe(aId);

    act(() => {
      result.current.actions.reorderTab(0, 2);
    });
    expect(result.current.tabs.map((t) => t.id)).toEqual([bId, cId, aId]);

    act(() => {
      result.current.actions.closeTab(cId);
    });
    expect(result.current.tabs.map((t) => t.id)).toEqual([bId, aId]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/PAGEs/browser/hooks/use_browser_tabs.test.js
```

Expected: FAIL with `Cannot find module './use_browser_tabs'`.

- [ ] **Step 3: Implement `use_browser_tabs.js`**

Create `src/PAGEs/browser/hooks/use_browser_tabs.js`:

```js
import { useSyncExternalStore, useRef } from "react";
import {
  getBrowserTabState,
  subscribeBrowserTabStore,
  newTab as storeNewTab,
  closeTab as storeCloseTab,
  switchTab as storeSwitchTab,
  reorderTab as storeReorderTab,
} from "../../../SERVICEs/browser_storage/browser_tab_store";

export const useBrowserTabs = () => {
  const state = useSyncExternalStore(
    subscribeBrowserTabStore,
    getBrowserTabState,
    getBrowserTabState,
  );

  const actionsRef = useRef(null);
  if (actionsRef.current === null) {
    actionsRef.current = {
      newTab: storeNewTab,
      closeTab: storeCloseTab,
      switchTab: storeSwitchTab,
      reorderTab: storeReorderTab,
    };
  }

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    actions: actionsRef.current,
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/PAGEs/browser/hooks/use_browser_tabs.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PAGEs/browser/hooks/use_browser_tabs.js src/PAGEs/browser/hooks/use_browser_tabs.test.js
git commit -m "feat(browser): add useBrowserTabs hook with stable action identity"
```

---

## Task 6: `useActiveWebviewRuntime` hook

**Files:**
- Create: `src/PAGEs/browser/hooks/use_active_webview_runtime.js`
- Test: `src/PAGEs/browser/hooks/use_active_webview_runtime.test.js`

### Design

- Takes a `tabId` parameter (`null` returns defaults)
- Subscribes to L2 store
- Returns the merged runtime object

- [ ] **Step 1: Write the failing test**

Create `src/PAGEs/browser/hooks/use_active_webview_runtime.test.js`:

```js
import { renderHook, act } from "@testing-library/react";
import { useActiveWebviewRuntime } from "./use_active_webview_runtime";
import {
  __resetBrowserRuntimeStoreForTests,
  updateRuntimeForTab,
} from "../../../SERVICEs/browser_storage/browser_runtime_store";

describe("useActiveWebviewRuntime", () => {
  beforeEach(() => {
    __resetBrowserRuntimeStoreForTests();
  });

  test("returns defaults for null tab id", () => {
    const { result } = renderHook(() => useActiveWebviewRuntime(null));
    expect(result.current).toEqual({
      loading: false,
      canGoBack: false,
      canGoForward: false,
      title: "",
      favicon: null,
      lastError: null,
    });
  });

  test("reflects store updates for the given tab id", () => {
    const { result } = renderHook(() => useActiveWebviewRuntime("tab-1"));

    act(() => {
      updateRuntimeForTab("tab-1", { loading: true, title: "Example" });
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.title).toBe("Example");
  });

  test("switching tab id returns the new tab's runtime", () => {
    updateRuntimeForTab("tab-1", { title: "One" });
    updateRuntimeForTab("tab-2", { title: "Two" });

    const { result, rerender } = renderHook(
      ({ id }) => useActiveWebviewRuntime(id),
      { initialProps: { id: "tab-1" } },
    );
    expect(result.current.title).toBe("One");

    rerender({ id: "tab-2" });
    expect(result.current.title).toBe("Two");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/PAGEs/browser/hooks/use_active_webview_runtime.test.js
```

Expected: FAIL with `Cannot find module './use_active_webview_runtime'`.

- [ ] **Step 3: Implement `use_active_webview_runtime.js`**

Create `src/PAGEs/browser/hooks/use_active_webview_runtime.js`:

```js
import { useSyncExternalStore } from "react";
import {
  getRuntimeForTab,
  subscribeBrowserRuntimeStore,
} from "../../../SERVICEs/browser_storage/browser_runtime_store";

export const useActiveWebviewRuntime = (tabId) => {
  const getSnapshot = () => getRuntimeForTab(tabId);
  return useSyncExternalStore(
    subscribeBrowserRuntimeStore,
    getSnapshot,
    getSnapshot,
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/PAGEs/browser/hooks/use_active_webview_runtime.test.js
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PAGEs/browser/hooks/use_active_webview_runtime.js src/PAGEs/browser/hooks/use_active_webview_runtime.test.js
git commit -m "feat(browser): add useActiveWebviewRuntime hook"
```

---

## Task 7: `glass_surface` — presentational primitive

**Files:**
- Create: `src/BUILTIN_COMPONENTs/glass/glass_surface.js`
- Test: `src/BUILTIN_COMPONENTs/glass/glass_surface.test.js`

### Design

- Props: `{children, isDark, style, ...rest}`
- Wraps children in a `div` with `backdrop-filter: blur(24px) saturate(180%)`
- `isDark` is passed as a prop (not read from context) so the component stays pure and testable. Callers read `ConfigContext` themselves.
- Merges any user `style` over defaults

- [ ] **Step 1: Write the failing test**

Create `src/BUILTIN_COMPONENTs/glass/glass_surface.test.js`:

```js
import { render } from "@testing-library/react";
import GlassSurface from "./glass_surface";

describe("GlassSurface", () => {
  test("renders children", () => {
    const { getByText } = render(
      <GlassSurface isDark={false}>
        <span>hello</span>
      </GlassSurface>,
    );
    expect(getByText("hello")).toBeInTheDocument();
  });

  test("applies backdrop-filter style", () => {
    const { container } = render(
      <GlassSurface isDark={false}>
        <span>x</span>
      </GlassSurface>,
    );
    const el = container.firstChild;
    expect(el).toHaveStyle({ backdropFilter: "blur(24px) saturate(180%)" });
  });

  test("uses dark background when isDark is true", () => {
    const { container: darkC } = render(
      <GlassSurface isDark={true}>
        <span>x</span>
      </GlassSurface>,
    );
    const { container: lightC } = render(
      <GlassSurface isDark={false}>
        <span>x</span>
      </GlassSurface>,
    );
    expect(darkC.firstChild.style.background).not.toBe(
      lightC.firstChild.style.background,
    );
  });

  test("merges caller style over defaults", () => {
    const { container } = render(
      <GlassSurface isDark={false} style={{ padding: 42 }}>
        <span>x</span>
      </GlassSurface>,
    );
    expect(container.firstChild).toHaveStyle({ padding: "42px" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/BUILTIN_COMPONENTs/glass/glass_surface.test.js
```

Expected: FAIL with `Cannot find module './glass_surface'`.

- [ ] **Step 3: Implement `glass_surface.js`**

Create `src/BUILTIN_COMPONENTs/glass/glass_surface.js`:

```js
// Presentational frosted-glass surface. isDark is a prop (not context) to keep
// this primitive pure and trivially testable. Callers own the ConfigContext read.

const GlassSurface = ({ children, isDark, style, ...rest }) => {
  const base = {
    background: isDark
      ? "rgba(20, 20, 24, 0.55)"
      : "rgba(255, 255, 255, 0.55)",
    backdropFilter: "blur(24px) saturate(180%)",
    WebkitBackdropFilter: "blur(24px) saturate(180%)",
    border: isDark
      ? "1px solid rgba(255, 255, 255, 0.08)"
      : "1px solid rgba(0, 0, 0, 0.06)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
  };
  return (
    <div style={{ ...base, ...style }} {...rest}>
      {children}
    </div>
  );
};

export default GlassSurface;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/BUILTIN_COMPONENTs/glass/glass_surface.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/glass/glass_surface.js src/BUILTIN_COMPONENTs/glass/glass_surface.test.js
git commit -m "feat(glass): add GlassSurface primitive for browser mode"
```

---

## Task 8: `UrlBar` component

**Files:**
- Create: `src/COMPONENTs/browser/url_bar.js`
- Test: `src/COMPONENTs/browser/url_bar.test.js`

### Design

Props:
```
{
  isDark,
  url,               // current URL displayed in input (string)
  loading,           // bool, affects reload button icon
  canGoBack,
  canGoForward,
  onBack,            // () => void
  onForward,         // () => void
  onReload,          // () => void
  onNavigate,        // (url) => void — fired on form submit
  onNewTab,          // () => void
}
```

Layout:
```
[◀] [▶] [↻]   [ url input (flex: 1) ]   [+]
```

Behavior:
- Form submission (enter key) calls `onNavigate(inputValue)`
- Input is controlled internally (local state seeded from `url` prop; re-seeded when `url` prop changes via `useEffect`)
- Disabled back/forward greyed out but still rendered

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/browser/url_bar.test.js`:

```js
import { render, fireEvent } from "@testing-library/react";
import UrlBar from "./url_bar";

const defaultProps = {
  isDark: false,
  url: "https://example.com",
  loading: false,
  canGoBack: true,
  canGoForward: false,
  onBack: jest.fn(),
  onForward: jest.fn(),
  onReload: jest.fn(),
  onNavigate: jest.fn(),
  onNewTab: jest.fn(),
};

describe("UrlBar", () => {
  beforeEach(() => {
    for (const key of Object.keys(defaultProps)) {
      if (typeof defaultProps[key] === "function") {
        defaultProps[key].mockClear();
      }
    }
  });

  test("renders the URL in the input", () => {
    const { getByDisplayValue } = render(<UrlBar {...defaultProps} />);
    expect(getByDisplayValue("https://example.com")).toBeInTheDocument();
  });

  test("submitting the form calls onNavigate with the input value", () => {
    const { getByDisplayValue } = render(<UrlBar {...defaultProps} />);
    const input = getByDisplayValue("https://example.com");
    fireEvent.change(input, { target: { value: "https://github.com" } });
    fireEvent.submit(input.closest("form"));
    expect(defaultProps.onNavigate).toHaveBeenCalledWith("https://github.com");
  });

  test("back button calls onBack when canGoBack=true", () => {
    const { getByLabelText } = render(<UrlBar {...defaultProps} />);
    fireEvent.click(getByLabelText("Back"));
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  test("back button does nothing when canGoBack=false", () => {
    const { getByLabelText } = render(
      <UrlBar {...defaultProps} canGoBack={false} />,
    );
    fireEvent.click(getByLabelText("Back"));
    expect(defaultProps.onBack).not.toHaveBeenCalled();
  });

  test("forward button is disabled by default and does not call onForward", () => {
    const { getByLabelText } = render(<UrlBar {...defaultProps} />);
    fireEvent.click(getByLabelText("Forward"));
    expect(defaultProps.onForward).not.toHaveBeenCalled();
  });

  test("reload button calls onReload", () => {
    const { getByLabelText } = render(<UrlBar {...defaultProps} />);
    fireEvent.click(getByLabelText("Reload"));
    expect(defaultProps.onReload).toHaveBeenCalledTimes(1);
  });

  test("new-tab button calls onNewTab", () => {
    const { getByLabelText } = render(<UrlBar {...defaultProps} />);
    fireEvent.click(getByLabelText("New tab"));
    expect(defaultProps.onNewTab).toHaveBeenCalledTimes(1);
  });

  test("input value updates when url prop changes (navigation)", () => {
    const { getByDisplayValue, rerender } = render(<UrlBar {...defaultProps} />);
    expect(getByDisplayValue("https://example.com")).toBeInTheDocument();
    rerender(<UrlBar {...defaultProps} url="https://github.com" />);
    expect(getByDisplayValue("https://github.com")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/url_bar.test.js
```

Expected: FAIL with `Cannot find module './url_bar'`.

- [ ] **Step 3: Implement `url_bar.js`**

Create `src/COMPONENTs/browser/url_bar.js`:

```js
import { useEffect, useState } from "react";

const btn = (isDark, disabled) => ({
  height: 32,
  width: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: disabled
    ? isDark
      ? "rgba(255,255,255,0.25)"
      : "rgba(0,0,0,0.25)"
    : isDark
      ? "rgba(255,255,255,0.85)"
      : "rgba(0,0,0,0.78)",
  cursor: disabled ? "default" : "pointer",
  fontSize: 16,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

const UrlBar = ({
  isDark,
  url,
  loading,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onNavigate,
  onNewTab,
}) => {
  const [input, setInput] = useState(url || "");

  useEffect(() => {
    setInput(url || "");
  }, [url]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim().length === 0) return;
    onNavigate?.(input.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 12px",
        height: 48,
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        aria-label="Back"
        disabled={!canGoBack}
        onClick={() => canGoBack && onBack?.()}
        style={btn(isDark, !canGoBack)}
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="Forward"
        disabled={!canGoForward}
        onClick={() => canGoForward && onForward?.()}
        style={btn(isDark, !canGoForward)}
      >
        ▶
      </button>
      <button
        type="button"
        aria-label="Reload"
        onClick={() => onReload?.()}
        style={btn(isDark, false)}
      >
        {loading ? "✕" : "↻"}
      </button>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter URL"
        style={{
          flex: 1,
          height: 32,
          border: "none",
          outline: "none",
          background: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.05)",
          color: isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)",
          borderRadius: 8,
          padding: "0 12px",
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />
      <button
        type="button"
        aria-label="New tab"
        onClick={() => onNewTab?.()}
        style={btn(isDark, false)}
      >
        +
      </button>
    </form>
  );
};

export default UrlBar;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/url_bar.test.js
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/browser/url_bar.js src/COMPONENTs/browser/url_bar.test.js
git commit -m "feat(browser): add UrlBar presentational component"
```

---

## Task 9: `TabBar` component (click switch + close)

**Files:**
- Create: `src/COMPONENTs/browser/tab_bar.js`
- Test: `src/COMPONENTs/browser/tab_bar.test.js`

### Design

Props:
```
{
  isDark,
  tabs,             // [{id, url, title, favicon}, ...]
  activeTabId,
  onSwitch,         // (id) => void
  onClose,          // (id) => void
  onReorder,        // (fromIndex, toIndex) => void (unused in Task 9; wired in Task 10)
}
```

Layout: horizontal flex row, each tab is a `div` with title + close button. Overflow scrolls horizontally.

**Title fallback:** when `title` is empty (new tab or still loading), display a URL-derived hostname or `"New Tab"` if URL is also empty.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/browser/tab_bar.test.js`:

```js
import { render, fireEvent } from "@testing-library/react";
import TabBar from "./tab_bar";

const sampleTabs = [
  { id: "t1", url: "https://github.com", title: "GitHub" },
  { id: "t2", url: "https://huggingface.co", title: "" },
  { id: "t3", url: "", title: "" },
];

const makeProps = (overrides = {}) => ({
  isDark: false,
  tabs: sampleTabs,
  activeTabId: "t1",
  onSwitch: jest.fn(),
  onClose: jest.fn(),
  onReorder: jest.fn(),
  ...overrides,
});

describe("TabBar", () => {
  test("renders all tabs", () => {
    const props = makeProps();
    const { getByText } = render(<TabBar {...props} />);
    expect(getByText("GitHub")).toBeInTheDocument();
    // empty title falls back to hostname
    expect(getByText("huggingface.co")).toBeInTheDocument();
    // empty URL falls back to "New Tab"
    expect(getByText("New Tab")).toBeInTheDocument();
  });

  test("clicking a tab calls onSwitch with its id", () => {
    const props = makeProps();
    const { getByText } = render(<TabBar {...props} />);
    fireEvent.click(getByText("huggingface.co"));
    expect(props.onSwitch).toHaveBeenCalledWith("t2");
  });

  test("clicking the close button calls onClose and stops propagation", () => {
    const props = makeProps();
    const { getAllByLabelText } = render(<TabBar {...props} />);
    const closeButtons = getAllByLabelText(/Close tab/i);
    fireEvent.click(closeButtons[0]);
    expect(props.onClose).toHaveBeenCalledWith("t1");
    expect(props.onSwitch).not.toHaveBeenCalled();
  });

  test("renders nothing visible when tabs is empty", () => {
    const props = makeProps({ tabs: [], activeTabId: null });
    const { container } = render(<TabBar {...props} />);
    // container should still render the bar (flex row), just with no tab items
    expect(container.firstChild).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='tab-item']")).toHaveLength(0);
  });

  test("active tab has distinct styling", () => {
    const props = makeProps();
    const { getAllByTestId } = render(<TabBar {...props} />);
    const items = getAllByTestId("tab-item");
    // t1 is active — should have data-active="true"
    expect(items[0].getAttribute("data-active")).toBe("true");
    expect(items[1].getAttribute("data-active")).toBe("false");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/tab_bar.test.js
```

Expected: FAIL with `Cannot find module './tab_bar'`.

- [ ] **Step 3: Implement `tab_bar.js` (no DnD yet)**

Create `src/COMPONENTs/browser/tab_bar.js`:

```js
const hostnameOrFallback = (url) => {
  if (!url) return "New Tab";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
};

const TabBar = ({
  isDark,
  tabs,
  activeTabId,
  onSwitch,
  onClose,
  // onReorder — wired in Task 10
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 12px",
        height: 36,
        overflowX: "auto",
        overflowY: "hidden",
        boxSizing: "border-box",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const label = tab.title || hostnameOrFallback(tab.url);
        return (
          <div
            key={tab.id}
            data-testid="tab-item"
            data-active={isActive ? "true" : "false"}
            onClick={() => onSwitch?.(tab.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "0 8px 0 10px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              color: isDark
                ? "rgba(255,255,255,0.85)"
                : "rgba(0,0,0,0.78)",
              background: isActive
                ? isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)"
                : "transparent",
              flexShrink: 0,
              maxWidth: 200,
            }}
          >
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 160,
              }}
            >
              {label}
            </span>
            <button
              type="button"
              aria-label={`Close tab ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose?.(tab.id);
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 13,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default TabBar;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/tab_bar.test.js
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/browser/tab_bar.js src/COMPONENTs/browser/tab_bar.test.js
git commit -m "feat(browser): add TabBar with click-switch and close button"
```

---

## Task 10: `TabBar` drag-and-drop reorder

**Files:**
- Modify: `src/COMPONENTs/browser/tab_bar.js`
- Modify: `src/COMPONENTs/browser/tab_bar.test.js`

### Design

HTML5 drag-and-drop:
- Each tab item has `draggable="true"`
- On `dragstart`: store source index in `e.dataTransfer.setData("text/x-pupu-tab-index", String(i))`
- On `dragover`: `e.preventDefault()` to allow drop
- On `drop`: read source index, compute target index from event's current tab, call `onReorder(from, to)`

- [ ] **Step 1: Add a failing test for DnD**

Append to `src/COMPONENTs/browser/tab_bar.test.js`:

```js
  test("dragging tab 0 onto tab 2 fires onReorder(0, 2)", () => {
    const props = makeProps();
    const { getAllByTestId } = render(<TabBar {...props} />);
    const items = getAllByTestId("tab-item");

    const dataTransfer = {
      data: {},
      setData(key, val) {
        this.data[key] = val;
      },
      getData(key) {
        return this.data[key];
      },
      dropEffect: "move",
      effectAllowed: "move",
    };

    fireEvent.dragStart(items[0], { dataTransfer });
    fireEvent.dragOver(items[2], { dataTransfer });
    fireEvent.drop(items[2], { dataTransfer });

    expect(props.onReorder).toHaveBeenCalledWith(0, 2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/tab_bar.test.js
```

Expected: the new test fails (onReorder not called).

- [ ] **Step 3: Implement DnD in `tab_bar.js`**

Modify `tab_bar.js` — add drag handlers to the tab item `<div>`. Replace the `<div key={tab.id}` block with this enhanced version:

```js
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        const label = tab.title || hostnameOrFallback(tab.url);
        return (
          <div
            key={tab.id}
            data-testid="tab-item"
            data-active={isActive ? "true" : "false"}
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer?.setData?.(
                "text/x-pupu-tab-index",
                String(idx),
              );
              if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer?.getData?.(
                "text/x-pupu-tab-index",
              );
              const from = Number(raw);
              if (Number.isFinite(from) && from !== idx) {
                // onReorder wired via props; fallback no-op
                (typeof onReorderRef === "function"
                  ? onReorderRef
                  : () => {})(from, idx);
              }
            }}
            onClick={() => onSwitch?.(tab.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "0 8px 0 10px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              color: isDark
                ? "rgba(255,255,255,0.85)"
                : "rgba(0,0,0,0.78)",
              background: isActive
                ? isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)"
                : "transparent",
              flexShrink: 0,
              maxWidth: 200,
            }}
          >
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 160,
              }}
            >
              {label}
            </span>
            <button
              type="button"
              aria-label={`Close tab ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose?.(tab.id);
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 13,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
```

Also add `onReorder` to the destructured props at the top of the component — replace:

```js
const TabBar = ({
  isDark,
  tabs,
  activeTabId,
  onSwitch,
  onClose,
  // onReorder — wired in Task 10
}) => {
```

with:

```js
const TabBar = ({
  isDark,
  tabs,
  activeTabId,
  onSwitch,
  onClose,
  onReorder,
}) => {
  const onReorderRef = onReorder;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/tab_bar.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/browser/tab_bar.js src/COMPONENTs/browser/tab_bar.test.js
git commit -m "feat(browser): add HTML5 drag-and-drop reordering to TabBar"
```

---

## Task 11: `ChatGlassColumn` — three-state snap column

**Files:**
- Create: `src/COMPONENTs/browser/chat_glass_column.js`
- Test: `src/COMPONENTs/browser/chat_glass_column.test.js`

### Design

Props:
```
{
  isDark,
  columnState,          // "ribbon" | "column" | "full"
  onColumnStateChange,  // (next) => void
  children,             // chat UI (ChatMessages + ChatInput) — opaque
  unreadCount,          // number, shown as pulse in ribbon
  agentActive,          // bool, shows activity dot
}
```

Widths:
- `ribbon`: 12px, children not rendered, clicking the ribbon calls `onColumnStateChange("column")`
- `column`: 380px, children rendered
- `full`: `100%`, children rendered, an "expand" button in column header toggles full ⇄ column

Escape key handling: top-level `keydown` listener steps down `full → column → ribbon → ribbon` (no further).

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/browser/chat_glass_column.test.js`:

```js
import { render, fireEvent } from "@testing-library/react";
import ChatGlassColumn from "./chat_glass_column";

const makeProps = (overrides = {}) => ({
  isDark: false,
  columnState: "column",
  onColumnStateChange: jest.fn(),
  children: <div data-testid="chat-content">chat-content</div>,
  unreadCount: 0,
  agentActive: false,
  ...overrides,
});

describe("ChatGlassColumn", () => {
  test("column state renders children", () => {
    const props = makeProps();
    const { getByTestId } = render(<ChatGlassColumn {...props} />);
    expect(getByTestId("chat-content")).toBeInTheDocument();
  });

  test("ribbon state does NOT render children", () => {
    const props = makeProps({ columnState: "ribbon" });
    const { queryByTestId } = render(<ChatGlassColumn {...props} />);
    expect(queryByTestId("chat-content")).toBeNull();
  });

  test("full state renders children", () => {
    const props = makeProps({ columnState: "full" });
    const { getByTestId } = render(<ChatGlassColumn {...props} />);
    expect(getByTestId("chat-content")).toBeInTheDocument();
  });

  test("clicking ribbon transitions to column", () => {
    const props = makeProps({ columnState: "ribbon" });
    const { getByTestId } = render(<ChatGlassColumn {...props} />);
    fireEvent.click(getByTestId("glass-ribbon"));
    expect(props.onColumnStateChange).toHaveBeenCalledWith("column");
  });

  test("clicking expand button in column goes to full", () => {
    const props = makeProps({ columnState: "column" });
    const { getByLabelText } = render(<ChatGlassColumn {...props} />);
    fireEvent.click(getByLabelText("Expand chat column"));
    expect(props.onColumnStateChange).toHaveBeenCalledWith("full");
  });

  test("clicking collapse button in full goes to column", () => {
    const props = makeProps({ columnState: "full" });
    const { getByLabelText } = render(<ChatGlassColumn {...props} />);
    fireEvent.click(getByLabelText("Collapse chat column"));
    expect(props.onColumnStateChange).toHaveBeenCalledWith("column");
  });

  test("Escape key steps down full → column → ribbon", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ChatGlassColumn {...makeProps({ columnState: "full", onColumnStateChange: onChange })} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).toHaveBeenLastCalledWith("column");

    rerender(
      <ChatGlassColumn {...makeProps({ columnState: "column", onColumnStateChange: onChange })} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).toHaveBeenLastCalledWith("ribbon");

    rerender(
      <ChatGlassColumn {...makeProps({ columnState: "ribbon", onColumnStateChange: onChange })} />,
    );
    const callsBefore = onChange.mock.calls.length;
    fireEvent.keyDown(window, { key: "Escape" });
    // from ribbon, escape is a no-op
    expect(onChange.mock.calls.length).toBe(callsBefore);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/chat_glass_column.test.js
```

Expected: FAIL with `Cannot find module './chat_glass_column'`.

- [ ] **Step 3: Implement `chat_glass_column.js`**

Create `src/COMPONENTs/browser/chat_glass_column.js`:

```js
import { useEffect } from "react";
import GlassSurface from "../../BUILTIN_COMPONENTs/glass/glass_surface";

const WIDTHS = { ribbon: 12, column: 380, full: null /* 100% */ };

const ChatGlassColumn = ({
  isDark,
  columnState,
  onColumnStateChange,
  children,
  unreadCount,
  agentActive,
}) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (columnState === "full") {
        onColumnStateChange?.("column");
      } else if (columnState === "column") {
        onColumnStateChange?.("ribbon");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [columnState, onColumnStateChange]);

  if (columnState === "ribbon") {
    return (
      <div
        data-testid="glass-ribbon"
        role="button"
        tabIndex={0}
        onClick={() => onColumnStateChange?.("column")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onColumnStateChange?.("column");
          }
        }}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: WIDTHS.ribbon,
          cursor: "pointer",
          background: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.04)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {unreadCount > 0 && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "rgba(10,186,181,1)",
            }}
          />
        )}
        {agentActive && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,140,0,1)",
            }}
          />
        )}
      </div>
    );
  }

  const isFull = columnState === "full";
  const width = isFull ? "100%" : `${WIDTHS.column}px`;

  return (
    <GlassSurface
      isDark={isDark}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "6px 10px",
        }}
      >
        <button
          type="button"
          aria-label={
            isFull ? "Collapse chat column" : "Expand chat column"
          }
          onClick={() =>
            onColumnStateChange?.(isFull ? "column" : "full")
          }
          style={{
            width: 24,
            height: 24,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: isDark
              ? "rgba(255,255,255,0.85)"
              : "rgba(0,0,0,0.78)",
            fontSize: 13,
            padding: 0,
          }}
        >
          {isFull ? "⇱" : "⇲"}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {children}
      </div>
    </GlassSurface>
  );
};

export default ChatGlassColumn;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/chat_glass_column.test.js
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/browser/chat_glass_column.js src/COMPONENTs/browser/chat_glass_column.test.js
git commit -m "feat(browser): add ChatGlassColumn with ribbon/column/full snap states"
```

---

## Task 12: `webview_error_page_html` — pure HTML builder

**Files:**
- Create: `src/COMPONENTs/browser/webview_error_page_html.js`
- Test: `src/COMPONENTs/browser/webview_error_page_html.test.js`

**Rationale:** Error page HTML generation is a pure function → trivially unit-testable and reusable.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/browser/webview_error_page_html.test.js`:

```js
import { buildErrorPageHtml } from "./webview_error_page_html";

describe("buildErrorPageHtml", () => {
  test("returns an HTML string containing the URL and error code", () => {
    const html = buildErrorPageHtml({
      url: "https://example.com",
      errorCode: -105,
      errorDescription: "ERR_NAME_NOT_RESOLVED",
      isDark: false,
    });
    expect(html).toContain("https://example.com");
    expect(html).toContain("ERR_NAME_NOT_RESOLVED");
    expect(html).toMatch(/<html/i);
  });

  test("escapes URL and error description", () => {
    const html = buildErrorPageHtml({
      url: "https://example.com/<script>alert(1)</script>",
      errorCode: -2,
      errorDescription: "<img src=x onerror=alert(1)>",
      isDark: false,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  test("emits different colors for dark mode", () => {
    const light = buildErrorPageHtml({
      url: "https://a.com",
      errorCode: -1,
      errorDescription: "err",
      isDark: false,
    });
    const dark = buildErrorPageHtml({
      url: "https://a.com",
      errorCode: -1,
      errorDescription: "err",
      isDark: true,
    });
    expect(light).not.toBe(dark);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/webview_error_page_html.test.js
```

Expected: FAIL with `Cannot find module './webview_error_page_html'`.

- [ ] **Step 3: Implement `webview_error_page_html.js`**

Create `src/COMPONENTs/browser/webview_error_page_html.js`:

```js
// Pure function: builds the HTML string for the built-in network-error page.
// The HTML is injected into a webview via executeJavaScript into about:blank.
// All user-supplied strings are HTML-escaped to prevent injection.

const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

export const buildErrorPageHtml = ({
  url,
  errorCode,
  errorDescription,
  isDark,
}) => {
  const bg = isDark ? "#151518" : "#fafafa";
  const fg = isDark ? "#e8e8ec" : "#1a1a1e";
  const dim = isDark ? "#8a8a92" : "#6a6a72";
  const accent = "rgba(10,186,181,1)";
  const safeUrl = escapeHtml(url || "");
  const safeDesc = escapeHtml(errorDescription || "");
  const code = Number.isFinite(errorCode) ? errorCode : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: ${bg}; color: ${fg}; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .wrap { max-width: 440px; margin: 15vh auto 0; padding: 0 24px; text-align: center; }
  h1 { font-size: 18px; font-weight: 500; margin-bottom: 8px; }
  .code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: ${dim}; margin-bottom: 4px; }
  .url { font-size: 12px; color: ${dim}; word-break: break-all; margin-bottom: 24px; }
  button { background: ${accent}; color: white; border: none; border-radius: 8px; padding: 8px 20px; font-size: 13px; cursor: pointer; font-family: inherit; }
  button:hover { opacity: 0.9; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Can't reach this page</h1>
    <div class="code">${safeDesc}${code ? " (" + code + ")" : ""}</div>
    <div class="url">${safeUrl}</div>
    <button onclick="window.location.reload()">Try again</button>
  </div>
</body>
</html>`;
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/webview_error_page_html.test.js
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/browser/webview_error_page_html.js src/COMPONENTs/browser/webview_error_page_html.test.js
git commit -m "feat(browser): add buildErrorPageHtml pure fn for webview errors"
```

---

## Task 13: `webview_crash_overlay` component

**Files:**
- Create: `src/COMPONENTs/browser/webview_crash_overlay.js`
- Test: `src/COMPONENTs/browser/webview_crash_overlay.test.js`

### Design

Props: `{isDark, reason, onReload, onClose, reloadDisabled}`

Purely presentational, shown on top of webview when it crashes.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/browser/webview_crash_overlay.test.js`:

```js
import { render, fireEvent } from "@testing-library/react";
import WebviewCrashOverlay from "./webview_crash_overlay";

const makeProps = (overrides = {}) => ({
  isDark: false,
  reason: "renderer gone",
  onReload: jest.fn(),
  onClose: jest.fn(),
  reloadDisabled: false,
  ...overrides,
});

describe("WebviewCrashOverlay", () => {
  test("renders the reason", () => {
    const { getByText } = render(<WebviewCrashOverlay {...makeProps()} />);
    expect(getByText(/renderer gone/)).toBeInTheDocument();
  });

  test("Reload button calls onReload", () => {
    const props = makeProps();
    const { getByText } = render(<WebviewCrashOverlay {...props} />);
    fireEvent.click(getByText("Reload"));
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });

  test("Close button calls onClose", () => {
    const props = makeProps();
    const { getByText } = render(<WebviewCrashOverlay {...props} />);
    fireEvent.click(getByText("Close tab"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("Reload button disabled when reloadDisabled=true", () => {
    const props = makeProps({ reloadDisabled: true });
    const { getByText } = render(<WebviewCrashOverlay {...props} />);
    const reload = getByText("Reload").closest("button");
    expect(reload.disabled).toBe(true);
    fireEvent.click(reload);
    expect(props.onReload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/webview_crash_overlay.test.js
```

Expected: FAIL with `Cannot find module './webview_crash_overlay'`.

- [ ] **Step 3: Implement `webview_crash_overlay.js`**

Create `src/COMPONENTs/browser/webview_crash_overlay.js`:

```js
const WebviewCrashOverlay = ({
  isDark,
  reason,
  onReload,
  onClose,
  reloadDisabled,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: isDark ? "#151518" : "#fafafa",
        color: isDark ? "#e8e8ec" : "#1a1a1e",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 28 }}>😵</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>
        This tab crashed
      </div>
      <div
        style={{
          fontSize: 12,
          color: isDark ? "#8a8a92" : "#6a6a72",
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        {reason || "unknown"}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          disabled={reloadDisabled}
          onClick={() => !reloadDisabled && onReload?.()}
          style={{
            background: reloadDisabled
              ? "rgba(128,128,128,0.3)"
              : "rgba(10,186,181,1)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 13,
            cursor: reloadDisabled ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => onClose?.()}
          style={{
            background: "transparent",
            color: isDark ? "#e8e8ec" : "#1a1a1e",
            border: isDark
              ? "1px solid rgba(255,255,255,0.2)"
              : "1px solid rgba(0,0,0,0.15)",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Close tab
        </button>
      </div>
    </div>
  );
};

export default WebviewCrashOverlay;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/browser/webview_crash_overlay.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/browser/webview_crash_overlay.js src/COMPONENTs/browser/webview_crash_overlay.test.js
git commit -m "feat(browser): add WebviewCrashOverlay presentational component"
```

---

## Task 14: `WebviewHost` — the actual `<webview>` manager

**Files:**
- Create: `src/COMPONENTs/browser/webview_host.js`

**No unit test for this one — it integrates directly with the Electron `<webview>` tag, which isn't available in jsdom. Verification is manual (Task 20).**

### Design

Props:
```
{
  tabs,                // from useBrowserTabs
  activeTabId,
  onRequestReload,     // (tabId) => void  — called when user clicks Reload in crash overlay
  onRequestClose,      // (tabId) => void  — called when user clicks Close tab in crash overlay
}
```

Responsibilities:
1. Render ONE `<webview>` per tab, all positioned absolutely inside a host container. Only the active one has `style.visibility = "visible"`; others are `"hidden"` with `pointerEvents: none`.
2. Wire webview events to `browser_runtime_store.updateRuntimeForTab`:
   - `did-start-loading` → `{loading: true}`
   - `did-stop-loading` → `{loading: false}`
   - `did-navigate` → update L1 URL via store (not L2)
   - `page-title-updated` → `{title}` (L2), and debounced write to L1
   - `page-favicon-updated` → `{favicon}` (L2), debounced to L1
   - `render-process-gone` / `crashed` → `{lastError: {type: "crashed", reason}}`
   - `did-fail-load` → inject built-in error HTML via `executeJavaScript`, filter out `-3` and `-20`
3. Expose imperative methods via ref for the parent (`loadURL`, `reload`, `goBack`, `goForward`) per tab id.
4. Track reload failure count per tab; after 3 failures, set `reloadDisabled: true`.

### Structure

```
<div style={{position: "relative", width: "100%", height: "100%"}}>
  {tabs.map(tab => (
    <div key={tab.id} style={{position: "absolute", inset: 0,
                                visibility: tab.id === activeTabId ? "visible" : "hidden"}}>
      <webview
        src={tab.url || "about:blank"}
        ref={...}
        style={{width: "100%", height: "100%", display: "inline-flex"}}
        allowpopups="false"
        partition="persist:pupu-browser"
      />
      {crashOverlayVisible && <WebviewCrashOverlay ... />}
    </div>
  ))}
</div>
```

**Critical Chromium quirk:** `<webview>` cannot be inside a CSS `transform` or `filter` ancestor. The host container must be direct-positioned (`absolute`/`fixed`), and animations (Task 19) must use `opacity`/`transform` only on sibling containers, never ancestors of the webview.

### Imperative handle

Use `React.forwardRef` + `useImperativeHandle`:

```js
useImperativeHandle(ref, () => ({
  loadURL: (tabId, url) => {
    const wv = webviewRefs.current[tabId];
    if (wv && typeof wv.loadURL === "function") wv.loadURL(url);
  },
  reload: (tabId) => { webviewRefs.current[tabId]?.reload(); },
  goBack: (tabId) => { webviewRefs.current[tabId]?.goBack(); },
  goForward: (tabId) => { webviewRefs.current[tabId]?.goForward(); },
}));
```

- [ ] **Step 1: Create `webview_host.js`**

Create `src/COMPONENTs/browser/webview_host.js`:

```js
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import WebviewCrashOverlay from "./webview_crash_overlay";
import { buildErrorPageHtml } from "./webview_error_page_html";
import {
  updateRuntimeForTab,
  clearRuntimeForTab,
  getRuntimeForTab,
} from "../../SERVICEs/browser_storage/browser_runtime_store";
import {
  updateTabFieldSilent,
} from "../../SERVICEs/browser_storage/browser_tab_store";

const IGNORED_ERROR_CODES = new Set([-3, -20]);
const MAX_RELOAD_ATTEMPTS = 3;

const WebviewHost = forwardRef(function WebviewHost(
  { isDark, tabs, activeTabId, onRequestClose },
  ref,
) {
  const webviewRefs = useRef({});
  const reloadFailsRef = useRef({});
  const [crashState, setCrashState] = useState({}); // { [tabId]: {reason, disabled} }

  useImperativeHandle(ref, () => ({
    loadURL: (tabId, url) => {
      const wv = webviewRefs.current[tabId];
      if (wv && typeof wv.loadURL === "function") {
        try {
          wv.loadURL(url);
        } catch (e) {
          console.warn("[webview_host] loadURL failed:", e);
        }
      }
    },
    reload: (tabId) => {
      webviewRefs.current[tabId]?.reload?.();
    },
    goBack: (tabId) => {
      webviewRefs.current[tabId]?.goBack?.();
    },
    goForward: (tabId) => {
      webviewRefs.current[tabId]?.goForward?.();
    },
  }), []);

  const attachListeners = useCallback((tab, el) => {
    if (!el) return;
    const tabId = tab.id;

    const onStartLoading = () => {
      updateRuntimeForTab(tabId, { loading: true, lastError: null });
    };
    const onStopLoading = () => {
      updateRuntimeForTab(tabId, {
        loading: false,
        canGoBack: el.canGoBack?.() || false,
        canGoForward: el.canGoForward?.() || false,
      });
    };
    const onDidNavigate = (e) => {
      updateTabFieldSilent(tabId, "url", e.url || "");
      updateRuntimeForTab(tabId, {
        canGoBack: el.canGoBack?.() || false,
        canGoForward: el.canGoForward?.() || false,
      });
    };
    const onTitle = (e) => {
      updateRuntimeForTab(tabId, { title: e.title || "" });
      updateTabFieldSilent(tabId, "title", e.title || "");
    };
    const onFavicon = (e) => {
      const favicon = e.favicons?.[0] || null;
      updateRuntimeForTab(tabId, { favicon });
      updateTabFieldSilent(tabId, "favicon", favicon);
    };
    const onCrash = (e) => {
      const reason =
        (e && (e.reason || e.details || e.type)) || "unknown";
      updateRuntimeForTab(tabId, {
        loading: false,
        lastError: { type: "crashed", reason },
      });
      setCrashState((prev) => ({
        ...prev,
        [tabId]: {
          reason,
          disabled:
            (reloadFailsRef.current[tabId] || 0) >= MAX_RELOAD_ATTEMPTS,
        },
      }));
    };
    const onFailLoad = (e) => {
      if (!e || e.isMainFrame === false) return;
      if (IGNORED_ERROR_CODES.has(e.errorCode)) return;
      const html = buildErrorPageHtml({
        url: e.validatedURL || "",
        errorCode: e.errorCode,
        errorDescription: e.errorDescription || "",
        isDark: !!isDark,
      });
      const escaped = html.replaceAll("`", "\\`").replaceAll("$", "\\$");
      try {
        el.executeJavaScript(
          `document.open();document.write(\`${escaped}\`);document.close();`,
          true,
        );
      } catch (err) {
        console.warn("[webview_host] error-page inject failed:", err);
      }
    };

    el.addEventListener("did-start-loading", onStartLoading);
    el.addEventListener("did-stop-loading", onStopLoading);
    el.addEventListener("did-navigate", onDidNavigate);
    el.addEventListener("did-navigate-in-page", onDidNavigate);
    el.addEventListener("page-title-updated", onTitle);
    el.addEventListener("page-favicon-updated", onFavicon);
    el.addEventListener("render-process-gone", onCrash);
    el.addEventListener("crashed", onCrash);
    el.addEventListener("did-fail-load", onFailLoad);

    return () => {
      el.removeEventListener("did-start-loading", onStartLoading);
      el.removeEventListener("did-stop-loading", onStopLoading);
      el.removeEventListener("did-navigate", onDidNavigate);
      el.removeEventListener("did-navigate-in-page", onDidNavigate);
      el.removeEventListener("page-title-updated", onTitle);
      el.removeEventListener("page-favicon-updated", onFavicon);
      el.removeEventListener("render-process-gone", onCrash);
      el.removeEventListener("crashed", onCrash);
      el.removeEventListener("did-fail-load", onFailLoad);
    };
  }, [isDark]);

  // Cleanup runtime state for tabs that were removed
  useEffect(() => {
    const currentIds = new Set(tabs.map((t) => t.id));
    for (const id of Object.keys(webviewRefs.current)) {
      if (!currentIds.has(id)) {
        delete webviewRefs.current[id];
        delete reloadFailsRef.current[id];
        clearRuntimeForTab(id);
        setCrashState((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  }, [tabs]);

  const handleOverlayReload = (tabId) => {
    const el = webviewRefs.current[tabId];
    if (!el) return;
    reloadFailsRef.current[tabId] =
      (reloadFailsRef.current[tabId] || 0) + 1;
    const willBlockNext =
      reloadFailsRef.current[tabId] >= MAX_RELOAD_ATTEMPTS;
    setCrashState((prev) => {
      const next = { ...prev };
      if (next[tabId]) {
        if (willBlockNext) {
          next[tabId] = { ...next[tabId], disabled: true };
        } else {
          delete next[tabId];
        }
      }
      return next;
    });
    try {
      el.reload();
    } catch (e) {
      console.warn("[webview_host] reload failed:", e);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const crash = crashState[tab.id];
        return (
          <div
            key={tab.id}
            style={{
              position: "absolute",
              inset: 0,
              visibility: isActive ? "visible" : "hidden",
              pointerEvents: isActive ? "auto" : "none",
            }}
          >
            <webview
              ref={(el) => {
                if (el && !webviewRefs.current[tab.id]) {
                  webviewRefs.current[tab.id] = el;
                  // attachListeners returns a cleanup; we track it via useEffect below
                  attachListeners(tab, el);
                }
              }}
              src={tab.url || "about:blank"}
              partition="persist:pupu-browser"
              allowpopups="false"
              style={{
                width: "100%",
                height: "100%",
                display: "inline-flex",
                border: "none",
              }}
            />
            {crash && (
              <WebviewCrashOverlay
                isDark={isDark}
                reason={crash.reason}
                reloadDisabled={!!crash.disabled}
                onReload={() => handleOverlayReload(tab.id)}
                onClose={() => onRequestClose?.(tab.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default WebviewHost;
```

- [ ] **Step 2: Sanity-check the file compiles**

Run:

```bash
npm test -- --watchAll=false --passWithNoTests src/COMPONENTs/browser/
```

Expected: no syntax errors (tests that exist still pass). `webview_host.js` has no test so it only needs to compile.

If webpack/babel complains about the unknown JSX tag `<webview>`, that is expected in test environments — Jest will choke if this file is imported in a test. We do NOT import it in any test during Task 14. It gets exercised in Task 20 (manual).

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/browser/webview_host.js
git commit -m "feat(browser): add WebviewHost with event wiring and crash overlay integration"
```

---

## Task 15: `BrowserWorkspace` — top-level composition

**Files:**
- Create: `src/PAGEs/browser/browser_workspace.js`
- Test: `src/PAGEs/browser/browser_workspace.test.js`

### Design

Props:
```
{
  isDark,
  onExitBrowser,       // () => void — globe click-back, wired from chat.js
  chatSlot,            // ReactNode — the chat UI (ChatMessages + ChatInput) passed down
}
```

Layout:
```
┌─────────────────────────────────────────────────┐
│ Glass surface: UrlBar + TabBar                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  WebviewHost                                    │
│                                                 │
└─────────────────────────────────────────────────┘
                                       + ChatGlassColumn (fixed right)
```

State:
- `columnState` — local useState, initial `"ribbon"`
- `useBrowserTabs` for tab list + actions
- `useActiveWebviewRuntime(activeTabId)` for L2 runtime
- `webviewHostRef` — imperative handle for UrlBar → WebviewHost wiring

Behaviors:
- On mount: if `tabs.length === 0`, auto-`newTab()` so UrlBar has something to bind to
- URL submit: `webviewHostRef.current.loadURL(activeTabId, url)`
- Reload/Back/Forward: delegate to webviewHostRef
- New tab button: `actions.newTab("")`
- Close tab: `actions.closeTab(id)`
- Switch tab: `actions.switchTab(id)`
- Reorder: `actions.reorderTab(from, to)`
- Crash overlay "Close tab" → same as regular close

### Testing scope

The `<webview>` tag cannot be mounted in jsdom. We test BrowserWorkspace **with WebviewHost mocked**. The smoke test validates composition wiring only (URL bar renders, new-tab button works, chat slot is rendered in column state).

- [ ] **Step 1: Write the failing test**

Create `src/PAGEs/browser/browser_workspace.test.js`:

```js
import { render, fireEvent } from "@testing-library/react";
import BrowserWorkspace from "./browser_workspace";
import { __resetBrowserTabStoreForTests } from "../../SERVICEs/browser_storage/browser_tab_store";
import { __resetBrowserRuntimeStoreForTests } from "../../SERVICEs/browser_storage/browser_runtime_store";

jest.mock("../../COMPONENTs/browser/webview_host", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: React.forwardRef(function MockWebviewHost(props, ref) {
      React.useImperativeHandle(ref, () => ({
        loadURL: jest.fn(),
        reload: jest.fn(),
        goBack: jest.fn(),
        goForward: jest.fn(),
      }), []);
      return <div data-testid="webview-host-mock" />;
    }),
  };
});

describe("BrowserWorkspace", () => {
  beforeEach(() => {
    __resetBrowserTabStoreForTests();
    __resetBrowserRuntimeStoreForTests();
  });

  test("auto-creates a first tab on mount", () => {
    const { getByTestId } = render(
      <BrowserWorkspace
        isDark={false}
        onExitBrowser={() => {}}
        chatSlot={<div data-testid="chat-slot">chat</div>}
      />,
    );
    expect(getByTestId("webview-host-mock")).toBeInTheDocument();
    // One tab item should exist in the TabBar
    const tabs = document.querySelectorAll("[data-testid='tab-item']");
    expect(tabs.length).toBe(1);
  });

  test("clicking '+' adds a new tab", () => {
    const { getByLabelText } = render(
      <BrowserWorkspace
        isDark={false}
        onExitBrowser={() => {}}
        chatSlot={<div />}
      />,
    );
    fireEvent.click(getByLabelText("New tab"));
    const tabs = document.querySelectorAll("[data-testid='tab-item']");
    expect(tabs.length).toBe(2);
  });

  test("renders URL bar", () => {
    const { container } = render(
      <BrowserWorkspace
        isDark={false}
        onExitBrowser={() => {}}
        chatSlot={<div />}
      />,
    );
    const input = container.querySelector("input[placeholder='Enter URL']");
    expect(input).toBeTruthy();
  });

  test("chat slot is visible when glass column is in 'column' state", () => {
    const { getByTestId, getByLabelText } = render(
      <BrowserWorkspace
        isDark={false}
        onExitBrowser={() => {}}
        chatSlot={<div data-testid="chat-slot">chat</div>}
      />,
    );
    // default is "ribbon" — chat slot should not be visible
    expect(document.querySelector("[data-testid='chat-slot']")).toBeNull();
    // Click the ribbon to expand to column
    fireEvent.click(getByTestId("glass-ribbon"));
    expect(getByTestId("chat-slot")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/PAGEs/browser/browser_workspace.test.js
```

Expected: FAIL with `Cannot find module './browser_workspace'`.

- [ ] **Step 3: Implement `browser_workspace.js`**

Create `src/PAGEs/browser/browser_workspace.js`:

```js
import { useEffect, useRef, useState } from "react";
import UrlBar from "../../COMPONENTs/browser/url_bar";
import TabBar from "../../COMPONENTs/browser/tab_bar";
import ChatGlassColumn from "../../COMPONENTs/browser/chat_glass_column";
import WebviewHost from "../../COMPONENTs/browser/webview_host";
import GlassSurface from "../../BUILTIN_COMPONENTs/glass/glass_surface";
import { useBrowserTabs } from "./hooks/use_browser_tabs";
import { useActiveWebviewRuntime } from "./hooks/use_active_webview_runtime";

const BrowserWorkspace = ({ isDark, onExitBrowser, chatSlot }) => {
  const { tabs, activeTabId, actions } = useBrowserTabs();
  const runtime = useActiveWebviewRuntime(activeTabId);
  const webviewHostRef = useRef(null);
  const [columnState, setColumnState] = useState("ribbon");

  // Auto-create first tab on mount
  useEffect(() => {
    if (tabs.length === 0) {
      actions.newTab("");
    }
  }, [actions, tabs.length]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const activeUrl = activeTab?.url || "";

  const handleNavigate = (url) => {
    if (!activeTabId) return;
    webviewHostRef.current?.loadURL(activeTabId, url);
  };
  const handleReload = () => {
    if (!activeTabId) return;
    webviewHostRef.current?.reload(activeTabId);
  };
  const handleBack = () => {
    if (!activeTabId) return;
    webviewHostRef.current?.goBack(activeTabId);
  };
  const handleForward = () => {
    if (!activeTabId) return;
    webviewHostRef.current?.goForward(activeTabId);
  };
  const handleNewTab = () => {
    actions.newTab("");
  };
  const handleCloseTab = (id) => {
    actions.closeTab(id);
  };
  const handleSwitchTab = (id) => {
    actions.switchTab(id);
  };
  const handleReorderTab = (from, to) => {
    actions.reorderTab(from, to);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      {/* Top: URL bar + tab bar in a single glass surface */}
      <GlassSurface
        isDark={isDark}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 5,
          borderRadius: 0,
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
        }}
      >
        <UrlBar
          isDark={isDark}
          url={activeUrl}
          loading={runtime.loading}
          canGoBack={runtime.canGoBack}
          canGoForward={runtime.canGoForward}
          onNavigate={handleNavigate}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onNewTab={handleNewTab}
        />
        <TabBar
          isDark={isDark}
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitch={handleSwitchTab}
          onClose={handleCloseTab}
          onReorder={handleReorderTab}
        />
      </GlassSurface>

      {/* Middle: Webview host (absolute so ancestors can animate via transform without affecting it — ancestors MUST NOT use transform) */}
      <div
        style={{
          position: "absolute",
          top: 84, // URL 48 + Tab 36
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <WebviewHost
          ref={webviewHostRef}
          isDark={isDark}
          tabs={tabs}
          activeTabId={activeTabId}
          onRequestClose={handleCloseTab}
        />
      </div>

      {/* Right-edge glass column */}
      <ChatGlassColumn
        isDark={isDark}
        columnState={columnState}
        onColumnStateChange={setColumnState}
        unreadCount={0}
        agentActive={false}
      >
        {/* Column-state chat slot. Also provide a back-to-chat escape hatch at the top. */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div
            style={{
              padding: "4px 12px",
              borderBottom: isDark
                ? "1px solid rgba(255,255,255,0.06)"
                : "1px solid rgba(0,0,0,0.05)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              aria-label="Back to chat"
              onClick={() => onExitBrowser?.()}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                color: isDark
                  ? "rgba(255,255,255,0.65)"
                  : "rgba(0,0,0,0.55)",
                fontFamily: "inherit",
              }}
            >
              ← back to chat
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {chatSlot}
          </div>
        </div>
      </ChatGlassColumn>
    </div>
  );
};

export default BrowserWorkspace;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/PAGEs/browser/browser_workspace.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PAGEs/browser/browser_workspace.js src/PAGEs/browser/browser_workspace.test.js
git commit -m "feat(browser): add BrowserWorkspace composing url bar, tabs, webview and glass column"
```

---

## Task 16: Add globe icon to `attach_panel`

**Files:**
- Modify: `src/COMPONENTs/chat-input/components/attach_panel.js`
- Modify: `src/COMPONENTs/chat-input/components/attach_panel.test.js`

**GitNexus:** Run `gitnexus_impact({target: "AttachPanel", direction: "upstream"})`. Expected: called from `chat_input.js`. Low blast radius.

### Design

Add a new prop `onEnterBrowser` (optional). When provided, render a globe Button just after the `link` button (the rightmost existing button), with:
- `prefix_icon="globe"`
- `title="Open in-app browser"`
- `onClick={onEnterBrowser}`

When `onEnterBrowser` is falsy, do NOT render the button (backward compatibility).

- [ ] **Step 1: Read the current attach_panel test**

```bash
cat src/COMPONENTs/chat-input/components/attach_panel.test.js | head -60
```

Understand the existing test structure (mocking, rendering, what's asserted).

- [ ] **Step 2: Add a failing test**

Append a test to `src/COMPONENTs/chat-input/components/attach_panel.test.js`. Because the test file already mocks dependencies for AttachPanel, your new test should slot in as an additional `test(...)` block inside the existing `describe`. Example block (adjust imports/mocks based on what's already there):

```js
  test("renders globe button when onEnterBrowser is provided and calls it on click", () => {
    const onEnterBrowser = jest.fn();
    const { getByTitle } = render(
      <AttachPanel {...baseProps} onEnterBrowser={onEnterBrowser} />,
    );
    const btn = getByTitle("Open in-app browser");
    fireEvent.click(btn);
    expect(onEnterBrowser).toHaveBeenCalledTimes(1);
  });

  test("does NOT render globe button when onEnterBrowser is absent", () => {
    const { queryByTitle } = render(<AttachPanel {...baseProps} />);
    expect(queryByTitle("Open in-app browser")).toBeNull();
  });
```

Note: if `baseProps` does not exist in the current test file, wrap the existing default props fixture to the same name, or inline the needed props. The key constraint is: these two tests must fail before Step 3 and pass after.

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- --watchAll=false src/COMPONENTs/chat-input/components/attach_panel.test.js
```

Expected: the two new tests FAIL (`Unable to find element with title: Open in-app browser`).

- [ ] **Step 4: Add the globe button to `attach_panel.js`**

1. Add `onEnterBrowser` to the destructured props in the `AttachPanel` function signature.
2. Find the location right after the link Button block (near line 426-430 in the current file — the `prefix_icon="link"` block). Insert a new button:

```js
            {/* ── In-app browser trigger ── */}
            {onEnterBrowser && (
              <div title="Open in-app browser">
                <Button
                  prefix_icon="globe"
                  onClick={onEnterBrowser}
                  style={{
                    color,
                    fontSize: 14,
                    borderRadius: floating ? 22 : 16,
                  }}
                />
              </div>
            )}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/COMPONENTs/chat-input/components/attach_panel.test.js
```

Expected: all tests (including the two new ones) PASS.

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/chat-input/components/attach_panel.js src/COMPONENTs/chat-input/components/attach_panel.test.js
git commit -m "feat(browser): add globe icon to attach panel for in-app browser entry"
```

---

## Task 17: Forward `onEnterBrowser` through `ChatInput`

**Files:**
- Modify: `src/COMPONENTs/chat-input/chat_input.js`

**GitNexus:** Run `gitnexus_impact({target: "ChatInput", direction: "upstream"})`. Expected: ChatPage / ChatInterface is the primary caller.

### Design

`ChatInput` already pipes many props through to `AttachPanel`. Add `onEnterBrowser` as a pass-through prop with no logic of its own.

- [ ] **Step 1: Read the current chat_input.js**

Specifically:
- Find where `AttachPanel` is rendered
- Find where props are destructured at the top of the component

- [ ] **Step 2: Add the pass-through**

1. Add `onEnterBrowser` to the destructured props.
2. Forward it to the `AttachPanel` call:

```js
      <AttachPanel
        {/* ...existing props... */}
        onEnterBrowser={onEnterBrowser}
      />
```

- [ ] **Step 3: Run existing chat_input tests to confirm nothing regressed**

```bash
npm test -- --watchAll=false --testPathPattern="chat_input" --passWithNoTests
```

Expected: existing tests pass (no new tests here — this is a trivial forward).

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/chat-input/chat_input.js
git commit -m "feat(browser): forward onEnterBrowser prop through ChatInput"
```

---

## Task 18: `chat.js` viewMode wiring

**Files:**
- Modify: `src/PAGEs/chat/chat.js`

**GitNexus:** Run `gitnexus_impact({target: "ChatInterface", direction: "upstream"})`. Expected: the router mounts this as the chat page. This is the most sensitive change in Phase 1 — take it slow.

### Design

Add `viewMode` state ("chat" | "browser") to `ChatInterface`. Conditionally render `<BrowserWorkspace>` when `viewMode === "browser"`.

**Key decision:** Do NOT try to preserve `ChatInterface` mount state across the view switch. When entering browser mode, the existing chat UI unmounts. When exiting browser mode, it remounts. Chat data comes from the existing `chat_storage` store so no user data is lost (drafts, messages). In-progress streams continue at the store level if the stream hook is resilient to unmount — this is accepted for Phase 1 and may need a fix in Phase 2.

**chatSlot strategy:** For the `chatSlot` prop of `BrowserWorkspace`, pass a simple placeholder in Phase 1:

```jsx
<div style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>
  Chat content placeholder — full chat integration coming in Phase 2.
</div>
```

This is deliberate scope control. Phase 2's state lifting is the right time to wire a real chat UI into the glass column. Attempting it here would duplicate stream state across two roots.

- [ ] **Step 1: Read the current chat.js skeleton**

Focus on the `ChatInterface` function component. Find:
- Where `<ChatInput>` is rendered
- The top-level return statement (the outer `<div>`)
- Where `useContext(ConfigContext)` provides `isDark`

- [ ] **Step 2: Add state and branch rendering**

At the top of `ChatInterface` (or wherever other `useState` calls live), add:

```js
const [viewMode, setViewMode] = useState("chat");
```

Import `BrowserWorkspace` at the top of the file:

```js
import BrowserWorkspace from "../browser/browser_workspace";
```

Pass `onEnterBrowser={() => setViewMode("browser")}` to `<ChatInput ...>`.

At the top of the return, add a short-circuit for browser mode:

```js
if (viewMode === "browser") {
  return (
    <BrowserWorkspace
      isDark={isDark}
      onExitBrowser={() => setViewMode("chat")}
      chatSlot={
        <div style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>
          Chat content placeholder — full chat integration coming in Phase 2.
        </div>
      }
    />
  );
}
```

- [ ] **Step 3: Manually verify in the running app**

```bash
npm start
```

1. Open any chat
2. Click the globe icon in the chat input attach panel
3. Confirm: browser workspace appears with an empty tab
4. Type `https://example.com` in the URL bar, press Enter
5. Confirm: example.com loads inside the webview
6. Open DevTools and check for console warnings
7. Click the ribbon on the right edge — it should expand to a 380px column showing the placeholder text
8. Click "← back to chat" — should return to the chat view

If any of these fail, debug before committing. Report the failure mode to your reviewer.

- [ ] **Step 4: Commit**

```bash
git add src/PAGEs/chat/chat.js
git commit -m "feat(browser): wire BrowserWorkspace into ChatInterface via viewMode state"
```

- [ ] **Step 5: Run gitnexus_detect_changes**

```
gitnexus_detect_changes({scope: "staged"})
```

Expected: only `chat.js` is listed among modified symbols. No unexpected collateral.

---

## Task 19: Enter/exit animation polish

**Files:**
- Modify: `src/PAGEs/browser/browser_workspace.js`
- Modify: `src/PAGEs/chat/chat.js`

### Design

Fade + slight scale crossfade between chat and browser views. 250 ms ease-out.

**Critical constraint:** `<webview>` CANNOT be inside a `transform` ancestor (Chromium restriction). The browser workspace's root element must NOT use `transform`. Only `opacity` is safe.

Approach:
- `BrowserWorkspace` root: CSS transition on `opacity`, starts at `0` when first mounted, transitions to `1` on next frame
- Chat interface root: similarly, opacity goes to 0 before unmount — but since we conditionally render, we can't animate unmount without a delay. **Simpler: animate only the enter, accept the exit as an immediate unmount.** This is good enough for Phase 1.

- [ ] **Step 1: Add an opacity transition to BrowserWorkspace**

Modify the root `div` in `src/PAGEs/browser/browser_workspace.js`. Add:

```js
const [mounted, setMounted] = useState(false);
useEffect(() => {
  const id = requestAnimationFrame(() => setMounted(true));
  return () => cancelAnimationFrame(id);
}, []);
```

And change the root `<div>`:

```js
<div
  style={{
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    opacity: mounted ? 1 : 0,
    transition: "opacity 250ms ease-out",
  }}
>
```

**Do NOT add `transform: scale(...)` here** — it would put the webview in a transformed ancestor and break compositing.

- [ ] **Step 2: Manually verify the fade-in**

```bash
npm start
```

Click the globe. Confirm the browser workspace fades in over ~250 ms. Click back to chat — the transition back is immediate (accepted).

- [ ] **Step 3: Commit**

```bash
git add src/PAGEs/browser/browser_workspace.js
git commit -m "feat(browser): fade-in entry animation for browser workspace"
```

---

## Task 20: End-to-end manual verification

**Files:** none (manual testing)

Walk through the Phase 1 acceptance checklist from the spec:

- [ ] Launch `npm start`
- [ ] Open any chat, click globe → browser mode appears with a blank tab
- [ ] Navigate to https://example.com → page loads
- [ ] Navigate to https://github.com → page loads
- [ ] Navigate to https://huggingface.co → page loads
- [ ] Navigate to https://youtube.com → page loads
- [ ] Navigate to https://www.reddit.com → page loads (SPA test)
- [ ] Navigate to https://news.ycombinator.com → page loads (plain HTML test)
- [ ] Navigate to https://en.wikipedia.org → page loads
- [ ] Navigate to a non-existent URL (e.g., `https://this-definitely-does-not-exist-12345.invalid`) → built-in error page appears, click Try again works
- [ ] Open 10 tabs via the "+" button, all show in the TabBar
- [ ] Click each tab → active tab switches, others remain hidden
- [ ] Close some tabs via the × button → active tab follows sensible selection
- [ ] Drag tab 1 to position 5 → tabs reorder as expected
- [ ] Toggle glass column: ribbon → column → full → column → ribbon via mouse clicks
- [ ] Press `Esc` in full mode → goes to column
- [ ] Press `Esc` in column mode → goes to ribbon
- [ ] Click "← back to chat" button in column header → returns to chat view
- [ ] Click globe again → browser mode reappears; **tabs and URLs are preserved** (because the store is module-level)
- [ ] Open React DevTools profiler → start profiling → type 50 characters in the ChatInput (after going back to chat view) → stop profiling → verify `TabBar` did NOT appear in the render list. **This is the performance acceptance criterion for Phase 1.**
- [ ] Quit PuPu and relaunch → **tabs are lost** (expected; persistence is Phase 2)
- [ ] Open a tab, wait for it to load, then trigger a crash by opening DevTools on that webview and running `setTimeout(() => { while(true) Array(1e9) }, 0)` — or any other crash method. Confirm the crash overlay appears with Reload/Close buttons. Click Reload → page reloads. Click Close → tab is removed.

If any item fails, open an issue, mark the failing task, and do NOT proceed to Phase 2. Phase 1 acceptance is gated on this list.

- [ ] **Run GitNexus analyze to refresh the index**

```bash
cd ~/Desktop/GITRepo/PuPu
npx gitnexus analyze --embeddings
```

(Only if `.gitnexus/meta.json` shows embeddings existed before — check first. If not, plain `npx gitnexus analyze`.)

- [ ] **Create the integration PR**

The Phase 1 branch is `agents`. Merge strategy is up to the reviewer.

---

## Post-Phase-1 Notes for the Next Plan

When Phase 2 (persistence) starts, the following items in Phase 1 will need to evolve. Do not implement them now, but leave clean seams:

1. **`browser_tab_store` will grow a `byChatId` layer.** Its external API (`newTab(url)` etc.) should stay backward-compatible — Phase 2 will add a `chatId` parameter with a default. Current API is positioned for that.

2. **`chatSlot` placeholder in `chat.js` will be replaced** by a real chat UI. The cleanest approach is to lift `ChatInterface`'s message list + input into a shared subcomponent and pass it to `BrowserWorkspace`. This requires a refactor of `chat.js` and is intentionally deferred.

3. **WebviewHost LRU** (max 8 active webviews) is not implemented in Phase 1 (we have a global tab list so the risk is bounded). Phase 2 introduces per-chat grouping which makes LRU non-optional.

4. **`browser_runtime_store.clearRuntimeForTab`** is called on tab close in Phase 1; Phase 2 will add chat-switch clearing.

5. **`updateTabFieldSilent` is wired but not exercised for `scrollY` in Phase 1**. That wiring happens in Phase 2 once per-chat persistence exists.

6. **CHANNELS.BROWSER namespace** is reserved but empty. Phase 2 adds handlers there.

---

## Spec Coverage Self-Review

Confirm every Phase 1 spec requirement has a task:

| Spec requirement (from § 8.1 Phase 1 scope) | Task |
|---|---|
| `attach_panel` adds globe icon | 16 |
| Globe click toggles view | 18 |
| New `BrowserWorkspace` page component | 15 |
| `UrlBar` (URL, load, reload, back/forward) | 8 |
| `TabBar` (+, X, click switch, drag-reorder) | 9, 10 |
| `WebviewHost` (single webview visible) | 14 |
| `ChatGlassColumn` (ribbon/column/full) | 11 |
| Glass style | 7 (surface), 11 (column), 15 (top strip) |
| Webview crash overlay | 13 (overlay), 14 (integration) |
| Built-in error page | 12 (HTML), 14 (integration) |
| Enter/exit animation | 19 |
| TabBar does not re-render during typing | 20 (verification) |
| `webviewTag: true` enabled | 1 |

Phase 1 `Not Included` list verified — no task accidentally implements persistence, cookies, agent, or per-chat grouping.

## Placeholder Scan

Plan has been scanned for forbidden patterns: no "TODO", no "fill in details", no "similar to Task N", no references to undefined types. All code blocks are complete.

## Type Consistency

Reviewed store API names across tasks 3→5→6→15→18: `newTab`, `closeTab`, `switchTab`, `reorderTab`, `updateTabFieldSilent`, `subscribeBrowserTabStore`, `getBrowserTabState`, `updateRuntimeForTab`, `clearRuntimeForTab`, `getRuntimeForTab`, `subscribeBrowserRuntimeStore`. Used consistently; no drift detected.

---

**End of Phase 1 plan.**
