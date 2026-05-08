# Streaming Frame-Path Render Coalesce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coalesce the 9 existing `syncStreamMessages` callsites in `onFrame` into a single microtask-batched `setMessages` per tick, eliminating the per-frame React commit that causes UI jank when multiple chats stream concurrently.

**Architecture:** The token path already uses rAF coalescing (`scheduleBufferedTokenFlush`), and the non-active-chat path already skips `setMessages` in favor of `scheduleBackgroundPersist` (which itself debounces to 2s). The remaining hot path is the active-chat frame branch in `syncStreamMessages` at `use_chat_stream.js:1089-1090`, which calls `setMessages` synchronously every time any of the 10 `syncStreamMessages` callers fires. We extract a tiny `createStreamFlushScheduler` module that tracks one pending microtask per active stream, then flush `setMessages` exactly once per tick with the freshest `streamMessages` reference. The closure variables (`streamMessages`, `activeStreamsRef` map entry) still update synchronously so subsequent frame handlers within the same tick observe the latest message list; only the React commit is deferred.

**Tech Stack:** React 19, `queueMicrotask`, JavaScript only (no TS), Jest with jsdom.

---

## Non-Goals

- Do **not** touch the token rAF flush (`scheduleBufferedTokenFlush`) — it already works and coalesces at 60fps.
- Do **not** change `scheduleBackgroundPersist` or the non-active branch — the 2s debounce is correct for background work.
- Do **not** add `React.memo` to `ChatBubble`, markdown, or trace-chain components in this plan — most already memo'd; verify in a follow-up if perf gap persists after frame coalesce lands.
- Do **not** change the 10 `syncStreamMessages` call sites — they stay identical; we only change what `syncStreamMessages` does internally.

## File Structure

**New files:**
- `src/PAGEs/chat/hooks/stream_flush_scheduler.js` — pure module, ~60 lines. Creates one scheduler instance per `startStream` invocation. Tracks a single `activeFlushScheduled` boolean and the latest `messages` reference. Exposes `commit(nextMessages)`, `flushSync()`, `cancel()`.
- `src/PAGEs/chat/hooks/stream_flush_scheduler.test.js` — Jest unit tests for the scheduler.

**Modified files:**
- `src/PAGEs/chat/hooks/use_chat_stream.js` — replace the body of `syncStreamMessages` (at line 1083-1095) so the active-chat branch schedules a microtask flush through the scheduler instead of calling `setMessages` directly. Add scheduler `flushSync` on stream-done, error, and cancel. Add `cancel` on chat-switch cleanup if any.

## How the scheduler behaves

```
commit(next):
  1. latestMessages = next            // synchronous — next frame handler sees fresh data
  2. if !scheduled: scheduled = true; queueMicrotask(flush)

flush:
  1. if !scheduled: return            // flushSync may have pre-empted
  2. scheduled = false
  3. onFlush(latestMessages)          // calls setMessages

flushSync():
  1. if !scheduled: return
  2. scheduled = false
  3. onFlush(latestMessages)          // the later queueMicrotask callback becomes a no-op

cancel():
  1. scheduled = false; latestMessages = null
```

This means N in-tick frame updates → 1 `setMessages`, and stream end always flushes whatever was buffered. The microtask fires *after* the current synchronous work but *before* any paint, so visual latency is imperceptible (sub-millisecond).

---

## Task 1: Create scheduler module with failing test

**Files:**
- Create: `src/PAGEs/chat/hooks/stream_flush_scheduler.js`
- Create: `src/PAGEs/chat/hooks/stream_flush_scheduler.test.js`

- [ ] **Step 1: Write the failing test file**

Create `src/PAGEs/chat/hooks/stream_flush_scheduler.test.js`:

