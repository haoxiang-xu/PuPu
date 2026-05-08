# Streaming Perf: Background Stream Throttled Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate UI lag when multiple chats stream simultaneously by removing per-token `localStorage` writes for background streams.

**Architecture:** Background streams already have an in-memory buffer (`activeStreamsRef`). Today, every token delta for a background chat triggers `storageApi.setChatMessages` → `JSON.stringify(entireStore) + localStorage.setItem` on the main thread. We introduce a per-chat throttled persister that coalesces storage writes (default 2000 ms) and force-flushes on stream end, tool-call frames, chat switch, error, and `beforeunload`. Foreground streams are unchanged — they continue to flush to React state every `requestAnimationFrame`.

**Tech Stack:** React 19, vanilla JS (no TS), Jest (co-located `*.test.js`), inline styles (no UI changes).

---

## File Structure

**New files:**
- `src/PAGEs/chat/hooks/background_stream_persister.js` — per-chat throttled persister module (no React — plain module with module-level state so tests can hit it directly).
- `src/PAGEs/chat/hooks/background_stream_persister.test.js` — unit tests (Jest, fake timers).

**Modified files:**
- `src/PAGEs/chat/hooks/use_chat_stream.js`
  - Replace `storageApi.setChatMessages` per-token branch in `syncStreamMessages` (~line 1085) with `persister.schedule`.
  - Replace the same call in `appendSyntheticToolConfirmationDecision` (~line 558) — tool confirmations should persist immediately.
  - `onDone` (~line 2120), `onError` (~line 2225), and `cancelCurrentStreamAndSettleMessages` (~line 406) call `persister.flushNow(chatId)` before deleting from `activeStreamsRef`.
- `src/PAGEs/chat/hooks/use_chat_session_state.js`
  - On chat switch (~line 169-182), call `persister.cancel(leavingChatId)` after the immediate `setChatMessages` so no stale scheduled write fires afterwards.
  - Add one-time `beforeunload` listener that calls `persister.flushAll()`.
- `src/PAGEs/chat/hooks/use_chat_stream.test.js` (if exists) — update any tests that rely on the previous per-token `setChatMessages` behavior.

**Unchanged (explicit non-scope):**
- `use_chat_session_state.js:169-182` on-switch-away immediate write — keep; it is the safety net that guarantees storage is fresh when leaving a chat.
- Foreground RAF throttle in `use_chat_stream.js:1314-1338` — keep.
- Chat bubble / markdown rendering — out of scope.

---

## Task 1: Create persister module with schedule + flushNow

**Files:**
- Create: `src/PAGEs/chat/hooks/background_stream_persister.js`

- [ ] **Step 1: Write the module**

```js
// src/PAGEs/chat/hooks/background_stream_persister.js
import { setChatMessages } from "../../../SERVICEs/chat_storage";

const DEFAULT_INTERVAL_MS = 2000;

const state = {
  intervalMs: DEFAULT_INTERVAL_MS,
  pending: new Map(), // chatId -> { timerId, messages }
};

const writeNow = (chatId, messages) => {
  setChatMessages(chatId, messages, { source: "chat-page" });
};

export const configureBackgroundPersister = ({ intervalMs } = {}) => {
  if (typeof intervalMs === "number" && intervalMs >= 0) {
    state.intervalMs = intervalMs;
  }
};

export const scheduleBackgroundPersist = (chatId, messages) => {
  if (!chatId || !Array.isArray(messages)) return;
  const entry = state.pending.get(chatId);
  if (entry) {
    entry.messages = messages;
    return;
  }
  const timerId = setTimeout(() => {
    const current = state.pending.get(chatId);
    state.pending.delete(chatId);
    if (current) writeNow(chatId, current.messages);
  }, state.intervalMs);
  state.pending.set(chatId, { timerId, messages });
};

export const flushBackgroundPersist = (chatId) => {
  if (!chatId) return false;
  const entry = state.pending.get(chatId);
  if (!entry) return false;
  clearTimeout(entry.timerId);
  state.pending.delete(chatId);
  writeNow(chatId, entry.messages);
  return true;
};

export const cancelBackgroundPersist = (chatId) => {
  if (!chatId) return false;
  const entry = state.pending.get(chatId);
  if (!entry) return false;
  clearTimeout(entry.timerId);
  state.pending.delete(chatId);
  return true;
};

export const flushAllBackgroundPersist = () => {
  for (const [chatId, entry] of state.pending.entries()) {
    clearTimeout(entry.timerId);
    writeNow(chatId, entry.messages);
  }
  state.pending.clear();
};

export const __resetBackgroundPersisterForTests = () => {
  for (const entry of state.pending.values()) {
    clearTimeout(entry.timerId);
  }
  state.pending.clear();
  state.intervalMs = DEFAULT_INTERVAL_MS;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/PAGEs/chat/hooks/background_stream_persister.js
git commit -m "feat(chat): add per-chat throttled background stream persister"
```

