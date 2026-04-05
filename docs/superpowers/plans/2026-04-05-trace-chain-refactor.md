# Trace Chain & Streaming Protocol Full-Stack Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign SSE streaming protocol from 25 to 10 event types, unify 3 input callbacks into 1, fix subagent run_id mismatch, rebuild trace_chain/branch_graph rendering with smart collapse and animations. Net reduction ~5,800 lines.

**Architecture:** Backend-first approach. Phase 1 adds new API alongside old (backwards compatible). Phase 2 rewrites the PuPu adapter to use new API. Phase 3 rewrites frontend to consume new SSE format. Phase 4 removes old code.

**Tech Stack:** Python 3.12+ (unchain kernel, Flask adapter), JavaScript/React 19 (PuPu frontend), Electron 40 (IPC bridge)

**Spec:** `docs/superpowers/specs/2026-04-05-trace-chain-refactor-design.md`

**Repos:**
- Unchain: `/Users/red/Desktop/GITRepo/unchain/`
- PuPu: `/Users/red/Desktop/GITRepo/PuPu/`

---

## Phase 1: Unchain Kernel (后端核心)

### Task 1: Create InputRequest / InputResponse Types

**Files:**
- Create: `/Users/red/Desktop/GITRepo/unchain/src/unchain/types/__init__.py`
- Create: `/Users/red/Desktop/GITRepo/unchain/src/unchain/types/input.py`
- Test: `/Users/red/Desktop/GITRepo/unchain/tests/test_input_types.py`

- [ ] **Step 1: Write test for InputRequest/InputResponse**

```python
# tests/test_input_types.py
from unchain.types.input import InputRequest, InputResponse


def test_input_request_approval():
    req = InputRequest(
        kind="approval",
        run_id="run-1",
        call_id="call-1",
        tool_name="write_file",
        config={"arguments": {"path": "/tmp/test.txt"}, "description": "Write file"},
    )
    assert req.kind == "approval"
    assert req.call_id == "call-1"
    assert req.config["arguments"]["path"] == "/tmp/test.txt"


def test_input_request_question():
    req = InputRequest(
        kind="question",
        run_id="run-1",
        call_id="call-2",
        tool_name="ask_user_question",
        config={
            "title": "Select file",
            "question": "Which?",
            "selection_mode": "single",
            "options": [{"value": "a.txt", "text": "a.txt"}],
        },
    )
    assert req.kind == "question"
    assert req.config["selection_mode"] == "single"


def test_input_request_continue():
    req = InputRequest(
        kind="continue",
        run_id="run-1",
        call_id=None,
        tool_name=None,
        config={"reason": "max_iterations_reached"},
    )
    assert req.call_id is None
    assert req.tool_name is None


def test_input_response_approved():
    resp = InputResponse(decision="approved", response=None)
    assert resp.decision == "approved"


def test_input_response_submitted():
    resp = InputResponse(decision="submitted", response={"selected": ["a.txt"]})
    assert resp.response["selected"] == ["a.txt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_input_types.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'unchain.types'`

- [ ] **Step 3: Create types package and InputRequest/InputResponse**

```python
# src/unchain/types/__init__.py
from .input import InputRequest, InputResponse

__all__ = ["InputRequest", "InputResponse"]
```

```python
# src/unchain/types/input.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class InputRequest:
    """Unified request for user input during agent execution.

    kind:
        "approval"  — tool execution approval (config: arguments, description)
        "question"  — ask_user_question (config: title, question, options, ...)
        "continue"  — max iterations reached (config: reason; call_id is None)
    """

    kind: str
    run_id: str
    call_id: str | None
    tool_name: str | None
    config: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InputResponse:
    """User's response to an InputRequest.

    decision:
        "approved" | "denied"     — for kind=approval
        "submitted"               — for kind=question
        "continued" | "stopped"   — for kind=continue
    """

    decision: str
    response: dict[str, Any] | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_input_types.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/types/ tests/test_input_types.py
git commit -m "feat(types): add InputRequest/InputResponse for unified input model"
```

---

### Task 2: Update Agent.run() Signature

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/agent/agent.py` (lines 148-189)

**Goal:** Add `on_input` parameter alongside existing callbacks (backwards compatible).

- [ ] **Step 1: Add on_input parameter to Agent.run()**

In `/Users/red/Desktop/GITRepo/unchain/src/unchain/agent/agent.py`, add the import at top:

```python
from unchain.types.input import InputRequest, InputResponse
```

Update the `run()` method signature (around line 148) to add `on_input`:

```python
def run(
    self,
    messages: str | list[dict[str, Any]],
    *,
    payload: dict[str, Any] | None = None,
    response_format: Any = None,
    callback: Callable[[dict[str, Any]], None] | None = None,
    verbose: bool = False,
    max_iterations: int | None = None,
    max_context_window_tokens: int | None = None,
    previous_response_id: str | None = None,
    on_tool_confirm: Callable[..., Any] | None = None,
    on_human_input: Callable[..., Any] | None = None,
    on_max_iterations: Callable[..., Any] | None = None,
    on_input: Callable[[InputRequest], InputResponse] | None = None,  # NEW
    session_id: str | None = None,
    memory_namespace: str | None = None,
    run_id: str | None = None,
    tool_runtime_config: dict[str, Any] | None = None,
) -> KernelRunResult:
```

Then pass `on_input` through to the kernel loop call inside `run()`. Find where `_run_state` is called and add `on_input=on_input` to the kwargs.

- [ ] **Step 2: Pass on_input through to _run_state and step_once**

In `kernel/loop.py`, update `_run_state` signature (around line 601) to accept `on_input`:

```python
def _run_state(
    self,
    state: RunState,
    *,
    # ... existing params ...
    on_tool_confirm: Any = None,
    on_human_input: Any = None,
    on_max_iterations: Any = None,
    on_input: Callable | None = None,  # NEW
    # ... rest ...
) -> KernelRunResult:
```

And `step_once` signature (around line 184):

```python
def step_once(
    self,
    state: RunState,
    *,
    # ... existing params ...
    on_tool_confirm: Any = None,
    on_human_input: Any = None,
    on_input: Callable | None = None,  # NEW
    # ... rest ...
) -> ModelTurnResult:
```

Pass `on_input` through all internal calls from `_run_state` → `step_once`.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_kernel_agent.py -v --timeout=30`
Expected: All existing tests pass (on_input defaults to None, no behavior change)