```js
import { createStreamFlushScheduler } from "./stream_flush_scheduler";

describe("createStreamFlushScheduler", () => {
  test("coalesces N commits in same tick into 1 flush with latest messages", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "a" }]);
    scheduler.commit([{ id: "m1", content: "ab" }]);
    scheduler.commit([{ id: "m1", content: "abc" }]);

    expect(flushes).toHaveLength(0); // not yet flushed synchronously

    await Promise.resolve(); // let microtasks drain

    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toEqual([{ id: "m1", content: "abc" }]);
  });

  test("flushSync pre-empts the pending microtask and flushes immediately", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "hello" }]);
    scheduler.flushSync();

    expect(flushes).toEqual([[{ id: "m1", content: "hello" }]]);

    await Promise.resolve();
    expect(flushes).toHaveLength(1); // microtask callback became a no-op
  });

  test("flushSync with no pending commit is a no-op", () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.flushSync();
    expect(flushes).toHaveLength(0);
  });

  test("cancel drops the pending microtask", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1" }]);
    scheduler.cancel();

    await Promise.resolve();
    expect(flushes).toHaveLength(0);
  });

  test("commit after flushSync schedules a new microtask", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "a" }]);
    scheduler.flushSync();
    scheduler.commit([{ id: "m1", content: "b" }]);

    expect(flushes).toHaveLength(1);

    await Promise.resolve();
    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toEqual([{ id: "m1", content: "b" }]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest src/PAGEs/chat/hooks/stream_flush_scheduler.test.js`

Expected: FAIL with `Cannot find module './stream_flush_scheduler'`.

- [ ] **Step 3: Implement the scheduler module**

Create `src/PAGEs/chat/hooks/stream_flush_scheduler.js`:

```js
/**
 * Coalesces N same-tick message updates into 1 flush.
 * Closure-scoped: create one scheduler per active stream.
 *
 * commit(next) — store latest messages (sync) + schedule a microtask flush
 *   if none pending. Subsequent commits in the same tick overwrite
 *   latestMessages but do not schedule a second microtask.
 *
 * flushSync() — flush the pending commit immediately (if any). Used on
 *   stream end/cancel to ensure React state is up-to-date before cleanup.
 *
 * cancel() — drop any pending commit without flushing. Used when the
 *   stream is aborted and the buffered messages should be discarded.
 */
export const createStreamFlushScheduler = ({ onFlush }) => {
  let scheduled = false;
  let latestMessages = null;

  const flush = () => {
    if (!scheduled) return;
    scheduled = false;
    const toFlush = latestMessages;
    latestMessages = null;
    onFlush(toFlush);
  };

  return {
    commit(nextMessages) {
      latestMessages = nextMessages;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    },
    flushSync() {
      if (!scheduled) return;
      flush();
    },
    cancel() {
      scheduled = false;
      latestMessages = null;
    },
  };
};
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx jest src/PAGEs/chat/hooks/stream_flush_scheduler.test.js`

Expected: PASS, 5 tests.

- [ ] **Step 5: Stop — leave changes uncommitted**

Do not run git commit. User commits manually.

---

## Task 2: Wire scheduler into `syncStreamMessages` active-chat branch

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js` — add import at top, create scheduler per `startStream` invocation, change `syncStreamMessages` body to route through scheduler on the active-chat branch.

**Context:** `syncStreamMessages` is defined inside the `startStream` function closure, so the scheduler must also be created per call to `startStream`. That way each stream has its own buffer and the scheduler is garbage-collected when the stream ends.

- [ ] **Step 1: Add the scheduler import**

At the top of `src/PAGEs/chat/hooks/use_chat_stream.js`, alongside the other local hook imports (near the existing `background_stream_persister` import), add:

```js
import { createStreamFlushScheduler } from "./stream_flush_scheduler";
```

Verify the import is grouped with the other relative imports from the same directory (don't reorder unrelated imports).

- [ ] **Step 2: Create scheduler at top of each `startStream` body**

Locate the existing `let streamMessages = nextMessages;` line (currently around line 1082, just before the `syncStreamMessages` definition). Immediately above it, insert:

```js
      const activeFlushScheduler = createStreamFlushScheduler({
        onFlush: (nextStreamMessages) => {
          setMessages(nextStreamMessages);
        },
      });
