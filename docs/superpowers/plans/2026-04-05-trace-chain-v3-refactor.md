# Trace Chain V3 Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the SSE streaming protocol and trace chain frontend to fix subagent routing, merge response/interaction into step blocks, add conditional branch merge, deduplicate errors, and polish animations.

**Architecture:** Slim backend frame envelope (remove unused fields), rewrite trace_chain.js rendering to a unified StepNode model where tool calls + response content + interactions live in a single block, enhance BranchGraph with conditional merge visibility and main-timeline pausing, fix error deduplication at the source.

**Tech Stack:** Python Flask (backend SSE), React 19 (frontend), Electron IPC (bridge), Jest (tests)

---

## Current State Analysis

### Backend Frame Envelope (route_chat.py:112-131)

```json
{
  "seq": 1,
  "ts": 1712345678000,
  "thread_id": "thread-...",
  "run_id": "...",
  "iteration": 0,
  "stage": "tool",
  "type": "tool_call",
  "payload": { ... }
}
```

**Unused fields by frontend:**
- `stage` — never referenced in trace_chain.js or use_chat_stream.js (derivable from `type`)
- `iteration` — never used for rendering decisions
- `thread_id` — only needed once on `stream_started` for persistence, redundant on every frame

### Frontend Bugs Identified

| Bug | Location | Root Cause |
|-----|----------|------------|
| Duplicate errors | trace_chain.js error rendering + message bubble | Error shown in both trace timeline AND message status |
| Response in wrong block | trace_chain.js:1404-1426 | `final_message` rendered as standalone item instead of inside preceding tool_call |
| ask_user unstable | trace_chain.js:1289-1367 + use_chat_stream.js | Complex confirmation state machine with race conditions |
| Selection not persisted | interact_wrapper.js | Disabled state doesn't show selected value |
| Subagent merge always visible | branch_graph.js:317-331 | MergeCurve rendered unconditionally |
| Spinner on main timeline | trace_chain.js:1454-1461 | Streaming indicator on main even during subagent |

### Target Rendering Model

```
StepNode (unified):
┌─────────────────────────────────────┐
│ [tag] tool_name        [detail ▼]   │  title row
│ response content (0.45 opacity)     │  merged final_message
│ ┌─────────────────────────────────┐ │
│ │ [select UI / approve buttons]   │ │  interaction (if applicable)
│ │ ✓ Selected: option_a (greyed)   │ │  persisted after submit
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

BranchNode (during run):
  main ── fork ──┐
                  │ sub-timeline [spinner]
                  │   step A
                  │   step B ...
  (main paused)  │

BranchNode (after done):
  main ── fork ──┐
                  │ sub-timeline
                  │   step A ✓
                  │   step B ✓
  main ── merge ─┘
  next step continues...
```

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `unchain_runtime/server/route_chat.py` | Modify:112-131 | Slim frame envelope |
| `electron/preload/stream/unchain_stream_client.js` | Modify:~100 | Read thread_id from payload |
| `src/COMPONENTs/chat-bubble/trace_chain.js` | Rewrite:812-1533 | Unified rendering model |
| `src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js` | Modify:256-334 | Conditional merge, animations |
| `src/COMPONENTs/chat-bubble/interact/interact_wrapper.js` | Modify:41-134 | Persisted selection display |
| `src/COMPONENTs/chat-bubble/trace_chain.test.js` | Modify | Updated tests |

---

## Task 1: Slim Backend Frame Envelope

**Files:**
- Modify: `unchain_runtime/server/route_chat.py:112-131`
- Modify: `unchain_runtime/server/route_chat.py:423-437` (stream_started payload)
- Modify: `electron/preload/stream/unchain_stream_client.js:~95-105`
- Test: `unchain_runtime/server/route_chat.py` (manual SSE test)

- [ ] **Step 1: Update `_build_trace_frame` to remove `stage`, `iteration`, `thread_id`**

In `unchain_runtime/server/route_chat.py`, replace the frame builder:

```python
def _build_trace_frame(
    *,
    seq: int,
    event_type: str,
    payload: Dict[str, object],
    run_id: str = "",
    timestamp_ms: int | None = None,
) -> Dict[str, object]:
    return {
        "seq": seq,
        "ts": timestamp_ms if isinstance(timestamp_ms, int) else int(time.time() * 1000),
        "run_id": run_id,
        "type": event_type,
        "payload": payload,
    }
```

- [ ] **Step 2: Move `thread_id` into `stream_started` payload**

In the `stream_events()` generator (~line 423), update the stream_started emission:

```python
seq += 1
yield _sse_event(
    "frame",
    _build_trace_frame(
        seq=seq,
        event_type="stream_started",
        payload={
            "model": root.get_model_name(options),
            "started_at": started_at,
            "trace_level": trace_level,
            "thread_id": thread_id,
        },
        timestamp_ms=started_at,
    ),
)
```

- [ ] **Step 3: Update all `_build_trace_frame` call sites to remove `thread_id` and `iteration` params**

In `stream_events()`, the main loop (~line 491-503):

```python
seq += 1
yield _sse_event(
    "frame",
    _build_trace_frame(
        seq=seq,
        event_type=event_type,
        payload=sanitized_payload,
        run_id=normalized_run_id,
        timestamp_ms=event_ts_ms,
    ),
)
```

The done frame (~line 505-520):

```python
seq += 1
finished_at = int(time.time() * 1000)
done_payload: Dict[str, object] = {"finished_at": finished_at}
if isinstance(final_bundle, dict) and final_bundle:
    done_payload["bundle"] = final_bundle
yield _sse_event(
    "frame",
    _build_trace_frame(
        seq=seq,
        event_type="done",
        payload=done_payload,
        timestamp_ms=finished_at,
    ),
)
```

The error frame (~line 527-542):

```python
seq += 1
error_ts = int(time.time() * 1000)
yield _sse_event(
    "frame",
    _build_trace_frame(
        seq=seq,
        event_type="error",
        payload={
            "code": code,
            "message": normalized_message,
        },
        timestamp_ms=error_ts,
    ),
)
```

- [ ] **Step 4: Remove unused variables**

Remove `last_iteration` variable and the `normalized_iteration` / `last_iteration` assignment from the loop body (lines ~481-484). These are no longer needed since `iteration` is removed from the frame.