- [ ] **Step 4: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/agent/agent.py src/unchain/kernel/loop.py
git commit -m "feat(agent): add on_input parameter to Agent.run() (backwards compatible)"
```

---

### Task 3: Kernel Event Emission Cleanup + on_input for max_iterations

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/kernel/loop.py`
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/providers/model_io.py`

**Goal:** Remove ~8 unnecessary event emissions. Replace `run_max_iterations` with `on_input(kind="continue")`. Remove `accumulated_text` from token_delta. Add `bundle` to `run_completed`. Add `model`/`thread_id` to `run_started`.

- [ ] **Step 1: Remove iteration_started/completed, response_received, memory_prepare/commit emissions from loop.py**

In `/Users/red/Desktop/GITRepo/unchain/src/unchain/kernel/loop.py`:

Delete or comment out these emit_event calls:
- Line ~687: `emit_event(..., "iteration_started", ...)` — DELETE entire call
- Line ~744: `emit_event(..., "iteration_completed", ...)` — DELETE entire call
- Line ~708: `emit_event(..., "response_received", ...)` — DELETE entire call
- Line ~233: `emit_event(..., "memory_prepare", ...)` — DELETE entire block (keep the memory logic, just remove the event)
- Line ~286: `emit_event(..., "memory_commit", ...)` — DELETE entire block (keep the memory logic)

- [ ] **Step 2: Remove final_message emission, add bundle to run_completed**

In loop.py, find the `emit_event("final_message", ...)` calls (lines ~725 and ~751) — DELETE both.

Update the `emit_event("run_completed", ...)` calls to include the bundle:

```python
self.emit_event(
    callback,
    "run_completed",
    run_id,
    iteration=max(0, int(state.iteration) - 1),
    status="completed",
    bundle=self._build_bundle(state),
)
```

Ensure `_build_bundle()` (or equivalent) returns token usage dict. Check existing code for how bundle is constructed for `run_max_iterations` and reuse that pattern.

- [ ] **Step 3: Replace run_max_iterations with on_input(kind="continue")**

In loop.py `_run_state()`, find the max_iterations handling (lines ~655-684). Replace:

```python
# OLD: emit event + call on_max_iterations
# self.emit_event(callback, "run_max_iterations", run_id, ...)
# if on_max_iterations:
#     should_continue = on_max_iterations(bundle)

# NEW: use on_input if available, fall back to on_max_iterations
if on_input:
    from unchain.types.input import InputRequest, InputResponse
    resp = on_input(InputRequest(
        kind="continue",
        run_id=run_id,
        call_id=None,
        tool_name=None,
        config={"reason": "max_iterations_reached", "iterations_used": int(state.iteration)},
    ))
    should_continue = resp.decision == "continued"
elif on_max_iterations:
    should_continue = on_max_iterations(bundle)
else:
    should_continue = False
```

- [ ] **Step 4: Remove request_messages and accumulated_text from providers**

In `/Users/red/Desktop/GITRepo/unchain/src/unchain/providers/model_io.py`:

1. Find `_emit_request_messages()` calls (line ~232) — DELETE the call sites (keep the method for now, just don't call it). Or add a flag to suppress.

2. Find all `token_delta` emissions (lines ~380, ~685, ~885) and remove the `accumulated_text` field:

```python
# OLD
self._emit(request.callback, "token_delta", request.run_id,
    iteration=request.iteration, provider="openai",
    delta=delta, accumulated_text="".join(collected_chunks))

# NEW
self._emit(request.callback, "token_delta", request.run_id,
    iteration=request.iteration, provider="openai",
    delta=delta)
```

Do this for all 3 provider implementations (OpenAI, Anthropic, Ollama).

- [ ] **Step 5: Verify tests pass**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/ --timeout=30 -x -q`
Expected: Tests that relied on old events may need updating. Fix any broken assertions.

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/kernel/loop.py src/unchain/providers/model_io.py
git commit -m "refactor(kernel): remove 8 unused event emissions, add on_input for max_iterations"
```

---

### Task 4: Unified on_input for Tool Confirmation + Human Input

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/tools/execution.py`
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/tools/confirmation.py`

**Goal:** When `on_input` is provided, use it for both tool confirmation and ask_user_question. Remove `tool_confirmed`/`tool_denied` event emissions. Keep old callbacks working as fallback.

- [ ] **Step 1: Add on_input path for tool confirmation in confirmation.py**

In `/Users/red/Desktop/GITRepo/unchain/src/unchain/tools/confirmation.py`, update `execute_confirmable_tool_call()` (line ~56):

Add `on_input` parameter. When provided, use it instead of `on_tool_confirm`:

```python
def execute_confirmable_tool_call(
    tool_call, context, *, on_tool_confirm=None, on_input=None,
):
    # ... existing setup ...

    if on_input:
        from unchain.types.input import InputRequest
        resp = on_input(InputRequest(
            kind="approval",
            run_id=context.run_id,
            call_id=tool_call.call_id,
            tool_name=tool_call.name,
            config={
                "arguments": copy.deepcopy(tool_call.arguments),
                "description": getattr(tool_call, "description", ""),
            },
        ))
        if resp.decision == "approved":
            modified_args = resp.response.get("modified_arguments") if resp.response else None
            if modified_args:
                tool_call = tool_call.with_arguments(modified_args)
            # Execute tool (NO tool_confirmed event — adapter handles input.resolved)
            return _execute_tool(tool_call, context)
        else:
            reason = resp.response.get("reason", "denied") if resp.response else "denied"
            return ToolExecutionOutcome(
                tool_result={"denied": True, "reason": reason},
                call_id=tool_call.call_id,
            )
    elif on_tool_confirm:
        # ... existing on_tool_confirm logic (unchanged) ...