```

The scheduler is block-scoped to this `startStream` closure — a new instance per stream invocation.

- [ ] **Step 3: Replace the `syncStreamMessages` body**

Replace the existing body (currently at `use_chat_stream.js:1083-1095`):

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

with:

```js
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamsRef.current.set(targetChatId, {
          messages: nextStreamMessages,
        });

        if (activeChatIdRef.current === targetChatId) {
          activeFlushScheduler.commit(nextStreamMessages);
          return;
        }

        scheduleBackgroundPersist(targetChatId, nextStreamMessages);
      };
```

Closure updates (`streamMessages` assignment + `activeStreamsRef.current.set`) remain **synchronous** so the next frame handler observes the freshest messages. Only the `setMessages` call is deferred by one microtask.

- [ ] **Step 4: Run the existing chat-stream tests**

Run: `npx jest src/PAGEs/chat/hooks/ --testPathIgnorePatterns=stream_flush_scheduler`

Expected: the pre-existing chat-stream tests continue to pass. If any test fails with a timing-sensitive assertion (e.g. expects `messages` to be updated synchronously after dispatching a frame), either (a) insert `await Promise.resolve()` before the assertion — the correct fix, because that is now the real-world behavior — or (b) flush via `activeFlushScheduler.flushSync()` if the test setup exposes it. Do not re-introduce synchronous `setMessages` in `syncStreamMessages`.

- [ ] **Step 5: Stop — leave changes uncommitted**

---

## Task 3: Flush scheduler on stream end, error, and cancel

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js` — add `activeFlushScheduler.flushSync()` in every branch where the stream terminates, so React state catches up before cleanup.

**Why:** The scheduler defers `setMessages` by one microtask. If a stream ends in the same tick as its last `syncStreamMessages` call (common for short streams or the `onDone` handler running synchronously after the final frame), cleanup code may read `messages` from a stale React render. A synchronous flush at termination guarantees consistency.

- [ ] **Step 1: Locate the existing stream-termination handlers**

Within `startStream`, find the handlers passed to `api.unchain.startStreamV2`:
- `onDone` (stream completed successfully)
- `onError` (stream failed)
- any local cancel/abort handler (e.g. triggered by `cancelStream` ref)
- `disposeBufferedTokenFlush()` call site — same function already exists at `use_chat_stream.js:1347-1352` for the token flush

Search: `grep -n "disposeBufferedTokenFlush\|onDone\|onError" src/PAGEs/chat/hooks/use_chat_stream.js` to find each termination point.

- [ ] **Step 2: Add `flushSync()` alongside existing token-flush cleanup**

At each point where `disposeBufferedTokenFlush()` is currently called (it is the token-flush cancel/dispose helper), add immediately before or after it:

```js
      activeFlushScheduler.flushSync();
```

The order is: flush token buffer first (may enqueue one more `syncStreamMessages` call which commits to scheduler), then flush the scheduler. Concretely:

```js
      flushBufferedTokenDelta(); // drains pending token delta → syncStreamMessages → scheduler.commit
      activeFlushScheduler.flushSync(); // now promote scheduler's microtask to sync
      disposeBufferedTokenFlush();
```

If the existing code calls `disposeBufferedTokenFlush()` without first calling `flushBufferedTokenDelta()` (i.e. cancel path that should *discard* the partial token), call `activeFlushScheduler.cancel()` instead of `flushSync()`:

```js
      disposeBufferedTokenFlush();
      activeFlushScheduler.cancel();
```

Match the cancel/flush choice to the existing token-flush semantics at each site: if tokens are flushed on exit, flush the scheduler; if tokens are discarded, cancel the scheduler.

- [ ] **Step 3: Verify by running the stream tests**

Run: `npx jest src/PAGEs/chat/hooks/ --testPathIgnorePatterns=stream_flush_scheduler`

Expected: PASS. If a test around cancel/error paths fails with a stale-messages assertion, it confirms the flush/cancel pairing is mis-matched at that site — re-read the corresponding handler to determine whether it should flush or discard.

- [ ] **Step 4: Stop — leave changes uncommitted**

---

## Task 4: Integration smoke test — frame-path coalesce in jsdom

**Files:**
- Create: `src/PAGEs/chat/hooks/use_chat_stream.frame_coalesce.test.js`

