# PuPu Web Browser — 06 · Frontend State Management

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 6.1 · Layered Strategy

Browser state is split into three layers. **The separation is intentional**, to prevent high-frequency state churn from polluting subscribers that don't care (a lesson learned from Phase 4 of `docs/superpowers/plans/cached-prancing-pie.md`).

| Layer | State | Frequency | Storage | Subscribers |
|---|---|---|---|---|
| **L1 · Tab structure** | tabs list, activeTabId, columnState | Low (user-driven) | Persisted to SQLite | Chat page / side menu / Tab bar |
| **L2 · Tab runtime** | per-webview loading, favicon, canGoBack, canGoForward | Medium (per navigation) | In-memory | Tab bar / UrlBar |
| **L3 · Per-webview metadata** | scrollY, title sync, cookie change events | High (scroll = multiple events per second) | In-memory, debounced to disk | WebviewHost only |

**Core invariant:** L3 changes must **never** trigger L1 or L2 subscribers. Scrolling 500 times should not cause a single TabBar re-render.

## 6.2 · Store 1 — `browser_tab_store` (L1)

**Responsibility:** per-chat tab structure, persisted.

```js
// in-memory shape
{
  byChatId: {
    "chat-abc": {
      tabs: [{id, url, title, favicon, scrollY, createdAt, lastActiveAt}, ...],
      activeTabId: "tab-1",
      columnState: "column",
      _dirty: false,  // internal, for debounced flush
    },
    ...
  },
  currentChatId: "chat-abc",
}
```

### Subscription model

Reuse the **exclude-list subscription API** designed in Phase 4 of `cached-prancing-pie.md`:

```js
subscribeBrowserTabStore(listener, {
  chatId: "chat-abc",         // only subscribe to one chat's changes
  excludeFields: ["scrollY"], // ignore scroll (see L3 note below)
});
```

- Side menu only subscribes to `currentChatId` changes.
- TabBar only subscribes to `currentChatId` + `byChatId[currentChatId].tabs`.

### Persistence

- Writes mutate in-memory immediately, then debounce 500 ms and call IPC `browser:save` to flush to disk.
- On startup, pre-load all chats' browser state from SQLite into memory (PuPu chat counts are bounded; lazy loading is unnecessary complexity).
- On app exit, force-flush all dirty entries.

## 6.3 · Store 2 — `browser_runtime_store` (L2, in-memory only)

**Responsibility:** runtime state for live webviews in the current chat; not persisted.

```js
{
  byTabId: {
    "tab-1": {
      loading: false,
      canGoBack: true,
      canGoForward: false,
      faviconUrl: "...",
      title: "Latest title",
      lastError: null,
    }
  }
}
```

- UrlBar's back/forward buttons and loading spinner subscribe to this store only — never to L1.
- Webview events (`did-navigate`, `did-start-loading`, `page-title-updated`, `page-favicon-updated`) flow into `webview_host` → update L2 → limited cascade to UrlBar.

### Cross-store sync

L2's `title` and `favicon` updates are **debounced 2 seconds** before being written back to L1's tab object. Short-lived title thrashing (SPA sites often churn the title) does not cause a series of SQLite writes.

## 6.4 · L3 · scrollY Special Path

Although `scrollY` is nominally a field on L1's `BrowserTab`, its write path **does not go through the store broadcast**.

Implementation:
- `WebviewHost` subscribes to the webview's scroll events (debounced 1 s)
- It calls `browserTabStore.updateTabFieldSilent(tabId, 'scrollY', value)` — **a silent variant that does not notify subscribers**
- Disk persistence still rides on L1's debounced flush mechanism

Semantics: `scrollY` is written to memory and disk, but no subscribers are notified. The next time a component mounts and reads, it sees the latest value — that's enough.

## 6.5 · Interaction with Chat Page Routing

**Browser mode is not a separate route. It is an internal view state of the chat page.**

Rationale:
- When switching chats, browser mode's active/inactive state must follow the chat lifecycle
- A separate route would turn "click globe" into a routing jump, introducing history interaction with both the browser's back button and PuPu's own back button

```js
// in ChatPage top-level
const [viewMode, setViewMode] = useState("chat");  // "chat" | "browser"
```

- `viewMode` is **not persisted** — session-level only. Restarting PuPu always lands in chat view.
- Switching chats resets `viewMode` to "chat". The user doesn't have to discover they were in browser mode when switching to an unrelated chat. **(This was an explicit decision; see open questions in phasing.)**

### Entering browser mode

1. `ChatPage` swaps rendering to `<BrowserWorkspace chatId={currentChatId} />`
2. `BrowserWorkspace` reads tabs from L1 store, creates webview instances
3. `ChatGlassColumn` keeps reading from `chat_storage_store` — chat and browser view share chat state seamlessly

### Exiting browser mode (globe toggle back)

1. `viewMode` reverts to "chat"
2. **Webview instances are not destroyed.** They remain in the DOM under a `display:none` container. Next entry is instant.
3. Webview destruction happens **only** on chat switch (see data-model § 3.3)

## 6.6 · Hooks Table

| Hook | Layer | Returns |
|---|---|---|
| `useBrowserTabs(chatId)` | L1 | `{tabs, activeTabId, columnState, actions: {newTab, closeTab, switchTab, reorderTab, setColumnState}}` |
| `useActiveWebviewRuntime()` | L2 | `{loading, canGoBack, canGoForward, title, favicon, error}` |
| `useBrowserViewMode()` | session | `{viewMode, enterBrowser, exitBrowser}` |
| `useWebviewRef(tabId)` | — | A ref to the webview instance (UrlBar's back/forward calls webview methods directly) |

## 6.7 · Performance Budget

- TabBar re-renders: one per tab list mutation (add/remove/reorder) — < 1/sec. Memoize as best practice but not a hot path.
- UrlBar re-renders: one per L2 event (~5 per navigation: start, navigate, finish, title, favicon). Acceptable.
- Chat column re-renders: go through the existing `use_chat_stream.js` path. Browser mode introduces no new chat re-render sources.
- **Goal:** typing in the chat input (Column mode) or scrolling the webview does not cause TabBar/UrlBar to re-render. This is the core acceptance criterion for the subscription-layering design.
