# Chat Switch Lazy Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat switch feel instant by (A) rendering only the last 3 messages on switch and expanding to 12 during idle, and (B) deferring `TraceChain` mount behind a lightweight placeholder.

**Architecture:** Two independent optimisations layered over the existing `ChatMessages` windowing and per-bubble `TraceChain` render.
- Plan A lives in `use_message_window_scroll.js` — on chat switch, the initial visible window shrinks to `boot_visible_count` (default 3), then expands to `initial_visible_count` (12) via `requestIdleCallback`.
- Plan B introduces a `LazyTraceChain` wrapper that renders a compact placeholder synchronously and swaps in the real `TraceChain` during idle. Streaming bubbles bypass the wrapper to avoid flicker while live frames arrive.

**Tech Stack:** React 19, Jest + React Testing Library, no new dependencies.

---

### Task 1: LazyTraceChain module (placeholder + idle mount)

**Files:**
- Create: `src/COMPONENTs/chat-bubble/lazy_trace_chain.js`
- Test: `src/COMPONENTs/chat-bubble/lazy_trace_chain.test.js`

- [ ] **Step 1: Write the failing tests**

Write `src/COMPONENTs/chat-bubble/lazy_trace_chain.test.js`:

```js
import React from "react";
import { act, render, screen } from "@testing-library/react";
import LazyTraceChain from "./lazy_trace_chain";

jest.mock("./trace_chain", () => ({
  __esModule: true,
  default: ({ frames = [], status = "done" }) => (
    <div data-testid="real-trace-chain">
      real:{frames.length}:{status}
    </div>
  ),
}));

describe("LazyTraceChain", () => {
  const originalIdle = window.requestIdleCallback;
  const originalCancel = window.cancelIdleCallback;
  let idleQueue;

  beforeEach(() => {
    idleQueue = [];
    window.requestIdleCallback = (cb) => {
      idleQueue.push(cb);
      return idleQueue.length;
    };
    window.cancelIdleCallback = () => {};
  });

  afterEach(() => {
    window.requestIdleCallback = originalIdle;
    window.cancelIdleCallback = originalCancel;
  });

  test("renders placeholder before idle and real TraceChain after idle", () => {
    render(<LazyTraceChain frames={[{ seq: 1, type: "tool_call" }]} status="done" />);
    expect(screen.getByTestId("lazy-trace-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("real-trace-chain")).toBeNull();

    act(() => {
      idleQueue.forEach((cb) => cb());
    });

    expect(screen.getByTestId("real-trace-chain")).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-trace-placeholder")).toBeNull();
  });

  test("skips lazy gating during streaming — mounts real TraceChain immediately", () => {
    render(<LazyTraceChain frames={[]} status="streaming" />);
    expect(screen.getByTestId("real-trace-chain")).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-trace-placeholder")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `CI=true npm test -- --testPathPattern=lazy_trace_chain.test.js`
Expected: FAIL with "Cannot find module './lazy_trace_chain'".

- [ ] **Step 3: Implement LazyTraceChain**

Write `src/COMPONENTs/chat-bubble/lazy_trace_chain.js`:

```js
import { memo, useEffect, useState } from "react";
import TraceChain from "./trace_chain";

const TracePlaceholder = () => (
  <div
    data-testid="lazy-trace-placeholder"
    style={{
      minHeight: 24,
      padding: "4px 0",
      fontSize: 12,
      opacity: 0.35,
      userSelect: "none",
    }}
  />
);

const LazyTraceChain = (props) => {
  const isStreaming = props?.status === "streaming";
  const [mounted, setMounted] = useState(isStreaming);

  useEffect(() => {
    if (mounted) {
      return undefined;
    }
    if (typeof window === "undefined") {
      setMounted(true);
      return undefined;
    }

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setMounted(true), {
        timeout: 200,
      });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(id);
        }
      };
    }

    const timerId = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timerId);
  }, [mounted]);

  useEffect(() => {
    if (isStreaming && !mounted) {
      setMounted(true);
    }
  }, [isStreaming, mounted]);

  if (!mounted) {
    return <TracePlaceholder />;
  }

  return <TraceChain {...props} />;
};

