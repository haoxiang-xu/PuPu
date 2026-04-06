# Trace Chain & Streaming Protocol Full-Stack Refactor

**Date:** 2026-04-05
**Scope:** unchain kernel + PuPu adapter + PuPu frontend (branch_graph, trace_chain, use_chat_stream)
**Approach:** Semantic Timeline Protocol (方案 A)

---

## 1. SSE Protocol Redesign

### 1.1 ID Simplification

| ID | Status | Notes |
|----|--------|-------|
| `run_id` | **Keep** | Unique per agent run. Child agents use `child_run_id` as their `run_id` |
| `call_id` | **Keep** | Identifies a tool invocation |
| `request_id` | **Keep** | Identifies an input request |
| `batch_id` | **Keep (optional)** | Only for worker batch scenarios |
| `response_id` | **Remove from SSE** | OpenAI internal concept |
| `session_id` | **Remove from SSE** | Backend memory scope |
| `memory_namespace` | **Remove from SSE** | Pure backend concept |
| `child_run_id` | **Merge** | No longer separate — it IS the child's `run_id` |

Frontend sees only 3 IDs: `run_id`, `call_id`, `request_id`.

### 1.2 Frame Envelope

```json
{
  "seq": 1,
  "ts": 1712345678000,
  "run_id": "abc-123",
  "type": "step"
}
```

Removed fields:
- `stage` — derivable from `type`
- `thread_id` — sent once in `run.start`
- `iteration` — internal loop concept

### 1.3 Event Types (10, replacing ~25)

#### `run.start`
```json
{ "type": "run.start", "run_id": "R1", "model": "claude-sonnet-4-20250514", "thread_id": "T1" }
```

#### `token`
```json
{ "type": "token", "run_id": "R1", "delta": "Hello" }
```

#### `step`
```json
{
  "type": "step", "run_id": "R1", "call_id": "C1",
  "tool_name": "read_file",
  "tool_display_name": "read_file @workspace1",
  "toolkit_id": "core",
  "arguments": { "path": "/tmp/test.txt" }
}
```

#### `step.result`
```json
{ "type": "step.result", "run_id": "R1", "call_id": "C1", "tool_name": "read_file", "result": {} }
```

#### `input.required`
```json
{
  "type": "input.required", "run_id": "R1", "request_id": "Q1",
  "kind": "question",
  "call_id": "C2",
  "tool_name": "ask_user_question",
  "config": {
    "title": "Select file",
    "question": "Which file to edit?",
    "selection_mode": "single",
    "options": [{ "value": "a.txt", "text": "a.txt" }]
  }
}
```

`kind` values:
- `"approval"` — tool execution approval (config: arguments, description)
- `"question"` — ask_user_question (config: title, question, options, selection_mode, allow_other, etc.)
- `"continue"` — max iterations reached (config: reason; call_id is null)

#### `input.resolved`
```json
{
  "type": "input.resolved", "run_id": "R1", "request_id": "Q1",
  "decision": "submitted",
  "response": { "selected": ["a.txt"] }
}
```

#### `branch.fork`
```json
{
  "type": "branch.fork", "run_id": "R1",
  "child_run_id": "R1-child-1",
  "call_id": "C3",
  "mode": "delegate",
  "label": "math_solver",
  "task": "Solve x^2 + 1 = 0",
  "batch_id": null
}
```

#### `branch.merge`
```json
{
  "type": "branch.merge", "run_id": "R1",
  "child_run_id": "R1-child-1",
  "status": "completed",
  "bundle": { "input_tokens": 200, "output_tokens": 80, "total_tokens": 280 }
}
```
Note: `bundle` is optional — included when child agent provides token usage.

#### `error`
```json
{ "type": "error", "run_id": "R1", "code": "provider_error", "message": "API returned 500" }
```

#### `run.done`
```json
{
  "type": "run.done", "run_id": "R1", "status": "completed",
  "bundle": { "input_tokens": 1234, "output_tokens": 567, "total_tokens": 1801 }
}
```

