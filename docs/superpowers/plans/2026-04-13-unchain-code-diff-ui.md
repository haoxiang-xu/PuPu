# Unchain Code Diff UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface unified diffs as the approval UI for unchain's file-writing tools (`write_file` / `create_file` / `delete_file` / any `edit_*` tools), rendered in the PuPu frontend via a new `code_diff` interact component. Approved/rejected cards stay in the timeline as history.

**Architecture:** Reuse the existing tool-confirmation protocol. unchain's `ToolConfirmationRequest` already supports `interact_type` / `interact_config`; we compute a unified diff payload inside a small hook on `WorkspaceToolkit` and set those fields from `unchain/tools/confirmation.py`. PuPu adapter already propagates these fields verbatim. Frontend gets a new `CodeDiffInteract` React component registered in `interactRegistry`.

**Tech Stack:** Python `difflib.unified_diff` (stdlib), pytest, React (no new JS dependencies — diff is parsed inline), existing PuPu interact framework.

**Spec reference:** `docs/superpowers/specs/2026-04-13-unchain-code-diff-ui-design.md`

---

## Investigation Findings (Step 0 — resolved before writing plan)

All four open questions from the spec (§4.3) have been resolved via source grep:

1. **Confirmation callback contract (unchain):** `ToolConfirmationRequest` in `miso/src/unchain/tools/models.py:209-229` already has `interact_type: str = "confirmation"` and `interact_config: dict | list | None = None`. Its `to_dict()` emits these fields. The callback is invoked in `miso/src/unchain/tools/confirmation.py:38-45` as a pre-execution gate. **Implication:** no unchain kernel change — tools populate these fields on the request object.

2. **File-writing tool inventory (unchain):** Lives in `miso/src/unchain/toolkits/builtin/workspace/workspace.py`. Confirmed: `write_file` (line 555), `create_file` (line 575), `delete_file` (line 593). Additional edit-shaped tools (`replace_lines`, `search_and_replace`, etc.) may exist — Task 3 grep-confirms and wires them in. No `multi_edit` / `apply_patch` was found in the initial sweep — Task 4 confirms absence or wires in if present.

3. **Reject contract:** `miso/src/unchain/tools/confirmation.py:71-86` — rejected calls return a dict `{"denied": True, "tool": ..., "reason": ...}` from the toolkit execute path, no exception. A `tool_denied` event is also emitted (line 49-58). **Implication:** `code_diff` preserves this automatically — we only change the *request* payload, not the response handling.

4. **PuPu adapter propagation:** `PuPu/unchain_runtime/server/unchain_adapter.py` — `_make_tool_confirm_callback` (~line 459) calls `_build_tool_confirmation_request_payload` (~line 294), which explicitly copies `interact_type` and `interact_config` from the request. **Implication:** zero adapter code change; Task 5 becomes a regression-test-only task.

**One spec correction:** `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` in `unchain_adapter.py:134-139` currently lists `{write_file, delete_file, move_file, terminal_exec}` — it does **not** include `create_file` or any edit-shaped tool. Plan Task 2 adds `create_file`; Task 3 adds any edit tools it wires in.

---

## File Structure

**unchain** (`~/Desktop/GITRepo/miso/`):

| File | Action | Responsibility |
|---|---|---|
| `src/unchain/tools/_diff_helpers.py` | create | `build_code_diff_payload` pure function + helpers |
| `src/unchain/toolkits/builtin/workspace/workspace.py` | modify | Add `build_confirmation_interact(tool_name, arguments) -> dict \| None` method that dispatches per tool and calls `build_code_diff_payload` |
| `src/unchain/tools/confirmation.py` | modify | After constructing `ToolConfirmationRequest`, if the toolkit implements `build_confirmation_interact`, call it and copy results into the request's `interact_type` / `interact_config` fields |
| `tests/unchain/tools/test_diff_helpers.py` | create | Unit tests for `build_code_diff_payload` |
| `tests/unchain/toolkits/test_workspace_code_diff.py` | create | Integration tests for `WorkspaceToolkit.build_confirmation_interact` |
| `tests/unchain/tools/test_confirmation_interact_dispatch.py` | create | Test that `confirmation.py` calls toolkit hook and populates request |

**PuPu** (`~/Desktop/GITRepo/PuPu/`):

| File | Action | Responsibility |
|---|---|---|
| `unchain_runtime/server/unchain_adapter.py` | modify | Add `create_file` to `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES`. (+ any additional edit tools enumerated in Task 3) |
| `src/COMPONENTs/interact/CodeDiffInteract.js` | create | New React interact component |
| `src/COMPONENTs/interact/CodeDiffInteract.css` (or styled equivalent) | create | Styling for the three states |
| `src/COMPONENTs/interact/interact_registry.js` | modify | Register `code_diff` → `CodeDiffInteract` |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | verify (no change expected) | Confirm `tool_call` dispatch is keyed on `interact_type` presence, not on `tool_name === "ask_user_question"` |
| `tests/server/test_adapter_code_diff_propagation.py` | create | Regression test that adapter forwards `interact_type="code_diff"` verbatim |
| `src/COMPONENTs/interact/__tests__/CodeDiffInteract.test.js` | create | Frontend unit tests (jest + RTL) |

**Note:** The PuPu frontend file paths above (`src/COMPONENTs/interact/...`) are inferred from the spec. Task 6 verifies the actual location by locating `ConfirmInteract.js` and mirroring it.

---

## Task 1: `build_code_diff_payload` helper (unchain)

**Files:**
- Create: `~/Desktop/GITRepo/miso/src/unchain/tools/_diff_helpers.py`
- Create: `~/Desktop/GITRepo/miso/tests/unchain/tools/test_diff_helpers.py`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/unchain/tools/test_diff_helpers.py`:

```python
"""Unit tests for build_code_diff_payload."""
from __future__ import annotations

import pytest

from unchain.tools._diff_helpers import build_code_diff_payload


def test_normal_edit_small_file():
    old = "line 1\nline 2\nline 3\n"
    new = "line 1\nline TWO\nline 3\n"
    result = build_code_diff_payload("foo.py", old, new, "edit")
    assert result is not None
    assert result["path"] == "foo.py"
    assert result["sub_operation"] == "edit"
    assert result["truncated"] is False
    assert "line TWO" in result["unified_diff"]
    assert "-line 2" in result["unified_diff"]
    assert "+line TWO" in result["unified_diff"]
    assert result["total_lines"] > 0
    assert result["displayed_lines"] == result["total_lines"]


def test_create_mode():
    result = build_code_diff_payload("new.py", "", "hello\nworld\n", "create")
    assert result is not None
    assert result["sub_operation"] == "create"
    assert "+hello" in result["unified_diff"]
    assert "+world" in result["unified_diff"]


def test_delete_mode():
    result = build_code_diff_payload("gone.py", "bye\nbye\n", "", "delete")
    assert result is not None
    assert result["sub_operation"] == "delete"
    assert "-bye" in result["unified_diff"]


def test_truncation_over_200_lines():
    old = "".join(f"line {i}\n" for i in range(300))
    new = "".join(f"LINE {i}\n" for i in range(300))
    result = build_code_diff_payload("big.py", old, new, "edit", max_lines=200)
    assert result is not None
    assert result["truncated"] is True
    assert result["displayed_lines"] == 200
    assert result["total_lines"] > 200
    assert result["unified_diff"].count("\n") <= 200 + 5  # small slack for header


def test_binary_bytes_with_nul_returns_none():
    result = build_code_diff_payload(
        "img.png",
        b"\x89PNG\r\n\x1a\n\x00\x00",
        b"\x89PNG\r\n\x1a\n\x00\x01",
        "edit",
    )
    assert result is None


def test_invalid_utf8_bytes_returns_none():
    result = build_code_diff_payload(
        "weird.bin", b"\xff\xfe\xfd", b"\xff\xfe\xfc", "edit"
    )
    assert result is None