```

- [ ] **Step 2: Add on_input path for human input in execution.py**

In `/Users/red/Desktop/GITRepo/unchain/src/unchain/tools/execution.py`, find the human input handling (around line 171). When `on_input` is provided, use it instead of `on_human_input`:

```python
if is_human_input_tool_name(tool_call.name):
    request = parse_human_input_request(tool_call)

    if on_input:
        from unchain.types.input import InputRequest
        resp = on_input(InputRequest(
            kind="question",
            run_id=context.run_id,
            call_id=tool_call.call_id,
            tool_name=tool_call.name,
            config={
                "request_id": request.request_id,
                "title": request.title,
                "question": request.question,
                "selection_mode": request.selection_mode,
                "options": [opt.to_dict() for opt in request.options],
                "allow_other": request.allow_other,
                "other_label": request.other_label,
                "other_placeholder": request.other_placeholder,
                "min_selected": request.min_selected,
                "max_selected": request.max_selected,
            },
        ))
        # Convert InputResponse to tool result format
        tool_result = _build_human_input_tool_result(request, resp)
        emit_loop_event(context.loop, context.callback, "tool_result",
            context.run_id, iteration=context.iteration,
            tool_name=tool_call.name, call_id=tool_call.call_id, result=tool_result)
        return  # Continue agent loop with result
    elif on_human_input:
        # ... existing on_human_input logic (unchanged) ...
```

Add helper:

```python
def _build_human_input_tool_result(request, resp):
    """Convert InputResponse to the tool result format expected by the agent."""
    if resp.response and "selected" in resp.response:
        return {"request_id": request.request_id, "selected_values": resp.response["selected"]}
    if resp.response and "text" in resp.response:
        return {"request_id": request.request_id, "text": resp.response["text"]}
    return {"request_id": request.request_id, "response": resp.response}
```

- [ ] **Step 3: Pass on_input through tool execution call chain**

Ensure `on_input` is passed from `step_once` → tool execution harness → `execute_confirmable_tool_call` and human input handler. Trace the call chain in execution.py and add the parameter at each level.

- [ ] **Step 4: Verify tests pass**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_human_input.py tests/test_kernel_agent.py -v --timeout=30`
Expected: Pass (old callbacks still work, on_input is optional)

- [ ] **Step 5: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/tools/execution.py src/unchain/tools/confirmation.py
git commit -m "feat(tools): add on_input path for tool confirmation and human input"
```

---

### Task 5: Subagent branch_fork/branch_merge + child_run_id Fix

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/subagents/plugin.py`

**Goal:** (1) Pass `child_run_id` as explicit `run_id` to child.run(). (2) Replace subagent_spawned/started with `branch_fork`. (3) Replace subagent_completed/failed with `branch_merge`. Keep old events alongside new for now.

- [ ] **Step 1: Add branch_fork/branch_merge emission helper**

In `plugin.py`, add a new helper alongside `_emit_subagent_event` (around line 348):

```python
def _emit_branch_event(self, context, event_type, *, child_run_id, mode, label, task=None, batch_id=None, status=None, **extra):
    """Emit branch_fork or branch_merge event."""
    payload = {
        "child_run_id": child_run_id,
        "mode": mode,
        "label": label,
    }
    if task is not None:
        payload["task"] = task
    if batch_id is not None:
        payload["batch_id"] = batch_id
    if status is not None:
        payload["status"] = status
    payload.update(extra)
    emit_loop_event(
        context.loop, context.callback, event_type,
        context.run_id, iteration=context.iteration, **payload,
    )
```

- [ ] **Step 2: Update _delegate() — emit branch_fork/merge + pass child_run_id**

In `_delegate()` (lines 378-467):

```python
# BEFORE child.run():
# OLD: self._emit_subagent_event(context, "subagent_spawned", ...)
#      self._emit_subagent_event(context, "subagent_started", ...)
# NEW:
self._emit_branch_event(context, "branch_fork",
    child_run_id=child_run_id, mode="delegate",
    label=child_id, task=task_description)

# KEY FIX: pass child_run_id as run_id to child agent
child_result = child_agent.run(
    messages,
    callback=context.callback,
    run_id=child_run_id,  # <-- THIS IS THE FIX
    on_input=context_kwargs.get("on_input"),
    # ... other kwargs ...
)

# AFTER child.run():
# OLD: self._emit_subagent_event(context, "subagent_completed"/"subagent_failed", ...)
# NEW:
status = "completed" if child_result.status == "completed" else "failed"
self._emit_branch_event(context, "branch_merge",
    child_run_id=child_run_id, mode="delegate",
    label=child_id, status=status)
```

- [ ] **Step 3: Update _handoff() — same pattern**

In `_handoff()` (lines 469-588), apply the same changes:
- Replace subagent_spawned + subagent_handoff + subagent_started with single `branch_fork` (mode="handoff")
- Pass `run_id=child_run_id` to child.run()
- Replace subagent_completed with `branch_merge`

- [ ] **Step 4: Update _spawn_worker_batch() — one fork per worker**

In `_spawn_worker_batch()` (lines 590-770):
- Replace `subagent_batch_started` with one `branch_fork` per worker (each with unique child_run_id, shared batch_id)
- Pass `run_id=child_run_id` to each worker's agent.run()
- After each worker completes, emit `branch_merge` for that worker

- [ ] **Step 5: Verify subagent tests pass**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_kernel_subagents.py -v --timeout=60`
Expected: May need updating for new event types. Adjust assertions.

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/subagents/plugin.py
git commit -m "feat(subagents): emit branch_fork/merge, fix child_run_id passed to child.run()"
```

---

## Phase 2: PuPu Adapter Rewrite (Python 后端)

### Task 6: Rewrite unchain_adapter.py

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py`

**Goal:** Replace 3700 lines with ~800 lines. Single `on_input` callback, EVENT_MAP mapping, simple queue consumer.

**Strategy:** Don't modify in-place — rewrite the `stream_chat_events()` function and its dependencies. Keep agent creation logic (`_create_agent()`) largely intact.

- [ ] **Step 1: Define EVENT_MAP and build_frame at top of file**

Add near the top of `unchain_adapter.py` (after imports):

```python
_EVENT_MAP = {
    "run_started":    "run.start",
    "run_completed":  "run.done",
    "token_delta":    "token",
    "tool_call":      "step",
    "tool_result":    "step.result",
    "branch_fork":    "branch.fork",
    "branch_merge":   "branch.merge",
    "error":          "error",
}

_DONE_SENTINEL = object()


def _build_sse_frame(seq, event_type, run_id, **fields):
    """Build an SSE frame dict with seq/ts/run_id/type envelope."""
    return {
        "seq": seq,
        "ts": int(time.time() * 1000),
        "run_id": run_id,
        "type": event_type,
        **fields,
    }