---

## Task 2: Test persister — schedule coalescing

**Files:**
- Create: `src/PAGEs/chat/hooks/background_stream_persister.test.js`

- [ ] **Step 1: Write failing test**

```js
// src/PAGEs/chat/hooks/background_stream_persister.test.js
jest.mock("../../../SERVICEs/chat_storage", () => ({
  setChatMessages: jest.fn(),
}));

import { setChatMessages } from "../../../SERVICEs/chat_storage";
import {
  configureBackgroundPersister,
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  cancelBackgroundPersist,
  flushAllBackgroundPersist,
  __resetBackgroundPersisterForTests,
} from "./background_stream_persister";

describe("background_stream_persister", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setChatMessages.mockClear();
    __resetBackgroundPersisterForTests();
    configureBackgroundPersister({ intervalMs: 2000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("coalesces many schedule calls into one write per interval", () => {
    for (let i = 0; i < 100; i++) {
      scheduleBackgroundPersist("chat-1", [{ id: "m", content: `hello${i}` }]);
    }
    expect(setChatMessages).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-1",
      [{ id: "m", content: "hello99" }],
      { source: "chat-page" },
    );
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat/hooks/background_stream_persister.test.js`
Expected: PASS (Task 1's module already supports this).

- [ ] **Step 3: Commit**

```bash
git add src/PAGEs/chat/hooks/background_stream_persister.test.js
git commit -m "test(chat): persister coalesces schedule calls"
```

---

## Task 3: Test persister — flushNow, cancel, flushAll, per-chat isolation

**Files:**
- Modify: `src/PAGEs/chat/hooks/background_stream_persister.test.js`

- [ ] **Step 1: Append tests**

```js
  test("flushBackgroundPersist writes immediately and returns true", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "m", content: "x" }]);
    const result = flushBackgroundPersist("chat-1");
    expect(result).toBe(true);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).toHaveBeenCalledTimes(1); // no double write
  });

  test("flushBackgroundPersist returns false when nothing pending", () => {
    expect(flushBackgroundPersist("chat-1")).toBe(false);
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  test("cancelBackgroundPersist drops pending write without calling storage", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "m", content: "x" }]);
    expect(cancelBackgroundPersist("chat-1")).toBe(true);
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  test("isolates timers across chatIds", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "a", content: "1" }]);
    scheduleBackgroundPersist("chat-2", [{ id: "a", content: "2" }]);
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).toHaveBeenCalledTimes(2);
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-1",
      [{ id: "a", content: "1" }],
      { source: "chat-page" },
    );
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-2",
      [{ id: "a", content: "2" }],
      { source: "chat-page" },
    );
  });

  test("flushAllBackgroundPersist writes every pending chat", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "a", content: "1" }]);
    scheduleBackgroundPersist("chat-2", [{ id: "a", content: "2" }]);
    flushAllBackgroundPersist();
    expect(setChatMessages).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).toHaveBeenCalledTimes(2);
  });

  test("ignores invalid chatId or messages", () => {
    scheduleBackgroundPersist("", [{ id: "a" }]);
    scheduleBackgroundPersist("chat-1", null);
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat/hooks/background_stream_persister.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/PAGEs/chat/hooks/background_stream_persister.test.js
git commit -m "test(chat): persister flush/cancel/isolation coverage"
```

---

## Task 4: Wire persister into `syncStreamMessages` (background branch)

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js:1074-1088` (and import block at top)

- [ ] **Step 1: Add import**

At the top of `use_chat_stream.js`, near the other hook-relative imports (look for the `../utils/...` or `./...` local imports, e.g. around line 9-12), add:

```js
import {
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  cancelBackgroundPersist,
  flushAllBackgroundPersist,
} from "./background_stream_persister";
```

- [ ] **Step 2: Replace the background write in `syncStreamMessages`**

Find the block at lines 1074-1088:

```js
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamsRef.current.set(targetChatId, {
          messages: nextStreamMessages,
        });

        if (activeChatIdRef.current === targetChatId) {
          setMessages(nextStreamMessages);
          return;
        }

        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      };
```

Replace with:

```js
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamsRef.current.set(targetChatId, {
          messages: nextStreamMessages,
        });

        if (activeChatIdRef.current === targetChatId) {
          setMessages(nextStreamMessages);
          return;
        }

        scheduleBackgroundPersist(targetChatId, nextStreamMessages);
      };