def test_oversized_returns_none():
    big = "x" * 600_000
    result = build_code_diff_payload(
        "huge.txt", big, big + "y", "edit", max_bytes=1_000_000
    )
    assert result is None


def test_identical_returns_empty_diff_payload():
    result = build_code_diff_payload("same.py", "a\n", "a\n", "edit")
    assert result is not None
    assert result["unified_diff"] == ""
    assert result["total_lines"] == 0
    assert result["displayed_lines"] == 0


def test_crlf_lf_normalized():
    old = "line1\r\nline2\r\n"
    new = "line1\nline2\n"
    result = build_code_diff_payload("mixed.py", old, new, "edit")
    assert result is not None
    # After normalization these should produce an empty or near-empty diff
    assert "line1" not in result["unified_diff"] or result["unified_diff"] == ""


def test_bytes_input_decoded_as_utf8():
    old = "héllo\n".encode("utf-8")
    new = "héllo world\n".encode("utf-8")
    result = build_code_diff_payload("u.py", old, new, "edit")
    assert result is not None
    assert "héllo world" in result["unified_diff"]


def test_exception_in_difflib_returns_none(monkeypatch):
    import unchain.tools._diff_helpers as mod

    def boom(*args, **kwargs):
        raise RuntimeError("synthetic")

    monkeypatch.setattr(mod.difflib, "unified_diff", boom)
    result = build_code_diff_payload("x.py", "a\n", "b\n", "edit")
    assert result is None
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/miso
PYTHONPATH=src pytest tests/unchain/tools/test_diff_helpers.py -v
```

Expected: all fail with `ModuleNotFoundError: No module named 'unchain.tools._diff_helpers'`.

- [ ] **Step 1.3: Implement `_diff_helpers.py`**

Create `src/unchain/tools/_diff_helpers.py`:

```python
"""Diff payload builder for code_diff interact UI.

This is intentionally dependency-free (stdlib only) and returns None on any
condition where a diff should NOT be shown (binary, oversized, internal error).
Callers fall back to the legacy confirmation UI in that case.
"""
from __future__ import annotations

import difflib
import logging
from typing import Any

log = logging.getLogger(__name__)

_MAX_LINES_DEFAULT = 200
_MAX_BYTES_DEFAULT = 1_000_000


def _coerce_text(value: str | bytes | None) -> str | None:
    """Return a UTF-8 string, or None for binary / undecodable input."""
    if value is None:
        return ""
    if isinstance(value, str):
        if "\x00" in value:
            return None
        return value
    if isinstance(value, (bytes, bytearray)):
        if b"\x00" in value:
            return None
        try:
            return bytes(value).decode("utf-8")
        except UnicodeDecodeError:
            return None
    return None


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def build_code_diff_payload(
    path: str,
    old_content: str | bytes | None,
    new_content: str | bytes | None,
    operation: str,
    *,
    max_lines: int = _MAX_LINES_DEFAULT,
    max_bytes: int = _MAX_BYTES_DEFAULT,
) -> dict[str, Any] | None:
    """Build a single file entry for a code_diff interact_config.

    Returns None when code_diff is NOT appropriate — caller must fall back
    to the legacy confirmation path:
      - binary content (NUL byte or non-UTF-8)
      - combined old+new size exceeds max_bytes
      - any unexpected exception (logged)
    """
    try:
        old_text = _coerce_text(old_content)
        new_text = _coerce_text(new_content)
        if old_text is None or new_text is None:
            return None

        old_bytes_len = len(old_text.encode("utf-8", errors="replace"))
        new_bytes_len = len(new_text.encode("utf-8", errors="replace"))
        if old_bytes_len + new_bytes_len > max_bytes:
            return None

        old_norm = _normalize_newlines(old_text)
        new_norm = _normalize_newlines(new_text)

        if operation == "create":
            sub_operation = "create"
        elif operation == "delete":
            sub_operation = "delete"
        else:
            sub_operation = "edit"

        if old_norm == new_norm:
            return {
                "path": path,
                "sub_operation": sub_operation,
                "unified_diff": "",
                "truncated": False,
                "total_lines": 0,
                "displayed_lines": 0,
            }

        old_lines = old_norm.splitlines(keepends=False)
        new_lines = new_norm.splitlines(keepends=False)

        diff_iter = difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            lineterm="",
            n=3,
        )
        all_lines = list(diff_iter)
        total_lines = len(all_lines)

        truncated = total_lines > max_lines
        displayed = all_lines[:max_lines] if truncated else all_lines

        unified_diff = "\n".join(displayed)
        if unified_diff and not unified_diff.endswith("\n"):
            unified_diff += "\n"

        return {
            "path": path,
            "sub_operation": sub_operation,
            "unified_diff": unified_diff,
            "truncated": truncated,
            "total_lines": total_lines,
            "displayed_lines": min(total_lines, max_lines),
        }
    except Exception:
        log.warning("build_code_diff_payload failed for %s", path, exc_info=True)
        return None
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
PYTHONPATH=src pytest tests/unchain/tools/test_diff_helpers.py -v
```

Expected: all 10 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
cd ~/Desktop/GITRepo/miso
git add src/unchain/tools/_diff_helpers.py tests/unchain/tools/test_diff_helpers.py
git commit -m "$(cat <<'EOF'
feat(unchain): add build_code_diff_payload helper

Pure stdlib helper that emits unified-diff payloads for the upcoming
code_diff interact UI, or returns None for binary / oversized / errored
inputs so callers can fall back to legacy confirmation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `WorkspaceToolkit.build_confirmation_interact` hook + confirmation.py dispatch

**Files:**
- Modify: `~/Desktop/GITRepo/miso/src/unchain/toolkits/builtin/workspace/workspace.py`
- Modify: `~/Desktop/GITRepo/miso/src/unchain/tools/confirmation.py`
- Create: `~/Desktop/GITRepo/miso/tests/unchain/toolkits/test_workspace_code_diff.py`
- Create: `~/Desktop/GITRepo/miso/tests/unchain/tools/test_confirmation_interact_dispatch.py`

### 2A — Read the target files first

- [ ] **Step 2.1: Read current `confirmation.py` in full to identify exact injection point**

```bash
cat ~/Desktop/GITRepo/miso/src/unchain/tools/confirmation.py
```

Locate the block around line 38-45 where `ToolConfirmationRequest` is constructed. Also identify how `tool_obj` → toolkit is reachable (typically there's a toolkit registry lookup). Record the exact variable names in a scratch note; the actual edit in Step 2.6 uses these names.

- [ ] **Step 2.2: Read `WorkspaceToolkit` around line 555 to confirm tool method signatures**

```bash
sed -n '540,620p' ~/Desktop/GITRepo/miso/src/unchain/toolkits/builtin/workspace/workspace.py
```

Confirm that:
- `write_file(self, path, content, append=False)` exists
- `create_file` exists and takes similar args
- `delete_file(self, path)` exists
- There's a `_resolve_workspace_path()` helper for path → absolute-path resolution

### 2B — Write the failing integration test for the toolkit hook

- [ ] **Step 2.3: Write `tests/unchain/toolkits/test_workspace_code_diff.py`**

```python
"""Integration tests for WorkspaceToolkit.build_confirmation_interact."""
from __future__ import annotations

from pathlib import Path

import pytest

from unchain.toolkits.builtin.workspace.workspace import WorkspaceToolkit


@pytest.fixture
def workspace(tmp_path: Path) -> WorkspaceToolkit:
    return WorkspaceToolkit(workspace_root=str(tmp_path))


def test_write_file_overwrite_builds_edit_diff(workspace, tmp_path):
    (tmp_path / "foo.py").write_text("old\n")
    result = workspace.build_confirmation_interact(
        "write_file", {"path": "foo.py", "content": "new\n"}
    )
    assert result is not None
    assert result["interact_type"] == "code_diff"
    cfg = result["interact_config"]
    assert cfg["operation"] == "edit"
    assert len(cfg["files"]) == 1
    assert cfg["files"][0]["sub_operation"] == "edit"
    assert "-old" in cfg["files"][0]["unified_diff"]
    assert "+new" in cfg["files"][0]["unified_diff"]


