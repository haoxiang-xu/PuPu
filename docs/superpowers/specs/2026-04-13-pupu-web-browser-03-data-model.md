# PuPu Web Browser — 03 · Per-chat Tab Data Model & Persistence

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 3.1 · Data Shapes

```ts
// BrowserTab — full state of a single tab
type BrowserTab = {
  id: string;              // uuid, stable key
  url: string;             // current URL
  title: string;           // page title (synced from webview)
  favicon: string | null;  // data: URL or remote URL
  scrollY: number;         // last known scroll position (Y axis only, simplified)
  createdAt: number;
  lastActiveAt: number;    // for future "recent" sort
  // Intentionally NOT stored: history / back-forward stack.
  // On restart, only current URL is restored; back/forward history starts fresh.
};

// BrowserChatState — full browser state for one chat
type BrowserChatState = {
  chatId: string;
  tabs: BrowserTab[];      // order == UI order (DnD reorder mutates array directly)
  activeTabId: string | null;
  columnState: "ribbon" | "column" | "full";  // last column state on close
  // NOTE: no per-chat cookies — cookies are globally shared (D1 scheme).
};
```

## 3.2 · Storage Location — Separate Store vs `chat_storage`

**Decision: Separate `browser_store`, but with lifecycle tied to chats.**

### Rationale

- `chat_storage_store` has a known broadcast-fanout issue that is the subject of Phase 4 in `docs/superpowers/plans/cached-prancing-pie.md`. We will not make that problem worse.
- Browser state changes at high frequency (scroll, navigation). It must not pollute `chat_storage_store` subscribers.
- Lifecycle **must** remain tied to chats: deleting a chat deletes its browser state.

### Persistence Layout

Stored in the main process in a dedicated SQLite table, managed by the Electron main process. The renderer reads and writes via IPC: `browser:load`, `browser:save`, `browser:delete`.

**Not `localStorage`:** data volume can grow (100 chats × 10 tabs × ~2KB metadata ≈ 2MB), and localStorage is a poor fit for this.

```
browser_tabs table:
  chat_id      TEXT  PRIMARY KEY
  state_json   TEXT    -- serialized BrowserChatState
  updated_at   INTEGER
  schema_ver   INTEGER DEFAULT 1
```

## 3.3 · Lifecycle

| Event | Browser state behavior |
|---|---|
| Create new chat | No browser state auto-created. Lazy on first globe click: empty `tabs` array. |
| Switch to a chat | Read `browser_tabs[chatId]` from SQLite; restore `tabs` and `activeTabId`. **Do not** create webviews until the user actually enters browser mode. |
| Enter browser mode | Create `<webview>` for `activeTabId`. Other tabs' webviews are lazy — created on switch. |
| Leave browser mode (globe toggle back) | Preserve all webview processes in memory; do **not** destroy. |
| Switch chats while in browser mode | **Destroy** all webviews for the previous chat; create webviews for the new chat. |
| Delete chat | Delete `browser_tabs[chatId]`; destroy associated webviews. |
| App exit | Snapshot each webview's current URL + `scrollY` to SQLite. |

### Critical Concern: Memory Explosion

Every `<webview>` is an independent renderer process (~100–300 MB). 10 chats × 10 tabs = 100 processes is not viable.

### Mitigations

1. **Only create webviews for the current chat's tabs.** On chat switch, destroy the previous chat's webviews (URLs and `scrollY` are preserved in state and reconstructed on re-entry).
2. **LRU cap within a single chat: 8 active webviews max.** Inactive tabs beyond 8 are destroyed (state kept). Reconstructed on switch.
3. When an agent tries to open a 9th tab, the LRU automatically evicts the oldest. The agent tool's return value reports which tab was evicted.

### URL Precision on Restore

- A destroyed-and-reconstructed webview uses the **last snapshot URL**, not its in-memory SPA route state.
- `scrollY` is restored best-effort on `did-finish-load`; silent failure on mismatch.
- Form data / `sessionStorage` is **not** promised to survive.

## 3.4 · Persistence Triggers

| Trigger | Timing |
|---|---|
| URL change (`did-navigate`) | Debounce 500 ms, then write SQLite |
| Tab add / remove / reorder | Immediate write |
| `activeTabId` change | Immediate write |
| `columnState` change | Immediate write |
| `scrollY` change | Debounce 1 s |
| App exit (`before-quit`) | Force-flush all debounce queues |

## 3.5 · Schema Migration

The `schema_ver` field exists so we can evolve the shape later. v1 is the initial schema. **No migration logic for v1 → v2 in this spec.** If the version doesn't match what the code supports, that chat's browser state is discarded and the user reopens tabs manually — an acceptable cost for simplicity.
