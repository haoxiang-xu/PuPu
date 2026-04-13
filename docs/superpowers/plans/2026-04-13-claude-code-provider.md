# Claude Code Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Claude Code" as a new provider option in PuPu's model providers settings. When selected, PuPu routes chat through the `claude-agent-sdk` Python package instead of the native unchain agent loop, surfacing Claude Code's thinking, tool calls, and user questions in the existing PuPu UI.

**Architecture:** A new `claude_code_adapter.py` module lives alongside `unchain_adapter.py` in the Flask sidecar. `_create_agent()` branches on `provider == "claude_code"` and returns a `ClaudeCodeAgentWrapper` whose `.run(...)` signature mirrors the unchain agent — so `stream_chat_events()` needs no changes. The wrapper runs an asyncio event loop inside the existing worker thread, iterates `claude_agent_sdk.query(...)`, and maps SDK message/block types to PuPu's event dict format. A new `thinking_delta` frame type carries `ThinkingBlock` content; it renders in `trace_chain_v3.js` using PuPu's existing design language. CLI availability is detected via an Electron service mirroring the Ollama pattern.

**Tech Stack:**
- Backend: Python 3.10+, `claude-agent-sdk` (pip), `asyncio`, existing Flask sidecar
- Frontend: React 19, existing `use_chat_stream.js` trace frame pipeline
- Electron: existing service pattern (`electron/main/services/`)
- Auth: inherited from user's `claude login` state — PuPu does NOT store credentials

**Out of scope (Phase 2 or later):**
- Plan mode (user explicitly deferred)
- `Task` tool → PuPu subagent timeline mapping (for now, Task renders as a normal tool_call)
- `TodoWrite` → Todo panel
- Session resume / history deduplication (each turn re-sends full history as a fresh query)
- Rich tool confirmation with argument editing (`can_use_tool` only supports bool)

**Known limitations baked into Phase 1:**
- Each user turn starts a fresh `query()` call with the full conversation history serialized into the prompt. Wasteful but correct. Optimize via `ClaudeSDKClient` session caching in Phase 2.
- When the Claude Code provider is selected, PuPu's Qdrant memory, character system, and custom toolkits are **greyed out** in the UI. They do not apply to this backend.

---

## File Structure

**Files to create:**
- `unchain_runtime/server/claude_code_adapter.py` — the wrapper module (event mapping, async loop, ClaudeCodeAgentWrapper class)
- `unchain_runtime/server/tests/test_claude_code_adapter.py` — unit tests for event mapping + wrapper behavior
- `electron/main/services/claude_code/service.js` — CLI availability detection + IPC handlers
- `electron/main/services/claude_code/service.cjs` — CommonJS mirror for electron main
- `src/COMPONENTs/settings/model_providers/claude_code_section.js` — Settings UI section for the new provider
- `src/SERVICEs/api.claude_code.js` — renderer-side facade for the IPC calls

**Files to modify:**
- `unchain_runtime/server/unchain_adapter.py` — branch in `_create_agent()`, extend provider validation
- `unchain_runtime/server/requirements.txt` (or equivalent) — add `claude-agent-sdk>=0.1.0`
- `src/PAGEs/chat/hooks/use_chat_stream.js` — add `thinking_delta` dispatch case
- `src/COMPONENTs/chat-bubble/trace_chain_v3.js` — add `thinking_delta` to `DISPLAY_FRAME_TYPES` + add renderer
- `src/COMPONENTs/settings/model_providers/index.js` — register the new section
- `electron/main/services/index.js` (or wherever services are registered) — register `claude_code` service
- `electron/preload/index.js` — expose `window.claudeCodeAPI`
- `electron/shared/ipc_channels.js` — new IPC channel constants

---

## Task 1: Create `claude_code_adapter.py` module skeleton with lazy imports

**Files:**
- Create: `unchain_runtime/server/claude_code_adapter.py`
- Create: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Why lazy imports:** `claude-agent-sdk` may not be installed in dev environments. PuPu should load fine without it — only fail when a user actually selects the Claude Code provider.

- [ ] **Step 1: Write the failing test for module-level lazy import helper**

Create `unchain_runtime/server/tests/test_claude_code_adapter.py`:
```python
import unittest
from unittest import mock


class TestClaudeCodeAdapterImport(unittest.TestCase):
    def test_is_sdk_available_returns_bool(self):
        from unchain_runtime.server import claude_code_adapter
        result = claude_code_adapter.is_sdk_available()
        self.assertIsInstance(result, bool)

    def test_get_sdk_import_error_none_when_available(self):
        from unchain_runtime.server import claude_code_adapter
        if claude_code_adapter.is_sdk_available():
            self.assertIsNone(claude_code_adapter.get_sdk_import_error())

    def test_get_sdk_import_error_message_when_missing(self):
        with mock.patch.dict("sys.modules", {"claude_agent_sdk": None}):
            from unchain_runtime.server import claude_code_adapter
            import importlib
            importlib.reload(claude_code_adapter)
            # After reload, if SDK is missing it should report an error string
            if not claude_code_adapter.is_sdk_available():
                err = claude_code_adapter.get_sdk_import_error()
                self.assertIsInstance(err, str)
                self.assertGreater(len(err), 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
```
Expected: `ModuleNotFoundError: No module named 'unchain_runtime.server.claude_code_adapter'`

- [ ] **Step 3: Create minimal `claude_code_adapter.py`**

Create `unchain_runtime/server/claude_code_adapter.py`:
```python
"""Claude Code provider adapter.

Wraps claude-agent-sdk so that _create_agent() in unchain_adapter.py can return
an object that behaves like an unchain agent (has .run(...) method) but
internally runs Claude Code via the SDK.
"""

from __future__ import annotations

_SDK_IMPORT_ERROR: str | None = None
_SDK_MODULE = None

try:
    import claude_agent_sdk as _sdk_module
    _SDK_MODULE = _sdk_module
except ImportError as exc:  # pragma: no cover - environment dependent
    _SDK_IMPORT_ERROR = (
        f"claude-agent-sdk is not installed: {exc}. "
        "Run `pip install claude-agent-sdk` to enable the Claude Code provider."
    )


def is_sdk_available() -> bool:
    return _SDK_MODULE is not None


def get_sdk_import_error() -> str | None:
    return _SDK_IMPORT_ERROR


def get_sdk_module():
    """Return the imported claude_agent_sdk module or raise if unavailable."""
    if _SDK_MODULE is None:
        raise RuntimeError(_SDK_IMPORT_ERROR or "claude-agent-sdk not available")
    return _SDK_MODULE
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): add adapter module skeleton with lazy SDK import"
```

---

## Task 2: Event mapping — `TextBlock` → `token_delta`

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** PuPu's event queue expects dicts shaped like:
```python
{
    "type": "token_delta",
    "run_id": "<uuid>",
    "iteration": 0,
    "timestamp": time.time(),
    "session_id": "<thread_id>",
    "delta": "<text chunk>",
}
```
(from `unchain_adapter.py` lines 3471-3479). Our mapper takes SDK blocks and produces these dicts.

- [ ] **Step 1: Write the failing test**

Append to `test_claude_code_adapter.py`:
```python
from dataclasses import dataclass


@dataclass
class _FakeTextBlock:
    type: str
    text: str


class TestEventMapping(unittest.TestCase):
    def test_map_text_block_to_token_delta(self):
        from unchain_runtime.server import claude_code_adapter
        block = _FakeTextBlock(type="text", text="Hello, world")
        ctx = {"run_id": "run-abc", "iteration": 2, "session_id": "sess-1"}
        events = list(claude_code_adapter.map_content_block(block, ctx))
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["type"], "token_delta")
        self.assertEqual(event["delta"], "Hello, world")
        self.assertEqual(event["run_id"], "run-abc")
        self.assertEqual(event["iteration"], 2)
        self.assertEqual(event["session_id"], "sess-1")
        self.assertIn("timestamp", event)
```

- [ ] **Step 2: Run test to verify failure**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping -v
```
Expected: `AttributeError: module ... has no attribute 'map_content_block'`

- [ ] **Step 3: Implement `map_content_block` for TextBlock**

Add to `claude_code_adapter.py`:
```python
import time
from typing import Any, Iterable