**Why:** Task 1 tests the scheduler in isolation. This task tests the wiring — that multiple frame-path `syncStreamMessages` calls within the same tick produce exactly one `setMessages` observation.

**Approach:** Instead of mounting the full hook (heavy), directly invoke `createStreamFlushScheduler` with a spy `onFlush` and drive it the way `syncStreamMessages` would. Verify the coalesce property by calling `commit` multiple times synchronously and asserting `onFlush` fires once.

If an integration test layer already exists for `use_chat_stream.js` that can drive mock frames end-to-end, prefer extending that. Search: `ls src/PAGEs/chat/hooks/*.test.js` — if `use_chat_stream.test.js` exists, add a frame-coalesce test there instead of a new file.

- [ ] **Step 1: Check for existing chat-stream integration tests**

Run: `ls src/PAGEs/chat/hooks/*.test.js`

If `use_chat_stream.test.js` exists: add tests there (Step 2a). Otherwise create a new file (Step 2b).

- [ ] **Step 2a (if use_chat_stream.test.js exists): Add a frame-coalesce test**

Append the following test to the existing `use_chat_stream.test.js`:

```js
describe("frame-path render coalesce", () => {
  test("10 syncStreamMessages calls in same tick result in 1 setMessages", async () => {
    // Use the existing harness that renders the hook and dispatches frames.
    // Drive the hook to an active stream for chatId "c1", then dispatch 10
    // synthetic frames in the same tick (no awaits between them).
    //
    // Assert: setMessages spy called exactly once after `await Promise.resolve()`.
    //
    // See existing test setup in this file for how to mount the hook and
    // inject mock frames via the mocked `api.unchain.startStreamV2`.
    //
    // If the existing harness cannot drive multiple frames without awaits,
    // fall back to Step 2b (create standalone scheduler-wiring test).
  });
});
```

Fill in the body using the existing test harness patterns already in the file. The assertion is: `setMessages` (or its spy) is called exactly 1 time, with the final `messages` array, after a single `await Promise.resolve()`.

- [ ] **Step 2b (if no existing integration test): Create scheduler-wiring test**

Create `src/PAGEs/chat/hooks/use_chat_stream.frame_coalesce.test.js`:

```js
/**
 * Verifies that the scheduler pattern used inside syncStreamMessages
 * coalesces N same-tick updates into 1 downstream call.
 *
 * This is a wiring smoke test that mirrors how use_chat_stream.js uses
 * the scheduler, without mounting the full hook.
 */
import { createStreamFlushScheduler } from "./stream_flush_scheduler";

describe("use_chat_stream frame-path coalesce wiring", () => {
  test("simulated onFrame burst: 10 commits in same tick → 1 setMessages", async () => {
    const setMessagesCalls = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => setMessagesCalls.push(messages),
    });

    // simulate 10 onFrame handlers each calling syncStreamMessages
    for (let i = 0; i < 10; i += 1) {
      const nextMessages = [{ id: "m1", content: `step ${i}` }];
      scheduler.commit(nextMessages);
    }

    expect(setMessagesCalls).toHaveLength(0);

    await Promise.resolve();

    expect(setMessagesCalls).toHaveLength(1);
    expect(setMessagesCalls[0]).toEqual([{ id: "m1", content: "step 9" }]);
  });

  test("commits across 3 ticks → 3 setMessages (one per tick)", async () => {
    const setMessagesCalls = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => setMessagesCalls.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "a" }]);
    await Promise.resolve();
    scheduler.commit([{ id: "m1", content: "ab" }]);
    await Promise.resolve();
    scheduler.commit([{ id: "m1", content: "abc" }]);
    await Promise.resolve();

    expect(setMessagesCalls).toHaveLength(3);
    expect(setMessagesCalls.map((m) => m[0].content)).toEqual([
      "a",
      "ab",
      "abc",
    ]);
  });

  test("terminal flushSync after burst emits last messages synchronously", () => {
    const setMessagesCalls = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => setMessagesCalls.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "partial" }]);
    scheduler.commit([{ id: "m1", content: "final" }]);
    scheduler.flushSync();

    expect(setMessagesCalls).toEqual([[{ id: "m1", content: "final" }]]);
  });
});
```