def test_write_file_new_path_builds_create_diff(workspace, tmp_path):
    result = workspace.build_confirmation_interact(
        "write_file", {"path": "brand_new.py", "content": "hello\n"}
    )
    assert result is not None
    cfg = result["interact_config"]
    assert cfg["operation"] == "create"
    assert cfg["files"][0]["sub_operation"] == "create"


def test_create_file_builds_create_diff(workspace, tmp_path):
    result = workspace.build_confirmation_interact(
        "create_file", {"path": "x.py", "content": "body\n"}
    )
    assert result is not None
    assert result["interact_config"]["operation"] == "create"


def test_delete_file_builds_delete_diff(workspace, tmp_path):
    (tmp_path / "gone.py").write_text("bye\nbye\n")
    result = workspace.build_confirmation_interact(
        "delete_file", {"path": "gone.py"}
    )
    assert result is not None
    cfg = result["interact_config"]
    assert cfg["operation"] == "delete"
    assert cfg["files"][0]["sub_operation"] == "delete"
    assert "-bye" in cfg["files"][0]["unified_diff"]


def test_binary_file_fallback_returns_none(workspace, tmp_path):
    # Write a file with NUL bytes -> coerce_text returns None -> fallback
    (tmp_path / "blob.bin").write_bytes(b"\x00\x01\x02")
    result = workspace.build_confirmation_interact(
        "write_file", {"path": "blob.bin", "content": "new text"}
    )
    assert result is None


def test_append_mode_treats_existing_plus_new(workspace, tmp_path):
    (tmp_path / "log.txt").write_text("line1\n")
    result = workspace.build_confirmation_interact(
        "write_file",
        {"path": "log.txt", "content": "line2\n", "append": True},
    )
    assert result is not None
    cfg = result["interact_config"]
    assert cfg["operation"] == "edit"
    assert "+line2" in cfg["files"][0]["unified_diff"]


def test_unknown_tool_returns_none(workspace, tmp_path):
    result = workspace.build_confirmation_interact(
        "some_other_tool", {"path": "x"}
    )
    assert result is None
```

- [ ] **Step 2.4: Run tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/miso
PYTHONPATH=src pytest tests/unchain/toolkits/test_workspace_code_diff.py -v
```

Expected: all fail with `AttributeError: 'WorkspaceToolkit' object has no attribute 'build_confirmation_interact'`.

### 2C — Implement the toolkit hook

- [ ] **Step 2.5: Add `build_confirmation_interact` method to `WorkspaceToolkit`**

Open `~/Desktop/GITRepo/miso/src/unchain/toolkits/builtin/workspace/workspace.py`. Add this method on the `WorkspaceToolkit` class (near the other public methods, e.g. right before or after `write_file`):

```python
def build_confirmation_interact(
    self,
    tool_name: str,
    arguments: dict,
) -> dict | None:
    """Return {interact_type, interact_config} for a file-tool call, or None.

    None signals the caller to fall back to the legacy confirmation UI
    (binary content, oversized files, unknown tool, any error).
    """
    from unchain.tools._diff_helpers import build_code_diff_payload

    try:
        if tool_name in ("write_file", "create_file"):
            path = arguments.get("path")
            if not isinstance(path, str) or not path:
                return None
            new_content = arguments.get("content", "")
            if not isinstance(new_content, (str, bytes)):
                return None
            target = self._resolve_workspace_path(path)

            existed = target.exists() and target.is_file()
            if existed:
                try:
                    old_bytes = target.read_bytes()
                except OSError:
                    return None
            else:
                old_bytes = b""

            append = bool(arguments.get("append", False))
            if append and existed:
                if isinstance(new_content, bytes):
                    new_bytes = old_bytes + new_content
                else:
                    try:
                        new_bytes = old_bytes + new_content.encode("utf-8")
                    except Exception:
                        return None
            else:
                if isinstance(new_content, bytes):
                    new_bytes = new_content
                else:
                    new_bytes = new_content.encode("utf-8")

            if existed:
                sub_op_hint = "edit"
                operation = "edit"
            else:
                sub_op_hint = "create"
                operation = "create"

            file_payload = build_code_diff_payload(
                path, old_bytes, new_bytes, sub_op_hint
            )
            if file_payload is None:
                return None

            title = (
                f"{'Create' if operation == 'create' else 'Edit'} {path}"
            )
            return {
                "interact_type": "code_diff",
                "interact_config": {
                    "title": title,
                    "operation": operation,
                    "files": [file_payload],
                    "overflow_count": 0,
                    "fallback_description": self._describe_diff(file_payload),
                },
            }

        if tool_name == "delete_file":
            path = arguments.get("path")
            if not isinstance(path, str) or not path:
                return None
            target = self._resolve_workspace_path(path)
            if not (target.exists() and target.is_file()):
                return None
            try:
                old_bytes = target.read_bytes()
            except OSError:
                return None

            file_payload = build_code_diff_payload(
                path, old_bytes, b"", "delete"
            )
            if file_payload is None:
                return None
            return {
                "interact_type": "code_diff",
                "interact_config": {
                    "title": f"Delete {path}",
                    "operation": "delete",
                    "files": [file_payload],
                    "overflow_count": 0,
                    "fallback_description": self._describe_diff(file_payload),
                },
            }

        return None
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "build_confirmation_interact failed for %s", tool_name, exc_info=True
        )
        return None


@staticmethod
def _describe_diff(file_payload: dict) -> str:
    path = file_payload.get("path", "?")
    op = file_payload.get("sub_operation", "edit")
    diff = file_payload.get("unified_diff", "")
    plus = sum(1 for line in diff.split("\n") if line.startswith("+") and not line.startswith("+++"))
    minus = sum(1 for line in diff.split("\n") if line.startswith("-") and not line.startswith("---"))
    return f"{op} {path} (+{plus} -{minus})"
```

- [ ] **Step 2.6: Run toolkit tests to verify they pass**

```bash
PYTHONPATH=src pytest tests/unchain/toolkits/test_workspace_code_diff.py -v
```

Expected: all 7 tests PASS.

### 2D — Wire up `confirmation.py` dispatch

- [ ] **Step 2.7: Write the failing dispatch test**

Create `tests/unchain/tools/test_confirmation_interact_dispatch.py`:

```python
"""Test that confirmation.py invokes toolkit.build_confirmation_interact."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest


def test_confirmation_request_gets_code_diff_from_toolkit(monkeypatch):
    from unchain.tools import confirmation as conf_mod
    from unchain.tools.models import ToolConfirmationRequest

    captured_request: dict = {}

    def fake_on_tool_confirm(req):
        captured_request["req"] = req
        return {"approved": True, "modified_arguments": None}

    # Synthetic toolkit that returns a code_diff interact
    synthetic_interact = {
        "interact_type": "code_diff",
        "interact_config": {"operation": "edit", "files": [{"path": "a.py"}]},
    }

    toolkit = MagicMock()
    toolkit.execute.return_value = {"ok": True}
    toolkit.build_confirmation_interact.return_value = synthetic_interact

    tool_obj = MagicMock()
    tool_obj.requires_confirmation = True
    tool_obj.description = "desc"

    tool_call = MagicMock()
    tool_call.name = "write_file"
    tool_call.call_id = "call-1"
    tool_call.arguments = {"path": "a.py", "content": "x"}

    # Exercise: call the real dispatch path from confirmation.py.
    # The exact function name depends on current source — adapt the
    # import below after reading confirmation.py in Step 2.1.
    outcome = conf_mod.run_tool_with_confirmation(
        tool_call=tool_call,
        tool_obj=tool_obj,
        toolkit=toolkit,
        on_tool_confirm=fake_on_tool_confirm,
        callback=None,
        run_id="run-1",
        iteration=0,
        loop=None,
    )

    assert outcome.denied is False
    req = captured_request["req"]
    assert isinstance(req, ToolConfirmationRequest)
    assert req.interact_type == "code_diff"
    assert req.interact_config == synthetic_interact["interact_config"]


def test_confirmation_request_unchanged_when_toolkit_returns_none(monkeypatch):
    from unchain.tools import confirmation as conf_mod
    from unchain.tools.models import ToolConfirmationRequest

    captured_request: dict = {}

    def fake_on_tool_confirm(req):
        captured_request["req"] = req
        return {"approved": True, "modified_arguments": None}

    toolkit = MagicMock()
    toolkit.execute.return_value = {"ok": True}
    toolkit.build_confirmation_interact.return_value = None

    tool_obj = MagicMock()
    tool_obj.requires_confirmation = True
    tool_obj.description = "desc"

    tool_call = MagicMock()
    tool_call.name = "write_file"
    tool_call.call_id = "call-2"
    tool_call.arguments = {"path": "blob.bin", "content": "x"}

    conf_mod.run_tool_with_confirmation(
        tool_call=tool_call,
        tool_obj=tool_obj,
        toolkit=toolkit,
        on_tool_confirm=fake_on_tool_confirm,
        callback=None,
        run_id="run-1",
        iteration=0,
        loop=None,
    )

    req = captured_request["req"]
    assert req.interact_type == "confirmation"  # default unchanged
    assert req.interact_config is None
```