def map_content_block(block: Any, ctx: dict) -> Iterable[dict]:
    """Convert a single SDK content block into zero or more PuPu event dicts.

    ctx carries run_id, iteration, session_id that must be stamped on every event.
    """
    block_type = getattr(block, "type", None)

    if block_type == "text":
        yield _base_event(ctx, "token_delta", delta=getattr(block, "text", ""))
        return


def _base_event(ctx: dict, event_type: str, **fields) -> dict:
    return {
        "type": event_type,
        "run_id": ctx.get("run_id", ""),
        "iteration": ctx.get("iteration", 0),
        "timestamp": time.time(),
        "session_id": ctx.get("session_id", ""),
        **fields,
    }
```

- [ ] **Step 4: Run test to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): map TextBlock to token_delta event"
```

---

## Task 3: Event mapping — `ThinkingBlock` → `thinking_delta` (new event type)

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

- [ ] **Step 1: Write the failing test**

Append to `TestEventMapping`:
```python
@dataclass
class _FakeThinkingBlock:
    type: str
    thinking: str


def test_map_thinking_block_to_thinking_delta(self):
    from unchain_runtime.server import claude_code_adapter
    block = _FakeThinkingBlock(type="thinking", thinking="Let me consider...")
    ctx = {"run_id": "run-x", "iteration": 1, "session_id": "s1"}
    events = list(claude_code_adapter.map_content_block(block, ctx))
    self.assertEqual(len(events), 1)
    self.assertEqual(events[0]["type"], "thinking_delta")
    self.assertEqual(events[0]["delta"], "Let me consider...")
    self.assertEqual(events[0]["run_id"], "run-x")
```

Note: add `_FakeThinkingBlock` dataclass at the top of the test file alongside `_FakeTextBlock`.

- [ ] **Step 2: Run test to verify failure**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping.test_map_thinking_block_to_thinking_delta -v
```
Expected: `AssertionError: 0 != 1` (no events yielded)

- [ ] **Step 3: Extend `map_content_block` for ThinkingBlock**

In `claude_code_adapter.py`, add after the text branch:
```python
    if block_type == "thinking":
        yield _base_event(ctx, "thinking_delta", delta=getattr(block, "thinking", ""))
        return
```

- [ ] **Step 4: Run test to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): map ThinkingBlock to thinking_delta event"
```

---

## Task 4: Event mapping — `ToolUseBlock` → `tool_call`

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** PuPu's `tool_call` event payload includes `call_id`, `tool_name`, `tool_display_name`, `toolkit_id`, `toolkit_name`, `arguments`, `confirmation_id`, `requires_confirmation`. For Claude Code, we fill in plausible defaults: `toolkit_id="claude_code"`, `toolkit_name="Claude Code"`, `requires_confirmation=False` (confirmation is handled via `can_use_tool` separately — see Task 7).

- [ ] **Step 1: Write the failing test**

Append to `TestEventMapping`:
```python
@dataclass
class _FakeToolUseBlock:
    type: str
    id: str
    name: str
    input: dict


def test_map_tool_use_block_to_tool_call(self):
    from unchain_runtime.server import claude_code_adapter
    block = _FakeToolUseBlock(
        type="tool_use",
        id="toolu_123",
        name="Read",
        input={"file_path": "/tmp/a.txt"},
    )
    ctx = {"run_id": "r", "iteration": 3, "session_id": "s"}
    events = list(claude_code_adapter.map_content_block(block, ctx))
    self.assertEqual(len(events), 1)
    e = events[0]
    self.assertEqual(e["type"], "tool_call")
    self.assertEqual(e["call_id"], "toolu_123")
    self.assertEqual(e["tool_name"], "Read")
    self.assertEqual(e["tool_display_name"], "Read")
    self.assertEqual(e["toolkit_id"], "claude_code")
    self.assertEqual(e["toolkit_name"], "Claude Code")
    self.assertEqual(e["arguments"], {"file_path": "/tmp/a.txt"})
    self.assertFalse(e["requires_confirmation"])
```

- [ ] **Step 2: Run test to verify failure**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping.test_map_tool_use_block_to_tool_call -v
```
Expected: `AssertionError: 0 != 1`

- [ ] **Step 3: Extend `map_content_block` for ToolUseBlock**

Add to `claude_code_adapter.py`:
```python
    if block_type == "tool_use":
        yield _base_event(
            ctx,
            "tool_call",
            call_id=getattr(block, "id", ""),
            tool_name=getattr(block, "name", ""),
            tool_display_name=getattr(block, "name", ""),
            toolkit_id="claude_code",
            toolkit_name="Claude Code",
            arguments=dict(getattr(block, "input", {}) or {}),
            confirmation_id="",
            requires_confirmation=False,
        )
        return
```

- [ ] **Step 4: Run test to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): map ToolUseBlock to tool_call event"
```

---

## Task 5: Event mapping — `ToolResultBlock` → `tool_result`

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** `ToolResultBlock.content` is a `list[TextBlock | dict]`. We flatten to a string: concat `TextBlock.text` and `str(dict)`.

- [ ] **Step 1: Write the failing test**

Append to `TestEventMapping`:
```python
@dataclass
class _FakeToolResultBlock:
    type: str
    tool_use_id: str
    content: list
    is_error: bool | None = None


def test_map_tool_result_block_to_tool_result(self):
    from unchain_runtime.server import claude_code_adapter
    block = _FakeToolResultBlock(
        type="tool_result",
        tool_use_id="toolu_123",
        content=[_FakeTextBlock(type="text", text="file contents here")],
        is_error=False,
    )
    ctx = {"run_id": "r", "iteration": 3, "session_id": "s"}
    events = list(claude_code_adapter.map_content_block(block, ctx))
    self.assertEqual(len(events), 1)
    e = events[0]
    self.assertEqual(e["type"], "tool_result")
    self.assertEqual(e["call_id"], "toolu_123")
    self.assertIn("file contents here", e["result"])
    self.assertFalse(e["is_error"])


def test_map_tool_result_block_with_error(self):
    from unchain_runtime.server import claude_code_adapter
    block = _FakeToolResultBlock(
        type="tool_result",
        tool_use_id="x",
        content=[_FakeTextBlock(type="text", text="permission denied")],
        is_error=True,
    )
    events = list(claude_code_adapter.map_content_block(block, {"run_id": "r", "iteration": 0, "session_id": "s"}))
    self.assertTrue(events[0]["is_error"])
```

- [ ] **Step 2: Run test to verify failure**

Expected: AssertionError

- [ ] **Step 3: Implement**

Add to `claude_code_adapter.py`:
```python
    if block_type == "tool_result":
        content_parts = []
        for part in getattr(block, "content", None) or []:
            if hasattr(part, "text"):
                content_parts.append(getattr(part, "text", ""))
            elif isinstance(part, dict):
                content_parts.append(str(part))
            else:
                content_parts.append(str(part))
        yield _base_event(
            ctx,
            "tool_result",
            call_id=getattr(block, "tool_use_id", ""),
            tool_name="",
            result="\n".join(content_parts),
            is_error=bool(getattr(block, "is_error", False)),
        )
        return
```

- [ ] **Step 4: Run tests to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestEventMapping -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): map ToolResultBlock to tool_result event"
```

---

## Task 6: Message-level mapping — `AssistantMessage` / `ResultMessage`

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** `AssistantMessage.content` is a list of content blocks. We iterate and call `map_content_block` for each. At the end of the full stream, `ResultMessage` signals "done", and we emit a `final_message` event assembling the full assistant text.

- [ ] **Step 1: Write the failing test**

```python
@dataclass
class _FakeAssistantMessage:
    role: str
    content: list