Also remove the `_trace_stage` function and `_TRACE_STAGE_BY_EVENT_TYPE` dict (lines 14-36, 59-60) since `stage` is removed.

- [ ] **Step 5: Update preload stream client to read `thread_id` from payload**

In `electron/preload/stream/unchain_stream_client.js`, in the `registerMisoStreamV2Listener` function, update the `stream_started` handler:

```javascript
if (frameType === "stream_started") {
  if (typeof handlers.onMeta === "function") {
    handlers.onMeta({
      thread_id: data.payload?.thread_id,
      model: data.payload?.model,
      ...data.payload,
    });
  }
  return;
}
```

The change: `data.thread_id` → `data.payload?.thread_id`. The `...data.payload` spread already includes it, but the explicit field ensures backward compatibility.

- [ ] **Step 6: Verify SSE output manually**

Run: `cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && python main.py`

Send a test request to `/chat/stream/v2` and verify:
- Frames no longer contain `stage`, `iteration`, or `thread_id` (except `stream_started.payload.thread_id`)
- `seq`, `ts`, `run_id`, `type`, `payload` are present
- Expected: all frames have 5 fields instead of 8

- [ ] **Step 7: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/route_chat.py electron/preload/stream/unchain_stream_client.js
git commit -m "refactor(stream): slim frame envelope — remove stage, iteration, move thread_id to payload"
```

---

## Task 2: Merge Response Content into Step Blocks

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/trace_chain.js:812-1428`
- Test: `src/COMPONENTs/chat-bubble/trace_chain.test.js`

The key change: when building `timelineItems`, associate each `final_message` frame with the PRECEDING `tool_call` item instead of creating a standalone "Response" item. Display the response content as low-opacity text below the tool tag.

- [ ] **Step 1: Write test for response-in-step rendering**

Add to `src/COMPONENTs/chat-bubble/trace_chain.test.js`:

```javascript
import { render, screen } from "@testing-library/react";
import TraceChain from "./trace_chain";
import { ConfigContext } from "../../CONTAINERs/config/context";

const mockConfig = {
  theme: { color: "#222" },
  onThemeMode: "light_mode",
};

const wrap = (ui) => (
  <ConfigContext.Provider value={mockConfig}>{ui}</ConfigContext.Provider>
);

describe("TraceChain — response merged into step", () => {
  it("does NOT create a standalone Response item when final_message follows a tool_call", () => {
    const frames = [
      { seq: 1, ts: 1000, type: "stream_started", payload: {} },
      {
        seq: 2,
        ts: 1100,
        type: "tool_call",
        run_id: "r1",
        payload: {
          call_id: "c1",
          tool_name: "read_file",
          tool_display_name: "Read File",
          arguments: { path: "/tmp/test" },
        },
      },
      {
        seq: 3,
        ts: 1200,
        type: "tool_result",
        run_id: "r1",
        payload: { call_id: "c1", result: { output: "file content" } },
      },
      {
        seq: 4,
        ts: 1300,
        type: "final_message",
        run_id: "r1",
        payload: { content: "I found the file." },
      },
      {
        seq: 5,
        ts: 1400,
        type: "tool_call",
        run_id: "r1",
        payload: {
          call_id: "c2",
          tool_name: "write_file",
          tool_display_name: "Write File",
          arguments: { path: "/tmp/out" },
        },
      },
      { seq: 6, ts: 1500, type: "done", payload: { finished_at: 1500 } },
    ];

    const { container } = render(
      wrap(
        <TraceChain
          frames={frames}
          status="done"
          bundle={{ consumed_tokens: 100, input_tokens: 60, output_tokens: 40 }}
          bubbleOwnsFinalMessage={false}
        />,
      ),
    );

    // The intermediate response "I found the file." should appear as
    // low-opacity text inside the Read File step, NOT as a standalone node
    const responseText = screen.queryByText("I found the file.");
    expect(responseText).toBeInTheDocument();

    // Verify it's styled with low opacity (merged into step)
    const style = responseText.closest("[data-step-response]")?.style;
    expect(style?.opacity).toBeTruthy();

    // There should be NO standalone "Response" title
    const responseTitles = container.querySelectorAll("[data-timeline-title]");
    const standaloneResponse = Array.from(responseTitles).find(
      (el) => el.textContent === "Response",
    );
    expect(standaloneResponse).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: FAIL — response is currently rendered as standalone "Response" item

- [ ] **Step 3: Implement response-in-step merging**

In `trace_chain.js`, modify the `timelineItems` useMemo (line 812+). The strategy: build a `responseContentByPrecedingCallId` map, then attach response content to tool_call items instead of creating standalone items.

Replace the section starting at line 812 with this logic:

```javascript
const timelineItems = useMemo(() => {
    const items = [];
    const renderedCallIds = new Set();
    const usedRunIds = new Set();
    let prevTs = startFrame?.ts ?? null;

    /* ── pre-pass: associate final_message content with preceding tool_call ── */
    const responseForPrecedingStep = new Map();
    let lastToolCallSeq = null;
    for (const frame of displayFrames) {
      if (frame.type === "tool_call") {
        lastToolCallSeq = frame.seq;
      } else if (frame.type === "final_message" && lastToolCallSeq != null) {
        const content =
          typeof frame.payload?.content === "string"
            ? frame.payload.content.trim()
            : "";
        if (content) {
          const prev = responseForPrecedingStep.get(lastToolCallSeq) || "";
          responseForPrecedingStep.set(
            lastToolCallSeq,
            prev ? `${prev}\n\n${content}` : content,
          );
        }
      }
    }

    for (const frame of displayFrames) {
      const delta =
        prevTs != null && frame.ts != null ? frame.ts - prevTs : null;
      if (frame.ts != null) prevTs = frame.ts;
      const spanText =
        delta != null && delta > 0 ? `+${formatDelta(delta)}` : null;

      /* ── reasoning / observation — unchanged ── */
      if (frame.type === "reasoning" || frame.type === "observation") {
        const text = extractText(frame.payload);
        const isObs = frame.type === "observation";
        items.push({
          key: `${frame.seq}-${frame.type}`,
          title: isObs ? "Observation" : "Reasoning",
          span: spanText,
          status: "done",
          body: !isObs && text ? text : undefined,
          details:
            isObs && text ? (
              <SeamlessMarkdown
                content={text}
                status="done"
                fontSize={12}
                lineHeight={1.65}
                style={{
                  ...TRACE_DETAIL_MARKDOWN_STYLE,
                  color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
                }}
              />
            ) : undefined,
        });
      } else if (frame.type === "tool_call") {
        /* ... (existing tool_call logic — see Step 4 for the merged response part) ... */
```

- [ ] **Step 4: Add merged response content to tool_call items**

Inside the `tool_call` branch of the loop, after building `interactBody` and before `items.push(...)`, add the merged response content:

```javascript
        /* ── merged response content from following final_message ── */
        const mergedResponseContent = responseForPrecedingStep.get(frame.seq) || "";

        items.push({
          key: `${frame.seq}-tool`,
          title: <ToolTag name={toolName} isDark={isDark} compact={compact} />,
          span: spanText,
          status: toolStatus,
          point: toolPointEl,
          body: (
            <>
              {mergedResponseContent ? (
                <div
                  data-step-response="true"
                  style={{
                    marginTop: 4,
                    fontSize: compact ? 11 : 12.5,
                    lineHeight: compact ? 1.45 : 1.55,
                    color: isDark
                      ? "rgba(255,255,255,0.45)"
                      : "rgba(0,0,0,0.4)",
                    opacity: 0.85,
                    fontFamily: "inherit",
                  }}
                >
                  <SeamlessMarkdown
                    content={mergedResponseContent}
                    status="done"
                    fontSize={compact ? 11 : 12.5}
                    lineHeight={compact ? 1.45 : 1.55}
                  />
                </div>
              ) : null}
              {interactBody}
            </>
          ),
          details:
            sections.length > 0 ? (
              <KVPanel sections={sections} isDark={isDark} color={color} />
            ) : undefined,
          _toolName: isInlineInteraction ? undefined : toolName,
          _sections: isInlineInteraction ? undefined : sections,
        });
```

- [ ] **Step 5: Skip standalone rendering of associated final_messages**

Replace the `final_message` branch of the loop (lines 1404-1427). Only render as standalone if the final_message is NOT associated with a preceding tool_call:

```javascript
      } else if (frame.type === "final_message") {
        /* Skip if this final_message was merged into a preceding step */
        if (responseForPrecedingStep.has(lastToolCallSeq)) {
          /* Check if THIS frame's content was part of the merged set.
             We need to check if any tool_call frame seq maps to this content. */
          let wasMerged = false;
          for (const [_stepSeq, _content] of responseForPrecedingStep) {
            /* We already merged all final_messages that follow a tool_call,
               so skip them all. Only render final_messages that appear
               BEFORE any tool_call (the very first response). */
          }
        }

        /* Only render standalone if no preceding tool_call exists */
        const content =
          typeof frame.payload?.content === "string"
            ? frame.payload.content
            : "";
        if (!content.trim()) continue;

        /* Check: does this final_message have a preceding tool_call? */
        const hasPrecedingToolCall = displayFrames
          .slice(0, displayFrames.indexOf(frame))
          .some((f) => f.type === "tool_call");

        if (hasPrecedingToolCall) {
          /* Already merged into the step block — skip standalone rendering */
          continue;
        }

        items.push({
          key: `${frame.seq}-final-message`,
          title: "Response",
          span: spanText,
          status: "done",
          body: (
            <div style={{ fontFamily: "inherit" }}>
              <SeamlessMarkdown
                content={content}
                status={isStreaming ? "streaming" : "done"}
                fontSize={compact ? 12 : ASSISTANT_MARKDOWN_FONT_SIZE}
                lineHeight={compact ? 1.5 : ASSISTANT_MARKDOWN_LINE_HEIGHT}
                style={compact ? COMPACT_RESPONSE_MARKDOWN_STYLE : undefined}
              />
            </div>
          ),
        });
      }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/COMPONENTs/chat-bubble/trace_chain.js src/COMPONENTs/chat-bubble/trace_chain.test.js
git commit -m "feat(trace): merge response content into step blocks instead of standalone items"
```

---

## Task 3: Unified Interaction Rendering in Step Blocks

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/trace_chain.js:1289-1367`
- Modify: `src/COMPONENTs/chat-bubble/interact/interact_wrapper.js`
- Test: `src/COMPONENTs/chat-bubble/trace_chain.test.js`

Currently `ask_user_question` and `tool_approval` both render inside tool_call blocks but the UI is unstable. `__continuation__` also renders this way. The user wants:
- ask_user + tool_approval → inside step block (as now, but fixed)
- `__continuation__` only → standalone block
- After submit: disable, grey out, persist selected option display

- [ ] **Step 1: Write test for interaction persistence after submit**

Add to `trace_chain.test.js`:

```javascript
describe("TraceChain — interaction persistence", () => {
  it("shows persisted selection as greyed-out after submit", () => {
    const frames = [
      { seq: 1, ts: 1000, type: "stream_started", payload: {} },
      {
        seq: 2,
        ts: 1100,
        type: "tool_call",
        run_id: "r1",
        payload: {
          call_id: "ask1",
          tool_name: "ask_user_question",
          tool_display_name: "Ask User",
          confirmation_id: "conf1",
          requires_confirmation: true,
          interact_type: "single",
          interact_config: {
            question: "Which option?",
            options: [
              { value: "opt_a", label: "Option A" },
              { value: "opt_b", label: "Option B" },
            ],
          },
          description: "Which option?",
        },
      },
      {
        seq: 3,
        ts: 1200,
        type: "tool_confirmed",
        run_id: "r1",
        payload: {
          call_id: "ask1",
          user_response: { value: "opt_a" },
        },
      },
      {
        seq: 4,
        ts: 1300,
        type: "tool_result",
        run_id: "r1",
        payload: {
          call_id: "ask1",
          result: { output: "User selected Option A" },
        },
      },
      { seq: 5, ts: 1400, type: "done", payload: { finished_at: 1400 } },
    ];

    const { container } = render(
      wrap(
        <TraceChain
          frames={frames}
          status="done"
          bubbleOwnsFinalMessage={false}
        />,
      ),
    );

    // The selection should be visible and greyed
    const selectedDisplay = container.querySelector("[data-persisted-selection]");
    expect(selectedDisplay).toBeInTheDocument();
    expect(selectedDisplay.textContent).toContain("Option A");

    // Interaction inputs should be disabled
    const inputs = container.querySelectorAll("input, button[data-interact-btn]");
    inputs.forEach((input) => {
      expect(input.disabled || input.getAttribute("aria-disabled") === "true").toBe(true);
    });
  });

  it("renders continue as standalone block, not inside a step", () => {
    const frames = [
      { seq: 1, ts: 1000, type: "stream_started", payload: {} },
      {
        seq: 2,
        ts: 1100,
        type: "tool_call",
        run_id: "r1",
        payload: {
          call_id: "cont1",
          tool_name: "__continuation__",
          tool_display_name: "Continue?",
          confirmation_id: "conf_cont",
          requires_confirmation: true,
          interact_type: "confirmation",
          interact_config: {},
          description: "Agent reached 5 iterations.",
        },
      },
    ];

    const { container } = render(
      wrap(
        <TraceChain
          frames={frames}
          status="streaming"
          bubbleOwnsFinalMessage={false}
        />,
      ),
    );

    // Continue should have its own distinct block style
    const continueBlock = container.querySelector("[data-continue-block]");
    expect(continueBlock).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: FAIL

- [ ] **Step 3: Add `data-persisted-selection` display to resolved interactions**

In `trace_chain.js`, inside the `isInlineInteraction` block (~line 1289+), after the status label rendering, add persisted selection display:

```javascript
        if (isInlineInteraction) {
          /* ... existing status label logic ... */

          const persistedValue =
            persistedUserResponse ||
            effectiveConfirmationUiState?.userResponse;

          interactBody = (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 4,
              }}
            >
              {/* Status label */}
              <span
                style={{
                  fontSize: 11.5,
                  color: statusColor,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                }}
              >
                {statusLabel}
              </span>

              {/* Persisted selection display — shown after resolve */}
              {isResolved && persistedValue && (
                <div
                  data-persisted-selection="true"
                  style={{
                    fontSize: 11,
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    color: isDark
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(0,0,0,0.3)",
                    padding: "4px 8px",
                    borderRadius: 5,
                    background: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                  }}
                >
                  {typeof persistedValue === "object"
                    ? persistedValue.value ||
                      (Array.isArray(persistedValue.values)
                        ? persistedValue.values.join(", ")
                        : persistedValue.text ||
                          JSON.stringify(persistedValue))
                    : String(persistedValue)}
                </div>
              )}

              {/* Interactive UI — disabled after submit */}
              {!isResolved && interactType !== "confirmation" ? (
                <InteractWrapper
                  type={interactType}
                  config={interactConfig}
                  onSubmit={(data) =>
                    handleInteractSubmit(confirmationId, interactType, data)
                  }
                  uiState={effectiveConfirmationUiState}
                  isDark={isDark}
                  disabled={!canTakeAction}
                />
              ) : !isResolved && canTakeAction ? (
                <InteractWrapper
                  type={interactType}
                  config={interactConfig}
                  onSubmit={(data) =>
                    handleInteractSubmit(confirmationId, interactType, data)
                  }
                  uiState={effectiveConfirmationUiState}
                  isDark={isDark}
                  disabled={false}
                />
              ) : null}
            </div>
          );
        }
```

- [ ] **Step 4: Mark `__continuation__` as standalone block**

Before the `items.push(...)` for tool_call, add a check for continuation:

```javascript
        const isContinuation = frame.payload?.tool_name === "__continuation__";

        items.push({
          key: `${frame.seq}-tool`,
          title: isContinuation ? (
            <span
              data-continue-block="true"
              style={{
                fontSize: compact ? "12px" : "13px",
                fontWeight: 500,
                color: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)",
                letterSpacing: "0.01em",
                userSelect: "none",
              }}
            >
              Continue?
            </span>
          ) : (
            <ToolTag name={toolName} isDark={isDark} compact={compact} />
          ),
          span: spanText,
          status: toolStatus,
          point: isContinuation ? "loading" : toolPointEl,
          body: (
            <>
              {!isContinuation && mergedResponseContent ? (
                <div
                  data-step-response="true"
                  style={{
                    marginTop: 4,
                    fontSize: compact ? 11 : 12.5,
                    lineHeight: compact ? 1.45 : 1.55,
                    color: isDark
                      ? "rgba(255,255,255,0.45)"
                      : "rgba(0,0,0,0.4)",
                    opacity: 0.85,
                    fontFamily: "inherit",
                  }}
                >
                  <SeamlessMarkdown
                    content={mergedResponseContent}
                    status="done"
                    fontSize={compact ? 11 : 12.5}
                    lineHeight={compact ? 1.45 : 1.55}
                  />
                </div>
              ) : null}
              {interactBody}
            </>
          ),
          details:
            !isContinuation && sections.length > 0 ? (
              <KVPanel sections={sections} isDark={isDark} color={color} />
            ) : undefined,
          _toolName:
            isContinuation || isInlineInteraction ? undefined : toolName,
          _sections:
            isContinuation || isInlineInteraction ? undefined : sections,
        });
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/COMPONENTs/chat-bubble/trace_chain.js src/COMPONENTs/chat-bubble/trace_chain.test.js
git commit -m "feat(trace): unified interaction in step blocks, persisted selection display"
```

---

## Task 4: Branch Graph — Conditional Merge & Main Timeline Pause

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js:256-334`
- Modify: `src/COMPONENTs/chat-bubble/trace_chain.js` (subagent rendering ~877-1203)
- Test: `src/COMPONENTs/chat-bubble/trace_chain.test.js`