### 1.4 Content Inline Rule

No separate `final_message` event. Frontend uses a `pendingContent` buffer:

1. Receive `token` → append to buffer, show as "streaming response..."
2. Receive `step` → attach buffer content to this step item, clear buffer
3. Receive `run.done` → buffer content becomes the final reply (message bubble)

### 1.5 Ordering Guarantees

1. `run.start` is always first for the **root** `run_id` (child agents do NOT emit `run.start` — `branch.fork` serves as their start signal)
2. `branch.fork` is always emitted before any child events (synchronous before child.run())
3. `branch.merge` is always after all child events for that `child_run_id` (child agents do NOT emit `run.done` — `branch.merge` serves as their end signal)
4. `step` is always before its corresponding `step.result`
5. `input.required` is always before its corresponding `input.resolved`
6. `run.done` is always last for the **root** `run_id`

**Child agent lifecycle:** `branch.fork` → child events (token, step, step.result, error, nested branch.fork/merge) → `branch.merge`. The adapter filters out `run_started`/`run_completed` for child run_ids.

### 1.6 Retired Events (~15)

| Old Event | Disposition |
|-----------|-------------|
| `iteration_started/completed` | Remove — internal loop concept |
| `request_messages` | Remove — debug only |
| `response_received` | Remove — response_id is backend-only |
| `previous_response_id_fallback` | Remove — internal |
| `memory_prepare/commit` | Remove — internal logging |
| `final_message` | Remove — replaced by token flow + content inline |
| `human_input_requested` | → `input.required` (kind=question) |
| `human_input_continuation` | Remove entirely |
| `run_max_iterations` | → `input.required` (kind=continue) |
| `tool_confirmed/denied` | → `input.resolved` |
| `subagent_spawned/started` | → `branch.fork` |
| `subagent_completed/failed` | → `branch.merge` |
| `subagent_handoff` | → `branch.fork` (mode=handoff) |
| `subagent_clarification_requested` | → child's `input.required` |
| `subagent_batch_started/joined` | → `branch.fork/merge` + batch_id |

---

## 2. Backend Changes

### 2.1 Unchain Core API

**Agent.run() signature change:**

```python
# Old (3 separate callbacks)
def run(self, messages, *, callback=None,
        on_tool_confirm=None, on_human_input=None, on_max_iterations=None, ...)

# New (1 unified callback)
def run(self, messages, *, callback=None, on_input=None, ...)
```

**New types:**

```python
@dataclass
class InputRequest:
    kind: str               # "approval" | "question" | "continue"
    run_id: str
    call_id: str | None     # None for "continue"
    tool_name: str | None
    config: dict            # kind-specific configuration

@dataclass
class InputResponse:
    decision: str           # "approved" | "denied" | "submitted" | "continued" | "stopped"
    response: dict | None   # decision-specific payload
```

### 2.2 kernel/loop.py Changes

**Removed event emissions:**

| Current Code | Action |
|-------------|--------|
| `emit_event("iteration_started")` | Delete |
| `emit_event("iteration_completed")` | Delete |
| `emit_event("response_received")` | Delete |
| `emit_event("final_message")` | Delete — token flow replaces it |
| `emit_event("run_max_iterations")` | Delete — use `on_input(kind="continue")` |
| `emit_event("memory_prepare")` | Delete from callback (internal log only) |
| `emit_event("memory_commit")` | Delete from callback (internal log only) |
| `emit_event("request_messages")` in model_io.py | Delete |

**Retained and simplified:**

| Old Event | New Event | Change |
|-----------|-----------|--------|
| `run_started` | `run_started` | Add `model`, `thread_id` fields |
| `run_completed` | `run_completed` | Add `bundle` field (token usage) |
| `token_delta` | `token_delta` | Remove `accumulated_text` (frontend accumulates) |

**max_iterations rework:**