class TestMessageMapping(unittest.TestCase):
    def test_map_assistant_message_yields_events_per_block(self):
        from unchain_runtime.server import claude_code_adapter
        msg = _FakeAssistantMessage(
            role="assistant",
            content=[
                _FakeTextBlock(type="text", text="Let me read "),
                _FakeTextBlock(type="text", text="the file."),
                _FakeToolUseBlock(type="tool_use", id="t1", name="Read", input={"p": "a"}),
            ],
        )
        ctx = {"run_id": "r", "iteration": 1, "session_id": "s"}
        events = list(claude_code_adapter.map_message(msg, ctx))
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0]["type"], "token_delta")
        self.assertEqual(events[1]["type"], "token_delta")
        self.assertEqual(events[2]["type"], "tool_call")

    def test_map_assistant_message_accumulates_text_for_final_message(self):
        from unchain_runtime.server import claude_code_adapter
        buf = claude_code_adapter.TextBuffer()
        msg = _FakeAssistantMessage(
            role="assistant",
            content=[
                _FakeTextBlock(type="text", text="Hello "),
                _FakeTextBlock(type="text", text="world"),
            ],
        )
        list(claude_code_adapter.map_message(msg, {"run_id": "", "iteration": 0, "session_id": ""}, text_buffer=buf))
        self.assertEqual(buf.get(), "Hello world")
```

- [ ] **Step 2: Run test to verify failure**

Expected: `AttributeError: module ... has no attribute 'map_message'`

- [ ] **Step 3: Implement `map_message` and `TextBuffer`**

Add to `claude_code_adapter.py`:
```python
class TextBuffer:
    """Accumulates assistant text for the final_message event."""
    def __init__(self) -> None:
        self._parts: list[str] = []

    def append(self, text: str) -> None:
        if text:
            self._parts.append(text)

    def get(self) -> str:
        return "".join(self._parts)

    def clear(self) -> None:
        self._parts = []


def map_message(msg: Any, ctx: dict, text_buffer: "TextBuffer | None" = None) -> Iterable[dict]:
    """Convert a single SDK message into PuPu events.

    If text_buffer is provided, accumulates all TextBlock text into it so the
    caller can emit a final_message at stream end.
    """
    role = getattr(msg, "role", "")
    content = getattr(msg, "content", None) or []

    if role == "assistant":
        for block in content:
            if text_buffer is not None and getattr(block, "type", None) == "text":
                text_buffer.append(getattr(block, "text", ""))
            yield from map_content_block(block, ctx)
        return

    if role == "user":
        # ResultMessage (role="user") contains tool_result blocks
        for block in content:
            yield from map_content_block(block, ctx)
        return

    # system/other — no-op for now
    return
```

- [ ] **Step 4: Run tests to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): map AssistantMessage and ResultMessage to events"
```

---

## Task 7: `can_use_tool` callback bridging to PuPu's confirmation flow

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** PuPu's existing `on_tool_confirm` callback (`unchain_adapter.py:459-528`) blocks on `threading.Event` until the user responds. `claude-agent-sdk`'s `can_use_tool` is an **async** callback returning `bool`. We need to bridge: from async SDK-land, call the sync `on_tool_confirm`, but run it in a thread executor so we don't block the event loop. The response object from PuPu has a `"decision"` key which is `"approve"` or `"deny"`.

- [ ] **Step 1: Write the failing test**

```python
import asyncio


class TestCanUseToolBridge(unittest.TestCase):
    def test_bridge_approves_when_on_tool_confirm_returns_approve(self):
        from unchain_runtime.server import claude_code_adapter

        captured_request = {}
        def fake_on_tool_confirm(req):
            captured_request["req"] = req
            return {"decision": "approve", "modified_arguments": None}

        bridge = claude_code_adapter.make_can_use_tool_bridge(fake_on_tool_confirm)

        result = asyncio.run(bridge("Bash", {"command": "ls"}))
        self.assertTrue(result)
        self.assertIsNotNone(captured_request.get("req"))

    def test_bridge_denies_when_on_tool_confirm_returns_deny(self):
        from unchain_runtime.server import claude_code_adapter
        def fake(req):
            return {"decision": "deny"}
        bridge = claude_code_adapter.make_can_use_tool_bridge(fake)
        result = asyncio.run(bridge("Bash", {"command": "rm -rf /"}))
        self.assertFalse(result)

    def test_bridge_returns_false_when_callback_none(self):
        from unchain_runtime.server import claude_code_adapter
        bridge = claude_code_adapter.make_can_use_tool_bridge(None)
        # None callback → permissive default (allow), matching PuPu behavior
        result = asyncio.run(bridge("Read", {"file_path": "/tmp/a"}))
        self.assertTrue(result)
```

- [ ] **Step 2: Run test to verify failure**

Expected: `AttributeError: ... has no attribute 'make_can_use_tool_bridge'`

- [ ] **Step 3: Implement**

Add to `claude_code_adapter.py`:
```python
import asyncio
from typing import Awaitable, Callable


def make_can_use_tool_bridge(
    on_tool_confirm: Callable[[Any], dict] | None,
) -> Callable[[str, dict], Awaitable[bool]]:
    """Bridge PuPu's sync on_tool_confirm to SDK's async can_use_tool callback.

    Returns a function matching SDK signature:
        async def can_use_tool(tool_name: str, tool_input: dict) -> bool
    """

    async def can_use_tool(tool_name: str, tool_input: dict) -> bool:
        if on_tool_confirm is None:
            return True  # permissive default when no confirm handler wired up

        # Build a minimal request object shaped like PuPu's tool_confirm_request.
        # PuPu's _build_tool_confirmation_request_payload (unchain_adapter.py:...)
        # expects an object with tool_name and arguments attributes.
        class _Req:
            def __init__(self, name: str, args: dict):
                self.tool_name = name
                self.arguments = args
                self.request_id = ""

        req = _Req(tool_name, dict(tool_input or {}))

        # Run the blocking on_tool_confirm in a thread to not starve the loop.
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, on_tool_confirm, req)

        decision = (response or {}).get("decision", "deny")
        return decision == "approve"

    return can_use_tool
```

- [ ] **Step 4: Run tests to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestCanUseToolBridge -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): bridge async can_use_tool to PuPu on_tool_confirm"
```

---

## Task 8: `ClaudeCodeAgentWrapper` class — the `.run(...)` entry point

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** This is the object that `_create_agent()` returns when `provider == "claude_code"`. It must have a `.run(messages, payload, callback, on_tool_confirm, on_human_input, on_max_iterations, max_iterations, session_id, memory_namespace, ...)` method mirroring unchain agent's interface. Internally it:

1. Builds a `ClaudeAgentOptions` from PuPu's options
2. Runs `asyncio.run(_run_async(...))` to iterate `query()`
3. For each SDK message, calls `map_message(...)` and invokes `callback(event_dict)` for each emitted event
4. At end, emits `final_message` with accumulated text
5. Handles cancellation via `cancel_event`

**Note:** The first version serializes history into the prompt string as a workaround for single-shot `query()`. Multi-turn cleanup is Phase 2.

- [ ] **Step 1: Write the failing test**

```python
class TestClaudeCodeAgentWrapper(unittest.TestCase):
    def test_wrapper_exposes_run_method(self):
        from unchain_runtime.server import claude_code_adapter
        wrapper = claude_code_adapter.ClaudeCodeAgentWrapper(
            cwd="/tmp",
            system_prompt="",
            allowed_tools=None,
            model=None,
        )
        self.assertTrue(hasattr(wrapper, "run"))
        self.assertTrue(callable(wrapper.run))

    def test_wrapper_has_provider_attribute(self):
        """_create_agent() downstream code reads agent.provider."""
        from unchain_runtime.server import claude_code_adapter
        wrapper = claude_code_adapter.ClaudeCodeAgentWrapper(cwd="/tmp")
        self.assertEqual(wrapper.provider, "claude_code")

    def test_wrapper_run_invokes_callback_with_events(self):
        """Fake the SDK query() with pre-canned messages and verify events flow through callback."""
        from unchain_runtime.server import claude_code_adapter
        received = []

        def callback(ev):
            received.append(ev)

        # Fake async query generator
        async def fake_query(prompt, options=None):
            yield _FakeAssistantMessage(
                role="assistant",
                content=[_FakeTextBlock(type="text", text="Hi there")],
            )

        with mock.patch.object(claude_code_adapter, "_sdk_query", fake_query):
            wrapper = claude_code_adapter.ClaudeCodeAgentWrapper(cwd="/tmp")
            wrapper.run(
                messages=[{"role": "user", "content": "hello"}],
                payload={},
                callback=callback,
                max_iterations=5,
                session_id="sess-1",
            )

        types = [e["type"] for e in received]
        self.assertIn("token_delta", types)
        self.assertIn("final_message", types)
        final = [e for e in received if e["type"] == "final_message"][-1]
        self.assertEqual(final["content"], "Hi there")
