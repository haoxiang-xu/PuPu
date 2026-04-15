# PuPu Web Browser — 08 · Phasing, Testing, Open Questions

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 8.1 · Phased Implementation (4 Phases)

This feature is too large to ship as one unit. We split it into four phases, each **independently shippable and verifiable**.

### Phase 1 · Browser Shell 🔨

**Goal:** globe icon → switch to browser workspace → able to browse manually. No agent, no cookie import, no persistence.

**Scope:**
- `attach_panel` adds globe icon + click-to-toggle view
- New `BrowserWorkspace` page component + enter/exit animation
- `UrlBar` (URL input, load, reload, back/forward)
- `TabBar` ("+" new, X close, click switch, drag-reorder)
- `WebviewHost` (single webview, in-memory per chat)
- `ChatGlassColumn` three snap states (ribbon / column / full) + glass style
- Webview crash overlay + built-in error page

**Not included:**
- Persistence (closing PuPu discards tabs)
- Cookie import (Electron default empty jar)
- Agent tools
- Per-chat tab grouping (global tab list, not bound to chat)

**Acceptance:**
- [ ] Open any chat, click globe, land in browser
- [ ] Browse 10+ sites (Google, GitHub, HF, YouTube, etc.)
- [ ] TabBar supports 10 tabs with add/remove/reorder
- [ ] Three glass-column states transition smoothly without webview reload
- [ ] Globe-toggle back to chat, then back to browser — webview state preserved
- [ ] Webview crash reloads and recovers
- [ ] Typing does not re-render TabBar (verified in DevTools Profiler)

**Estimate:** ~12 new files, ~2000 lines. Largest unknown: `<webview>` compositing layer interaction with `backdrop-filter`.

---

### Phase 2 · Persistence + Per-chat Grouping 💾

**Goal:** tabs bound to chats, survive app restart.

**Scope:**
- Main-process `browser_tabs` SQLite table + IPC handlers
- `browser_tab_store` (L1) + debounced flush
- `browser_runtime_store` (L2)
- Schema version field + corrupted file backup
- Per-chat tab switch (chat change → destroy current webviews → load new chat tabs)
- Webview LRU (max 8 live webviews per chat)
- ScrollY silent update path

**Acceptance:**
- [ ] Open 3 tabs in chat A, switch to chat B, open 2 tabs, switch back to A — see original 3 with correct URLs
- [ ] Restart PuPu — all chats' tabs and scrollY restore
- [ ] Delete a chat → its browser state is cleaned up
- [ ] Open 10 tabs; when the 9th is created, the oldest is recycled with a notification
- [ ] SQLite corruption recovers gracefully + backs up the corrupted file
- [ ] Schema version mismatch degrades gracefully

**Estimate:** ~6 new files, ~4 modified, ~1500 lines.

---

### Phase 3 · Cookie Import 🍪

**Goal:** one-shot Chrome cookie import for login continuity; macOS in this phase.

**Scope:**
- `chrome_cookie_importer.js` (macOS implementation)
- Settings → Browser page + Import button
- First-launch banner
- "Don't ask again" preference (per device)
- Chrome-running detection + user guidance
- Progress UI + completion toast
- "Clear imported cookies" button

**Not included in Phase 3:**
- Windows / Linux implementations (tracked as Phase 3.5)
- Incremental sync / automatic re-import

**Acceptance:**
- [ ] Sign in to GitHub in Chrome → Import → PuPu opens github.com already signed in
- [ ] With Chrome running, Import prompts user to quit Chrome
- [ ] Keychain denial degrades gracefully
- [ ] "Clear imported cookies" wipes everything
- [ ] Banner + "Don't ask again" takes effect
- [ ] Cookie statistics are correct (imported / skipped)

**Estimate:** ~4 new files + Settings page changes, ~800 lines.

---

### Phase 3.5 · Windows / Linux Cookie Import

- Windows: DPAPI decryption + `Local State` for the key
- Linux: libsecret (GNOME Keyring / KDE Wallet) / hardcoded `peanuts` for legacy versions
- ~600 lines

---

### Phase 4 · Agent Browser Tools 🤖

**Goal:** full C-tier agent capability.

**Scope:**
- `cdp_controller.js` (main process, CDP attach / command wrappers)
- `browser_tools.js` (15 tools, definitions + implementations)
- `PupuSel` selector system + bundled Readability.js
- `browser_tool_risk.js` (L0/L1/L2/L3 rules)
- Integration with `use_tool_confirmation` (risk-aware flow)
- Specialized `ToolConfirmationPanel` renderer for browser tools (highlight-box screenshots)
- Sensitive-field detection
- CDP attach failure fallback
- Auto-screenshot strategy on tool failure