```python
# Old
self.emit_event(callback, "run_max_iterations", run_id, ...)
if on_max_iterations:
    should_continue = on_max_iterations(bundle)

# New
if on_input:
    resp = on_input(InputRequest(kind="continue", run_id=run_id, call_id=None, ...))
    should_continue = resp.decision == "continued"
```

### 2.3 tools/execution.py Changes

**Unified confirmation + ask_user_question:**

```python
# Old: two separate paths
if on_tool_confirm:
    result = on_tool_confirm(ConfirmRequest(...))
if is_human_input_tool(tool_call.name):
    result = on_human_input(HumanInputRequest(...))

# New: one path
if on_input:
    if requires_confirmation:
        resp = on_input(InputRequest(kind="approval", call_id=..., tool_name=..., config={...}))
    elif is_human_input_tool(tool_call.name):
        resp = on_input(InputRequest(kind="question", call_id=..., config={...}))
```

Remove `tool_confirmed`/`tool_denied` event emissions — adapter emits `input.resolved` after callback returns.

### 2.4 subagents/plugin.py — Critical Fix

**Root cause fix:** Pass `child_run_id` as the child agent's explicit `run_id`.

```python
# Old: child_run_id and child's actual run_id can diverge
child_run_id = f"{session_id}:{child_id}:{uuid4()}"
self._emit_subagent_event("subagent_spawned", child_run_id=child_run_id, ...)
child_result = child_agent.run(messages, callback=callback, ...)  # run_id auto-generated!

# New: guaranteed consistency
child_run_id = f"{session_id}:{child_id}:{uuid4()}"
emit_event(callback, "branch_fork", run_id, child_run_id=child_run_id, mode="delegate", ...)
child_result = child_agent.run(messages, callback=callback, run_id=child_run_id, ...)
emit_event(callback, "branch_merge", run_id, child_run_id=child_run_id, status=...)
```

**Event consolidation:**

| Old Events | New Event |
|-----------|-----------|
| `subagent_spawned` + `subagent_started` | Single `branch_fork` |
| `subagent_completed` / `subagent_failed` | Single `branch_merge` (status differentiates) |
| `subagent_handoff` | `branch_fork` (mode="handoff") |
| `subagent_batch_started` | One `branch_fork` per worker |
| `subagent_batch_joined` | One `branch_merge` per worker |
| `subagent_clarification_requested` | Child agent's `on_input(kind="question")` |

**Ordering guarantee:** `branch_fork` emitted synchronously before `child.run()` starts. For delegates this is inherently sequential. For workers, fork events are emitted before ThreadPoolExecutor.submit().

### 2.5 Adapter Layer Rebuild

**Current:** `unchain_adapter.py` — 3700 lines, 3 blocking callback factories, event suppress/re-emit.
**Target:** ~800 lines, 1 callback factory, pure mapping.

**Event mapping:**

```python
EVENT_MAP = {
    "run_started":    "run.start",
    "run_completed":  "run.done",
    "token_delta":    "token",
    "tool_call":      "step",
    "tool_result":    "step.result",
    "branch_fork":    "branch.fork",
    "branch_merge":   "branch.merge",
    "error":          "error",
}
```

**Core structure:**

```python
def stream_chat_events(options, session_id, ...):
    agent = create_agent(options)
    queue = Queue()

    def on_input(request: InputRequest) -> InputResponse:
        request_id = str(uuid4())
        waiter = {"event": threading.Event(), "response": None}
        pending_inputs[request_id] = waiter
        queue.put(build_frame("input.required", request.run_id,
            request_id=request_id, kind=request.kind,
            call_id=request.call_id, tool_name=request.tool_name,
            config=request.config))
        waiter["event"].wait()
        resp = waiter["response"]
        queue.put(build_frame("input.resolved", request.run_id,
            request_id=request_id, decision=resp.decision,
            response=resp.response))
        return resp

    def on_event(event):
        sse_type = EVENT_MAP.get(event["type"])
        if not sse_type:
            return
        # Filter out child run_started/run_completed (replaced by branch.fork/merge)
        if event["type"] in ("run_started", "run_completed") and event["run_id"] in child_run_ids:
            return
        queue.put(build_frame(sse_type, event["run_id"], **extract_fields(event)))

    thread = Thread(target=lambda: agent.run(messages, callback=on_event, on_input=on_input, ...))
    thread.start()
    yield from drain_queue(queue)
```