```

Add the `_sdk_query` indirection in the module so tests can monkey-patch it. At module level:
```python
# Re-exported for patching in tests; real code uses get_sdk_module().query
_sdk_query = None
```

- [ ] **Step 2: Run tests to verify failure**

Expected: `AttributeError: ... has no attribute 'ClaudeCodeAgentWrapper'`

- [ ] **Step 3: Implement `ClaudeCodeAgentWrapper`**

Add to `claude_code_adapter.py`:
```python
import threading
import uuid

_sdk_query = None  # tests patch this; real .run() calls get_sdk_module().query


class ClaudeCodeAgentWrapper:
    """Object returned by _create_agent() when provider == 'claude_code'.

    Mimics unchain agent's .run(...) interface so stream_chat_events() doesn't need
    to change. Internally runs claude-agent-sdk.query() inside an asyncio loop.
    """

    def __init__(
        self,
        *,
        cwd: str | None = None,
        system_prompt: str = "",
        allowed_tools: list | None = None,
        disallowed_tools: list | None = None,
        model: str | None = None,
        mcp_servers: dict | None = None,
        max_iterations: int = 32,
    ) -> None:
        self.provider = "claude_code"
        self.model = model or ""
        self._cwd = cwd
        self._system_prompt = system_prompt
        self._allowed_tools = allowed_tools
        self._disallowed_tools = disallowed_tools
        self._mcp_servers = mcp_servers or {}
        self._max_iterations = max_iterations

    def run(
        self,
        *,
        messages: list,
        payload: dict,
        callback,
        max_iterations: int | None = None,
        on_tool_confirm=None,
        on_human_input=None,
        on_max_iterations=None,
        session_id: str = "",
        memory_namespace: str = "",
        cancel_event: threading.Event | None = None,
        **_ignored_kwargs,
    ) -> dict:
        """Runs one turn of Claude Code via the SDK. Blocks until done."""
        run_id = f"run-{uuid.uuid4()}"
        ctx = {"run_id": run_id, "iteration": 0, "session_id": session_id}
        text_buffer = TextBuffer()

        prompt = _build_prompt_from_messages(messages)
        options = _build_sdk_options(
            cwd=self._cwd,
            system_prompt=self._system_prompt,
            allowed_tools=self._allowed_tools,
            disallowed_tools=self._disallowed_tools,
            model=self.model or None,
            mcp_servers=self._mcp_servers,
            max_turns=max_iterations or self._max_iterations,
            on_tool_confirm=on_tool_confirm,
        )

        async def drive():
            query_fn = _sdk_query or get_sdk_module().query
            async for msg in query_fn(prompt=prompt, options=options):
                if cancel_event is not None and cancel_event.is_set():
                    break
                for event in map_message(msg, ctx, text_buffer=text_buffer):
                    callback(event)

        asyncio.run(drive())

        # Emit final_message with accumulated assistant text
        final_text = text_buffer.get()
        if final_text:
            callback({
                "type": "final_message",
                "run_id": run_id,
                "iteration": 0,
                "timestamp": time.time(),
                "session_id": session_id,
                "content": final_text,
            })

        return {
            "messages": messages + [{"role": "assistant", "content": final_text}],
            "bundle": {"model": self.model, "active_agent": "claude_code"},
        }


def _build_prompt_from_messages(messages: list) -> str:
    """Phase 1: serialize history into a single prompt string.

    Phase 2 will use ClaudeSDKClient for proper multi-turn.
    """
    if not messages:
        return ""
    if len(messages) == 1:
        return str(messages[0].get("content", ""))

    lines = []
    for m in messages[:-1]:
        role = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in content
            )
        lines.append(f"{role.upper()}: {content}")
    lines.append("")
    last = messages[-1]
    last_content = last.get("content", "")
    if isinstance(last_content, list):
        last_content = " ".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in last_content
        )
    lines.append(f"Current message: {last_content}")
    return "\n".join(lines)


def _build_sdk_options(
    *,
    cwd,
    system_prompt,
    allowed_tools,
    disallowed_tools,
    model,
    mcp_servers,
    max_turns,
    on_tool_confirm,
):
    sdk = get_sdk_module()
    can_use_tool = make_can_use_tool_bridge(on_tool_confirm) if on_tool_confirm else None
    return sdk.ClaudeAgentOptions(
        cwd=cwd,
        system_prompt=system_prompt or None,
        allowed_tools=allowed_tools,
        disallowed_tools=disallowed_tools,
        model=model,
        mcp_servers=mcp_servers,
        max_turns=max_turns,
        can_use_tool=can_use_tool,
    )
```

- [ ] **Step 4: Run tests to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): implement ClaudeCodeAgentWrapper.run() with async->sync bridge"
```

---

## Task 9: `AskUserQuestion` special routing → PuPu's human_input flow

**Files:**
- Modify: `unchain_runtime/server/claude_code_adapter.py`
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** When Claude Code calls its builtin `AskUserQuestion` tool, the SDK emits a `ToolUseBlock` with `name="AskUserQuestion"`. Rather than letting this render as a generic tool_call, we want it to **re-use PuPu's existing question UI**. The human_input event payload (from `_make_human_input_callback` in `unchain_adapter.py:3279-3364`) has `interact_type` ("single"/"multi") and `interact_config`. We emit a `tool_call` event with those fields so the frontend renders it as a question.

- [ ] **Step 1: Write the failing test**

```python
def test_map_askuserquestion_tool_use_becomes_question_event(self):
    from unchain_runtime.server import claude_code_adapter
    block = _FakeToolUseBlock(
        type="tool_use",
        id="q_1",
        name="AskUserQuestion",
        input={
            "question": "Which file should I edit?",
            "options": ["a.py", "b.py", "c.py"],
            "multiSelect": False,
        },
    )
    ctx = {"run_id": "r", "iteration": 0, "session_id": "s"}
    events = list(claude_code_adapter.map_content_block(block, ctx))
    self.assertEqual(len(events), 1)
    e = events[0]
    self.assertEqual(e["type"], "tool_call")
    self.assertEqual(e["tool_name"], "ask_user_question")
    self.assertEqual(e["tool_display_name"], "Ask User")
    self.assertEqual(e["toolkit_id"], "core")
    self.assertEqual(e["interact_type"], "single")
    self.assertIn("interact_config", e)
    self.assertEqual(e["interact_config"]["question"], "Which file should I edit?")
    self.assertTrue(e["requires_confirmation"])
```

- [ ] **Step 2: Run test to verify failure**

Expected: `AssertionError: 'ask_user_question' != 'AskUserQuestion'`

- [ ] **Step 3: Branch `ToolUseBlock` handling for AskUserQuestion**

Modify `map_content_block` in `claude_code_adapter.py`. Replace the `if block_type == "tool_use":` block with:
```python
    if block_type == "tool_use":
        tool_name = getattr(block, "name", "")
        tool_input = dict(getattr(block, "input", {}) or {})

        if tool_name == "AskUserQuestion":
            is_multi = bool(tool_input.get("multiSelect", False))
            yield _base_event(
                ctx,
                "tool_call",
                call_id=getattr(block, "id", ""),
                tool_name="ask_user_question",
                tool_display_name="Ask User",
                toolkit_id="core",
                toolkit_name="Core",
                arguments=tool_input,
                confirmation_id=getattr(block, "id", ""),
                requires_confirmation=True,
                interact_type="multi" if is_multi else "single",
                interact_config={
                    "question": tool_input.get("question", ""),
                    "options": tool_input.get("options", []),
                    "multi_select": is_multi,
                },
            )
            return

        yield _base_event(
            ctx,
            "tool_call",
            call_id=getattr(block, "id", ""),
            tool_name=tool_name,
            tool_display_name=tool_name,
            toolkit_id="claude_code",
            toolkit_name="Claude Code",
            arguments=tool_input,
            confirmation_id="",
            requires_confirmation=False,
        )
        return
```