```

- [ ] **Step 2: Write new stream_chat_events() with unified on_input**

Replace the existing `stream_chat_events()` (lines ~3454-3658) with:

```python
def stream_chat_events(options, thread_id, messages, attachments=None, **kwargs):
    """Stream chat events as SSE frames. Yields frame dicts."""
    agent = _create_agent(options, thread_id)
    event_queue = queue.Queue()
    seq_counter = itertools.count(1)
    child_run_ids = set()
    pending_inputs = {}

    toolkit_tool_index = _build_toolkit_tool_index(agent)

    def next_seq():
        return next(seq_counter)

    # ── Unified on_input callback ──
    def on_input(request):
        from unchain.types.input import InputResponse
        request_id = str(uuid.uuid4())
        waiter = {"event": threading.Event(), "response": None}
        pending_inputs[request_id] = waiter

        # Emit input.required frame
        event_queue.put(_build_sse_frame(
            next_seq(), "input.required", request.run_id,
            request_id=request_id,
            kind=request.kind,
            call_id=request.call_id,
            tool_name=request.tool_name,
            config=request.config,
        ))

        waiter["event"].wait()

        resp = waiter["response"]
        if resp is None:
            resp = InputResponse(decision="denied", response={"reason": "cancelled"})

        # Emit input.resolved frame
        event_queue.put(_build_sse_frame(
            next_seq(), "input.resolved", request.run_id,
            request_id=request_id,
            decision=resp.decision,
            response=resp.response,
        ))

        return resp

    # ── Event callback ──
    def on_event(event):
        event_type = event.get("type", "")
        event_run_id = event.get("run_id", "")

        # Track child run_ids from branch_fork
        if event_type == "branch_fork":
            child_run_ids.add(event.get("child_run_id", ""))

        # Filter out child run_started/run_completed (replaced by branch_fork/merge)
        if event_type in ("run_started", "run_completed") and event_run_id in child_run_ids:
            return

        sse_type = _EVENT_MAP.get(event_type)
        if not sse_type:
            return

        fields = _extract_sse_fields(event_type, event, toolkit_tool_index)
        event_queue.put(_build_sse_frame(next_seq(), sse_type, event_run_id, **fields))

    # ── Run agent in background thread ──
    run_result = [None]
    run_error = [None]

    def run_agent():
        try:
            run_result[0] = agent.run(
                messages,
                callback=on_event,
                on_input=on_input,
                session_id=thread_id,
                payload=options.get("payload"),
                max_iterations=options.get("max_iterations", 6),
                verbose=False,
                emit_stream=True,
            )
        except Exception as exc:
            run_error[0] = exc
        finally:
            event_queue.put(_DONE_SENTINEL)

    worker = threading.Thread(target=run_agent, daemon=True)
    worker.start()

    # ── Drain queue and yield frames ──
    while True:
        item = event_queue.get()
        if item is _DONE_SENTINEL:
            break
        yield item

    # Emit error if agent crashed
    if run_error[0]:
        yield _build_sse_frame(
            next_seq(), "error", "",
            code="agent_error", message=str(run_error[0]),
        )

    # Emit run.done if not already emitted
    result = run_result[0]
    if result:
        bundle = {
            "input_tokens": getattr(result, "input_tokens", 0),
            "output_tokens": getattr(result, "output_tokens", 0),
            "total_tokens": getattr(result, "consumed_tokens", 0),
        }
        yield _build_sse_frame(
            next_seq(), "run.done", getattr(result, "run_id", ""),
            status=getattr(result, "status", "completed"), bundle=bundle,
        )

    # Store pending_inputs reference for external access
    stream_chat_events._pending_inputs = pending_inputs
```

- [ ] **Step 3: Write _extract_sse_fields() helper**

```python
def _extract_sse_fields(event_type, event, toolkit_tool_index):
    """Extract relevant fields from an unchain event for the SSE frame."""
    fields = {}

    if event_type == "run_started":
        fields["model"] = event.get("model", "")
        fields["thread_id"] = event.get("thread_id", "")

    elif event_type == "token_delta":
        fields["delta"] = event.get("delta", "")

    elif event_type == "tool_call":
        fields["call_id"] = event.get("call_id", "")
        fields["tool_name"] = event.get("tool_name", "")
        fields["arguments"] = event.get("arguments", {})
        # Toolkit metadata
        tool_info = toolkit_tool_index.get(event.get("tool_name", ""), {})
        if tool_info:
            fields["toolkit_id"] = tool_info.get("toolkit_id", "")
            fields["tool_display_name"] = tool_info.get("display_name", "")

    elif event_type == "tool_result":
        fields["call_id"] = event.get("call_id", "")
        fields["tool_name"] = event.get("tool_name", "")
        fields["result"] = event.get("result", {})

    elif event_type == "branch_fork":
        fields["child_run_id"] = event.get("child_run_id", "")
        fields["call_id"] = event.get("call_id", "")
        fields["mode"] = event.get("mode", "")
        fields["label"] = event.get("label", "")
        fields["task"] = event.get("task", "")
        fields["batch_id"] = event.get("batch_id")

    elif event_type == "branch_merge":
        fields["child_run_id"] = event.get("child_run_id", "")
        fields["status"] = event.get("status", "")
        fields["bundle"] = event.get("bundle")

    elif event_type == "run_completed":
        fields["status"] = event.get("status", "completed")
        fields["bundle"] = event.get("bundle", {})

    elif event_type == "error":
        fields["code"] = event.get("code", "unknown")
        fields["message"] = event.get("message", "")

    return fields
```

- [ ] **Step 4: Write submit_input() function (replaces submit_tool_confirmation)**

```python
def submit_input(request_id, decision, response=None):
    """Resume a blocked on_input callback with the user's response."""
    from unchain.types.input import InputResponse

    pending = getattr(stream_chat_events, "_pending_inputs", {})
    waiter = pending.get(request_id)
    if not waiter:
        return False
    waiter["response"] = InputResponse(decision=decision, response=response)
    waiter["event"].set()
    return True
```

- [ ] **Step 5: Delete old callback factories**

Remove these functions from `unchain_adapter.py`:
- `_make_tool_confirm_callback()` (~70 lines)
- `_make_human_input_callback()` (~85 lines)
- `_make_continuation_callback()` (~50 lines)
- All related helper functions for old callback patterns

Keep `_create_agent()` and `_build_toolkit_tool_index()` as they are.

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/unchain_adapter.py
git commit -m "refactor(adapter): rewrite stream_chat_events with unified on_input (3700→~800 lines)"
```