**Deleted complexity:**
- `_make_tool_confirm_callback()` (459-528 lines)
- `_make_human_input_callback()` (3277-3362 lines)
- `_make_continuation_callback()` (531-581 lines)
- Event suppress list
- Synthetic tool_call generation
- Complex toolkit metadata enrichment (simplified to inline lookup in on_event)

**HTTP endpoints:**

```
POST /chat/stream/v2       → SSE stream (unchanged path)
POST /chat/input/respond    → Unified input response (replaces /chat/tool/confirmation)
```

```python
@blueprint.route("/chat/input/respond", methods=["POST"])
def respond_input():
    data = request.json
    request_id = data["request_id"]
    waiter = pending_inputs.get(request_id)
    if not waiter:
        return {"error": "not_found"}, 404
    waiter["response"] = InputResponse(
        decision=data["decision"],
        response=data.get("response"))
    waiter["event"].set()
    return {"status": "ok"}
```

---

## 3. Frontend State Layer (use_chat_stream.js)

### 3.1 Core Data Structure

```javascript
const streamState = {
  runId: null,
  timeline: [],                   // Main timeline items
  branches: new Map(),            // child_run_id → { meta, timeline, pendingContent, status }
  pendingContent: "",             // Token accumulation buffer
  pendingInput: null,             // Current input.required
  bundle: null,                   // Final token usage
  status: "idle",                 // "idle" | "streaming" | "awaiting_input" | "done" | "error"
};
```

### 3.2 Event Handlers

```javascript
const HANDLERS = {
  "run.start": (state, frame) => {
    // Only root agent emits run.start (children use branch.fork)
    state.runId = frame.run_id;
    state.status = "streaming";
  },

  "token": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    target.pendingContent += frame.delta;
  },

  "step": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    target.timeline.push({
      type: "step",
      callId: frame.call_id,
      toolName: frame.tool_name,
      displayName: frame.tool_display_name,
      arguments: frame.arguments,
      content: target.pendingContent,   // Auto-attach accumulated content
      result: null,
      inputState: null,
      childRunIds: null,
      status: "running",
    });
    target.pendingContent = "";
  },

  "step.result": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    const step = target.timeline.find(s => s.callId === frame.call_id);
    if (step) { step.result = frame.result; step.status = "done"; }
  },

  "input.required": (state, frame) => {
    state.status = "awaiting_input";
    const target = resolveTimeline(state, frame.run_id);
    if (frame.kind === "continue") {
      target.timeline.push({
        type: "continue",
        requestId: frame.request_id,
        config: frame.config,
        inputState: { status: "pending", decision: null },
      });
    } else {
      const step = target.timeline.find(s => s.callId === frame.call_id);
      if (step) {
        step.inputState = {
          requestId: frame.request_id,
          kind: frame.kind,
          config: frame.config,
          status: "pending",
          decision: null,
          response: null,
        };
        step.status = "awaiting_input";
      }
    }
  },

  "input.resolved": (state, frame) => {
    state.status = "streaming";
    const item = findByRequestId(state, frame.request_id);
    if (item?.inputState) {
      item.inputState.status = "submitted";
      item.inputState.decision = frame.decision;
      item.inputState.response = frame.response;
    }
  },

  "branch.fork": (state, frame) => {
    state.branches.set(frame.child_run_id, {
      meta: { mode: frame.mode, label: frame.label, task: frame.task, batchId: frame.batch_id },
      timeline: [],
      pendingContent: "",
      status: "running",
    });
    const parent = resolveTimeline(state, frame.run_id);
    const step = parent.timeline.find(s => s.callId === frame.call_id);
    if (step) {
      step.childRunIds = step.childRunIds || [];
      step.childRunIds.push(frame.child_run_id);
    }
  },

  "branch.merge": (state, frame) => {
    const branch = state.branches.get(frame.child_run_id);
    if (branch) branch.status = frame.status;
  },

  "error": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    const isDup = target.timeline.some(
      i => i.type === "error" && i.code === frame.code && i.message === frame.message);
    if (!isDup) {
      target.timeline.push({ type: "error", code: frame.code, message: frame.message });
    }
  },

  "run.done": (state, frame) => {
    state.status = "done";
    state.bundle = frame.bundle;
  },
};

function resolveTimeline(state, runId) {
  if (state.branches.has(runId)) return state.branches.get(runId);
  return state;
}
```