- [ ] **Step 4: Run tests to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
```
Expected: PASS (all existing tests + new one)

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/server/claude_code_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): route AskUserQuestion tool to PuPu human_input UI"
```

---

## Task 10: Hook `ClaudeCodeAgentWrapper` into `_create_agent()` in `unchain_adapter.py`

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py:3164` (`_create_agent` function)
- Modify: `unchain_runtime/server/unchain_adapter.py` — update `_parse_model_overrides` (around line 608) to accept `"claude_code"` provider

**Context:** This is the integration point. We add a branch at the top of `_create_agent` that checks `provider == "claude_code"` and returns a `ClaudeCodeAgentWrapper` before the unchain path runs.

- [ ] **Step 1: Write the failing test**

Append to `test_claude_code_adapter.py`:
```python
class TestCreateAgentIntegration(unittest.TestCase):
    def test_create_agent_returns_wrapper_for_claude_code_provider(self):
        from unchain_runtime.server import unchain_adapter, claude_code_adapter
        options = {
            "provider": "claude_code",
            "workspace_roots": ["/tmp"],
        }
        # Only run this test if SDK available; otherwise skip
        if not claude_code_adapter.is_sdk_available():
            self.skipTest("claude-agent-sdk not installed")
        agent = unchain_adapter._create_agent(options, session_id="test-session")
        self.assertIsInstance(agent, claude_code_adapter.ClaudeCodeAgentWrapper)
        self.assertEqual(agent.provider, "claude_code")

    def test_create_agent_raises_clear_error_if_sdk_missing(self):
        from unchain_runtime.server import unchain_adapter, claude_code_adapter
        if claude_code_adapter.is_sdk_available():
            self.skipTest("SDK is installed, can't test missing case")
        options = {"provider": "claude_code"}
        with self.assertRaises(RuntimeError) as ctx:
            unchain_adapter._create_agent(options, session_id="test")
        self.assertIn("claude-agent-sdk", str(ctx.exception))
```

- [ ] **Step 2: Run test to verify failure**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestCreateAgentIntegration -v
```
Expected: `AssertionError: <unchain agent> is not an instance of ClaudeCodeAgentWrapper` (or similar)

- [ ] **Step 3: Patch `_parse_model_overrides` to accept `claude_code`**

In `unchain_adapter.py` around line 608, find the provider validation. Look for the set of valid providers (`{"openai", "anthropic", "ollama"}`). Change to `{"openai", "anthropic", "ollama", "claude_code"}`.

Exact edit: search for the occurrence of the tuple/set containing `"openai", "anthropic", "ollama"` in `_parse_model_overrides` and `_get_runtime_config`, and add `"claude_code"` to **each** instance.

- [ ] **Step 4: Add branch at top of `_create_agent`**

In `unchain_adapter.py` at line 3164, modify `_create_agent` — insert the branch immediately after the function signature and docstring:

```python
def _create_agent(options: Dict[str, object] | None = None, session_id: str = ""):
    # Claude Code provider branches early — it doesn't use unchain agent.
    provider_preview = (get_runtime_config(options) or {}).get("provider", "")
    if provider_preview == "claude_code":
        from unchain_runtime.server import claude_code_adapter as _cca
        if not _cca.is_sdk_available():
            raise RuntimeError(
                _cca.get_sdk_import_error()
                or "claude-agent-sdk is not installed."
            )
        workspace_roots = options.get("workspace_roots") if options else None
        cwd = workspace_roots[0] if workspace_roots else None
        opts = options or {}
        wrapper = _cca.ClaudeCodeAgentWrapper(
            cwd=cwd,
            system_prompt=str(opts.get("system_prompt", "") or ""),
            allowed_tools=opts.get("allowed_tools") or None,
            disallowed_tools=opts.get("disallowed_tools") or None,
            model=str(opts.get("model", "") or "") or None,
            mcp_servers=opts.get("mcp_servers") or {},
            max_iterations=_resolve_agent_max_iterations(options),
        )
        # Attach orchestration metadata matching unchain agent shape
        wrapper._orchestration_role = "developer"
        wrapper._orchestration_mode = "default"
        wrapper._memory_runtime = {
            "requested": False,
            "available": False,
            "reason": "claude_code_provider_unsupported",
        }
        wrapper._max_iterations = _resolve_agent_max_iterations(options)
        wrapper._toolkits = []
        wrapper._display_model = f"Claude Code / {wrapper.model or 'default'}"
        wrapper._max_context_window_tokens = 200000  # Claude Code default ballpark
        return wrapper

    # ... existing unchain agent path below (unchanged)
    UnchainAgent = _UnchainAgent
    # ... rest of the original function body
```

- [ ] **Step 5: Run tests to verify pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
python -m unittest unchain_runtime.server.tests.test_unchain_adapter_capabilities -v
```
Expected: PASS (both the new integration tests AND the existing capabilities tests)

- [ ] **Step 6: Commit**

```bash
git add unchain_runtime/server/unchain_adapter.py unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "feat(claude-code): route claude_code provider through wrapper in _create_agent"
```

---

## Task 11: End-to-end backend test — `stream_chat_events` with a faked SDK

**Files:**
- Modify: `unchain_runtime/server/tests/test_claude_code_adapter.py`

**Context:** Confirm that a full `stream_chat_events()` call with `provider="claude_code"` yields the expected event sequence.

- [ ] **Step 1: Write the failing test**

```python
class TestStreamChatEventsEndToEnd(unittest.TestCase):
    def test_stream_chat_events_yields_events_from_fake_sdk(self):
        from unchain_runtime.server import unchain_adapter, claude_code_adapter

        if not claude_code_adapter.is_sdk_available():
            self.skipTest("SDK not installed")

        async def fake_query(prompt, options=None):
            yield _FakeAssistantMessage(
                role="assistant",
                content=[
                    _FakeThinkingBlock(type="thinking", thinking="Thinking..."),
                    _FakeTextBlock(type="text", text="Hello!"),
                ],
            )

        with mock.patch.object(claude_code_adapter, "_sdk_query", fake_query):
            events = list(unchain_adapter.stream_chat_events(
                message="hi",
                history=[],
                attachments=None,
                options={"provider": "claude_code", "workspace_roots": ["/tmp"]},
                session_id="sess-e2e",
            ))

        types = [e.get("type") for e in events]
        self.assertIn("thinking_delta", types)
        self.assertIn("token_delta", types)
        self.assertIn("final_message", types)
```

- [ ] **Step 2: Run test to verify failure or pass**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter.TestStreamChatEventsEndToEnd -v
```
Expected: PASS if earlier tasks are all complete. If FAIL, diagnose: most likely the `_sdk_query` monkey-patch didn't take effect because `drive()` still calls `get_sdk_module().query` — adjust `ClaudeCodeAgentWrapper.run` so it prefers `_sdk_query` when set (already done in Task 8, but verify).

- [ ] **Step 3: Commit**

```bash
git add unchain_runtime/server/tests/test_claude_code_adapter.py
git commit -m "test(claude-code): add end-to-end stream_chat_events integration test"
```

---

## Task 12: Backend dependency — add `claude-agent-sdk` to requirements

**Files:**
- Modify: `unchain_runtime/requirements.txt` (or `pyproject.toml` / `setup.py` — check which one the project uses)

- [ ] **Step 1: Locate the Python dependency declaration**

```bash
ls /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/
find /Users/red/Desktop/GITRepo/PuPu/unchain_runtime -name "requirements*.txt" -o -name "pyproject.toml" -o -name "setup.py"
```

- [ ] **Step 2: Add the dependency**

Example for `requirements.txt`:
```
claude-agent-sdk>=0.1.0
```

If `pyproject.toml`:
```toml
[project]
dependencies = [
    ...
    "claude-agent-sdk>=0.1.0",
]
```

- [ ] **Step 3: Install it in the dev environment**

```bash
cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime
pip install claude-agent-sdk
```
Verify: `python -c "import claude_agent_sdk; print(claude_agent_sdk.__version__)"`

- [ ] **Step 4: Re-run the adapter tests to confirm nothing regressed**