---

### Task 7: Update route_chat.py — New Endpoint + Event Map

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_chat.py`

- [ ] **Step 1: Replace _TRACE_STAGE_BY_EVENT_TYPE with new event type set**

```python
# Old: _TRACE_STAGE_BY_EVENT_TYPE dict with ~20 entries
# New: just validate known types (stage is no longer in frames)
_KNOWN_SSE_TYPES = {
    "run.start", "run.done", "token", "step", "step.result",
    "input.required", "input.resolved",
    "branch.fork", "branch.merge", "error",
}
```

- [ ] **Step 2: Simplify chat_stream_v2 SSE encoding**

Update the SSE generator in `chat_stream_v2()` (lines ~382-554). The frame dict from `stream_chat_events()` is already properly structured — just encode to SSE:

```python
@api_blueprint.post("/chat/stream/v2")
def chat_stream_v2():
    # ... existing request parsing ...

    def generate():
        try:
            for frame in stream_chat_events(options, thread_id, messages, attachments):
                yield f"event: frame\ndata: {json.dumps(frame, ensure_ascii=False, default=str)}\n\n"
        except GeneratorExit:
            cancel_pending_inputs()
        finally:
            cancel_pending_inputs()

    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    })
```

- [ ] **Step 3: Add /chat/input/respond endpoint**

```python
@api_blueprint.post("/chat/input/respond")
def respond_input():
    """Unified endpoint for user input responses (approval, question, continue)."""
    data = request.json or {}
    request_id = data.get("request_id")
    decision = data.get("decision")
    response_data = data.get("response")

    if not request_id or not decision:
        return jsonify({"error": "request_id and decision required"}), 400

    success = submit_input(request_id, decision, response_data)
    if not success:
        return jsonify({"error": "not_found", "message": f"No pending input for {request_id}"}), 404

    return jsonify({"status": "ok"})
```

- [ ] **Step 4: Keep old /chat/tool/confirmation endpoint as deprecated wrapper**

```python
@api_blueprint.post("/chat/tool/confirmation")
def chat_tool_confirmation_legacy():
    """Deprecated: use /chat/input/respond instead."""
    data = request.json or {}
    # Map old format to new
    decision = "approved" if data.get("approved") else "denied"
    response = {}
    if data.get("reason"):
        response["reason"] = data["reason"]
    if data.get("modified_arguments"):
        response["modified_arguments"] = data["modified_arguments"]
    return respond_input_internal(data.get("confirmation_id"), decision, response or None)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/route_chat.py
git commit -m "feat(routes): add /chat/input/respond endpoint, simplify SSE encoding"
```

---

## Phase 3: PuPu Electron + API Layer

### Task 8: Update Electron IPC + API Facade

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js`
- Modify: `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/unchain_bridge.js`
- Modify: `/Users/red/Desktop/GITRepo/PuPu/electron/preload/stream/unchain_stream_client.js`
- Modify: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.unchain.js`

- [ ] **Step 1: Add input/respond IPC handler in service.js**

In `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js`, find the tool confirmation handler (around line 992) and add a new handler alongside it:

```javascript
// New: unified input respond handler
const UNCHAIN_INPUT_RESPOND_ENDPOINT = "/chat/input/respond";