> **Implementation note for this test:** the exact name and signature of the dispatch function (`run_tool_with_confirmation` above) must match what exists in `confirmation.py` after Step 2.1. If the current API differs, rename both the test call and the actual production function consistently in Step 2.8.

- [ ] **Step 2.8: Run the test to verify it fails**

```bash
PYTHONPATH=src pytest tests/unchain/tools/test_confirmation_interact_dispatch.py -v
```

Expected: fail — either with an AttributeError (toolkit hook not consulted) or assertion error (`interact_type == 'confirmation'` but we wanted `code_diff`).

- [ ] **Step 2.9: Patch `confirmation.py` to invoke the toolkit hook**

Locate the block in `src/unchain/tools/confirmation.py` where `ToolConfirmationRequest` is constructed (currently around line 38-45, per Step 2.1 findings). Immediately **before** calling `on_tool_confirm(confirmation_request)`, insert:

```python
# Allow toolkit to upgrade the interact payload for this tool call.
builder = getattr(toolkit, "build_confirmation_interact", None)
if callable(builder):
    try:
        enhancement = builder(
            tool_call.name,
            tool_call.arguments if isinstance(tool_call.arguments, dict) else {},
        )
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "toolkit.build_confirmation_interact failed for %s",
            tool_call.name,
            exc_info=True,
        )
        enhancement = None
    if isinstance(enhancement, dict):
        interact_type = enhancement.get("interact_type")
        interact_config = enhancement.get("interact_config")
        if isinstance(interact_type, str) and interact_type:
            confirmation_request.interact_type = interact_type
        if interact_config is not None:
            confirmation_request.interact_config = interact_config
```

**Important:** if Step 2.1 revealed that `confirmation.py` does NOT already receive `toolkit` as a parameter in this code path, you must also plumb it in — either as a new parameter on the dispatch function or via an attribute on `tool_obj`. Keep this change minimal and mirror however `toolkit.execute(...)` is currently reached in the same function.

- [ ] **Step 2.10: Run the dispatch test again**

```bash
PYTHONPATH=src pytest tests/unchain/tools/test_confirmation_interact_dispatch.py -v
```

Expected: both tests PASS.

- [ ] **Step 2.11: Run the entire unchain test suite to catch regressions**

```bash
PYTHONPATH=src pytest tests/unchain/ -x --ignore=tests/test_broth_core.py --ignore=tests/test_agent_core.py
```

Expected: no new failures. If any pre-existing failures unrelated to this change show up, note them but do not fix here.

- [ ] **Step 2.12: Commit**

```bash
cd ~/Desktop/GITRepo/miso
git add \
  src/unchain/toolkits/builtin/workspace/workspace.py \
  src/unchain/tools/confirmation.py \
  tests/unchain/toolkits/test_workspace_code_diff.py \
  tests/unchain/tools/test_confirmation_interact_dispatch.py
git commit -m "$(cat <<'EOF'
feat(unchain): wire code_diff interact for workspace file tools

WorkspaceToolkit now exposes build_confirmation_interact(), invoked
from tools/confirmation.py before the user-confirmation callback.
write_file / create_file / delete_file surface a unified diff as the
approval payload; binary / oversized / errored inputs fall back to the
legacy confirmation UI transparently.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Enumerate and wire additional edit-shaped tools

**Files:**
- Modify: `~/Desktop/GITRepo/miso/src/unchain/toolkits/builtin/workspace/workspace.py` (extend `build_confirmation_interact` switch)
- Modify: `~/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py` (extend `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES`)
- Modify: `~/Desktop/GITRepo/miso/tests/unchain/toolkits/test_workspace_code_diff.py` (add cases per tool found)

- [ ] **Step 3.1: Discover edit-shaped tools**

```bash
cd ~/Desktop/GITRepo/miso
grep -n "def " src/unchain/toolkits/builtin/workspace/workspace.py \
  | grep -iE "edit|replace|patch|modify|insert|append"