```

- [ ] **Step 3: Run existing tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat`
Expected: PASS. If any test asserted `storageApi.setChatMessages` being called synchronously on a background token, update it to advance timers and re-check — note the assertion in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/PAGEs/chat/hooks/use_chat_stream.js
git commit -m "refactor(chat): route background stream writes through persister"
```

---

## Task 5: Force-flush persister on stream done / error / cancel

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js`

- [ ] **Step 1: Flush in `onDone`**

Find `onDone: (done) => {` (~line 2120). Inside the handler, the final `syncStreamMessages(nextStreamMessages)` call (~line 2157) happens before `activeStreamsRef.current.delete(targetChatId)` (~line 2210). Since `syncStreamMessages` only schedules for background chats, the scheduled timer might fire AFTER the chat is removed. Replace the scheduling path on final frames by calling `flushBackgroundPersist` right after the final `syncStreamMessages`.

Add this line directly after `syncStreamMessages(nextStreamMessages);` at ~line 2157:

```js
              syncStreamMessages(nextStreamMessages);
              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
```

- [ ] **Step 2: Flush in `onError`**

Find `onError: (error) => {` (~line 2225). After `flushBufferedTokenDelta()` (~line 2227) and wherever the final `syncStreamMessages` is called in the error path (search for `syncStreamMessages` within the onError handler — around lines 2341 and 2389), follow each with:

```js
              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
```

Also add a safety flush at the start of the non-retry branch (after line 2303 `releaseTokenFlushController()`):

```js
              // Safety flush in case the error path exits without calling syncStreamMessages
              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
```

- [ ] **Step 3: Flush in `cancelCurrentStreamAndSettleMessages`**

Find `cancelCurrentStreamAndSettleMessages` (~line 406). It operates on `activeChatIdRef.current` (the currently-visible chat) but other chats may also be streaming. For the current chat we rely on the existing `setMessages(nextMessages)` at line 438. No persister flush needed for the current chat.

But if the app is shutting down a stream while the user has navigated away, defensively flush. After line 414 (`streamingChatIdsRef.current.delete(currentChatId);`):

```js
    streamingChatIdsRef.current.delete(currentChatId);
    flushBackgroundPersist(currentChatId); // no-op if nothing pending
```

- [ ] **Step 4: Run test suite**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PAGEs/chat/hooks/use_chat_stream.js
git commit -m "fix(chat): flush background persister on stream done/error/cancel"
```

---

## Task 6: Tool-confirmation branch persists immediately

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js:555-561`

Rationale: Tool confirmation decisions are rare, user-visible state transitions. They should hit storage right away so other UI (sidemenu, other windows) picks them up.

- [ ] **Step 1: Replace background write**

At lines 555-561:

```js
      if (activeChatIdRef.current === targetChatId) {
        setMessages(nextStreamMessages);
      } else {
        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      }
```

Replace with:

```js
      if (activeChatIdRef.current === targetChatId) {
        setMessages(nextStreamMessages);
      } else {
        // Tool confirmation is infrequent + user-visible — bypass the throttle.
        cancelBackgroundPersist(targetChatId);
        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      }
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/PAGEs/chat/hooks/use_chat_stream.js
git commit -m "refactor(chat): tool confirmation bypasses background throttle"
```

---

## Task 7: Cancel pending persist on chat switch + beforeunload flush

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_session_state.js`

- [ ] **Step 1: Add import**

Near the top of the file:

```js
import {
  cancelBackgroundPersist,
  flushAllBackgroundPersist,
} from "./background_stream_persister";
```

- [ ] **Step 2: Cancel pending persist after on-switch immediate write**

Find the block at ~line 169-182:

```js
      const leavingStreamState = activeStreamsRef.current.get(currentActiveId);
      if (
        currentActiveStillExists &&
        leavingStreamState &&
        Array.isArray(leavingStreamState.messages)
      ) {
        setChatMessages(
          currentActiveId,
          leavingStreamState.messages,
          {
            source: "chat-page",
          },
        );
      }
```

Replace with:

```js
      const leavingStreamState = activeStreamsRef.current.get(currentActiveId);
      if (
        currentActiveStillExists &&
        leavingStreamState &&
        Array.isArray(leavingStreamState.messages)
      ) {
        setChatMessages(
          currentActiveId,
          leavingStreamState.messages,
          {
            source: "chat-page",
          },
        );
        // We just wrote fresh state; drop any pending throttled write.
        cancelBackgroundPersist(currentActiveId);
      }