export default memo(LazyTraceChain);
```

- [ ] **Step 4: Run tests and confirm pass**

Run: `CI=true npm test -- --testPathPattern=lazy_trace_chain.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/chat-bubble/lazy_trace_chain.js src/COMPONENTs/chat-bubble/lazy_trace_chain.test.js
git commit -m "feat(chat-bubble): add LazyTraceChain placeholder wrapper"
```

---

### Task 2: Wire LazyTraceChain into ChatBubble

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/chat_bubble.js` (both `<TraceChain>` sites and import)
- Modify: `src/COMPONENTs/chat-bubble/character_chat_bubble.js` (mirror change if it also mounts TraceChain)
- Test: extend `src/COMPONENTs/chat-bubble/chat_bubble.test.js`

- [ ] **Step 1: Confirm character_chat_bubble usage**

Run: `CI=true grep -n "TraceChain" src/COMPONENTs/chat-bubble/character_chat_bubble.js || true`
If it imports `TraceChain`, change the same two lines. If not, skip the character file.

- [ ] **Step 2: Write the failing test addition**

Append to `src/COMPONENTs/chat-bubble/chat_bubble.test.js`:

```js
describe("ChatBubble lazy trace chain", () => {
  test("assistant bubble with tool_call frames renders lazy placeholder first", () => {
    const originalIdle = window.requestIdleCallback;
    window.requestIdleCallback = () => 1;
    try {
      const { container } = render(
        <ConfigContext.Provider
          value={{
            theme: { color: "#222", font: { fontFamily: "sans-serif" } },
            onThemeMode: "light_mode",
          }}
        >
          <ChatBubble
            message={{
              id: "assistant-1",
              role: "assistant",
              content: "done",
              status: "done",
              traceFrames: [
                { seq: 1, type: "tool_call", payload: { tool_name: "fs_read" } },
              ],
            }}
            traceFrames={[
              { seq: 1, type: "tool_call", payload: { tool_name: "fs_read" } },
            ]}
          />
        </ConfigContext.Provider>,
      );
      expect(
        container.querySelector('[data-testid="lazy-trace-placeholder"]'),
      ).not.toBeNull();
    } finally {
      window.requestIdleCallback = originalIdle;
    }
  });
});
```

- [ ] **Step 3: Run test and confirm failure**

Run: `CI=true npm test -- --testPathPattern=chat_bubble.test.js`
Expected: FAIL — placeholder not found (real TraceChain still used).

- [ ] **Step 4: Swap TraceChain import for LazyTraceChain in chat_bubble.js**

In `src/COMPONENTs/chat-bubble/chat_bubble.js`, replace line 3:

```js
import TraceChain from "./trace_chain";
```

with:

```js
import TraceChain from "./lazy_trace_chain";
```

Leave the two JSX call sites as `<TraceChain ... />` — they now reference the lazy wrapper.

- [ ] **Step 5: Mirror change in character_chat_bubble.js (only if Step 1 found usage)**

Same single-line swap.

- [ ] **Step 6: Run the full chat-bubble test file**

Run: `CI=true npm test -- --testPathPattern=chat-bubble`
Expected: all existing tests still pass, new test passes.

- [ ] **Step 7: Commit**

```bash
git add src/COMPONENTs/chat-bubble/chat_bubble.js src/COMPONENTs/chat-bubble/chat_bubble.test.js src/COMPONENTs/chat-bubble/character_chat_bubble.js
git commit -m "refactor(chat-bubble): route TraceChain through lazy wrapper"
```

---

### Task 3: Two-stage visible window in scroll hook

**Files:**
- Modify: `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js`
- Test: `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js` (create if missing; append new tests otherwise)

- [ ] **Step 1: Check for existing test file**