- [ ] **Step 3: Run the new test**

Run: `npx jest src/PAGEs/chat/hooks/use_chat_stream.frame_coalesce.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 4: Stop — leave changes uncommitted**

---

## Task 5: Full suite regression check

**Files:** no changes — this is a verification task.

- [ ] **Step 1: Run the full Jest suite**

Run: `npx jest`

Expected: All tests pass except pre-existing failures already documented in prior sessions (App.test, toolkit_card, settings_modal, token_usage, memory/index `Cannot destructure property 'locale' of useContext` and chat_bubble/trace_chain/miso_stream_client). No *new* failures introduced by this plan's changes.

If any new failure appears in a file touched by this plan (`use_chat_stream.js`, the two new test files), investigate before proceeding. If a new failure appears in an *unrelated* file, run `git stash && npx jest <that file> && git stash pop` to confirm it is pre-existing.

- [ ] **Step 2: Run lint on the modified files**

Run: `npx eslint src/PAGEs/chat/hooks/stream_flush_scheduler.js src/PAGEs/chat/hooks/stream_flush_scheduler.test.js src/PAGEs/chat/hooks/use_chat_stream.js`

Expected: no new lint errors. If the repo has no eslint config, skip this step.

- [ ] **Step 3: Stop — leave changes uncommitted**

---

## Task 6: Manual perf verification

**Files:** no changes — manual test.

**Goal:** Confirm that the intervention reduces main-thread Scripting time and improves INP during concurrent multi-chat streaming.

- [ ] **Step 1: Start the dev environment**

Run: `npm start`

Wait for the Electron window to open and the React dev server to be ready.

- [ ] **Step 2: Set up a multi-chat streaming scenario**

1. Create 2-3 chats in different contexts.
2. In each, start a prompt that will produce a long response with visible agent activity (tool calls, reasoning — use a model/toolkit combo that produces many `trace_frame` / `tool_call` frames).
3. Start all 2-3 streams within a few seconds of each other so they overlap.

- [ ] **Step 3: Record a DevTools Performance profile**

1. Open DevTools → Performance tab.
2. Start recording just before sending the last prompt.
3. While the streams overlap, click around the side-menu explorer and scroll the chat view.
4. Stop recording after ~10 seconds of overlapping streams.

- [ ] **Step 4: Read the profile**

In the Summary:
- **Scripting** should be substantially lower than a pre-change baseline (if available). The specific absolute number depends on model/toolkit — relative is what matters.
- **Long tasks** (>50ms) in the main thread should be fewer and shorter.
- **INP** measured during the interaction should be under 200ms.
- **Framerate** of the scroll/click interactions should stay around 60fps.

In the flame chart:
- Look for `setMessages` / React commit spikes. Before this plan, you would see one per frame; after, you should see at most one per tick (tick ≈ per-SSE-message).

If perf does *not* improve measurably, the bottleneck is elsewhere (likely `ChatBubble` / markdown re-parse cost per `setMessages`). In that case, stop and discuss with the user before proceeding to memoization changes (out of scope for this plan).

- [ ] **Step 5: Stop — leave changes uncommitted**

---

## Rollback

If the change causes observable regressions (stale UI, crashes, tests that cannot be adjusted sensibly), revert by replacing `syncStreamMessages`'s active branch back to:

```js
        if (activeChatIdRef.current === targetChatId) {
          setMessages(nextStreamMessages);
          return;
        }
```

and deleting the `activeFlushScheduler` instance + the two new files. The scheduler module is fully additive — no deletion required outside `use_chat_stream.js`.

## Success Criteria

1. `createStreamFlushScheduler` unit tests pass (5 tests).
2. Frame-coalesce wiring tests pass (3 tests).
3. Full Jest suite has no new failures vs. pre-change baseline.
4. Manual profile confirms fewer/shorter long tasks and improved interaction responsiveness during concurrent multi-chat streaming.