```

- [ ] **Step 3: Add beforeunload listener**

Anywhere in the hook body after the subscribe `useEffect`, add a new `useEffect`:

```js
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onBeforeUnload = () => {
      flushAllBackgroundPersist();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat/hooks/use_chat_session_state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PAGEs/chat/hooks/use_chat_session_state.js
git commit -m "feat(chat): cancel persist on switch, flush on unload"
```

---

## Task 8: Integration test — background tokens do not hit storage per token

**Files:**
- Create: `src/PAGEs/chat/hooks/use_chat_stream_persist.test.js`

This test validates the user-visible contract: when a chat is NOT active, 100 token deltas produce at most one storage write (after the throttle interval), and the final `onDone` triggers an immediate write.

- [ ] **Step 1: Write integration test**

```js
// src/PAGEs/chat/hooks/use_chat_stream_persist.test.js
jest.mock("../../../SERVICEs/chat_storage", () => ({
  __esModule: true,
  setChatMessages: jest.fn(),
}));

import {
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  __resetBackgroundPersisterForTests,
  configureBackgroundPersister,
} from "./background_stream_persister";
import { setChatMessages } from "../../../SERVICEs/chat_storage";

describe("background stream persist contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setChatMessages.mockClear();
    __resetBackgroundPersisterForTests();
    configureBackgroundPersister({ intervalMs: 2000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("100 token deltas produce at most one write within one interval", () => {
    let content = "";
    for (let i = 0; i < 100; i++) {
      content += `token${i} `;
      scheduleBackgroundPersist("chat-bg", [{ id: "m", content }]);
    }
    expect(setChatMessages).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
  });

  test("flush on stream end writes the final buffer immediately", () => {
    scheduleBackgroundPersist("chat-bg", [{ id: "m", content: "partial" }]);
    // Simulate onDone: final syncStreamMessages then flushBackgroundPersist.
    scheduleBackgroundPersist("chat-bg", [
      { id: "m", content: "final", status: "done" },
    ]);
    flushBackgroundPersist("chat-bg");
    expect(setChatMessages).toHaveBeenCalledTimes(1);
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-bg",
      [{ id: "m", content: "final", status: "done" }],
      { source: "chat-page" },
    );
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/PAGEs/chat/hooks/use_chat_stream_persist.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/PAGEs/chat/hooks/use_chat_stream_persist.test.js
git commit -m "test(chat): contract test for background persist throttling"
```

---

## Task 9: Manual perf verification

**Files:** none (manual test).

- [ ] **Step 1: Start dev build**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm start`

- [ ] **Step 2: Baseline recording**

Before running, `git stash` this branch or check out `main`, repeat steps 3-5, and record timings. Come back to this branch and compare.

- [ ] **Step 3: Reproduce original lag**

Open three chats. Send a long prompt to each in rapid succession so all three are streaming simultaneously. Switch to a fourth chat and type into the composer.

- [ ] **Step 4: Measure**

Open Chrome DevTools → Performance tab → Record for 10s while all three streams run. After recording:
- In the bottom panel, check **"Scripting"** time for `localStorage.setItem` / `JSON.stringify` frames.
- Check the **frames timeline** for long tasks > 50 ms.

Expected on this branch: no long tasks from `localStorage.setItem` during streaming; composer typing remains responsive (no visible frame drops on keystroke).

- [ ] **Step 5: Sanity check persistence**

After all three streams finish, refresh the app (Cmd+R). All three chats must contain the final assistant message in full — proving the `onDone` flush works.

If perf is still poor or messages missing, stop and debug — do not merge.

- [ ] **Step 6: Record results**

Append a short note to the end of this plan document (under a new `## Results` heading) with the before/after frame-drop count and any surprises. Then commit.

```bash
git add docs/superpowers/plans/2026-04-19-streaming-perf-background-persist.md
git commit -m "docs(chat): record streaming perf results"
```

---

## Task 10: Verification and cleanup

- [ ] **Step 1: Full test suite**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test`
Expected: all tests pass.

- [ ] **Step 2: Lint**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/PAGEs/chat/hooks/background_stream_persister.js src/PAGEs/chat/hooks/use_chat_stream.js src/PAGEs/chat/hooks/use_chat_session_state.js`
Expected: no errors.

- [ ] **Step 3: Impact verification**

Run `gitnexus_detect_changes({scope: "all"})` to confirm the changed symbols are only: `syncStreamMessages`, `appendSyntheticToolConfirmationDecision`, the onDone/onError/cancel handlers inside `runTurnRequest`, the chat-switch effect in `useChatSessionState`, and the three new modules/tests. If other files changed, investigate before merging.

- [ ] **Step 4: Commit any last fixes and push branch**

```bash
git status
git push -u origin HEAD
```