Run: `CI=true test -f src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js && echo exists || echo missing`
If `missing`, create from scratch in Step 2. If `exists`, append the new describe block to the existing file.

- [ ] **Step 2: Write the failing tests**

Test file content (create or append the `describe("boot visible window", ...)` block):

```js
import { act, renderHook } from "@testing-library/react";
import useMessageWindowScroll from "./use_message_window_scroll";

const makeMessages = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `m-${i}`, role: "user", content: `${i}` }));

describe("boot visible window", () => {
  const originalIdle = window.requestIdleCallback;
  const originalCancel = window.cancelIdleCallback;
  let idleQueue;

  beforeEach(() => {
    idleQueue = [];
    window.requestIdleCallback = (cb) => {
      idleQueue.push(cb);
      return idleQueue.length;
    };
    window.cancelIdleCallback = () => {};
  });

  afterEach(() => {
    window.requestIdleCallback = originalIdle;
    window.cancelIdleCallback = originalCancel;
  });

  test("on chat switch, starts with boot_visible_count and expands to initial_visible_count via idle", () => {
    const messages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ chat_id }) =>
        useMessageWindowScroll({
          chat_id,
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
          boot_visible_count: 3,
        }),
      { initialProps: { chat_id: "a" } },
    );

    // Simulate switch to a different chat_id — triggers switch effect
    rerender({ chat_id: "b" });

    // Immediately after switch, only boot_visible_count visible
    expect(result.current.visibleMessages.length).toBe(3);

    // Drain idle queue — should expand to initial_visible_count
    act(() => {
      idleQueue.forEach((cb) => cb());
    });

    expect(result.current.visibleMessages.length).toBe(12);
  });

  test("defaults boot_visible_count to initial_visible_count when unset (backward compatible)", () => {
    const messages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ chat_id }) =>
        useMessageWindowScroll({
          chat_id,
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
        }),
      { initialProps: { chat_id: "a" } },
    );

    rerender({ chat_id: "b" });
    expect(result.current.visibleMessages.length).toBe(12);
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `CI=true npm test -- --testPathPattern=use_message_window_scroll`
Expected: FAIL — first test expects 3 but gets 12 (or hook rejects the new param).

- [ ] **Step 4: Update the hook to accept boot_visible_count + idle expand**

In `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js`:

Add `boot_visible_count` to the destructured props:

```js
export const useMessageWindowScroll = ({
  chat_id,
  messages,
  is_streaming,
  initial_visible_count,
  load_batch_size,
  top_load_threshold,
  boot_visible_count,
}) => {
```

Compute the effective boot count near the top of the hook body (after existing state declarations):

```js
  const effectiveBootCount =
    typeof boot_visible_count === "number" && boot_visible_count > 0
      ? Math.min(boot_visible_count, initial_visible_count)
      : initial_visible_count;
```

Replace the switch effect (currently lines 210-223) with:

```js
  useEffect(() => {
    if (activeChatIdRef.current === chat_id) {
      return undefined;
    }

    activeChatIdRef.current = chat_id;
    lastScrollTopRef.current = 0;
    const bootStart = Math.max(0, messages.length - effectiveBootCount);
    visibleStartRef.current = bootStart;
    setVisibleStartIndex(bootStart);
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";

    if (effectiveBootCount >= initial_visible_count) {
      return undefined;
    }

    const expandTarget = Math.max(0, messages.length - initial_visible_count);
    if (expandTarget >= bootStart) {
      return undefined;
    }

    const runExpand = () => {
      visibleStartRef.current = expandTarget;
      setVisibleStartIndex((prev) => Math.min(prev, expandTarget));
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      const id = window.requestIdleCallback(runExpand, { timeout: 240 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(id);
        }
      };
    }

    const timerId = setTimeout(runExpand, 0);
    return () => clearTimeout(timerId);
  }, [chat_id, effectiveBootCount, initial_visible_count, messages.length]);
```

- [ ] **Step 5: Run tests and confirm pass**

Run: `CI=true npm test -- --testPathPattern=use_message_window_scroll`
Expected: both new tests pass, no regression elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js
git commit -m "feat(chat-messages): boot-window rendering with idle expand on switch"
```

---

### Task 4: Wire boot_visible_count into ChatMessages

**Files:**
- Modify: `src/COMPONENTs/chat-messages/chat_messages.js`

- [ ] **Step 1: Add prop with default**

In `src/COMPONENTs/chat-messages/chat_messages.js` line 28 area, extend the destructured props:

```js
  initialVisibleCount = 12,
  bootVisibleCount = 3,
  loadBatchSize = 6,
  topLoadThreshold = 80,
```

- [ ] **Step 2: Pass through to the hook**

In the `useMessageWindowScroll` call (line 45-52), add the new parameter:

```js
  } = useMessageWindowScroll({
    chat_id: chatId,
    messages,
    is_streaming: isStreaming,
    initial_visible_count: initialVisibleCount,
    load_batch_size: loadBatchSize,
    top_load_threshold: topLoadThreshold,
    boot_visible_count: bootVisibleCount,
  });
```

- [ ] **Step 3: Run the chat-messages test suite**

Run: `CI=true npm test -- --testPathPattern=chat-messages`
Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/chat-messages/chat_messages.js
git commit -m "feat(chat-messages): expose bootVisibleCount prop with default 3"
```

---

### Task 5: Full verification + manual switch smoke test

**Files:**
- None (verification only)

- [ ] **Step 1: Run the whole chat-related test surface**

Run: `CI=true npm test -- --testPathPattern="(chat-bubble|chat-messages|PAGEs/chat)"`
Expected: all green. Note any failures that were pre-existing (compare against `git stash` or a known baseline).

- [ ] **Step 2: Run lint**

Run: `npx eslint src/COMPONENTs/chat-bubble/lazy_trace_chain.js src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js src/COMPONENTs/chat-messages/chat_messages.js src/COMPONENTs/chat-bubble/chat_bubble.js`
Expected: no warnings or errors.

- [ ] **Step 3: GitNexus impact check**

Run: `gitnexus_detect_changes({scope: "staged"})` via the MCP tool. Confirm changes are scoped to the chat-bubble and chat-messages clusters.

- [ ] **Step 4: Manual smoke test**

1. `npm start`
2. Open two chats, each with at least 5 assistant messages that contain tool calls / trace frames.
3. Switch rapidly between them. Observe:
   - The first 3 messages should appear instantly.
   - Trace chains should appear as greyed placeholders briefly, then resolve to full timelines within ~200ms.
   - Scrolling up beyond the first 3 should still auto-load older messages via existing scroll behaviour.
4. Compare perceived latency to `git stash` of the changes, if needed.

- [ ] **Step 5: Commit any tweaks from manual testing**

Only if Step 4 surfaces a real issue. Otherwise, nothing to commit.

---

## Self-Review

**Spec coverage:**
- Plan A (boot window + idle expand) → Tasks 3 & 4 ✓
- Plan B (LazyTraceChain placeholder + idle swap, streaming bypass) → Tasks 1 & 2 ✓
- Verification path → Task 5 ✓

**Placeholder scan:** None — every step includes concrete code, exact file paths, exact commands.

**Type/naming consistency:**
- Hook uses snake_case for props (`boot_visible_count`, matching existing `initial_visible_count`). ✓
- Component uses camelCase for props (`bootVisibleCount`, matching existing `initialVisibleCount`). ✓
- LazyTraceChain forwards `status` as a string — matches TraceChain's signature. ✓
- Test mocks match the module path `./trace_chain` used in the real import. ✓

**Known edge:** If `initial_visible_count` is smaller than `boot_visible_count` (e.g. a short chat with 2 messages), the hook clamps effective boot count to `initial_visible_count`, which keeps the invariant that we never render more than the caller asked for.