```bash
python -m unittest unchain_runtime.server.tests.test_claude_code_adapter -v
```
Expected: PASS. Integration tests that previously skipped (SDK unavailable) should now run.

- [ ] **Step 5: Commit**

```bash
git add unchain_runtime/requirements.txt  # or pyproject.toml
git commit -m "chore(claude-code): add claude-agent-sdk dependency"
```

---

## Task 13: Electron — Claude Code CLI detection service

**Files:**
- Create: `electron/main/services/claude_code/service.js`
- Create: `electron/main/services/claude_code/service.cjs`

**Context:** Mirror the Ollama service pattern (`electron/main/services/ollama/service.js`). The detection approach: run `claude --version` and capture output. If the binary is missing (`ENOENT`), set status to `"not_found"`. If found, capture the version string.

- [ ] **Step 1: Create `electron/main/services/claude_code/service.js`**

```javascript
const { spawn } = require("child_process");

let claudeCodeStatus = "unknown"; // "unknown" | "checking" | "ready" | "not_found" | "error"
let claudeCodeVersion = "";
let lastCheckError = "";

const checkClaudeCodeCli = () =>
  new Promise((resolve) => {
    const proc = spawn("claude", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        claudeCodeStatus = "not_found";
        lastCheckError = "Claude Code CLI not found in PATH";
      } else {
        claudeCodeStatus = "error";
        lastCheckError = err.message;
      }
      claudeCodeVersion = "";
      resolve({ status: claudeCodeStatus, version: "", error: lastCheckError });
    });

    proc.on("close", (code) => {
      if (code === 0) {
        claudeCodeStatus = "ready";
        claudeCodeVersion = stdoutBuf.trim() || "unknown";
        lastCheckError = "";
      } else {
        claudeCodeStatus = "error";
        lastCheckError = stderrBuf.trim() || `exit code ${code}`;
        claudeCodeVersion = "";
      }
      resolve({
        status: claudeCodeStatus,
        version: claudeCodeVersion,
        error: lastCheckError,
      });
    });

    setTimeout(() => {
      try {
        proc.kill();
      } catch (_) {}
    }, 5000);
  });

const getClaudeCodeStatus = () => ({
  status: claudeCodeStatus,
  version: claudeCodeVersion,
  error: lastCheckError,
});

module.exports = {
  checkClaudeCodeCli,
  getClaudeCodeStatus,
};
```

- [ ] **Step 2: Create the `.cjs` mirror**

Copy the same contents to `electron/main/services/claude_code/service.cjs` (PuPu convention: both .js and .cjs variants exist for electron tests).

- [ ] **Step 3: Add a test**

Create `electron/main/services/claude_code/service.test.cjs`:
```javascript
const { checkClaudeCodeCli, getClaudeCodeStatus } = require("./service.cjs");

describe("claude_code service", () => {
  test("getClaudeCodeStatus returns a status object with expected keys", () => {
    const s = getClaudeCodeStatus();
    expect(s).toHaveProperty("status");
    expect(s).toHaveProperty("version");
    expect(s).toHaveProperty("error");
  });

  test("checkClaudeCodeCli resolves with status object", async () => {
    const result = await checkClaudeCodeCli();
    expect(result).toHaveProperty("status");
    expect(["ready", "not_found", "error"]).toContain(result.status);
  });
});
```

- [ ] **Step 4: Run the test**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
npm test -- electron/main/services/claude_code/service.test.cjs
```
Expected: PASS (the `ready` branch passes if user has claude installed; otherwise `not_found`)

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/claude_code/
git commit -m "feat(claude-code): add CLI detection service mirroring Ollama pattern"
```

---

## Task 14: Electron — IPC channel for CLI status

**Files:**
- Modify: `electron/shared/ipc_channels.js` — add new constant
- Modify: `electron/main/index.js` (or wherever IPC handlers are registered) — register handler
- Modify: `electron/preload/index.js` (or wherever bridges are exposed) — expose `window.claudeCodeAPI`
- Create: `src/SERVICEs/api.claude_code.js` — renderer-side facade

- [ ] **Step 1: Add IPC channel constant**

In `electron/shared/ipc_channels.js`, add:
```javascript
exports.CLAUDE_CODE_GET_STATUS = "claude_code:get_status";
exports.CLAUDE_CODE_CHECK_CLI = "claude_code:check_cli";
```

- [ ] **Step 2: Register the IPC handlers in electron main**

In `electron/main/index.js` (or the service registration file), find where Ollama's IPC handlers are registered. Add alongside:
```javascript
const claudeCodeService = require("./services/claude_code/service.cjs");
const { CLAUDE_CODE_GET_STATUS, CLAUDE_CODE_CHECK_CLI } = require("../shared/ipc_channels");

ipcMain.handle(CLAUDE_CODE_GET_STATUS, () => claudeCodeService.getClaudeCodeStatus());
ipcMain.handle(CLAUDE_CODE_CHECK_CLI, async () => {
  return await claudeCodeService.checkClaudeCodeCli();
});
```

- [ ] **Step 3: Expose the bridge in preload**

In `electron/preload/index.js` (or wherever `window.ollamaAPI` is defined), add:
```javascript
contextBridge.exposeInMainWorld("claudeCodeAPI", {
  getStatus: () => ipcRenderer.invoke("claude_code:get_status"),
  checkCli: () => ipcRenderer.invoke("claude_code:check_cli"),
});
```

- [ ] **Step 4: Create renderer-side facade**

Create `src/SERVICEs/api.claude_code.js`:
```javascript
const bridge = typeof window !== "undefined" ? window.claudeCodeAPI : null;

export const getClaudeCodeStatus = async () => {
  if (!bridge) return { status: "unknown", version: "", error: "bridge unavailable" };
  try {
    return await bridge.getStatus();
  } catch (err) {
    return { status: "error", version: "", error: String(err) };
  }
};

export const checkClaudeCodeCli = async () => {
  if (!bridge) return { status: "unknown", version: "", error: "bridge unavailable" };
  try {
    return await bridge.checkCli();
  } catch (err) {
    return { status: "error", version: "", error: String(err) };
  }
};
```

- [ ] **Step 5: Smoke test**

Start PuPu dev mode and open the DevTools console:
```bash
npm start
```
Then in the renderer console:
```javascript
await window.claudeCodeAPI.checkCli()
// Expected: { status: "ready", version: "claude x.y.z", error: "" }
// Or: { status: "not_found", ... } if not installed
```

- [ ] **Step 6: Commit**

```bash
git add electron/shared/ipc_channels.js electron/main/index.js electron/preload/index.js src/SERVICEs/api.claude_code.js
git commit -m "feat(claude-code): expose CLI status via IPC bridge"
```

---

## Task 15: Frontend — add `thinking_delta` dispatch in `use_chat_stream.js`

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js` (onFrame handler, around line 1383)

**Context:** The `onFrame` handler is a long if/chain. We add `thinking_delta` handling before the existing subagent/tool routing. Its job: append the new frame to the active assistant message's `traceFrames` so it gets rendered progressively.

- [ ] **Step 1: Read the current `onFrame` structure to find the exact insertion point**

```bash
grep -n "onFrame" /Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js
```
Find the first `if (frame.type === "token_delta")` branch — insert `thinking_delta` handling right before or after it. Best placement: right before `token_delta` so thinking arrives before visible text.

- [ ] **Step 2: Add the dispatch case**

In `use_chat_stream.js`, near the start of the `onFrame` if-chain:
```javascript
if (frame.type === "thinking_delta") {
  const delta = frame.payload?.delta || "";
  if (!delta) return;
  // Append to current assistant message traceFrames so trace_chain_v3 renders it.
  setStreamingThinking((prev) => (prev || "") + delta);
  appendTraceFrameToStreamingMessage(frame);
  return;
}
```

- [ ] **Step 3: Wire up `setStreamingThinking` state**

If no such state exists, add near the top of the `useChatStream` hook body:
```javascript
const [streamingThinking, setStreamingThinking] = useState("");
```

Reset it on new streams (find where other streaming state is reset; add `setStreamingThinking("")` there).

- [ ] **Step 4: Make sure `appendTraceFrameToStreamingMessage` helper exists**

If the codebase already has a helper for adding frames to the streaming assistant message, use it. If not, the handler may need to directly mutate `activeStreamMessagesRef.current.messages[lastAssistantIndex].traceFrames`. Check how `tool_call` is handled — copy that pattern.

- [ ] **Step 5: Smoke test via fake frame injection**

No unit test for this — verified end-to-end in Task 18 smoke test. Skip to commit.

- [ ] **Step 6: Commit**

```bash
git add src/PAGEs/chat/hooks/use_chat_stream.js
git commit -m "feat(claude-code): dispatch thinking_delta frames in chat stream hook"
```

---

## Task 16: Frontend — render `thinking_delta` in `trace_chain_v3.js`

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/trace_chain_v3.js`