### 3.3 Deleted Complexity

| Current Code | ~Lines | Replacement |
|-------------|--------|-------------|
| subagentMetaByRunIdRef + subagentFramesByRunIdRef + eager registration | ~500 | `state.branches` Map; `branch.fork` guarantees ordering |
| pendingToolConfirmationRequests + toolConfirmationUiStateById + confirmationIdByCallId + confirmationCallIdById | ~400 | `step.inputState` single object |
| intermediateFinalMessageSeqs + 5-way final_message heuristic | ~60 | `pendingContent` buffer rule |
| syncAssistantSubagentState() serialization | ~50 | Direct state maintenance |
| isKnownSubagentRunId() + eager registration | ~100 | Not needed — `branch.fork` guaranteed first |

**Target:** 2664 lines → ~800 lines.

### 3.4 Unified Input API

```javascript
async function submitInput(requestId, decision, response = null) {
  await api.unchain.respondInput({ request_id: requestId, decision, response });
}

// Approval
submitInput(reqId, "approved");
submitInput(reqId, "denied", { reason: "unsafe" });

// Question (select)
submitInput(reqId, "submitted", { selected: ["a.txt"] });

// Continue
submitInput(reqId, "continued");
submitInput(reqId, "stopped");
```

---

## 4. Rendering Layer

### 4.1 trace_chain.js Rebuild

**Current:** 1633 lines — event interpretation + timeline item building + subagent recursion + confirmation state machine.
**Target:** ~600 lines — pure rendering. State layer does the heavy lifting.

**Timeline item mapping (1:1, no aggregation needed):**

```
State item                          → UI Render
──────────────────────────────────────────────────
{ type: "step", status: "running" }   → StepNode (spinner + tag)
{ type: "step", status: "done" }      → StepNode (completed)
{ type: "step", childRunIds: [...] }  → StepNode + BranchGraph
{ type: "step", inputState: {...} }   → StepNode + inline interaction UI
{ type: "continue" }                  → ContinueNode (standalone block)
{ type: "error" }                     → ErrorNode (deduplicated)
(streaming)                           → StreamingNode (spinner)
(done + bundle)                       → TokenSummaryNode (end)
```

### 4.2 StepNode Layout

```
┌──────────────────────────────────────────┐
│ ●  [ToolTag]  description        +123ms  │  Title: point + tag + desc + delta
│    I'll look into that file...           │  Content: low opacity (only if present)
│                                          │
│    ┌── Interaction (only if inputState) ─┐│
│    │  [Options / Approval UI]            ││  Pending: actionable
│    │  or: Selected xxx (gray, disabled)  ││  Submitted: persistent display
│    └─────────────────────────────────────┘│
│                                          │
│    ▶ Details                             │  Collapsible: arguments + result + error
└──────────────────────────────────────────┘
```

**Approval rendering:**
- Pending: `[Approve] [Deny]` buttons
- Submitted: `Approved` or `Denied: reason` (disabled, gray, persistent)