```

Also check `toolkit.toml`:

```bash
grep -E "^\[\[tools\]\]|^name" src/unchain/toolkits/builtin/workspace/*.toml
```

Record each tool name and its arguments. Typical suspects: `replace_lines`, `search_and_replace`, `insert_lines`, `apply_patch`.

- [ ] **Step 3.2: For each edit-shaped tool found, extend the switch in `build_confirmation_interact`**

Pattern: read the target file's current bytes, apply the tool's transformation **in memory** (use the same logic the tool itself uses, or call a shared helper), compute the diff, return the payload. If applying the transformation in memory is non-trivial or duplicates the tool, extract a `_simulate_<tool>(path, arguments) -> tuple[bytes, bytes]` helper that both the tool and `build_confirmation_interact` call.

Example for `replace_lines(path, start, end, new_content)`:

```python
if tool_name == "replace_lines":
    path = arguments.get("path")
    if not isinstance(path, str):
        return None
    target = self._resolve_workspace_path(path)
    if not (target.exists() and target.is_file()):
        return None
    try:
        old_bytes = target.read_bytes()
        old_text = old_bytes.decode("utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    lines = old_text.splitlines(keepends=True)
    start = int(arguments.get("start", 0))
    end = int(arguments.get("end", start))
    replacement = arguments.get("new_content", "")
    if not isinstance(replacement, str):
        return None
    new_text = "".join(lines[:start]) + replacement + "".join(lines[end:])
    file_payload = build_code_diff_payload(
        path, old_bytes, new_text.encode("utf-8"), "edit"
    )
    if file_payload is None:
        return None
    return {
        "interact_type": "code_diff",
        "interact_config": {
            "title": f"Edit {path}",
            "operation": "edit",
            "files": [file_payload],
            "overflow_count": 0,
            "fallback_description": self._describe_diff(file_payload),
        },
    }
```

**Do the same for every tool found in Step 3.1.** The common shape is: (1) parse args, (2) read old bytes, (3) simulate the edit in-memory, (4) build payload, (5) wrap in interact_config.

- [ ] **Step 3.3: Add a test case per new tool in `test_workspace_code_diff.py`**

For each new tool, mirror the structure of `test_write_file_overwrite_builds_edit_diff`: set up a file in `tmp_path`, call `workspace.build_confirmation_interact(tool_name, args)`, assert `interact_type == "code_diff"` and the diff contains expected `-old` / `+new` markers.

- [ ] **Step 3.4: Run toolkit tests**

```bash
cd ~/Desktop/GITRepo/miso
PYTHONPATH=src pytest tests/unchain/toolkits/test_workspace_code_diff.py -v
```

Expected: all PASS.

- [ ] **Step 3.5: Extend PuPu's `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES`**

Open `~/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py` and locate `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` (~line 134-139). Add `create_file` and every edit-shaped tool enumerated in Step 3.1. Example (exact names depend on Step 3.1 findings):

```python
_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES = {
    "write_file",
    "create_file",         # new
    "delete_file",
    "move_file",
    "terminal_exec",
    "replace_lines",       # new (if found)
    "search_and_replace",  # new (if found)
    # ... add all edit-shaped tools found
}
```

- [ ] **Step 3.6: Commit**

```bash
cd ~/Desktop/GITRepo/miso
git add src/unchain/toolkits/builtin/workspace/workspace.py tests/unchain/toolkits/test_workspace_code_diff.py
git commit -m "$(cat <<'EOF'
feat(unchain): extend code_diff to edit-shaped workspace tools

Adds build_confirmation_interact branches for every edit-shaped tool
in WorkspaceToolkit (replace_lines, search_and_replace, etc.) by
simulating each tool's transformation in memory and reusing
build_code_diff_payload.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"

cd ~/Desktop/GITRepo/PuPu
git add unchain_runtime/server/unchain_adapter.py
git commit -m "$(cat <<'EOF'
feat(adapter): add create_file and edit tools to legacy confirm list

Ensures the frontend receives confirmation events (including code_diff
payloads) for every workspace tool that actually mutates disk.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Multi-file batch tool (conditional)

**Files:**
- Modify: `~/Desktop/GITRepo/miso/src/unchain/toolkits/builtin/workspace/workspace.py`
- Modify: `~/Desktop/GITRepo/miso/tests/unchain/toolkits/test_workspace_code_diff.py`

- [ ] **Step 4.1: Check whether a batch tool exists**

```bash
grep -niE "multi_edit|apply_patch|batch_edit|edit_many" \
  ~/Desktop/GITRepo/miso/src/unchain/toolkits/builtin/workspace/
```

**If no such tool exists:** skip this task entirely. Document in the commit that no batch tool was found and move on.

**If one exists:** continue to Step 4.2.

- [ ] **Step 4.2: Add integration test for batch case**

Append to `tests/unchain/toolkits/test_workspace_code_diff.py`:

```python
def test_batch_edit_builds_multi_diff(workspace, tmp_path):
    (tmp_path / "a.py").write_text("A1\n")
    (tmp_path / "b.py").write_text("B1\n")
    (tmp_path / "c.py").write_text("C1\n")
    result = workspace.build_confirmation_interact(
        "<batch_tool_name>",  # replace with actual name
        {
            "edits": [  # replace arg shape with actual schema
                {"path": "a.py", "content": "A2\n"},
                {"path": "b.py", "content": "B2\n"},
                {"path": "c.py", "content": "C2\n"},
            ]
        },
    )
    assert result is not None
    cfg = result["interact_config"]
    assert cfg["operation"] == "multi"
    assert len(cfg["files"]) == 3
    assert cfg["overflow_count"] == 0


def test_batch_edit_overflow(workspace, tmp_path):
    for i in range(12):
        (tmp_path / f"f{i}.py").write_text(f"old{i}\n")
    edits = [
        {"path": f"f{i}.py", "content": f"new{i}\n"} for i in range(12)
    ]
    result = workspace.build_confirmation_interact(
        "<batch_tool_name>", {"edits": edits}
    )
    assert result is not None
    cfg = result["interact_config"]
    assert len(cfg["files"]) == 10
    assert cfg["overflow_count"] == 2


def test_batch_edit_binary_member_falls_back(workspace, tmp_path):
    (tmp_path / "good.py").write_text("ok\n")
    (tmp_path / "blob.bin").write_bytes(b"\x00\x01")
    result = workspace.build_confirmation_interact(
        "<batch_tool_name>",
        {
            "edits": [
                {"path": "good.py", "content": "ok2\n"},
                {"path": "blob.bin", "content": "x"},
            ]
        },
    )
    assert result is None  # entire batch falls back
```

- [ ] **Step 4.3: Implement the batch branch in `build_confirmation_interact`**

```python
if tool_name == "<batch_tool_name>":
    edits = arguments.get("edits")
    if not isinstance(edits, list) or not edits:
        return None

    file_payloads: list[dict] = []
    for edit in edits:
        if not isinstance(edit, dict):
            return None
        sub_path = edit.get("path")
        sub_content = edit.get("content", "")
        if not isinstance(sub_path, str) or not sub_path:
            return None
        sub_target = self._resolve_workspace_path(sub_path)
        if sub_target.exists() and sub_target.is_file():
            try:
                sub_old = sub_target.read_bytes()
            except OSError:
                return None
            sub_op = "edit"
        else:
            sub_old = b""
            sub_op = "create"
        if isinstance(sub_content, bytes):
            sub_new = sub_content
        else:
            try:
                sub_new = sub_content.encode("utf-8")
            except Exception:
                return None
        payload = build_code_diff_payload(
            sub_path, sub_old, sub_new, sub_op
        )
        if payload is None:
            return None  # atomic fallback for whole batch
        file_payloads.append(payload)

    MAX_DISPLAYED = 10
    overflow = max(0, len(file_payloads) - MAX_DISPLAYED)
    displayed = file_payloads[:MAX_DISPLAYED]
    title = f"Multi-file edit ({len(file_payloads)} files)"
    return {
        "interact_type": "code_diff",
        "interact_config": {
            "title": title,
            "operation": "multi",
            "files": displayed,
            "overflow_count": overflow,
            "fallback_description": (
                f"Batch edit of {len(file_payloads)} files"
            ),
        },
    }
```

Replace `<batch_tool_name>` with the actual name, and `arguments.get("edits")` with the real arg key.

- [ ] **Step 4.4: Run tests**

```bash
cd ~/Desktop/GITRepo/miso
PYTHONPATH=src pytest tests/unchain/toolkits/test_workspace_code_diff.py -v
```

Expected: all PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/unchain/toolkits/builtin/workspace/workspace.py tests/unchain/toolkits/test_workspace_code_diff.py
git commit -m "$(cat <<'EOF'
feat(unchain): support multi-file batch tool in code_diff

Adds overflow handling (>10 files) and atomic fallback when any
member of the batch is binary or oversized.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PuPu adapter regression test

**Files:**
- Create: `~/Desktop/GITRepo/PuPu/tests/server/test_adapter_code_diff_propagation.py`

- [ ] **Step 5.1: Write the regression test**

```python
"""Regression test: _build_tool_confirmation_request_payload propagates
interact_type='code_diff' and interact_config verbatim."""
from __future__ import annotations

from unchain_runtime.server.unchain_adapter import (
    _build_tool_confirmation_request_payload,
)


def test_code_diff_interact_type_is_preserved():
    class FakeReq:
        def to_dict(self):
            return {
                "tool_name": "write_file",
                "call_id": "call-xyz",
                "arguments": {"path": "foo.py", "content": "new"},
                "description": "Write File",
                "interact_type": "code_diff",
                "interact_config": {
                    "title": "Edit foo.py",
                    "operation": "edit",
                    "files": [
                        {
                            "path": "foo.py",
                            "sub_operation": "edit",
                            "unified_diff": "--- a/foo.py\n+++ b/foo.py\n",
                            "truncated": False,
                            "total_lines": 2,
                            "displayed_lines": 2,
                        }
                    ],
                    "overflow_count": 0,
                    "fallback_description": "edit foo.py (+1 -0)",
                },
            }

    payload = _build_tool_confirmation_request_payload(FakeReq())
    assert payload["interact_type"] == "code_diff"
    assert payload["interact_config"]["operation"] == "edit"
    assert payload["interact_config"]["files"][0]["path"] == "foo.py"
    assert "render_component" not in payload


def test_confirmation_default_when_no_interact_type():
    class FakeReq:
        def to_dict(self):
            return {
                "tool_name": "write_file",
                "call_id": "c-1",
                "arguments": {},
                "description": "",
            }

    payload = _build_tool_confirmation_request_payload(FakeReq())
    assert payload["interact_type"] == "confirmation"
    assert payload["interact_config"] == {}
```

- [ ] **Step 5.2: Run and verify it passes**

```bash
cd ~/Desktop/GITRepo/PuPu
PYTHONPATH=. pytest tests/server/test_adapter_code_diff_propagation.py -v
```

Expected: PASS on both (current adapter code already does the right thing — this locks that contract).

- [ ] **Step 5.3: Commit**

```bash
git add tests/server/test_adapter_code_diff_propagation.py
git commit -m "$(cat <<'EOF'
test(adapter): lock code_diff interact_type propagation contract

Regression test ensures _build_tool_confirmation_request_payload
forwards interact_type and interact_config verbatim — the frontend
relies on this for the new code_diff UI.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `CodeDiffInteract` React component

**Files:**
- Create: `~/Desktop/GITRepo/PuPu/src/COMPONENTs/interact/CodeDiffInteract.js` (path TBD from Step 6.1)
- Create: test file alongside per PuPu convention

### 6A — Locate existing interact components

- [ ] **Step 6.1: Find the existing interact components directory**

```bash
cd ~/Desktop/GITRepo/PuPu
grep -rl "ConfirmInteract" src/ --include="*.js" --include="*.jsx"
```

Record the actual directory (e.g. `src/COMPONENTs/interact/` or `src/components/interact/`). Use this as the target directory for the new component. Read `ConfirmInteract.js` and `interact_registry.js` in full to match conventions (prop names, styling approach, imports).

### 6B — Write the failing test

- [ ] **Step 6.2: Write `CodeDiffInteract.test.js` alongside the existing interact tests**

Locate how existing interact tests are structured:

```bash
grep -rl "ConfirmInteract" src/ --include="*.test.js" --include="*.test.jsx"
```

Mirror that structure. Write:

```jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeDiffInteract } from "./CodeDiffInteract";

const baseConfig = {
  title: "Edit foo.py",
  operation: "edit",
  files: [
    {
      path: "foo.py",
      sub_operation: "edit",
      unified_diff:
        "--- a/foo.py\n+++ b/foo.py\n@@ -1,2 +1,2 @@\n-old\n+new\n",
      truncated: false,
      total_lines: 4,
      displayed_lines: 4,
    },
  ],
  overflow_count: 0,
  fallback_description: "edit foo.py (+1 -1)",
};

describe("CodeDiffInteract", () => {
  test("renders pending state with approve/reject buttons", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        status="pending"
        isDark={false}
      />
    );
    expect(screen.getByText("Edit foo.py")).toBeInTheDocument();
    expect(screen.getByText("foo.py")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  test("classifies diff lines correctly", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        status="pending"
        isDark={false}
      />
    );
    const added = screen.getByText("+new");
    const removed = screen.getByText("-old");
    expect(added).toHaveClass("diff-line-added");
    expect(removed).toHaveClass("diff-line-removed");
  });

  test("renders approved state with badge and no buttons", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        status="approved"
        isDark={false}
      />
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });

  test("renders rejected state with red badge", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        status="rejected"
        isDark={false}
      />
    );
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
    expect(screen.getByText(/rejected/i)).toBeInTheDocument();
  });

  test("shows truncation notice when truncated", () => {
    const cfg = {
      ...baseConfig,
      files: [{ ...baseConfig.files[0], truncated: true, total_lines: 500, displayed_lines: 200 }],
    };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        status="pending"
        isDark={false}
      />
    );
    expect(screen.getByText(/300 more lines hidden/i)).toBeInTheDocument();
  });

  test("shows overflow notice", () => {
    const cfg = { ...baseConfig, overflow_count: 3 };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        status="pending"
        isDark={false}
      />
    );
    expect(screen.getByText(/\+ 3 more files not shown/i)).toBeInTheDocument();
  });

  test("clicking Approve calls onSubmit with approved:true", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        status="pending"
        isDark={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: true });
  });

  test("clicking Reject calls onSubmit with approved:false", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        status="pending"
        isDark={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: false });
  });

  test("malformed unified_diff falls back to <pre>", () => {
    const cfg = {
      ...baseConfig,
      files: [
        {
          ...baseConfig.files[0],
          unified_diff: "not a valid diff at all",
        },
      ],
    };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        status="pending"
        isDark={false}
      />
    );
    // Should render something — no crash
    expect(screen.getByText("foo.py")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.3: Run the tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/PuPu
npx jest src/.../CodeDiffInteract.test.js
```

Expected: all fail (component does not exist).

### 6C — Implement the component

- [ ] **Step 6.4: Create `CodeDiffInteract.js`**

Use the exact directory discovered in Step 6.1. Match the file's module format (CJS / ESM) to neighbors:

```jsx
import React from "react";

const OP_LABELS = {
  edit: "Edit",
  create: "Create",
  delete: "Delete",
  multi: "Multi-file edit",
};

function parseDiffLines(unifiedDiff) {
  if (!unifiedDiff || typeof unifiedDiff !== "string") return [];
  const rows = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  const lines = unifiedDiff.split("\n");
  for (const raw of lines) {
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      rows.push({ kind: "file-header", text: raw });
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLineNo = parseInt(m[1], 10);
        newLineNo = parseInt(m[2], 10);
      }
      rows.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      rows.push({ kind: "added", text: raw, oldNo: "", newNo: newLineNo });
      newLineNo += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      rows.push({ kind: "removed", text: raw, oldNo: oldLineNo, newNo: "" });
      oldLineNo += 1;
      continue;
    }
    if (raw.startsWith(" ")) {
      rows.push({
        kind: "context",
        text: raw,
        oldNo: oldLineNo,
        newNo: newLineNo,
      });
      oldLineNo += 1;
      newLineNo += 1;
      continue;
    }
    if (raw.length === 0) continue;
    rows.push({ kind: "context", text: raw });
  }
  return rows;
}

function DiffBody({ unifiedDiff, isDark }) {
  let rows;
  try {
    rows = parseDiffLines(unifiedDiff);
  } catch (e) {
    rows = null;
  }
  if (!rows || rows.length === 0) {
    return (
      <pre className={`code-diff-raw ${isDark ? "dark" : ""}`}>
        {unifiedDiff || "(no changes)"}
      </pre>
    );
  }
  return (
    <div className={`code-diff-body ${isDark ? "dark" : ""}`}>
      {rows.map((row, idx) => {
        let cls = "diff-line";
        if (row.kind === "added") cls += " diff-line-added";
        else if (row.kind === "removed") cls += " diff-line-removed";
        else if (row.kind === "hunk") cls += " diff-line-hunk";
        else if (row.kind === "file-header") cls += " diff-line-fileheader";
        else cls += " diff-line-context";
        return (
          <div key={idx} className={cls}>
            <span className="diff-lineno old">{row.oldNo ?? ""}</span>
            <span className="diff-lineno new">{row.newNo ?? ""}</span>
            <span className="diff-text">{row.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function countPlusMinus(unifiedDiff) {
  if (!unifiedDiff) return { plus: 0, minus: 0 };
  let plus = 0,
    minus = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
  }
  return { plus, minus };
}

function FileBlock({ file, isDark }) {
  const { plus, minus } = countPlusMinus(file.unified_diff);
  const hiddenCount = Math.max(0, (file.total_lines || 0) - (file.displayed_lines || 0));
  return (
    <div className="code-diff-file">
      <div className="code-diff-file-header">
        <span className="code-diff-path">{file.path}</span>
        <span className="code-diff-subop">{file.sub_operation}</span>
        <span className="code-diff-stats">
          +{plus} -{minus}
        </span>
      </div>
      <DiffBody unifiedDiff={file.unified_diff} isDark={isDark} />
      {file.truncated && (
        <div className="code-diff-truncated">
          truncated — {hiddenCount} more lines hidden
        </div>
      )}
    </div>
  );
}

export function CodeDiffInteract({ config, onSubmit, status, isDark }) {
  const title = config?.title || "Code changes";
  const operation = config?.operation || "edit";
  const files = Array.isArray(config?.files) ? config.files : [];
  const overflow = config?.overflow_count || 0;

  const stateClass =
    status === "approved"
      ? "code-diff-state-approved"
      : status === "rejected"
      ? "code-diff-state-rejected"
      : "code-diff-state-pending";

  return (
    <div className={`code-diff-card ${stateClass} ${isDark ? "dark" : ""}`}>
      <div className="code-diff-header">
        <span className="code-diff-title">{title}</span>
        <span className="code-diff-op-badge">{OP_LABELS[operation] || operation}</span>
      </div>
      <div className="code-diff-files">
        {files.map((f, idx) => (
          <FileBlock key={`${f.path}-${idx}`} file={f} isDark={isDark} />
        ))}
        {overflow > 0 && (
          <div className="code-diff-overflow">+ {overflow} more files not shown</div>
        )}
      </div>
      <div className="code-diff-footer">
        {status === "pending" && (
          <>
            <button
              type="button"
              className="code-diff-btn code-diff-btn-approve"
              onClick={() => onSubmit && onSubmit({ approved: true })}
            >
              Approve
            </button>
            <button
              type="button"
              className="code-diff-btn code-diff-btn-reject"
              onClick={() => onSubmit && onSubmit({ approved: false })}
            >
              Reject
            </button>
          </>
        )}
        {status === "approved" && (
          <span className="code-diff-badge code-diff-badge-approved">
            ✓ Approved
          </span>
        )}
        {status === "rejected" && (
          <span className="code-diff-badge code-diff-badge-rejected">
            ✗ Rejected
          </span>
        )}
      </div>
    </div>
  );
}

export default CodeDiffInteract;
```

- [ ] **Step 6.5: Create `CodeDiffInteract.css`** (or the styled-components / SCSS equivalent used by neighbors)

```css
.code-diff-card {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  background: #ffffff;
  font-family: inherit;
}
.code-diff-card.dark {
  background: #1b1b1b;
  border-color: #3a3a3a;
  color: #e8e8e8;
}
.code-diff-card.code-diff-state-approved {
  opacity: 0.75;
  border-left: 3px solid #22c55e;
}
.code-diff-card.code-diff-state-rejected {
  opacity: 0.75;
  border-left: 3px solid #ef4444;
}

.code-diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.code-diff-title { font-weight: 600; }
.code-diff-op-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: #eaeef2;
  border-radius: 4px;
  text-transform: uppercase;
}
.code-diff-card.dark .code-diff-op-badge { background: #2d2d2d; }

.code-diff-file { margin-bottom: 12px; }
.code-diff-file-header {
  display: flex;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 4px;
  align-items: center;
}
.code-diff-path { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 600; }
.code-diff-subop { color: #656d76; text-transform: uppercase; font-size: 10px; }
.code-diff-stats { margin-left: auto; color: #656d76; font-family: ui-monospace, Menlo, monospace; }

.code-diff-body {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  border: 1px solid #eaeef2;
  border-radius: 4px;
  overflow-x: auto;
  background: #f6f8fa;
}
.code-diff-card.dark .code-diff-body { background: #0d1117; border-color: #30363d; }
.code-diff-raw {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre;
  padding: 8px;
  background: #f6f8fa;
  border-radius: 4px;
  overflow-x: auto;
}
.code-diff-card.dark .code-diff-raw { background: #0d1117; }

.diff-line {
  display: flex;
  padding: 0 8px;
  white-space: pre;
}
.diff-lineno {
  display: inline-block;
  width: 3em;
  text-align: right;
  padding-right: 8px;
  color: #8c959f;
  user-select: none;
}
.diff-line-added { background: #e6ffec; }
.diff-line-removed { background: #ffebe9; }
.code-diff-card.dark .diff-line-added { background: #033a16; }
.code-diff-card.dark .diff-line-removed { background: #67060c; }
.diff-line-hunk { background: #ddf4ff; color: #0969da; }
.code-diff-card.dark .diff-line-hunk { background: #0c2d6b; color: #79c0ff; }
.diff-line-fileheader { color: #8c959f; }

.code-diff-truncated, .code-diff-overflow {
  font-size: 11px;
  color: #8c959f;
  font-style: italic;
  padding: 4px 8px;
}

.code-diff-footer { margin-top: 10px; display: flex; gap: 8px; align-items: center; }
.code-diff-btn {
  padding: 6px 14px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  background: #f6f8fa;
}
.code-diff-btn-approve { background: #1f883d; color: white; border-color: #1f883d; }
.code-diff-btn-reject { background: #ffffff; color: #cf222e; border-color: #cf222e; }
.code-diff-badge { font-size: 12px; padding: 4px 10px; border-radius: 4px; }
.code-diff-badge-approved { background: #dafbe1; color: #1a7f37; }
.code-diff-badge-rejected { background: #ffebe9; color: #82061e; }
```

Import the CSS inside `CodeDiffInteract.js` with a single `import "./CodeDiffInteract.css";` if that's the pattern used by `ConfirmInteract.js`; otherwise inline styles per local convention.

- [ ] **Step 6.6: Run tests**

```bash
cd ~/Desktop/GITRepo/PuPu
npx jest src/.../CodeDiffInteract.test.js
```

Expected: all PASS. If any fail, read the assertion error and patch the component minimally — do not change the tests.

- [ ] **Step 6.7: Commit**

```bash
git add src/.../CodeDiffInteract.js src/.../CodeDiffInteract.css src/.../CodeDiffInteract.test.js
git commit -m "$(cat <<'EOF'
feat(ui): add CodeDiffInteract component

New interact component renders unified diffs with per-line +/- coloring,
three states (pending/approved/rejected), truncation and overflow notices,
and approve/reject buttons that conform to the existing interact onSubmit
contract.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Register `code_diff` in interact registry + verify stream handler

**Files:**
- Modify: `~/Desktop/GITRepo/PuPu/src/.../interact_registry.js`
- Modify (conditional): `~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js`

- [ ] **Step 7.1: Read `interact_registry.js`**

```bash
cat ~/Desktop/GITRepo/PuPu/src/.../interact_registry.js   # path from Task 6.1
```

- [ ] **Step 7.2: Add `code_diff` entry**

Edit `interact_registry.js` to import and register:

```js
import { CodeDiffInteract } from "./CodeDiffInteract";

const interactRegistry = {
  confirmation: ConfirmInteract,
  single: SingleSelectInteract,
  multi: MultiSelectInteract,
  text_input: TextInputInteract,
  multi_choice: MultiChoiceInteract,
  code_diff: CodeDiffInteract,  // new
};
```

Keep the exact surrounding style (named export vs default, trailing comma, semicolons) consistent with the existing file.

- [ ] **Step 7.3: Verify `use_chat_stream.js` tool_call dispatch is generic**

```bash
grep -nE "ask_user_question|interact_type|tool_call" \
  ~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js
```

**Two things to confirm by reading the matches:**

(a) The `tool_call` frame handler that routes to `InteractWrapper` keys its decision on whether `frame.payload.interact_type` is set (or `frame.payload.interact_config` is non-null), **not** on `frame.payload.tool_name === "ask_user_question"`.

(b) After receiving an approve/reject response from `/chat/tool/confirmation`, the frame is NOT removed from `message.traceFrames`. Instead a `status` field (or similar) is mutated to `"approved"` / `"rejected"`, and the interact component is re-rendered in the new state.

**If (a) is already correct:** no change. Commit only the registry edit.

**If (a) is wrong** (hard-coded on tool name): generalize the check. Replace a line like:
```js
if (frame.type === "tool_call" && frame.payload.tool_name === "ask_user_question") { ... }
```
with:
```js
if (frame.type === "tool_call" && frame.payload.interact_type) { ... }
```
and confirm the surrounding branch still handles `ask_user_question` (it should — same code path).

**If (b) is wrong** (frame removed on response): change the response handler so it *updates* the frame's `status` in `message.traceFrames` rather than filtering it out. The exact diff depends on current structure — keep the change targeted.

- [ ] **Step 7.4: Manual sanity check — does the app still boot?**

```bash
cd ~/Desktop/GITRepo/PuPu
# Use whatever start command is canonical (check package.json "scripts"):
grep -A5 '"scripts"' package.json
# Then run the dev server — e.g.:
npm run dev  # or npm start / yarn dev
```

Open the app, send one message to an agent that just echoes text (no file tool). Confirm no JavaScript errors in console and that previous interact types (ask_user_question if reachable) still work. Kill the dev server.

- [ ] **Step 7.5: Commit**

```bash
git add src/.../interact_registry.js
# Only include use_chat_stream.js if it was actually modified
git commit -m "$(cat <<'EOF'
feat(ui): register code_diff in interact registry

Wires up the new CodeDiffInteract component. [If use_chat_stream.js was
touched, add a second sentence explaining the targeted change.]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: End-to-end manual verification

**No file changes.** This is the final verification gate before declaring the feature done.

- [ ] **Step 8.1: Start PuPu in dev mode connected to the unchain branch**

Follow the project's standard dev-run procedure. Ensure unchain is resolved from `~/Desktop/GITRepo/miso/src` (editable install or sys-path equivalent) so the workspace toolkit changes are active.

- [ ] **Step 8.2: Run the E2E checklist**

For each scenario below, open a chat, instruct the agent, and verify the expected outcome. Check the box only when the scenario is green.

- [ ] **E2E-1 (small edit):** Ask the agent to edit an existing `.py` file in the workspace with a small change. **Expect:** diff card appears, shows removed and added lines, Approve button works, after approve the card de-saturates with a green left edge, diff content still visible.
- [ ] **E2E-2 (create):** Ask agent to create a new `.md` file with a few lines. **Expect:** card shows operation "create", every line prefixed with `+`, approve works.
- [ ] **E2E-3 (delete):** Ask agent to delete a file. **Expect:** card shows "delete", all lines prefixed with `-`, red/green edge on approve.
- [ ] **E2E-4 (truncation):** Pre-populate a file with 500 lines, ask agent to rewrite all 500. **Expect:** diff shows ~200 lines, then the "X more lines hidden" notice.
- [ ] **E2E-5 (binary fallback):** Ask agent to write to a path whose existing content is binary (e.g. a PNG). **Expect:** falls back to the legacy confirmation UI, no crash.
- [ ] **E2E-6 (reject):** Ask agent to write a file, click Reject. **Expect:** card takes rejected style (red edge, "✗ Rejected"), agent receives the denial (it should say something like "user denied" or retry), no hang.
- [ ] **E2E-7 (history persistence):** After approving a diff, send more messages so the chat scrolls. Scroll back up. **Expect:** the old diff card still renders correctly in approved state.
- [ ] **E2E-8 (batch, only if Task 4 applied):** Ask agent to use the batch tool on 3 files. **Expect:** single card with 3 file blocks, single approve, all three execute.
- [ ] **E2E-9 (overflow, only if Task 4 applied):** Ask agent to use the batch tool on 12 files. **Expect:** 10 file blocks + "+2 more files not shown" notice.
- [ ] **E2E-10 (regression: ask_user_question):** Trigger a flow that uses `ask_user_question` (any existing questionnaire path). **Expect:** unchanged behavior — single/multi/text_input UIs still work.

- [ ] **Step 8.3: If any E2E scenario fails**

Do NOT paper over with a quick fix. Root-cause it:
- Check the browser console for JS errors → likely a component / registry issue (Task 6 or 7)
- Check the PuPu server logs for Python errors → likely an adapter propagation issue (Task 2 or 5)
- Check the unchain logs → likely a toolkit hook issue (Task 2 or 3)
Narrow the failure with the smallest possible repro, then fix in the corresponding task's code and re-run that E2E case. Add a test capturing the bug before committing the fix.

- [ ] **Step 8.4: Commit the manual verification record**

This is a documentation-only commit to mark the feature done.

```bash
cd ~/Desktop/GITRepo/PuPu
# Append a brief "Verification Log" section to the spec or plan doc
# recording: date, checklist outcomes, any follow-ups.
git add docs/superpowers/plans/2026-04-13-unchain-code-diff-ui.md
git commit -m "$(cat <<'EOF'
docs: record code_diff UI E2E verification results

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update auto-memory

- [ ] **Step 9.1: Add a project memory entry**

Create `~/.claude/projects/-Users-red-Desktop/memory/project_pupu_code_diff_ui.md`:

```markdown
---
name: PuPu code_diff interact UI
description: Unified diff UI for unchain file tools via new code_diff interact_type, completed YYYY-MM-DD
type: project
---

unchain workspace file tools (write_file / create_file / delete_file /
[edit tools from Task 3] / [batch tool from Task 4 if applied]) now surface
a unified diff as the approval UI. Protocol: `interact_type = "code_diff"`
in ToolConfirmationRequest, payload shape documented in
`PuPu/docs/superpowers/specs/2026-04-13-unchain-code-diff-ui-design.md`.

Implementation:
- unchain: `src/unchain/tools/_diff_helpers.py` (pure), toolkit hook
  `WorkspaceToolkit.build_confirmation_interact`, dispatch in
  `src/unchain/tools/confirmation.py`
- PuPu adapter: zero code change, one regression test locking propagation
- PuPu frontend: `CodeDiffInteract` component + `interact_registry` entry

Binary / oversized / errored inputs fall back to legacy confirmation UI.
Approved/rejected cards persist in the timeline with de-saturated styling.

How to apply: see spec + plan docs for protocol details. When adding a
new file-mutating tool, remember to (1) add a branch in
`build_confirmation_interact`, (2) add the name to
`_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` in `unchain_adapter.py`.
```

- [ ] **Step 9.2: Add to MEMORY.md index**

Edit `~/.claude/projects/-Users-red-Desktop/memory/MEMORY.md` and append:

```
- [PuPu code_diff UI](project_pupu_code_diff_ui.md) — unified diff approval UI for unchain workspace tools (complete)
```

---

## Self-Review Notes

Run against the spec (`2026-04-13-unchain-code-diff-ui-design.md`):

- §1 Goal → covered by Tasks 1-7.
- §2 Non-goals → no task touches them.
- §3 Protocol (event shape, lifecycle, invariants) → Task 2 (backend), Task 5 (adapter), Task 6/7 (frontend).
- §4.1 unchain changes → Tasks 1, 2, 3, 4.
- §4.2 PuPu adapter → Tasks 3.5, 5 (test-only + `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` update).
- §4.3 Step-0 open questions → pre-resolved in the "Investigation Findings" section at the top of this plan.
- §5 Frontend → Tasks 6, 7.
- §6 Testing → each production task has matching tests; §6.5 manual checklist lives in Task 8.
- §7 Edge cases → covered in Task 1 tests + Task 2 fallback logic + Task 6 malformed-diff test.
- §8 Impl order → this plan's task order matches.
- §9 Future work → explicitly not in this plan.

**Type-consistency check:** `build_code_diff_payload` signature and return shape is consistent between `_diff_helpers.py`, the workspace hook, and the frontend tests. `interact_type` / `interact_config` names match unchain's `ToolConfirmationRequest` dataclass. CSS class names (`diff-line-added`, `diff-line-removed`) match what the test asserts.

**Known gaps flagged for execution:**
- Task 2 Step 2.7 uses a placeholder dispatch function name (`run_tool_with_confirmation`). Execution must read `confirmation.py` first and adjust both the test and the production edit to match the real API.
- Task 6 Step 6.1 must locate the actual frontend interact directory. The plan uses `src/COMPONENTs/interact/` as a placeholder.
- Task 4 is entirely conditional on whether a batch tool exists; Step 4.1 decides.
- Task 3 is driven by Step 3.1's grep output; the specific edit-tool branches to add are discovered at implementation time.