**Context:** Add `thinking_delta` to `DISPLAY_FRAME_TYPES` (line 16-23) and add a renderer case. User specified: **not folded by default, using PuPu's design language.**

- [ ] **Step 1: Add to `DISPLAY_FRAME_TYPES`**

In `trace_chain_v3.js` around line 16-23:
```javascript
const DISPLAY_FRAME_TYPES = new Set([
  "reasoning",
  "observation",
  "thinking_delta",  // Claude Code thinking blocks
  "tool_call",
  "tool_result",
  "final_message",
  "error",
]);
```

- [ ] **Step 2: Add the renderer case**

Find where `frame.type === "reasoning"` is rendered (lines ~554-892). Add a parallel branch for `thinking_delta`. PuPu's design language for this should use:
- The same color palette as the reasoning block but with a distinct indicator
- A 💭 / brain-icon prefix (or use existing iconography)
- Expanded by default (no `isCollapsed` initial state)
- Left border or accent to distinguish from normal text

Example skeleton (adapt colors/fonts to match existing `trace_chain_v3.js` style):
```javascript
if (frame.type === "thinking_delta") {
  const delta = frame.payload?.delta || "";
  return (
    <div
      key={key}
      style={{
        marginTop: 8,
        marginBottom: 8,
        padding: "8px 12px",
        borderLeft: `2px solid ${isDark ? "#6b6b8f" : "#9ca3c8"}`,
        color: isDark ? "#a8a8c0" : "#6b6b8a",
        fontSize: 13,
        fontStyle: "italic",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          opacity: 0.7,
          marginBottom: 4,
        }}
      >
        Thinking
      </div>
      {delta}
    </div>
  );
}
```

**Note:** check the existing `trace_chain_v3.js` styling conventions before committing to these exact colors. The snippet above is a template — match it to whatever palette PuPu's reasoning/observation blocks already use. If there's a shared `useTheme` or color constants file, use those instead of hardcoded hex.

- [ ] **Step 3: Handle consecutive `thinking_delta` frames**

Since thinking arrives as a stream of small deltas, consecutive frames should **visually merge into one block** rather than rendering as many separate boxes. Look at how consecutive `token_delta` frames are merged in existing code — apply the same pattern. This may mean aggregating deltas in `use_chat_stream.js` (Task 15) and rendering only the accumulated buffer, rather than one box per frame.

Concrete approach: in Task 15, instead of appending every `thinking_delta` frame to `traceFrames`, maintain a **single** synthetic `thinking_block` frame per assistant turn and append deltas to its `payload.delta`. Then the renderer sees one frame per thinking session.

If this refactor is cleaner, update Task 15's step 2 to:
```javascript
if (frame.type === "thinking_delta") {
  const delta = frame.payload?.delta || "";
  if (!delta) return;
  appendOrCreateThinkingFrame(delta);  // merges into single frame
  return;
}
```
...and implement `appendOrCreateThinkingFrame` to locate the most recent `thinking_block` frame in the assistant's `traceFrames` and append to its delta, creating a new one if none exists.

- [ ] **Step 4: Smoke test rendering**

Manually: use the end-to-end test in Task 18 to verify thinking appears in UI with correct styling.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/chat-bubble/trace_chain_v3.js src/PAGEs/chat/hooks/use_chat_stream.js
git commit -m "feat(claude-code): render thinking_delta frames in chat bubble"
```

---

## Task 17: Frontend — Claude Code provider section in Settings UI

**Files:**
- Create: `src/COMPONENTs/settings/model_providers/claude_code_section.js`
- Modify: `src/COMPONENTs/settings/model_providers/index.js`

**Context:** The section shows:
- Status badge (green if CLI ready, yellow if checking, red if not_found)
- "Check again" button
- Install instructions (expandable) if CLI not found
- A note: "Authentication is handled by the `claude` CLI. Run `claude login` in your terminal."
- **No API key input** (explicitly)

- [ ] **Step 1: Create the section component**

Create `src/COMPONENTs/settings/model_providers/claude_code_section.js`:
```javascript
import React, { useEffect, useState, useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/ConfigContainer";
import { checkClaudeCodeCli, getClaudeCodeStatus } from "../../../SERVICEs/api.claude_code";

const ClaudeCodeSection = () => {
  const { isDark } = useContext(ConfigContext);
  const [status, setStatus] = useState({ status: "checking", version: "", error: "" });

  const refresh = async () => {
    setStatus((s) => ({ ...s, status: "checking" }));
    const result = await checkClaudeCodeCli();
    setStatus(result);
  };

  useEffect(() => {
    (async () => {
      const initial = await getClaudeCodeStatus();
      if (initial.status === "unknown") {
        await refresh();
      } else {
        setStatus(initial);
      }
    })();
  }, []);

  const badgeColor = {
    ready: isDark ? "#3ddc84" : "#22a06b",
    checking: isDark ? "#e8c547" : "#b48a00",
    not_found: isDark ? "#ff6b6b" : "#c93838",
    error: isDark ? "#ff6b6b" : "#c93838",
    unknown: isDark ? "#888" : "#666",
  }[status.status] || "#888";

  const label = {
    ready: `Connected · ${status.version}`,
    checking: "Checking...",
    not_found: "Claude Code CLI not found",
    error: "Error",
    unknown: "Unknown",
  }[status.status] || status.status;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        backgroundColor: isDark ? "#1a1a22" : "#f7f7fa",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: badgeColor,
          }}
        />
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: isDark ? "#e8e8f0" : "#222",
          }}
        >
          Claude Code
        </div>
        <div
          style={{
            fontSize: 12,
            color: isDark ? "#a0a0b0" : "#666",
            marginLeft: "auto",
          }}
        >
          {label}
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: isDark ? "#8a8aa0" : "#555",
          lineHeight: 1.5,
          marginBottom: 8,
        }}
      >
        Authentication is handled by the <code>claude</code> CLI. Run <code>claude login</code> in your terminal if you haven't already.
      </div>

      {status.status === "not_found" && (
        <div
          style={{
            fontSize: 12,
            color: isDark ? "#c8c8d8" : "#333",
            padding: 8,
            borderRadius: 4,
            backgroundColor: isDark ? "#2a1f1f" : "#fdf2f2",
            marginBottom: 8,
          }}
        >
          Install Claude Code:{" "}
          <code>curl -fsSL https://claude.ai/install.sh | bash</code>
        </div>
      )}

      <button
        onClick={refresh}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          backgroundColor: isDark ? "#2a2a3a" : "#e8e8f0",
          color: isDark ? "#e8e8f0" : "#222",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        Check again
      </button>
    </div>
  );
};

export default ClaudeCodeSection;
```

**Note on styling:** the colors above are placeholders — match to PuPu's existing palette. Check how `OllamaLibraryBrowser` styles its status badge and copy that palette.

- [ ] **Step 2: Register in `model_providers/index.js`**

Find where `OpenAISection`, `AnthropicSection`, `OllamaLibraryBrowser` are imported and rendered. Add:
```javascript
import ClaudeCodeSection from "./claude_code_section";
// ...
// Inside the render tree:
<ClaudeCodeSection />
```

- [ ] **Step 3: Verify rendering**

```bash
npm start
```
Navigate: Settings → Model Providers. Confirm:
- "Claude Code" section visible
- Status badge shows correct state
- "Check again" button triggers re-check
- No API key input visible

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/settings/model_providers/
git commit -m "feat(claude-code): add Claude Code provider section to settings UI"
```

---

## Task 18: Frontend — provider selection plumbing (making it actually selectable as active provider)