async function handleRespondInput(event, { request_id, decision, response }) {
  const res = await fetch(
    `http://${UNCHAIN_HOST}:${UNCHAIN_PORT}${UNCHAIN_INPUT_RESPOND_ENDPOINT}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id, decision, response }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`input respond failed: ${res.status} ${body}`);
  }
  return await res.json();
}
```

Register this handler in the IPC handlers setup.

- [ ] **Step 2: Expose in preload bridge**

In the unchain bridge file, add:

```javascript
respondInput: (payload) => ipcRenderer.invoke("unchain:respond-input", payload),
```

- [ ] **Step 3: Add respondInput to api.unchain.js**

In `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.unchain.js`:

```javascript
async respondInput({ request_id, decision, response = null }) {
  if (!request_id || !decision) {
    throw new FrontendApiError("request_id and decision are required");
  }
  return await window.unchainAPI.respondInput({ request_id, decision, response });
},
```

- [ ] **Step 4: Simplify stream client**

In `/Users/red/Desktop/GITRepo/PuPu/electron/preload/stream/unchain_stream_client.js`, the frame routing can be simplified. Currently it special-cases `stream_started`, `token_delta`, `done`, `error`. With the new protocol, ALL events come as `frame` type. The client just needs to:

1. Parse the frame
2. Check if type is `token` → call `onToken(frame.delta)`
3. Check if type is `run.done` → call `onDone(frame)`
4. Check if type is `error` → call `onError(frame)`
5. Everything else → call `onFrame(frame)`

- [ ] **Step 5: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add electron/ src/SERVICEs/api.unchain.js
git commit -m "feat(electron): add respondInput IPC handler, simplify stream client"
```

---

## Phase 4: Frontend State Layer

### Task 9: Rewrite use_chat_stream.js

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js`

**Goal:** Replace 2664 lines with ~800 lines. New semantic event handlers, simplified state.

**Strategy:** Rewrite the core `onFrame` handler and state management. Keep the outer hook structure (React state, refs, effects) but replace internals.

- [ ] **Step 1: Define new state structure**

At the top of the hook, replace the current refs/state with:

```javascript
// Replace all the old refs (subagentMetaByRunIdRef, subagentFramesByRunIdRef,
// pendingToolConfirmationRequests, toolConfirmationUiStateById, etc.)
// with a single streamState ref:

const streamStateRef = useRef({
  runId: null,
  timeline: [],
  branches: new Map(),
  pendingContent: "",
  bundle: null,
  status: "idle",
});
```

- [ ] **Step 2: Implement HANDLERS map**

```javascript
function resolveTimeline(state, runId) {
  if (state.branches.has(runId)) return state.branches.get(runId);
  return state;
}

function findByRequestId(state, requestId) {
  // Search main timeline
  for (const item of state.timeline) {
    if (item.inputState?.requestId === requestId) return item;
    if (item.type === "continue" && item.requestId === requestId) return item;
  }
  // Search branch timelines
  for (const branch of state.branches.values()) {
    for (const item of branch.timeline) {
      if (item.inputState?.requestId === requestId) return item;
    }
  }
  return null;
}

const HANDLERS = {
  "run.start": (state, frame) => {
    state.runId = frame.run_id;
    state.status = "streaming";
  },

  "token": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    target.pendingContent = (target.pendingContent || "") + (frame.delta || "");
  },

  "step": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    target.timeline.push({
      type: "step",
      callId: frame.call_id,
      toolName: frame.tool_name,
      displayName: frame.tool_display_name || frame.tool_name,
      toolkitId: frame.toolkit_id,
      arguments: frame.arguments,
      content: target.pendingContent || "",
      result: null,
      inputState: null,
      childRunIds: null,
      status: "running",
      ts: frame.ts,
    });
    target.pendingContent = "";
  },

  "step.result": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    const step = target.timeline.findLast((s) => s.callId === frame.call_id);
    if (step) {
      step.result = frame.result;
      step.status = "done";
    }
  },

  "input.required": (state, frame) => {
    state.status = "awaiting_input";
    const target = resolveTimeline(state, frame.run_id);
    if (frame.kind === "continue") {
      target.timeline.push({
        type: "continue",
        requestId: frame.request_id,
        config: frame.config,
        inputState: { status: "pending", decision: null, response: null },
        ts: frame.ts,
      });
    } else {
      const step = target.timeline.findLast((s) => s.callId === frame.call_id);
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
      meta: {
        mode: frame.mode,
        label: frame.label,
        task: frame.task,
        batchId: frame.batch_id,
      },
      timeline: [],
      pendingContent: "",
      status: "running",
    });
    const parent = resolveTimeline(state, frame.run_id);
    const step = parent.timeline.findLast((s) => s.callId === frame.call_id);
    if (step) {
      step.childRunIds = step.childRunIds || [];
      step.childRunIds.push(frame.child_run_id);
    }
  },

  "branch.merge": (state, frame) => {
    const branch = state.branches.get(frame.child_run_id);
    if (branch) {
      branch.status = frame.status === "completed" ? "done" : "error";
    }
  },

  "error": (state, frame) => {
    const target = resolveTimeline(state, frame.run_id);
    const isDup = target.timeline.some(
      (i) => i.type === "error" && i.code === frame.code && i.message === frame.message
    );
    if (!isDup) {
      target.timeline.push({
        type: "error",
        code: frame.code,
        message: frame.message,
        ts: frame.ts,
      });
    }
  },

  "run.done": (state, frame) => {
    state.status = "done";
    state.bundle = frame.bundle;
  },
};
```

- [ ] **Step 3: Replace onFrame handler**

The new `onFrame` is trivial:

```javascript
const onFrame = useCallback((frame) => {
  const handler = HANDLERS[frame.type];
  if (handler) {
    const state = streamStateRef.current;
    handler(state, frame);
    syncToReactState(state);
  }
}, []);
```

Where `syncToReactState` does a shallow copy to trigger re-render:

```javascript
function syncToReactState(state) {
  setStreamMessages((prev) => {
    const msg = prev.find((m) => m.id === assistantMessageIdRef.current);
    if (!msg) return prev;
    return prev.map((m) =>
      m.id === msg.id
        ? {
            ...m,
            content: state.pendingContent || m.content,
            status: state.status === "done" ? "done" : state.status === "error" ? "error" : "streaming",
            updatedAt: Date.now(),
            streamState: { ...state, branches: new Map(state.branches) },
          }
        : m
    );
  });
}
```

- [ ] **Step 4: Replace submitInput handler**

```javascript
const submitInput = useCallback(async (requestId, decision, response = null) => {
  try {
    await api.unchain.respondInput({ request_id: requestId, decision, response });
  } catch (err) {
    console.error("submitInput failed:", err);
  }
}, []);
```

- [ ] **Step 5: Delete old code**

Remove:
- `subagentMetaByRunIdRef`, `subagentFramesByRunIdRef`, `parentRunIdRef`
- `pendingToolConfirmationRequests`, `toolConfirmationUiStateById`
- `confirmationIdByCallIdRef`, `confirmationCallIdByIdRef`
- `isKnownSubagentRunId()`, `upsertSubagentMeta()`
- `syncAssistantSubagentState()`
- Old `onFrame` handler (lines ~1374-1970)
- Token buffering logic (now just `pendingContent` string concat)
- `intermediateFinalMessageSeqs` computation

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/PAGEs/chat/hooks/use_chat_stream.js
git commit -m "refactor(stream): rewrite use_chat_stream with semantic event handlers (2664→~800 lines)"
```

---

## Phase 5: Frontend Rendering

### Task 10: Rewrite trace_chain.js

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/trace_chain.js`

**Goal:** Replace 1633 lines with ~600 lines. Pure 1:1 rendering from streamState.

- [ ] **Step 1: Update constants and imports**

```javascript
import { useMemo, useState, useCallback, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/ConfigContext";
import BranchGraph from "../../BUILTIN_COMPONENTs/branch_graph/branch_graph";
import Timeline from "../../BUILTIN_COMPONENTs/timeline_v2/timeline";
import SeamlessMarkdown from "../../BUILTIN_COMPONENTs/seamless_markdown/seamless_markdown";
// Keep: ToolTag, SubagentTag, SubagentPoint, HammerPoint, ErrorPoint, TokenSummary, KVPanel
// Remove: DISPLAY_FRAME_TYPES, all old computed maps
```

- [ ] **Step 2: Write buildTimelineItems() with freeze logic**

```javascript
function buildTimelineItems(streamState, isDark) {
  if (!streamState) return [];
  const items = [];
  let hasActiveBranch = false;

  for (const item of streamState.timeline) {
    if (item.type === "step") {
      items.push(buildStepItem(item, streamState, isDark));
      // Check for active branches → freeze main
      if (item.childRunIds?.length > 0) {
        const allDone = item.childRunIds.every(
          (id) => streamState.branches.get(id)?.status !== "running"
        );
        if (!allDone) {
          hasActiveBranch = true;
          break;
        }
      }
    } else if (item.type === "continue") {
      items.push(buildContinueItem(item, isDark));
    } else if (item.type === "error") {
      items.push(buildErrorItem(item, isDark));
    }
  }

  if (!hasActiveBranch) {
    if (streamState.status === "streaming" || streamState.status === "awaiting_input") {
      const content = streamState.pendingContent;
      items.push({
        key: "__streaming__",
        title: content ? "Response" : "Thinking...",
        status: "active",
        point: "loading",
        body: content ? <SeamlessMarkdown content={content} isDark={isDark} /> : undefined,
      });
    }
    if (streamState.status === "done" && streamState.bundle?.total_tokens > 0) {
      items.push({
        key: "__token_summary__",
        title: <TokenSummary {...streamState.bundle} isDark={isDark} />,
        status: "done",
        point: "end",
      });
    }
  }

  return items;
}
```

- [ ] **Step 3: Write buildStepItem() with inline content and interaction**

```javascript
function buildStepItem(step, streamState, isDark) {
  const item = {
    key: step.callId,
    title: <ToolTag name={step.displayName || step.toolName} isDark={isDark} />,
    status: step.status === "done" ? "done" : "active",
    point: step.status === "running" ? "loading" : <HammerPoint isDark={isDark} />,
  };

  // Inline content (low opacity)
  if (step.content) {
    item.subtitle = step.content;  // Rendered with low opacity by Timeline
  }

  // Interaction UI (approval/question)
  if (step.inputState) {
    item.interaction = step.inputState;
    item.point = step.inputState.status === "pending" ? "loading" : <HammerPoint isDark={isDark} />;
    item.status = step.inputState.status === "pending" ? "active" : "done";
  }

  // Details (expandable: arguments + result)
  item.details = buildStepDetails(step, isDark);

  // Branch graph (if this step spawned subagents)
  if (step.childRunIds?.length > 0) {
    item.branch = buildBranchData(step, streamState, isDark);
  }

  return item;
}
```

- [ ] **Step 4: Write branch building + smart collapse**

```javascript
function buildBranchData(step, streamState, isDark) {
  const branches = step.childRunIds.map((childRunId) => {
    const branch = streamState.branches.get(childRunId);
    if (!branch) return null;
    return {
      key: childRunId,
      label: branch.meta?.label || childRunId,
      task: branch.meta?.task || "",
      status: branch.status || "running",
      children: (
        <TraceChain
          streamState={branch}
          isDark={isDark}
          _depth={(_depth || 0) + 1}
        />
      ),
    };
  }).filter(Boolean);

  const allDone = branches.every((b) => b.status !== "running");

  return { branches, showMerge: allDone };
}
```

Smart collapse (using `deriveExpandedSet` from spec):

```javascript
const [manualOverrides, setManualOverrides] = useState(new Map());

const expandedBranches = useMemo(() => {
  if (!streamState?.branches) return new Set();
  const auto = new Set();
  for (const [id, branch] of streamState.branches) {
    if (branch.status === "running") auto.add(id);
  }
  if (auto.size === 0) {
    // Find most recently added completed branch
    const ids = [...streamState.branches.keys()];
    for (let i = ids.length - 1; i >= 0; i--) {
      const b = streamState.branches.get(ids[i]);
      if (b && b.status !== "running") { auto.add(ids[i]); break; }
    }
  }
  const result = new Set(auto);
  for (const [id, expanded] of manualOverrides) {
    if (expanded) result.add(id); else result.delete(id);
  }
  return result;
}, [streamState?.branches, manualOverrides]);
```

- [ ] **Step 5: Keep existing sub-components (ToolTag, TokenSummary, KVPanel, etc.)**

Copy over unchanged: `ToolTag`, `SubagentTag`, `SubagentPoint`, `HammerPoint`, `ErrorPoint`, `TokenSummary`, `KVPanel`, `formatDelta`, `truncateInlineText`. These are small, focused, and work fine.

Delete: `intermediateFinalMessageSeqs` computation, `toolResultByCallId` map, `confirmationStatusByCallId`, `childRunIdsBySubagentId`, and all the old timeline building logic (lines 812-1559).

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/COMPONENTs/chat-bubble/trace_chain.js
git commit -m "refactor(trace_chain): rewrite with 1:1 state-to-UI mapping (1633→~600 lines)"
```

---

### Task 11: Rework branch_graph.js

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js`

**Goal:** New props API, conditional merge curve, animations.

- [ ] **Step 1: Update BranchGraph component signature**

```javascript
function BranchGraph({ branches, showMerge, mergeStatus, isDark, onToggle }) {
  // branches: [{ key, label, task, status, isExpanded, children }]
  // showMerge: boolean (true only when ALL branches complete)
  // mergeStatus: "completed" | "failed" | "partial"
```

- [ ] **Step 2: Update ForkCurve with draw animation**

```javascript
function ForkCurve({ curveReach, isDark }) {
  return (
    <svg
      width={curveReach + TRACK_W}
      height={FORK_CURVE_H}
      style={{ display: "block", overflow: "visible" }}
    >
      <path
        d={`M ${curveReach + TRACK_W / 2} 0 C ${curveReach + TRACK_W / 2} ${FORK_CURVE_H * 0.6}, ${TRACK_W / 2} ${FORK_CURVE_H * 0.4}, ${TRACK_W / 2} ${FORK_CURVE_H}`}
        fill="none"
        stroke={isDark ? "rgb(55,55,55)" : "rgb(210,210,210)"}
        strokeWidth={LINE_W}
        style={{
          strokeDasharray: 40,
          animation: "forkDraw 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        }}
      />
    </svg>
  );
}
```

- [ ] **Step 3: Make MergeCurve conditional with appear animation**

```javascript
function MergeCurve({ curveReach, isDark, status }) {
  const color = status === "failed"
    ? (isDark ? "rgb(140,68,68)" : "rgb(222,160,160)")
    : (isDark ? "rgb(25,120,117)" : "rgb(155,215,213)");

  return (
    <svg
      width={curveReach + TRACK_W}
      height={FORK_CURVE_H}
      style={{
        display: "block",
        overflow: "visible",
        animation: "mergeAppear 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards",
      }}
    >
      <path
        d={`M ${TRACK_W / 2} 0 C ${TRACK_W / 2} ${FORK_CURVE_H * 0.6}, ${curveReach + TRACK_W / 2} ${FORK_CURVE_H * 0.4}, ${curveReach + TRACK_W / 2} ${FORK_CURVE_H}`}
        fill="none"
        stroke={color}
        strokeWidth={LINE_W}
      />
    </svg>
  );
}
```

- [ ] **Step 4: Update BranchItem with enter animation + active pulse**

```javascript
function BranchItem({ branch, index, isDark, onToggle }) {
  return (
    <div
      style={{
        animation: `branchEnter 0.3s cubic-bezier(0.32, 0.72, 0, 1) ${index * 0.05}s forwards`,
        opacity: 0,  // Initial state before animation
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 24 }}>
        <div
          style={{
            width: 6, height: 6, borderRadius: "50%",
            border: `1.5px solid rgba(168,130,255,0.4)`,
            boxShadow: branch.status === "running"
              ? "0 0 0 2.5px rgba(168,130,255,0.12)"
              : "none",
            animation: branch.status === "running"
              ? "trackPulse 2s ease-in-out infinite"
              : "none",
          }}
        />
        <SubagentTag label={branch.label} isDark={isDark} />
        {branch.task && (
          <span style={{ opacity: 0.5, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
            {branch.task}
          </span>
        )}
        <ExpandToggle expanded={branch.isExpanded} onClick={() => onToggle(branch.key)} isDark={isDark} />
      </div>

      <AnimatedHeight open={branch.isExpanded}>
        {branch.children}
      </AnimatedHeight>
    </div>
  );
}
```

- [ ] **Step 5: Assemble BranchGraph render**

```javascript
function BranchGraph({ branches, showMerge, mergeStatus, isDark, onToggle }) {
  const curveReach = 22;

  return (
    <div style={{ marginLeft: 8, paddingTop: 4 }}>
      <ForkCurve curveReach={curveReach} isDark={isDark} />

      {branches.map((branch, i) => (
        <BranchItem
          key={branch.key}
          branch={branch}
          index={i}
          isDark={isDark}
          onToggle={onToggle}
        />
      ))}

      {showMerge && (
        <MergeCurve curveReach={curveReach} isDark={isDark} status={mergeStatus} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add keyframe styles**

Since PuPu uses inline styles, inject keyframes once via a style tag (or add to the component's mount effect):

```javascript
// At module level — inject keyframes once
if (typeof document !== "undefined" && !document.getElementById("branch-graph-keyframes")) {
  const style = document.createElement("style");
  style.id = "branch-graph-keyframes";
  style.textContent = `
    @keyframes forkDraw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
    @keyframes mergeAppear { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes branchEnter { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes trackPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1.0; } }
  `;
  document.head.appendChild(style);
}
```

- [ ] **Step 7: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add src/BUILTIN_COMPONENTs/branch_graph/branch_graph.js
git commit -m "refactor(branch_graph): conditional merge, staggered animations, new props API"
```

---

## Phase 6: Cleanup

### Task 12: Remove Old Code from Unchain

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/agent/agent.py`
- Modify: `/Users/red/Desktop/GITRepo/unchain/src/unchain/kernel/loop.py`

**Goal:** Remove deprecated `on_tool_confirm`, `on_human_input`, `on_max_iterations` parameters once PuPu adapter is fully migrated.

- [ ] **Step 1: Remove old callback parameters from Agent.run()**

```python
def run(
    self,
    messages: str | list[dict[str, Any]],
    *,
    payload: dict[str, Any] | None = None,
    response_format: Any = None,
    callback: Callable[[dict[str, Any]], None] | None = None,
    verbose: bool = False,
    max_iterations: int | None = None,
    max_context_window_tokens: int | None = None,
    previous_response_id: str | None = None,
    # REMOVED: on_tool_confirm, on_human_input, on_max_iterations
    on_input: Callable[[InputRequest], InputResponse] | None = None,
    session_id: str | None = None,
    memory_namespace: str | None = None,
    run_id: str | None = None,
    tool_runtime_config: dict[str, Any] | None = None,
) -> KernelRunResult:
```

- [ ] **Step 2: Remove old callback parameters from _run_state and step_once**

Same cleanup in `kernel/loop.py`.

- [ ] **Step 3: Remove old subagent events from plugin.py**

Remove the `_emit_subagent_event()` method and all calls to `subagent_spawned`, `subagent_started`, etc. Only keep `_emit_branch_event()`.

- [ ] **Step 4: Remove old tool confirmation event emissions from confirmation.py**

Remove the `emit_loop_event("tool_confirmed", ...)` and `emit_loop_event("tool_denied", ...)` calls. The on_input fallback path for old callbacks can be removed.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/ --timeout=60 -v
```

Fix any broken tests by updating to use `on_input` instead of old callbacks.

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add -A
git commit -m "cleanup: remove deprecated on_tool_confirm/on_human_input/on_max_iterations callbacks"
```

---

### Task 13: Remove Old Frontend Code

**Files:**
- Modify: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_chat.py` — Remove legacy `/chat/tool/confirmation` endpoint
- Modify: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.unchain.js` — Remove `respondToolConfirmation()`
- Modify: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js` — Remove old confirmation IPC handler

- [ ] **Step 1: Remove deprecated endpoints and handlers**

Remove:
- Legacy `chat_tool_confirmation_legacy` route from `route_chat.py`
- `UNCHAIN_TOOL_CONFIRMATION_ENDPOINT` constant from `service.js`
- Old IPC handler for tool confirmation
- `respondToolConfirmation()` from `api.unchain.js`

- [ ] **Step 2: Run full app to verify**

```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm start
```

Verify: Chat streaming works, tool approval works, ask_user_question works, subagent branches render correctly.

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add -A
git commit -m "cleanup: remove deprecated tool confirmation code"
```

---

## Execution Order Summary

| Phase | Tasks | Repo | Can run after? |
|-------|-------|------|---------------|
| 1 | Tasks 1-5 | unchain | System works (backwards compatible) |
| 2 | Tasks 6-7 | PuPu backend | Old frontend still works if adapter emits old format |
| 3 | Task 8 | PuPu electron | Bridges ready for new format |
| 4 | Task 9 | PuPu frontend state | State layer ready |
| 5 | Tasks 10-11 | PuPu frontend render | UI updated |
| 6 | Tasks 12-13 | Both | Cleanup |

**Critical path:** Tasks 2→3→4→5 (unchain) must complete before Task 6 (adapter). Tasks 6→7→8→9 are sequential. Tasks 10-11 can partially parallelize.

**Total tasks:** 13
**Estimated net change:** -5,800 lines