Requirements:
1. Merge curve only shows when subagent is `done` (not during `active`)
2. Spinner only on subtimeline, NOT on main timeline
3. Main timeline visually pauses at fork point (no new items while subagent running)
4. Default expanded while running

- [ ] **Step 1: Write test for conditional merge visibility**

Add to `trace_chain.test.js`:

```javascript
describe("BranchGraph — conditional merge", () => {
  it("hides merge curve when subagent is still running", () => {
    const BranchGraph =
      require("../../BUILTIN_COMPONENTs/branch_graph/branch_graph").default;

    const branches = [
      {
        key: "b1",
        title: "worker",
        status: "active",
        point: null,
      },
    ];

    const { container } = render(
      wrap(
        <BranchGraph
          branches={branches}
          expanded={true}
          status="active"
          showMerge={false}
          curveReach={26}
          isDark={false}
        />,
      ),
    );

    // Fork curve should exist
    const svgs = container.querySelectorAll("svg");
    // Only fork curve, no merge curve
    expect(svgs.length).toBe(1);
  });

  it("shows merge curve when subagent is done", () => {
    const BranchGraph =
      require("../../BUILTIN_COMPONENTs/branch_graph/branch_graph").default;

    const branches = [
      {
        key: "b1",
        title: "worker",
        status: "done",
        point: null,
      },
    ];

    const { container } = render(
      wrap(
        <BranchGraph
          branches={branches}
          expanded={true}
          status="done"
          showMerge={true}
          curveReach={26}
          isDark={false}
        />,
      ),
    );

    const svgs = container.querySelectorAll("svg");
    // Both fork and merge curves
    expect(svgs.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: FAIL — `showMerge` prop doesn't exist yet

- [ ] **Step 3: Add `showMerge` prop to BranchGraph**

In `src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js`, update the component:

```javascript
const BranchGraph = ({
  branches = [],
  expanded = false,
  status = "pending",
  showMerge = true,
  curveReach = 0,
  inset = 0,
  isDark = false,
  compact = false,
}) => {
  if (!branches.length) return null;

  const showCurves = curveReach > 0;
  const curveColor = resolveLineColor(status, isDark);
  const effectiveReach = Math.max(0, curveReach - inset);
  const curveW = effectiveReach + TRACK_W / 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginLeft: inset > 0 ? -inset : undefined,
        marginTop: compact ? 4 : 6,
      }}
    >
      {/* fork curve — always visible when connected */}
      {showCurves && (
        <div style={{ position: "relative", height: FORK_CURVE_H }}>
          <div
            style={{ position: "absolute", left: -effectiveReach, top: 0 }}
          >
            <ForkCurve
              width={curveW}
              height={FORK_CURVE_H}
              color={curveColor}
              strokeWidth={LINE_W}
            />
          </div>
        </div>
      )}

      {/* branch nodes — collapsible */}
      <AnimatedChildren open={expanded}>
        <div>
          {branches.map((branch, i) => (
            <BranchNode
              key={branch.key ?? i}
              item={branch}
              index={i}
              total={branches.length}
              prevStatus={
                i > 0 ? (branches[i - 1].status ?? "pending") : null
              }
              overallStatus={status}
              isDark={isDark}
              compact={compact}
            />
          ))}
        </div>
      </AnimatedChildren>

      {/* merge curve — only visible when showMerge is true */}
      {showCurves && showMerge && (
        <div
          style={{
            position: "relative",
            height: FORK_CURVE_H,
            transition: "opacity 0.3s ease, height 0.3s ease",
          }}
        >
          <div
            style={{ position: "absolute", left: -effectiveReach, top: 0 }}
          >
            <MergeCurve
              width={curveW}
              height={FORK_CURVE_H}
              color={curveColor}
              strokeWidth={LINE_W}
            />
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Update trace_chain.js to pass `showMerge` based on subagent status**

In the subagent rendering section (~line 1191-1200), update the BranchGraph call:

```javascript
          const isSubagentDone = overallBranchStatus === "done" || overallBranchStatus === "error";

          items.push({
            key: `${frame.seq}-subagent`,
            title: (
              /* ... existing title JSX ... */
            ),
            span: spanText,
            status: resultFrame ? "done" : "active",
            point: <SubagentPoint isDark={isDark} />,
            body: branches.length > 0 ? (
              <BranchGraph
                branches={branches}
                expanded={isBranchExpanded}
                status={overallBranchStatus}
                showMerge={isSubagentDone}
                curveReach={hideTrack ? 0 : compact ? 22 : 26}
                inset={hideTrack ? 0 : 12}
                isDark={isDark}
                compact={compact}
              />
            ) : undefined,
          });
```

- [ ] **Step 5: Remove main timeline spinner during subagent execution**

In the streaming content section (~line 1430-1462), check if any subagent is currently active:

```javascript
    if (isStreaming) {
      /* Check if any subagent is currently running */
      const hasActiveSubagent = Object.values(effectiveSubagentMetaByRunId).some(
        (meta) => {
          const s = typeof meta?.status === "string" ? meta.status.trim().toLowerCase() : "";
          return s === "running" || s === "spawned" || s === "needs_clarification";
        },
      );

      /* Only show main timeline spinner if NO subagent is active.
         When a subagent runs, spinner should be on the subtimeline. */
      if (!hasActiveSubagent) {
        const liveContent =
          typeof streamingContent === "string" ? streamingContent : "";
        if (liveContent.trim()) {
          items.push({
            key: "__streaming_content__",
            title: "Response",
            span: null,
            status: "active",
            point: "loading",
            body: (
              <div style={{ fontFamily: "inherit" }}>
                <SeamlessMarkdown
                  content={liveContent}
                  status="streaming"
                  fontSize={compact ? 12 : ASSISTANT_MARKDOWN_FONT_SIZE}
                  lineHeight={compact ? 1.5 : ASSISTANT_MARKDOWN_LINE_HEIGHT}
                  style={compact ? COMPACT_RESPONSE_MARKDOWN_STYLE : undefined}
                  priority="high"
                />
              </div>
            ),
          });
        } else {
          items.push({
            key: "__streaming__",
            title: "Thinking\u2026",
            span: null,
            status: "active",
            point: "loading",
          });
        }
      }
      /* If subagent is active, the spinner appears inside the BranchNode
         via the nested TraceChain's own streaming state */
    }
```

- [ ] **Step 6: Default subagent branches to expanded while running**

In the branch state initialization (~line 1021), change default expansion:

```javascript
          const bState = branchState.get(bKey);
          /* Default: expanded while any branch is running, collapsed when all done */
          const isBranchExpanded = bState?.expanded ?? (overallBranchStatus !== "done");
```

This means branches auto-expand during execution and can be manually collapsed.

- [ ] **Step 7: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js src/COMPONENTs/chat-bubble/trace_chain.js src/COMPONENTs/chat-bubble/trace_chain.test.js
git commit -m "feat(branch): conditional merge curve, spinner on subtimeline only, auto-expand running branches"
```

---

## Task 5: Error Deduplication

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/trace_chain.js:1383-1403`
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js` (onError handler)
- Test: `src/COMPONENTs/chat-bubble/trace_chain.test.js`

The bug: errors appear twice because:
1. The `error` frame renders as a timeline ErrorNode in trace_chain
2. The `onError` handler sets message status to "error" which renders in the message bubble

Fix strategy: The trace chain owns error display. The message bubble only shows error status (icon/color) but not the error message text. If the trace chain has an error frame, the bubble should NOT repeat the same message.

- [ ] **Step 1: Write test for error deduplication**

```javascript
describe("TraceChain — error deduplication", () => {
  it("renders error frame exactly once", () => {
    const frames = [
      { seq: 1, ts: 1000, type: "stream_started", payload: {} },
      {
        seq: 2,
        ts: 1100,
        type: "tool_call",
        run_id: "r1",
        payload: {
          call_id: "c1",
          tool_name: "read_file",
          arguments: { path: "/x" },
        },
      },
      {
        seq: 3,
        ts: 1200,
        type: "error",
        payload: {
          code: "provider_error",
          message: "Rate limit exceeded",
        },
      },
    ];

    const { container } = render(
      wrap(
        <TraceChain
          frames={frames}
          status="error"
          bubbleOwnsFinalMessage={false}
        />,
      ),
    );

    // Count how many times the error message appears
    const errorNodes = container.querySelectorAll("[data-error-node]");
    expect(errorNodes.length).toBe(1);
    expect(errorNodes[0].textContent).toContain("Rate limit exceeded");
  });
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: May pass (single error in trace_chain is correct), but the real fix is in the message bubble

- [ ] **Step 3: Add `data-error-node` attribute to error items**

In `trace_chain.js`, update the error item rendering (~line 1383-1403):

```javascript
      } else if (frame.type === "error") {
        const msg = frame.payload?.message || "Unknown error";
        const code = frame.payload?.code;
        const pairs = [
          ...(code != null ? [{ key: "code", value: String(code) }] : []),
          { key: "message", value: msg },
        ];
        items.push({
          key: `${frame.seq}-error`,
          title: "Error",
          span: spanText,
          status: "done",
          point: <ErrorPoint />,
          body: (
            <div data-error-node="true">
              <KVPanel
                sections={[{ pairs }]}
                isDark={isDark}
                color={isDark ? "#f87171" : "#dc2626"}
              />
            </div>
          ),
        });
      }
```

Note: `details` changed to `body` so the error content is always visible without needing to click "detail". Errors should never be hidden behind a toggle.

- [ ] **Step 4: Prevent duplicate error in message bubble**

In `use_chat_stream.js`, in the `onError` handler, add a flag that the trace chain already has the error:

```javascript
onError: (error) => {
  const errorMessage = error?.message || "Unknown stream error";
  const errorCode = error?.code || "stream_error";

  /* ... existing memory_unavailable retry logic ... */

  /* Mark message as error status but DON'T duplicate the error message
     if the trace chain already received an error frame.
     The trace chain renders error frames — the bubble just shows status. */
  const traceHasError = (activeStreamMessagesRef.current?.messages || [])
    .find((m) => m.id === assistantMessageId)
    ?.traceFrames?.some((f) => f.type === "error");

  const nextStreamMessages = streamMessages.map((msg) =>
    msg.id === assistantMessageId
      ? {
          ...msg,
          status: "error",
          /* Only set error text if trace chain doesn't have it */
          ...(traceHasError ? {} : { error: errorMessage }),
          updatedAt: Date.now(),
        }
      : msg,
  );
  syncStreamMessages(nextStreamMessages);
},
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain.test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/COMPONENTs/chat-bubble/trace_chain.js src/PAGEs/chat/hooks/use_chat_stream.js src/COMPONENTs/chat-bubble/trace_chain.test.js
git commit -m "fix(trace): deduplicate error display between trace chain and message bubble"
```

---

## Task 6: Animation Polish

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js`
- Modify: `src/BUILTIN_COMPONENTs/class/animated_children.js` (if exists)
- Test: Visual review

Requirements:
- Timeline grow animation should be smooth
- Fork/merge curves should animate in
- Modern, minimal feel
- All transitions use cubic-bezier easing

- [ ] **Step 1: Add CSS transition to BranchGraph fork/merge curves**

In `branch_graph.js`, add enter animation to the fork and merge curve containers:

```javascript
      {/* fork curve — always visible when connected */}
      {showCurves && (
        <div
          style={{
            position: "relative",
            height: FORK_CURVE_H,
            animation: "branchFadeIn 0.25s cubic-bezier(0.32, 1, 0.32, 1)",
          }}
        >
          <div
            style={{ position: "absolute", left: -effectiveReach, top: 0 }}
          >
            <ForkCurve
              width={curveW}
              height={FORK_CURVE_H}
              color={curveColor}
              strokeWidth={LINE_W}
            />
          </div>
        </div>
      )}

      {/* ... branches ... */}

      {/* merge curve — animate in when appearing */}
      {showCurves && showMerge && (
        <div
          style={{
            position: "relative",
            height: FORK_CURVE_H,
            animation: "branchFadeIn 0.3s cubic-bezier(0.32, 1, 0.32, 1)",
          }}
        >
          <div
            style={{ position: "absolute", left: -effectiveReach, top: 0 }}
          >
            <MergeCurve
              width={curveW}
              height={FORK_CURVE_H}
              color={curveColor}
              strokeWidth={LINE_W}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 2: Add keyframe style injection**

At the top of `branch_graph.js`, after imports, add a style injection for the animation keyframes:

```javascript
/* ── inject animation keyframes once ─────────────────────────────────── */
const KEYFRAME_ID = "__branch_graph_keyframes__";
if (typeof document !== "undefined" && !document.getElementById(KEYFRAME_ID)) {
  const style = document.createElement("style");
  style.id = KEYFRAME_ID;
  style.textContent = `
    @keyframes branchFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes branchSlideIn {
      from { opacity: 0; max-height: 0; }
      to   { opacity: 1; max-height: 500px; }
    }
  `;
  document.head.appendChild(style);
}
```

- [ ] **Step 3: Add smooth color transitions to branch lines**

In `BranchNode`, the line segments already have `transition: "background 0.3s"`. Ensure all line color transitions use a consistent easing:

```javascript
const LINE_TRANSITION = "background 0.3s cubic-bezier(0.32, 1, 0.32, 1)";
```

Replace all `transition: "background 0.3s"` in `BranchNode` with `transition: LINE_TRANSITION`.

- [ ] **Step 4: Add smooth expand/collapse to BranchNode content**

The `AnimatedChildren` component handles open/close animation. Verify it uses a smooth easing. If it uses a basic linear or ease-in-out, update to cubic-bezier:

Check `src/BUILTIN_COMPONENTs/class/animated_children.js` — if its transition duration or easing is hardcoded, update:

```javascript
// Target easing for all animated children:
transition: "max-height 0.28s cubic-bezier(0.32, 1, 0.32, 1), opacity 0.2s ease"
```

- [ ] **Step 5: Visual review**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm start`

Test scenarios:
1. Send a message with tool calls → verify smooth timeline growth
2. Trigger subagent → verify fork curve animates in
3. Wait for subagent to complete → verify merge curve slides in smoothly
4. Expand/collapse branch → verify smooth animation
5. Error state → verify no jerky transitions

Expected: All animations smooth, modern, no jarring jumps.

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js
git commit -m "polish(branch): smooth fork/merge animations with cubic-bezier easing"
```

---

## Task 7: Container Header — Steps + Time + Token Usage

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/trace_chain.js:1577-1629`
- Test: Visual review

Ensure the container header persistently shows: step count + duration + token usage.

- [ ] **Step 1: Update container header to always show metrics**

In `trace_chain.js`, the header section (~line 1577-1629):

```javascript
  return (
    <div style={{ marginBottom: showContainerHeader ? 10 : 0 }}>
      {showContainerHeader ? (
        <div
          onClick={() => setBodyOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            cursor: "pointer",
            userSelect: "none",
            marginBottom: bodyOpen ? 6 : 0,
          }}
        >
          <Icon
            src="arrow_right"
            color={color}
            style={{
              width: 16,
              height: 16,
              opacity: 0.25,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.2s cubic-bezier(0.32,1,0.32,1)",
              transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
          <span
            style={{
              fontSize: 11.5,
              color,
              opacity: 0.38,
              fontFamily: theme?.font?.fontFamily || "inherit",
              letterSpacing: 0.1,
            }}
          >
            {isStreaming && !doneFrame
              ? "Thinking\u2026"
              : hasError
                ? (stepCount > 0
                    ? `Failed after ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                    : "Failed") + (duration ? ` \u00B7 ${formatDelta(duration)}` : "")
                : (stepCount > 0
                    ? `${stepCount} step${stepCount !== 1 ? "s" : ""}`
                    : "Done") +
                  (duration ? ` \u00B7 ${formatDelta(duration)}` : "")}
          </span>
          {/* Inline token summary in header when collapsed */}
          {!bodyOpen &&
            status === "done" &&
            bundle?.consumed_tokens > 0 && (
              <span style={{ marginLeft: 4 }}>
                <TokenSummary
                  input={bundle.input_tokens}
                  output={bundle.output_tokens}
                  total={bundle.consumed_tokens}
                  isDark={isDark}
                />
              </span>
            )}
        </div>
      ) : null}
      {timelineBody}
    </div>
  );
```

Key change: Simplified step label (removed "Used" prefix → just "3 steps"), added inline token summary when collapsed.

- [ ] **Step 2: Run app and verify**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm start`
Expected:
- Header shows "3 steps · 2.4s" format
- When collapsed, token summary appears inline
- When expanded, token summary appears at bottom of timeline

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/COMPONENTs/chat-bubble/trace_chain.js
git commit -m "polish(trace): simplified header metrics with inline token summary"
```

---

## Task 8: Delegate Subagent — Actions on Sub-Timeline

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/trace_chain.js` (subagent rendering)
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js` (frame routing)

Ensure delegate subagent's tool calls and actions all display on the sub-timeline branch, NOT on the main timeline.

- [ ] **Step 1: Verify subagent frame routing in use_chat_stream.js**

The current routing logic at lines 1575-1623 already routes frames by `run_id`. Verify the logic handles these scenarios:

1. `subagent_spawned` arrives → registers `child_run_id`
2. Child frames arrive → routed to subagent timeline
3. Eager registration handles race condition

Read the routing code and confirm it handles delegate properly. The key check:

```javascript
// In onFrame handler, after subagent lifecycle event processing:
const frameRunId = frame.run_id || frame.payload?.run_id || "";
const isKnownChild = isKnownSubagentRunId(frameRunId);
const isUnknownChild =
  !isKnownChild &&
  frameRunId.length > 0 &&
  parentRunIdRef.current &&
  frameRunId !== parentRunIdRef.current;
```

This should work correctly for delegate. If the delegate's agent has a different `run_id` than the parent, all its frames (tool_call, tool_result, final_message) will route to the sub-timeline.

- [ ] **Step 2: Ensure delegate's TraceChain receives `onToolConfirmationDecision`**

In the recursive TraceChain for subagent branches (~line 1124-1135), add the confirmation handler:

```javascript
              expandContent: canExpand ? (
                <TraceChain
                  frames={worker.frames}
                  status={getSubagentTraceStatus(worker.status)}
                  showContainerHeader={false}
                  bubbleOwnsFinalMessage={false}
                  compact
                  hideTrack
                  subagentFrames={effectiveSubagentFrames}
                  subagentMetaByRunId={effectiveSubagentMetaByRunId}
                  onToolConfirmationDecision={onToolConfirmationDecision}
                  toolConfirmationUiStateById={toolConfirmationUiStateById}
                  _depth={_depth + 1}
                />
              ) : /* ... */
```

This ensures that if a delegate subagent has interactive tool calls (ask_user, tool_approval), they render and function correctly in the sub-timeline.

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/COMPONENTs/chat-bubble/trace_chain.js
git commit -m "fix(trace): pass confirmation handlers to subagent nested TraceChain"
```

---

## Task 9: Final Integration Testing & Cleanup

**Files:**
- All modified files
- Test: `src/COMPONENTs/chat-bubble/trace_chain.test.js`

- [ ] **Step 1: Write integration test covering full trace chain**

```javascript
describe("TraceChain — full integration", () => {
  it("renders a complete agent run with tools, subagent, and errors correctly", () => {
    const frames = [
      { seq: 1, ts: 1000, type: "stream_started", run_id: "", payload: { model: "gpt-4" } },
      { seq: 2, ts: 1050, run_id: "parent", type: "run_started", payload: {} },
      { seq: 3, ts: 1100, run_id: "parent", type: "reasoning", payload: { content: "Let me think..." } },
      {
        seq: 4, ts: 1200, run_id: "parent", type: "tool_call",
        payload: { call_id: "c1", tool_name: "search", tool_display_name: "Search", arguments: { q: "test" } },
      },
      {
        seq: 5, ts: 1300, run_id: "parent", type: "tool_result",
        payload: { call_id: "c1", result: { output: "found it" } },
      },
      { seq: 6, ts: 1400, run_id: "parent", type: "final_message", payload: { content: "I found the answer." } },
      {
        seq: 7, ts: 1500, run_id: "parent", type: "tool_call",
        payload: {
          call_id: "c2", tool_name: "delegate_to_subagent",
          tool_display_name: "Delegate", arguments: { target: "writer", task: "Write docs" },
        },
      },
      {
        seq: 8, ts: 1600, run_id: "parent", type: "subagent_spawned",
        payload: { child_run_id: "child1", subagent_id: "writer", mode: "delegate" },
      },
      {
        seq: 9, ts: 1700, run_id: "child1", type: "tool_call",
        payload: { call_id: "c3", tool_name: "write_file", arguments: { path: "/docs/readme.md" } },
      },
      {
        seq: 10, ts: 1800, run_id: "child1", type: "tool_result",
        payload: { call_id: "c3", result: { output: "written" } },
      },
      {
        seq: 11, ts: 1900, run_id: "parent", type: "tool_result",
        payload: {
          call_id: "c2",
          result: { status: "completed", agent_name: "writer", output: "Docs written" },
        },
      },
      { seq: 12, ts: 2000, type: "done", payload: { finished_at: 2000, bundle: { consumed_tokens: 500, input_tokens: 300, output_tokens: 200 } } },
    ];

    const subagentFrames = {
      child1: frames.filter((f) => f.run_id === "child1"),
    };
    const subagentMetaByRunId = {
      child1: { subagentId: "writer", mode: "delegate", status: "completed" },
    };

    const { container } = render(
      wrap(
        <TraceChain
          frames={frames.filter((f) => f.run_id !== "child1")}
          status="done"
          bundle={{ consumed_tokens: 500, input_tokens: 300, output_tokens: 200 }}
          subagentFrames={subagentFrames}
          subagentMetaByRunId={subagentMetaByRunId}
          bubbleOwnsFinalMessage={false}
        />,
      ),
    );

    // Verify: reasoning node exists
    expect(screen.getByText("Reasoning")).toBeInTheDocument();

    // Verify: "I found the answer." is merged into the Search step, NOT standalone
    expect(screen.getByText(/I found the answer/)).toBeInTheDocument();
    const standaloneResponses = Array.from(
      container.querySelectorAll("[data-timeline-title]"),
    ).filter((el) => el.textContent === "Response");
    expect(standaloneResponses.length).toBe(0);

    // Verify: subagent branch exists
    expect(screen.getByText(/writer/)).toBeInTheDocument();

    // Verify: token summary exists
    expect(screen.getByText(/300 in/)).toBeInTheDocument();
    expect(screen.getByText(/200 out/)).toBeInTheDocument();

    // Verify: NO duplicate errors
    const errors = container.querySelectorAll("[data-error-node]");
    expect(errors.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --testPathPattern=trace_chain`
Expected: ALL PASS

- [ ] **Step 3: Manual end-to-end testing**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm start`

Test matrix:

| Scenario | Expected |
|----------|----------|
| Simple chat (no tools) | No trace chain shown |
| Single tool call | Step block with tag + detail |
| Tool call + response | Response merged into step block as low-opacity text |
| Multiple sequential tool calls | Grouped with count badge |
| ask_user_question (single select) | Selection in step block, persists after submit |
| ask_user_question (multi select) | Multi-select in step block, persists after submit |
| tool_approval | Approve/deny in step block, persists decision |
| continue prompt | Standalone block (not inside a step) |
| delegate subagent | Fork curve → sub-timeline → merge curve (after done) |
| multi worker batch | Fork → multiple sub-branches → merge |
| subagent running | Spinner on subtimeline, main paused, branches expanded |
| subagent done | Merge curve appears, main timeline resumes |
| error during stream | Single error display (not duplicated) |
| error in subagent | Error on sub-timeline, failure status on branch |

- [ ] **Step 4: Cleanup — remove dead code**

Search for any code that references removed frame fields (`stage`, `iteration`):

```bash
cd /Users/red/Desktop/GITRepo/PuPu
grep -rn "\.stage\b\|\.iteration\b" src/ --include="*.js" | grep -v node_modules | grep -v "\.test\."
```

Remove any references found.

- [ ] **Step 5: Final commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add -A
git commit -m "test(trace): integration tests for trace chain v3 refactor"
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| Frame fields | 8 per frame (seq, ts, thread_id, run_id, iteration, stage, type, payload) | 5 per frame (seq, ts, run_id, type, payload) |
| Response content | Standalone "Response" timeline item | Merged into preceding step block (low-opacity) |
| ask_user / tool_approval | In step block but unstable | In step block, persisted selection, disable after submit |
| continue | In step block | Standalone block |
| Error display | Duplicated (trace + bubble) | Single source (trace chain only) |
| Subagent merge curve | Always visible | Conditional (only when done) |
| Main spinner | Always visible during streaming | Hidden when subagent active |
| Branch default | Collapsed | Expanded while running |
| Animations | Basic transitions | Cubic-bezier easing, fade-in curves |
| Token summary | Only at timeline end | Also inline in collapsed header |