**Question rendering:**
- Pending: question text + radio/checkbox options + `[Submit]`
- Submitted: `Selected: option_name` (disabled, gray, persistent)

**Continue (standalone block):**
- Pending: `[Continue] [Stop]` buttons
- Submitted: `Continued` or `Stopped` (disabled, gray)

### 4.3 Main Timeline Freeze

```javascript
function buildTimelineItems(state) {
  const items = [];
  let hasActiveBranch = false;

  for (const item of state.timeline) {
    items.push(renderItem(item));

    if (item.childRunIds?.length > 0) {
      const allDone = item.childRunIds.every(
        id => state.branches.get(id)?.status !== "running");
      if (!allDone) {
        hasActiveBranch = true;
        break;  // Main timeline stops rendering here
      }
    }
  }

  if (!hasActiveBranch) {
    if (state.status === "streaming") items.push(streamingItem(state.pendingContent));
    if (state.status === "done" && state.bundle) items.push(tokenSummaryItem(state.bundle));
  }

  return items;
}
```

Visual effect: main timeline stops at fork point. No spinner, no new items. Focus shifts to sub-branch.

### 4.4 branch_graph.js Redesign

**Current:** ForkCurve → AnimatedChildren(BranchNodes) → MergeCurve.
**New architecture:**

```
<BranchGraph>
  <ForkCurve animated />
  {branches.map(branch =>
    <BranchItem key={branch.key}>
      <BranchHeader>
        <SubagentTag label />
        <StatusIndicator status />
        <TaskPreview text />
        <ExpandToggle />
      </BranchHeader>
      <AnimatedHeight open={branch.isExpanded}>
        {branch.children}  /* Recursive <TraceChain /> */
      </AnimatedHeight>
    </BranchItem>
  )}
  {showMerge && <MergeCurve animated status={mergeStatus} />}
</BranchGraph>
```

**Props:**

```javascript
{
  branches: [{
    key: string,           // child_run_id
    label: string,         // display name
    task: string,          // task description
    status: "running" | "done" | "error",
    isExpanded: boolean,   // controlled by smart collapse
    children: ReactNode,   // recursive <TraceChain />
  }],
  showMerge: boolean,      // true only when ALL branches complete
  mergeStatus: string,     // "completed" | "failed" | "partial"
  isDark: boolean,
  onToggle: (key) => void,
}
```

**Key changes:**

1. **MergeCurve conditional rendering:** Only rendered when `showMerge=true`, with enter animation.
2. **ForkCurve draw animation:** SVG stroke-dasharray/offset animation.
3. **BranchItem enter animation:** Staggered slide-down + fade-in.
4. **Active branch pulse:** Track line subtly pulses for running branches.
5. **Spinner placement:** Sub-branch TraceChain renders its own streaming item with spinner. Main timeline does NOT render a spinner (frozen).

### 4.5 Smart Collapse

Managed in trace_chain.js, not branch_graph:

```javascript
function deriveExpandedSet(branches, manualOverrides) {
  const auto = new Set();

  // 1. All running branches: force expanded
  for (const [id, branch] of branches) {
    if (branch.status === "running") auto.add(id);
  }

  // 2. No running branches → expand most recently completed
  if (auto.size === 0) {
    const lastCompleted = findMostRecentCompleted(branches);
    if (lastCompleted) auto.add(lastCompleted);
  }

  // 3. Manual overrides take precedence
  const result = new Set(auto);
  for (const [id, expanded] of manualOverrides) {
    if (expanded) result.add(id);
    else result.delete(id);
  }

  return result;
}
```

Behavior:
1. delegate_1 starts → expanded
2. delegate_1 completes → stays expanded
3. delegate_2 starts → delegate_1 auto-collapses, delegate_2 expands
4. User manually clicks delegate_1 → re-expands (override)

### 4.6 Error Deduplication