**Files:**
- Modify: wherever PuPu determines which provider to send in `options.provider` when starting a chat stream. This is likely in `src/SERVICEs/api.unchain.js` or a context provider.

**Context:** PuPu already has the concept of an "active provider" (openai/anthropic/ollama). We need to add `claude_code` as a valid option and add a way for the user to **select** it — probably a dropdown or radio button in the chat composer area or model picker.

This task is the least mechanical because it depends on PuPu's existing model-selection UX — do recon first.

- [ ] **Step 1: Recon the existing model picker**

```bash
grep -rn "provider" /Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/model_providers/
grep -rn "modelId\|model_id" /Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.unchain.js
grep -rn "selectedModel\|activeModel" /Users/red/Desktop/GITRepo/PuPu/src/
```
Find:
- Where the active model/provider is stored (likely localStorage)
- Where it's read when building the chat payload
- What UI component lets the user pick it

Report findings before continuing. Ground the rest of this task in concrete file paths.

- [ ] **Step 2: Add `claude_code` to the valid providers list in the frontend**

Wherever the frontend has a provider whitelist (e.g., `["openai", "anthropic", "ollama"]`), add `"claude_code"`.

- [ ] **Step 3: Add a "Claude Code" option in the model picker UI**

Typically a dropdown item or a radio option. When selected, store `{ provider: "claude_code", model: "" }` in settings.

- [ ] **Step 4: Verify end-to-end — chat composer sends correct options.provider**

Start PuPu, select Claude Code, open DevTools Network tab, send a message. Confirm the POST to `/chat/stream_v2` includes `"provider": "claude_code"` in the `options` payload.

- [ ] **Step 5: Commit**

```bash
git add <files modified during recon>
git commit -m "feat(claude-code): wire Claude Code into frontend provider selection"
```

---

## Task 19: Frontend — grey out incompatible features when Claude Code is selected

**Files:**
- Modify: `src/COMPONENTs/settings/memory/*` — disable with note
- Modify: `src/COMPONENTs/toolkit/*` — disable with note
- Modify: character selection UI — disable with note

**Context:** When Claude Code provider is active, memory/character/custom toolkits do not apply. We grey them out with a small explanation tooltip to prevent user confusion.

- [ ] **Step 1: Add a shared helper to detect active provider**

Create or reuse an existing hook:
```javascript
// src/SERVICEs/hooks/use_active_provider.js
import { useState, useEffect } from "react";

export const useActiveProvider = () => {
  const [provider, setProvider] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        const root = JSON.parse(localStorage.getItem("settings") || "{}");
        setProvider(root?.selected_model?.provider || "");
      } catch {
        setProvider("");
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  return provider;
};
```
Adapt the `root?.selected_model?.provider` path to match what Task 18 actually uses.

- [ ] **Step 2: In memory settings, check active provider and grey out**

Example:
```javascript
const provider = useActiveProvider();
const disabled = provider === "claude_code";

return (
  <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}>
    {disabled && (
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        Not available with Claude Code provider. Claude Code uses CLAUDE.md and its built-in compaction.
      </div>
    )}
    {/* existing memory UI */}
  </div>
);
```

Apply the same pattern to toolkit selection and character picker.

- [ ] **Step 3: Verify in UI**

Start app, switch provider to Claude Code, navigate to memory/toolkit/character settings. Confirm all three are greyed out with the explanation note.

- [ ] **Step 4: Commit**

```bash
git add src/SERVICEs/hooks/use_active_provider.js src/COMPONENTs/settings/memory src/COMPONENTs/toolkit
git commit -m "feat(claude-code): disable memory/toolkit/character UI when provider active"
```

---

## Task 20: Manual end-to-end smoke test

**Files:** none — this is a checklist, not a code task.

- [ ] **Step 1: Prerequisites**

- Claude Code CLI installed: `claude --version` succeeds
- User is logged in: `claude login` completed at least once
- `claude-agent-sdk` installed in PuPu's Python environment

- [ ] **Step 2: Start PuPu in dev mode**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
npm start
```

- [ ] **Step 3: Verify provider detection**

- Navigate: Settings → Model Providers → Claude Code
- Status badge: **green**, version shown
- No API key field present

- [ ] **Step 4: Select Claude Code as active provider**

- Via model picker or settings (wherever Task 18 wired it up)

- [ ] **Step 5: Attach a workspace**

- Set workspace root to any real directory (e.g., the PuPu repo itself)

- [ ] **Step 6: Send a simple chat message**

- "Hello, what files are in this workspace?"
- Verify:
  - ✅ Text streams back
  - ✅ A `Read` / `Glob` / `Bash` tool call appears as a tool card
  - ✅ The tool result appears
  - ✅ Final assistant message appears at the end

- [ ] **Step 7: Send a message that triggers thinking**

- If the model supports extended thinking and SDK enables it by default, send a complex reasoning query: "Explain the architecture of this project based on the files you see"
- Verify:
  - ✅ A "Thinking" block appears before the main text
  - ✅ It is **expanded by default**
  - ✅ It uses PuPu's design language (matches rest of UI)

- [ ] **Step 8: Trigger a tool confirmation**

- Send: "Run `ls -la` in the current directory"
- Verify:
  - ✅ Tool confirmation modal appears
  - ✅ Approving allows the command to run
  - ✅ Denying blocks it

- [ ] **Step 9: Trigger `AskUserQuestion`**

- Send a message that likely causes the model to ask for clarification: "Edit a file — you pick which one and what to change"
- Verify:
  - ✅ If the model calls `AskUserQuestion`, it renders as PuPu's existing question UI (single/multi select), NOT as a generic tool card
  - ✅ Selecting an option continues the conversation

- [ ] **Step 10: Verify incompatible features are greyed out**

- Settings → Memory: greyed out with note
- Settings → Toolkits: greyed out with note
- Character picker: greyed out with note

- [ ] **Step 11: Write up findings**

Document any deviations from expected behavior as follow-up issues. Things to explicitly verify:
- Does Task (subagent) tool render reasonably as a tool_call? (Acceptable for Phase 1 — just not a full subagent timeline)
- Does `TodoWrite` render as a tool_call? (Acceptable for Phase 1)
- Does cancellation (stop button) actually interrupt mid-stream? (If not, file as follow-up)

- [ ] **Step 12: Commit any docs updates if needed**

```bash
git add docs/
git commit -m "docs(claude-code): phase 1 smoke test findings"
```

---

## Self-Review Checklist

**Spec coverage check:**
- ✅ Backend adapter with lazy SDK import (Task 1)
- ✅ Text block mapping (Task 2)
- ✅ Thinking block mapping (Task 3)
- ✅ Tool use / tool result mapping (Tasks 4, 5)
- ✅ Message-level mapping (Task 6)
- ✅ Tool confirmation bridging (Task 7)
- ✅ ClaudeCodeAgentWrapper class (Task 8)
- ✅ AskUserQuestion special routing (Task 9)
- ✅ Integration into _create_agent (Task 10)
- ✅ E2E backend test (Task 11)
- ✅ SDK dependency declaration (Task 12)
- ✅ CLI availability detection (Tasks 13, 14)
- ✅ Frontend thinking rendering — dispatch (Task 15) and UI (Task 16)
- ✅ Settings UI for provider (Task 17)
- ✅ Provider selection plumbing (Task 18)
- ✅ Grey out incompatible features (Task 19)
- ✅ Manual smoke test (Task 20)

**Not covered (explicitly out of scope):**
- Plan mode (user said defer)
- Task tool → subagent timeline (Phase 2)
- TodoWrite → Todo panel (Phase 2)
- Session resume / history optimization (Phase 2)
- Rich tool confirmation with argument editing (SDK limitation)

**Known plan weaknesses:**
- Task 18 is less concrete than others because it requires recon of existing model-picker UI. The task explicitly calls this out and asks the executor to do recon first.
- Task 16's exact color palette is a template — the executor must adapt to PuPu's real design tokens, which weren't captured verbatim here.
- Task 19 assumes the existence of a settings storage shape (`root.selected_model.provider`) that must be adjusted to match what Task 18 actually implements.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-13-claude-code-provider.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this long because each task ships a clean commit independently.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