**End-to-end acceptance:**
- [ ] "Go to github.com and find trending repos" → agent auto-navigates, reads page, summarizes
- [ ] "Fill in my name on this form" → L2 confirm → user approves → agent executes
- [ ] Instruct agent to click a password field → L3 confirm with warning
- [ ] Agent clicks "delete" → L3 confirm with element text preview
- [ ] Stale selectors auto-retry via alternatives
- [ ] Webview crash during agent run → `recoverable: true` returned
- [ ] 20+ step agent runs without deadlock or memory leak
- [ ] Certificate errors cannot be bypassed by the agent

**Estimate:** ~10 new files + ~3 modified, ~3000 lines. Largest and hardest phase.

---

## 8.2 · Phase Dependencies

```
Phase 1 (Shell) ──┬──> Phase 2 (Persistence)
                  │        │
                  │        v
                  │    Phase 3 (Cookies — macOS)
                  │        │
                  │        v
                  │    Phase 3.5 (Cookies — Win/Linux)
                  │
                  └──> Phase 4 (Agent Tools)

Phase 2 and Phase 4 may progress in parallel (different sessions).
Phase 3 can run at any time after Phase 1; it does not block Phase 4.
```

## 8.3 · Testing Strategy

| Layer | Type | Tool | Coverage |
|---|---|---|---|
| Pure fn | Unit | Jest | `browser_tool_risk.js` rules, `PupuSel` parser, schema migration, cookie mapping |
| State | Unit | Jest | `browser_tab_store` add/remove/reorder/LRU/silent update |
| React | Component | React Testing Library | UrlBar, TabBar, ChatGlassColumn interactions (no real webview) |
| Webview | Integration | Playwright-Electron | Open PuPu → enter browser → load real site → verify |
| Agent tool | Integration | Playwright-Electron + local HTML fixtures | Each `browser_*` tool against fixture pages |
| E2E | Smoke | Manual + screen recording | Phase acceptance checklists |

**Key decision: agent tool tests use local HTML fixtures, not real sites** — stable, fast, runnable offline. Fixtures live in `test-fixtures/browser/`.

## 8.4 · Performance Budgets

| Metric | Target |
|---|---|
| Globe click → browser workspace visible | < 400 ms |
| TabBar re-renders during typing | 0 |
| Webview LRU eviction wall time | < 100 ms |
| Chat switch (with browser-mode destroy + rebuild) | < 800 ms |
| Cookie import (5000 cookies) | < 5 s |
| CDP attach | < 500 ms |
| `browser_read_page(text)` on 1 MB page | < 200 ms |
| `browser_screenshot` | < 800 ms |
| Agent full "search + read + summarize" loop | < 15 s |

## 8.5 · Open Questions (defer to implementation)

These are deliberate unknowns — to be resolved during implementation, not in design:

1. **TabBar maximum tab count** — LRU caps live webviews at 8, but what's the UI limit on the tab strip? Horizontal scroll for 30 tabs? A "more tabs" overflow menu?
2. **Exact glass style numerics** — `blur(24px)` is a starting point; macOS and Windows differ in `backdrop-filter` handling. Tune on real devices.
3. **`browser_read_page` `truncated` threshold** — 100 KB of text? 200 KB? Drives context costs for the model.
4. **Agent tool rate limit** — should we cap tool calls per second to prevent runaway tasks?
5. **Readability.js version / fork** — the official Mozilla/Readability npm package or jsdom-readability?
6. **JPEG quality 60 for screenshots** — possibly too low, losing detail. Tune during integration testing.
7. **Cookie import banner copy** — trust-sensitive; polish during copy review.

## 8.6 · Explicitly Out of Scope

These are **not** being built, even if asked:

- ❌ Bookmarks / history / Reading List
- ❌ Chrome extension support
- ❌ Multi-window / `Cmd+N` (no extra `BrowserWindow` at the Electron level)
- ❌ Download manager (downloads go to the OS default path; no UI)
- ❌ Specialized PDF / image / video viewers (use Chromium defaults)
- ❌ Incognito mode (possible future, not Day 1)
- ❌ Password manager integration (1Password, iCloud Keychain)
- ❌ Translate
- ❌ `browser_run_js` arbitrary script execution (risk/reward not justified)