- Error appears in timeline OR message bubble, never both.
- If timeline contains an error item → bubble suppresses error display.
- Same `code + message` combo only appears once in any given timeline.

### 4.7 Animations

**Easing constant (shared):**
```css
--ease-out: cubic-bezier(0.32, 0.72, 0, 1);
```

**ForkCurve draw:**
```css
@keyframes forkDraw {
  from { stroke-dashoffset: 40; }
  to   { stroke-dashoffset: 0; }
}
.fork-curve path {
  stroke-dasharray: 40;
  animation: forkDraw 0.35s var(--ease-out) forwards;
}
```

**MergeCurve appear:**
```css
@keyframes mergeAppear {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**BranchItem enter (staggered):**
```css
@keyframes branchEnter {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.branch-item { animation: branchEnter 0.3s var(--ease-out) forwards; }
.branch-item:nth-child(2) { animation-delay: 0.05s; }
.branch-item:nth-child(3) { animation-delay: 0.10s; }
```

**Active branch track pulse:**
```css
@keyframes trackPulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}
.branch-track-line[data-status="running"] {
  animation: trackPulse 2s ease-in-out infinite;
}
```

**Dot/line status transitions:**
```css
.timeline-dot { transition: background 0.4s var(--ease-out), transform 0.4s var(--ease-out); }
.timeline-line { transition: background 0.45s var(--ease-out); }
```

---

## 5. Summary: Files Changed

### Unchain (backend)

| File | Change | Impact |
|------|--------|--------|
| `agent/agent.py` | `run()` signature: 3 callbacks → 1 `on_input` | Medium |
| `kernel/loop.py` | Remove ~8 event emissions, add `on_input` for max_iterations | High |
| `providers/model_io.py` | Remove `request_messages`, `previous_response_id_fallback` emissions, remove `accumulated_text` from token_delta | Low |
| `tools/execution.py` | Unify tool_confirm + human_input into `on_input` | High |
| `tools/confirmation.py` | Remove `tool_confirmed`/`tool_denied` emissions | Low |
| `subagents/plugin.py` | Fix child_run_id passing, consolidate to `branch_fork`/`branch_merge` | High |
| New: `types/input.py` | `InputRequest`, `InputResponse` dataclasses | New file |

### PuPu Backend (adapter)

| File | Change | Impact |
|------|--------|--------|
| `unchain_runtime/server/unchain_adapter.py` | Rewrite: 3700 → ~800 lines. Single on_input, EVENT_MAP, simple queue | Critical |
| `unchain_runtime/server/route_chat.py` | New `/chat/input/respond` endpoint, remove old `/chat/tool/confirmation` | Medium |

### PuPu Frontend

| File | Change | Impact |
|------|--------|--------|
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Rewrite: 2664 → ~800 lines. Semantic event handlers, simplified state | Critical |
| `src/COMPONENTs/chat-bubble/trace_chain.js` | Rewrite: 1633 → ~600 lines. Pure rendering, 1:1 item mapping | Critical |
| `src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js` | Major rework: conditional merge, animations, new props API | High |
| `src/SERVICEs/api.unchain.js` | New `respondInput()`, remove `respondToolConfirmation()` | Low |
| `electron/preload/stream/unchain_stream_client.js` | Simplify frame routing (no more special-casing by type) | Low |
| `electron/preload/bridges/unchain_bridge.js` | Update IPC channel for new endpoint | Low |
| `electron/main/services/unchain/service.js` | Add `/chat/input/respond` proxy, simplify stream event handling | Low |

### Net Effect

- **~8,000 lines removed** (adapter 2900 + use_chat_stream 1860 + trace_chain 1030)
- **~2,200 lines added** (new adapter 800 + new use_chat_stream 800 + new trace_chain 600)
- **Net reduction: ~5,800 lines**
- **Event types: 25 → 10**
- **IDs in SSE frames: 8 → 3**
- **Blocking callbacks: 3 → 1**
- **State machines: 3 → 1**
