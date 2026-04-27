# Unchain Code Diff UI — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface unified diffs as the approval UI for `CoreToolkit.write` and `CoreToolkit.edit` in the standalone unchain repo, rendered in the PuPu frontend via a new `code_diff` interact component. Approved/rejected cards stay in the timeline as history. Session-based auto-approve is intentionally excluded.

**Architecture:** Extend `ToolConfirmationPolicy` dataclass with `interact_type` / `interact_config` fields. Add a confirmation resolver to `write` and `edit` that reads the target file, computes a unified diff via `build_code_diff_payload`, and returns a policy carrying `interact_type="code_diff"` + `interact_config={...}`. `confirmation.py` is patched to propagate the new policy fields onto `ToolConfirmationRequest`. PuPu adapter already propagates arbitrary `interact_type` verbatim — one dead-code cleanup to its legacy tool-name list plus a regression test. Frontend gets a new `CodeDiffInteract` React component registered in `interactRegistry`.

**Tech Stack:** Python 3.12+ `difflib` (stdlib), pytest, React 19 function components with inline styles, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-13-unchain-code-diff-ui-design.md`

**Repos:**
- unchain: `~/Desktop/GITRepo/unchain/` (branch `dev`)
- PuPu: `~/Desktop/GITRepo/PuPu/` (branch `dev`)

---

## Investigation Findings (Step 0 — resolved before writing plan)

All 4 spec §4.3 open questions resolved by source grep. Plan tasks use these findings directly — no in-task investigation needed.

1. **`ToolConfirmationPolicy` shape**: defined at `unchain/src/unchain/tools/models.py:202-225`, frozen dataclass with fields `requires_confirmation: bool = True`, `description: str = ""`, `render_component: dict | None = None`. It does NOT yet have `interact_type` / `interact_config`. We extend it in Task 2.

2. **`ToolConfirmationRequest` shape**: at `unchain/src/unchain/tools/models.py:286-310`, already has `interact_type: str = "confirmation"` and `interact_config: dict | list | None = None`. No dataclass change needed on the request side.

3. **Confirmation resolver pattern**: `CoreToolkit.shell` uses this. Resolver registered via `self.register(self.shell, requires_confirmation=True, confirmation_resolver=self._resolve_shell_confirmation, ...)` at `unchain/src/unchain/toolkits/builtin/core/core.py:140-146`. Resolver signature: `(arguments: dict, execution_context: ToolExecutionContext | None) -> ToolConfirmationPolicy`. Framework invokes it at `unchain/src/unchain/tools/confirmation.py:74-79`. Reference impl at `core.py:922-943`.

4. **`execute_confirmable_tool_call` request construction**: `unchain/src/unchain/tools/confirmation.py:94-113`. We patch inside this block to read `interact_type` / `interact_config` from `confirmation_policy` and pass them to the `ToolConfirmationRequest` constructor.

5. **PuPu adapter propagation**: `_make_tool_confirm_callback` (~line 459) delegates to `_build_tool_confirmation_request_payload` (~line 294) which already copies `interact_type` / `interact_config` verbatim from the request. Task 5 is a regression test + dead-code cleanup of `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES`.

6. **Current write/edit confirmation goes through**: `CoreToolkit` hard-codes `requires_confirmation=True` when registering `write` and `edit` (`core.py:109-122`). PuPu's legacy tool-name list is dead code — it lists `write_file / delete_file / move_file` which don't exist in standalone unchain. Fixing the list doesn't change behavior, but it's worth cleaning up.

---

## File Structure

**unchain repo (`~/Desktop/GITRepo/unchain/`):**

| File | Action | Responsibility |
|---|---|---|
| `src/unchain/tools/_diff_helpers.py` | create | `build_code_diff_payload(path, old, new, operation)` pure stdlib function |
| `src/unchain/tools/models.py` | modify | Extend `ToolConfirmationPolicy` dataclass with `interact_type` + `interact_config` fields; update `from_raw` classmethod to honor them |
| `src/unchain/tools/confirmation.py` | modify | Read `interact_type` / `interact_config` from the active policy and pass them to the `ToolConfirmationRequest` constructor |
| `src/unchain/toolkits/builtin/core/core.py` | modify | Add `_resolve_write_confirmation` and `_resolve_edit_confirmation` resolvers; wire them via `self.register(..., confirmation_resolver=...)` for `write` and `edit` |
| `tests/test_diff_helpers.py` | create | 11 unit tests for `build_code_diff_payload` |
| `tests/test_confirmation_policy_interact_fields.py` | create | Tests that `ToolConfirmationPolicy` carries `interact_type` / `interact_config` and propagates them to `ToolConfirmationRequest` via `execute_confirmable_tool_call` |
| `tests/test_core_write_edit_code_diff.py` | create | Integration tests that `write` / `edit` resolvers produce valid `code_diff` policies and fall back on binary/oversized inputs |

**PuPu repo (`~/Desktop/GITRepo/PuPu/`):**

| File | Action | Responsibility |
|---|---|---|
| `unchain_runtime/server/unchain_adapter.py` | modify | Replace stale `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` entries with the new ones (dead-code cleanup) |
| `unchain_runtime/server/tests/test_adapter_code_diff_propagation.py` | create | Regression test: adapter forwards `interact_type="code_diff"` verbatim |
| `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js` | create | New React interact component |
| `src/COMPONENTs/chat-bubble/interact/interact_registry.js` | modify | Register `code_diff: CodeDiffInteract` |
| `src/COMPONENTs/chat-bubble/interact/code_diff_interact.test.js` | create | RTL unit tests for the component |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | verify (no change expected) | Confirm `isAutoApprovable` still excludes `code_diff`; confirm `tool_call` dispatch is generic |
| `src/PAGEs/chat/hooks/use_chat_stream.code_diff_guard.test.js` | create | Targeted regression test asserting `code_diff` is NOT auto-approved even when `sessionAutoApproveRef` would otherwise match |

**Docs:**

| File | Action |
|---|---|
| `docs/superpowers/plans/2026-04-13-unchain-code-diff-ui.md` | this plan |
| `~/.claude/projects/-Users-red-Desktop/memory/project_pupu_code_diff_ui.md` | new memory entry on Task 9 |

---

## Task 1: `build_code_diff_payload` helper (unchain)

**Files:**
- Create: `~/Desktop/GITRepo/unchain/src/unchain/tools/_diff_helpers.py`
- Create: `~/Desktop/GITRepo/unchain/tests/test_diff_helpers.py`

- [ ] **Step 1.1: Write the failing tests**

Create `~/Desktop/GITRepo/unchain/tests/test_diff_helpers.py`:

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


def test_delete_mode_sanity():
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
    assert result["unified_diff"] == ""


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
cd ~/Desktop/GITRepo/unchain
PYTHONPATH=src pytest tests/test_diff_helpers.py -v
```

Expected: all fail with `ModuleNotFoundError: No module named 'unchain.tools._diff_helpers'`.

- [ ] **Step 1.3: Implement `_diff_helpers.py`**

Create `~/Desktop/GITRepo/unchain/src/unchain/tools/_diff_helpers.py`:

```python
"""Diff payload builder for the code_diff interact UI.

Dependency-free (stdlib only). Returns None on any condition where a diff
should NOT be shown (binary, oversized, internal error); callers fall back
to the legacy confirmation UI in that case.
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
    to the legacy confirmation path (binary content, oversized, or any
    unexpected exception, which is logged at WARNING).
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
PYTHONPATH=src pytest tests/test_diff_helpers.py -v
```

Expected: all 11 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
cd ~/Desktop/GITRepo/unchain
git add src/unchain/tools/_diff_helpers.py tests/test_diff_helpers.py
git commit -m "$(cat <<'EOF'
feat(tools): add build_code_diff_payload helper

Pure stdlib helper emitting unified-diff payloads for the upcoming
code_diff interact UI, or None for binary / oversized / errored inputs
so callers can fall back to legacy confirmation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `ToolConfirmationPolicy` with interact fields (unchain)

**Files:**
- Modify: `~/Desktop/GITRepo/unchain/src/unchain/tools/models.py:202-225`
- Create: `~/Desktop/GITRepo/unchain/tests/test_confirmation_policy_interact_fields.py`

- [ ] **Step 2.1: Write the failing test**

Create `~/Desktop/GITRepo/unchain/tests/test_confirmation_policy_interact_fields.py`:

```python
"""Tests for ToolConfirmationPolicy interact_type/interact_config fields."""
from __future__ import annotations

from unchain.tools.models import ToolConfirmationPolicy


def test_policy_defaults():
    p = ToolConfirmationPolicy()
    assert p.requires_confirmation is True
    assert p.description == ""
    assert p.render_component is None
    assert p.interact_type == "confirmation"
    assert p.interact_config is None


def test_policy_with_code_diff_interact():
    cfg = {
        "title": "Edit foo.py",
        "operation": "edit",
        "path": "foo.py",
        "unified_diff": "--- a/foo.py\n+++ b/foo.py\n",
        "truncated": False,
        "total_lines": 2,
        "displayed_lines": 2,
        "fallback_description": "edit foo.py (+1 -0)",
    }
    p = ToolConfirmationPolicy(
        requires_confirmation=True,
        description="Edit foo.py",
        interact_type="code_diff",
        interact_config=cfg,
    )
    assert p.interact_type == "code_diff"
    assert p.interact_config == cfg


def test_from_raw_bool_true():
    p = ToolConfirmationPolicy.from_raw(True)
    assert p.requires_confirmation is True
    assert p.interact_type == "confirmation"
    assert p.interact_config is None


def test_from_raw_bool_false():
    p = ToolConfirmationPolicy.from_raw(False)
    assert p.requires_confirmation is False
    assert p.interact_type == "confirmation"


def test_from_raw_dict_with_interact_fields():
    raw = {
        "requires_confirmation": True,
        "description": "Edit",
        "interact_type": "code_diff",
        "interact_config": {"operation": "edit", "path": "foo.py"},
    }
    p = ToolConfirmationPolicy.from_raw(raw)
    assert p.interact_type == "code_diff"
    assert p.interact_config == {"operation": "edit", "path": "foo.py"}


def test_from_raw_dict_without_interact_fields():
    raw = {"requires_confirmation": True, "description": "ok"}
    p = ToolConfirmationPolicy.from_raw(raw)
    assert p.interact_type == "confirmation"
    assert p.interact_config is None


def test_from_raw_passes_existing_policy_through():
    original = ToolConfirmationPolicy(
        requires_confirmation=True,
        interact_type="code_diff",
        interact_config={"foo": "bar"},
    )
    p = ToolConfirmationPolicy.from_raw(original)
    assert p is original
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/unchain
PYTHONPATH=src pytest tests/test_confirmation_policy_interact_fields.py -v
```

Expected: all fail with `TypeError: __init__() got an unexpected keyword argument 'interact_type'`.

- [ ] **Step 2.3: Read current `models.py:202-225` to lock the exact context**

```bash
sed -n '195,235p' ~/Desktop/GITRepo/unchain/src/unchain/tools/models.py
```

Confirm the class definition matches the investigation snippet (frozen dataclass, three fields, `from_raw` classmethod).

- [ ] **Step 2.4: Patch `ToolConfirmationPolicy`**

Edit `~/Desktop/GITRepo/unchain/src/unchain/tools/models.py`. Replace the existing `ToolConfirmationPolicy` dataclass and its `from_raw` classmethod with:

```python
@dataclass(frozen=True)
class ToolConfirmationPolicy:
    requires_confirmation: bool = True
    description: str = ""
    render_component: dict[str, Any] | None = None
    interact_type: str = "confirmation"
    interact_config: dict[str, Any] | list[Any] | None = None

    @classmethod
    def from_raw(
        cls,
        raw: bool | dict[str, Any] | "ToolConfirmationPolicy" | None,
    ) -> "ToolConfirmationPolicy":
        if isinstance(raw, ToolConfirmationPolicy):
            return raw
        if isinstance(raw, bool):
            return cls(requires_confirmation=raw)
        if isinstance(raw, dict):
            render_component = raw.get("render_component")
            interact_type_raw = raw.get("interact_type", "confirmation")
            interact_type = (
                interact_type_raw
                if isinstance(interact_type_raw, str) and interact_type_raw
                else "confirmation"
            )
            interact_config_raw = raw.get("interact_config")
            interact_config = (
                interact_config_raw
                if isinstance(interact_config_raw, (dict, list))
                else None
            )
            return cls(
                requires_confirmation=bool(raw.get("requires_confirmation", True)),
                description=str(raw.get("description") or ""),
                render_component=render_component if isinstance(render_component, dict) else None,
                interact_type=interact_type,
                interact_config=interact_config,
            )
        return cls()
```

- [ ] **Step 2.5: Run tests to verify they pass**

```bash
PYTHONPATH=src pytest tests/test_confirmation_policy_interact_fields.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 2.6: Commit**

```bash
cd ~/Desktop/GITRepo/unchain
git add src/unchain/tools/models.py tests/test_confirmation_policy_interact_fields.py
git commit -m "$(cat <<'EOF'
feat(tools): add interact_type/interact_config to ToolConfirmationPolicy

Extends the policy dataclass so confirmation resolvers can surface
custom interact payloads (e.g. code_diff) in addition to the existing
render_component hook. from_raw() honors both new fields when
constructing a policy from a dict.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Propagate interact fields from policy to request (unchain)

**Files:**
- Modify: `~/Desktop/GITRepo/unchain/src/unchain/tools/confirmation.py:94-113`
- Create: `~/Desktop/GITRepo/unchain/tests/test_confirmation_interact_propagation.py`

- [ ] **Step 3.1: Write the failing test**

Create `~/Desktop/GITRepo/unchain/tests/test_confirmation_interact_propagation.py`:

```python
"""Test that execute_confirmable_tool_call propagates policy interact fields."""
from __future__ import annotations

from unittest.mock import MagicMock

from unchain.tools.confirmation import execute_confirmable_tool_call
from unchain.tools.models import ToolConfirmationPolicy, ToolConfirmationRequest


def _make_tool_call(name: str = "write", args: dict | None = None, call_id: str = "c-1"):
    tool_call = MagicMock()
    tool_call.name = name
    tool_call.call_id = call_id
    tool_call.arguments = args if args is not None else {"path": "foo.py", "content": "x"}
    return tool_call


def _make_tool_obj(resolver_return):
    tool_obj = MagicMock()
    tool_obj.requires_confirmation = True
    tool_obj.observe = False
    tool_obj.description = "write"
    tool_obj.render_component = None
    tool_obj.confirmation_resolver = MagicMock(return_value=resolver_return)
    return tool_obj


def test_policy_interact_fields_reach_request():
    captured = {}

    def on_tool_confirm(req: ToolConfirmationRequest):
        captured["req"] = req
        return {"approved": True, "modified_arguments": None}

    policy = ToolConfirmationPolicy(
        requires_confirmation=True,
        description="Edit foo.py",
        interact_type="code_diff",
        interact_config={
            "title": "Edit foo.py",
            "operation": "edit",
            "path": "foo.py",
            "unified_diff": "--- a/foo.py\n+++ b/foo.py\n@@ -1 +1 @@\n-old\n+new\n",
            "truncated": False,
            "total_lines": 5,
            "displayed_lines": 5,
            "fallback_description": "edit foo.py (+1 -1)",
        },
    )
    toolkit = MagicMock()
    toolkit.get.return_value = _make_tool_obj(policy)
    toolkit.execute.return_value = {"ok": True}

    outcome = execute_confirmable_tool_call(
        toolkit=toolkit,
        tool_call=_make_tool_call(),
        on_tool_confirm=on_tool_confirm,
        loop=None,
        callback=None,
        run_id="run-1",
        iteration=0,
    )

    assert outcome.denied is False
    req = captured["req"]
    assert req.interact_type == "code_diff"
    assert req.interact_config == policy.interact_config


def test_default_policy_keeps_request_defaults():
    captured = {}

    def on_tool_confirm(req: ToolConfirmationRequest):
        captured["req"] = req
        return {"approved": True, "modified_arguments": None}

    toolkit = MagicMock()
    toolkit.get.return_value = _make_tool_obj(ToolConfirmationPolicy())
    toolkit.execute.return_value = {"ok": True}

    execute_confirmable_tool_call(
        toolkit=toolkit,
        tool_call=_make_tool_call(),
        on_tool_confirm=on_tool_confirm,
        loop=None,
        callback=None,
        run_id="run-1",
        iteration=0,
    )
    req = captured["req"]
    assert req.interact_type == "confirmation"
    assert req.interact_config is None
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/unchain
PYTHONPATH=src pytest tests/test_confirmation_interact_propagation.py -v
```

Expected: `test_policy_interact_fields_reach_request` fails because `req.interact_type == "confirmation"` (the default). Second test may already pass.

- [ ] **Step 3.3: Read current `confirmation.py:94-113`**

```bash
sed -n '70,120p' ~/Desktop/GITRepo/unchain/src/unchain/tools/confirmation.py
```

Confirm the block structure matches the investigation:
- Line 74-79: `confirmation_policy = ToolConfirmationPolicy.from_raw(tool_obj.confirmation_resolver(...))`
- Line ~94: `if tool_obj is not None and requires_confirmation and callable(on_tool_confirm):`
- Line 103-113: `ToolConfirmationRequest(...)` construction.

- [ ] **Step 3.4: Patch the request construction**

Edit `~/Desktop/GITRepo/unchain/src/unchain/tools/confirmation.py`. In the `if tool_obj is not None and requires_confirmation and callable(on_tool_confirm):` block, locate the existing `confirmation_request = ToolConfirmationRequest(...)` call and replace it with this version that also passes `interact_type` and `interact_config`:

```python
        # Propagate interact_type / interact_config from the resolved policy
        # onto the request. Policy may be None if no resolver was registered —
        # in that case the request defaults apply ("confirmation" / None).
        policy_interact_type = (
            confirmation_policy.interact_type
            if confirmation_policy is not None
            else "confirmation"
        )
        policy_interact_config = (
            confirmation_policy.interact_config
            if confirmation_policy is not None
            else None
        )

        confirmation_request = ToolConfirmationRequest(
            tool_name=tool_call.name,
            call_id=tool_call.call_id,
            arguments=tool_call.arguments if isinstance(tool_call.arguments, dict) else {},
            description=(
                confirmation_policy.description
                if confirmation_policy is not None and confirmation_policy.description
                else tool_obj.description
            ),
            interact_type=policy_interact_type,
            interact_config=policy_interact_config,
            render_component=effective_render,
        )
```

- [ ] **Step 3.5: Run tests to verify they pass**

```bash
PYTHONPATH=src pytest tests/test_confirmation_interact_propagation.py -v
```

Expected: both tests PASS.

- [ ] **Step 3.6: Run the surrounding confirmation test suite to catch regressions**

```bash
PYTHONPATH=src pytest tests/ -k "confirmation or tool" --no-header 2>&1 | tail -20
```

Expected: no new failures. Note any pre-existing failures but do not fix them here.

- [ ] **Step 3.7: Commit**

```bash
cd ~/Desktop/GITRepo/unchain
git add src/unchain/tools/confirmation.py tests/test_confirmation_interact_propagation.py
git commit -m "$(cat <<'EOF'
feat(tools): propagate policy interact fields to confirmation request

execute_confirmable_tool_call now copies interact_type / interact_config
from the resolved ToolConfirmationPolicy onto ToolConfirmationRequest,
enabling resolver-driven custom interact UIs (e.g. code_diff).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `write` / `edit` resolvers to produce `code_diff` policies (unchain)

**Files:**
- Modify: `~/Desktop/GITRepo/unchain/src/unchain/toolkits/builtin/core/core.py`
- Create: `~/Desktop/GITRepo/unchain/tests/test_core_write_edit_code_diff.py`

### 4A — Read the existing registration and tool bodies

- [ ] **Step 4.1: Read the `write` and `edit` registration in `_register_tools`**

```bash
sed -n '90,160p' ~/Desktop/GITRepo/unchain/src/unchain/toolkits/builtin/core/core.py
```

Confirm that `write` and `edit` are registered with `requires_confirmation=True` but no `confirmation_resolver`. Record the exact argument style (positional vs kwarg, trailing comma) to mirror it.

- [ ] **Step 4.2: Read the `write` and `edit` method bodies and helpers**

```bash
sed -n '170,270p' ~/Desktop/GITRepo/unchain/src/unchain/toolkits/builtin/core/core.py  # _resolve_absolute_path, _read_text_file
sed -n '345,475p' ~/Desktop/GITRepo/unchain/src/unchain/toolkits/builtin/core/core.py  # write, edit
```

Confirm helper signatures:
- `self._resolve_absolute_path(path) -> (Path | None, str | None)`
- `self._read_text_file(target) -> (str | None, dict | None)` (second element is an error payload)

### 4B — Write the failing integration tests

- [ ] **Step 4.3: Write `tests/test_core_write_edit_code_diff.py`**

```python
"""Integration tests that CoreToolkit resolvers produce code_diff policies."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from unchain.toolkits.builtin.core.core import CoreToolkit
from unchain.tools.models import ToolConfirmationPolicy


@pytest.fixture
def toolkit(tmp_path: Path) -> CoreToolkit:
    return CoreToolkit(workspace_root=str(tmp_path))


def _abspath(tmp_path: Path, rel: str) -> str:
    return str(tmp_path / rel)


def test_write_overwrite_builds_code_diff_policy(toolkit, tmp_path):
    target = tmp_path / "foo.py"
    target.write_text("old\n")
    policy = toolkit._resolve_write_confirmation(
        {"path": _abspath(tmp_path, "foo.py"), "content": "new\n"},
        None,
    )
    assert isinstance(policy, ToolConfirmationPolicy)
    assert policy.requires_confirmation is True
    assert policy.interact_type == "code_diff"
    cfg = policy.interact_config
    assert isinstance(cfg, dict)
    assert cfg["operation"] == "edit"
    assert cfg["path"] == _abspath(tmp_path, "foo.py")
    assert "-old" in cfg["unified_diff"]
    assert "+new" in cfg["unified_diff"]
    assert cfg["truncated"] is False


def test_write_new_path_builds_create_diff(toolkit, tmp_path):
    policy = toolkit._resolve_write_confirmation(
        {"path": _abspath(tmp_path, "brand_new.py"), "content": "hello\n"},
        None,
    )
    assert policy.interact_type == "code_diff"
    assert policy.interact_config["operation"] == "create"


def test_write_binary_existing_falls_back(toolkit, tmp_path):
    (tmp_path / "blob.bin").write_bytes(b"\x00\x01\x02")
    policy = toolkit._resolve_write_confirmation(
        {"path": _abspath(tmp_path, "blob.bin"), "content": "text"},
        None,
    )
    # Fall back → plain confirmation, no interact override
    assert policy.requires_confirmation is True
    assert policy.interact_type == "confirmation"
    assert policy.interact_config is None


def test_edit_simple_replace_builds_code_diff(toolkit, tmp_path):
    target = tmp_path / "foo.py"
    target.write_text("hello world\n")
    policy = toolkit._resolve_edit_confirmation(
        {
            "path": _abspath(tmp_path, "foo.py"),
            "old_string": "world",
            "new_string": "there",
        },
        None,
    )
    assert policy.interact_type == "code_diff"
    cfg = policy.interact_config
    assert cfg["operation"] == "edit"
    assert "-hello world" in cfg["unified_diff"]
    assert "+hello there" in cfg["unified_diff"]


def test_edit_target_missing_falls_back(toolkit, tmp_path):
    policy = toolkit._resolve_edit_confirmation(
        {
            "path": _abspath(tmp_path, "nope.py"),
            "old_string": "x",
            "new_string": "y",
        },
        None,
    )
    assert policy.requires_confirmation is True
    assert policy.interact_type == "confirmation"


def test_edit_old_string_not_found_falls_back(toolkit, tmp_path):
    (tmp_path / "foo.py").write_text("alpha\n")
    policy = toolkit._resolve_edit_confirmation(
        {
            "path": _abspath(tmp_path, "foo.py"),
            "old_string": "MISSING",
            "new_string": "y",
        },
        None,
    )
    assert policy.interact_type == "confirmation"


def test_edit_large_diff_is_truncated(toolkit, tmp_path):
    lines = [f"line {i}" for i in range(400)]
    (tmp_path / "big.py").write_text("\n".join(lines) + "\n")
    policy = toolkit._resolve_edit_confirmation(
        {
            "path": _abspath(tmp_path, "big.py"),
            "old_string": "line ",
            "new_string": "LINE ",
            "replace_all": True,
        },
        None,
    )
    assert policy.interact_type == "code_diff"
    cfg = policy.interact_config
    assert cfg["truncated"] is True
    assert cfg["displayed_lines"] == 200


def test_write_resolver_registered_on_tool(toolkit):
    tool = toolkit.tools.get("write")
    assert tool is not None
    assert tool.requires_confirmation is True
    assert callable(tool.confirmation_resolver)


def test_edit_resolver_registered_on_tool(toolkit):
    tool = toolkit.tools.get("edit")
    assert tool is not None
    assert tool.requires_confirmation is True
    assert callable(tool.confirmation_resolver)
```

- [ ] **Step 4.4: Run tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/unchain
PYTHONPATH=src pytest tests/test_core_write_edit_code_diff.py -v
```

Expected: all fail with `AttributeError: 'CoreToolkit' object has no attribute '_resolve_write_confirmation'` and similar for `_resolve_edit_confirmation`. The last two tests fail because `tool.confirmation_resolver` is `None`.

### 4C — Implement the resolvers and wire them

- [ ] **Step 4.5: Add the resolver methods to `CoreToolkit`**

Open `~/Desktop/GITRepo/unchain/src/unchain/toolkits/builtin/core/core.py`. Add the following imports at the top of the file if not already present:

```python
from unchain.tools._diff_helpers import build_code_diff_payload
```

Then add these two methods on `CoreToolkit` (placement: near `_resolve_shell_confirmation` around line 922 — keep all confirmation resolvers together):

```python
    def _resolve_write_confirmation(
        self,
        arguments: dict[str, Any],
        execution_context: "ToolExecutionContext | None",
    ) -> ToolConfirmationPolicy:
        """Build a code_diff confirmation policy for the `write` tool.

        Falls back to a plain confirmation policy when the target is
        binary, oversized, unreadable, or the path cannot be resolved.
        """
        path_arg = arguments.get("path")
        new_content = arguments.get("content", "")
        if not isinstance(path_arg, str) or not path_arg or not isinstance(new_content, str):
            return ToolConfirmationPolicy(requires_confirmation=True)

        target, err = self._resolve_absolute_path(path_arg)
        if target is None or err is not None:
            return ToolConfirmationPolicy(requires_confirmation=True)

        existed = target.exists() and target.is_file()
        if existed:
            old_raw, load_error = self._read_text_file(target)
            if old_raw is None or load_error is not None:
                return ToolConfirmationPolicy(requires_confirmation=True)
        else:
            old_raw = ""

        operation = "edit" if existed else "create"
        file_payload = build_code_diff_payload(
            str(target), old_raw, new_content, operation
        )
        if file_payload is None:
            return ToolConfirmationPolicy(requires_confirmation=True)

        title = f"{'Edit' if existed else 'Create'} {target}"
        interact_config = {
            "title": title,
            "operation": operation,
            "path": str(target),
            "unified_diff": file_payload["unified_diff"],
            "truncated": file_payload["truncated"],
            "total_lines": file_payload["total_lines"],
            "displayed_lines": file_payload["displayed_lines"],
            "fallback_description": self._describe_code_diff(file_payload, str(target)),
        }
        return ToolConfirmationPolicy(
            requires_confirmation=True,
            description=title,
            interact_type="code_diff",
            interact_config=interact_config,
        )

    def _resolve_edit_confirmation(
        self,
        arguments: dict[str, Any],
        execution_context: "ToolExecutionContext | None",
    ) -> ToolConfirmationPolicy:
        """Build a code_diff confirmation policy for the `edit` tool.

        Simulates the string-replace in memory to produce a diff without
        mutating disk. Falls back to a plain confirmation policy when the
        target is missing, binary, or the old_string is not found.
        """
        path_arg = arguments.get("path")
        old_string = arguments.get("old_string")
        new_string = arguments.get("new_string", "")
        replace_all = bool(arguments.get("replace_all", False))

        if (
            not isinstance(path_arg, str) or not path_arg
            or not isinstance(old_string, str)
            or not isinstance(new_string, str)
        ):
            return ToolConfirmationPolicy(requires_confirmation=True)

        target, err = self._resolve_absolute_path(path_arg)
        if target is None or err is not None:
            return ToolConfirmationPolicy(requires_confirmation=True)
        if not (target.exists() and target.is_file()):
            return ToolConfirmationPolicy(requires_confirmation=True)

        old_raw, load_error = self._read_text_file(target)
        if old_raw is None or load_error is not None:
            return ToolConfirmationPolicy(requires_confirmation=True)

        match_count = old_raw.count(old_string)
        if match_count == 0:
            return ToolConfirmationPolicy(requires_confirmation=True)
        if match_count > 1 and not replace_all:
            return ToolConfirmationPolicy(requires_confirmation=True)

        replacement_count = match_count if replace_all else 1
        new_raw = old_raw.replace(old_string, new_string, replacement_count)

        file_payload = build_code_diff_payload(
            str(target), old_raw, new_raw, "edit"
        )
        if file_payload is None:
            return ToolConfirmationPolicy(requires_confirmation=True)

        title = f"Edit {target}"
        interact_config = {
            "title": title,
            "operation": "edit",
            "path": str(target),
            "unified_diff": file_payload["unified_diff"],
            "truncated": file_payload["truncated"],
            "total_lines": file_payload["total_lines"],
            "displayed_lines": file_payload["displayed_lines"],
            "fallback_description": self._describe_code_diff(file_payload, str(target)),
        }
        return ToolConfirmationPolicy(
            requires_confirmation=True,
            description=title,
            interact_type="code_diff",
            interact_config=interact_config,
        )

    @staticmethod
    def _describe_code_diff(file_payload: dict, path: str) -> str:
        diff = file_payload.get("unified_diff", "") or ""
        plus = sum(
            1 for line in diff.split("\n")
            if line.startswith("+") and not line.startswith("+++")
        )
        minus = sum(
            1 for line in diff.split("\n")
            if line.startswith("-") and not line.startswith("---")
        )
        op = file_payload.get("sub_operation", "edit")
        return f"{op} {path} (+{plus} -{minus})"
```

- [ ] **Step 4.6: Wire the resolvers into `_register_tools`**

In the same file, find the existing `self.register(self.write, ...)` and `self.register(self.edit, ...)` calls (around line 109-122 per investigation). Add `confirmation_resolver=` kwargs:

```python
        self.register(
            self.write,
            description="Write UTF-8 text file (overwrite or create).",
            requires_confirmation=True,
            confirmation_resolver=self._resolve_write_confirmation,
            history_arguments_optimizer=self._compact_write_args,
        )
        self.register(
            self.edit,
            description="Replace a string in a file (single or all occurrences).",
            requires_confirmation=True,
            confirmation_resolver=self._resolve_edit_confirmation,
            history_arguments_optimizer=self._compact_edit_args,
        )
```

Preserve any other kwargs already present in the existing registration calls (the shown snippet lists the ones known from investigation; if `_register_tools` passes additional options, keep them intact and only add `confirmation_resolver`).

- [ ] **Step 4.7: Run tests to verify they pass**

```bash
cd ~/Desktop/GITRepo/unchain
PYTHONPATH=src pytest tests/test_core_write_edit_code_diff.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 4.8: Run full unchain suite for regressions**

```bash
PYTHONPATH=src pytest tests/ -q 2>&1 | tail -25
```

Expected: `test_core_toolkit.py` and other CoreToolkit tests still pass. Record any pre-existing failures (Broth migration debt) but do not fix here.

- [ ] **Step 4.9: Commit**

```bash
cd ~/Desktop/GITRepo/unchain
git add \
  src/unchain/toolkits/builtin/core/core.py \
  tests/test_core_write_edit_code_diff.py
git commit -m "$(cat <<'EOF'
feat(core): add code_diff confirmation resolvers for write/edit

CoreToolkit.write and CoreToolkit.edit now surface a unified diff as
their approval UI via _resolve_write_confirmation and
_resolve_edit_confirmation. Each resolver reads the target file in
memory, simulates the edit, computes a diff via
build_code_diff_payload, and returns a ToolConfirmationPolicy carrying
interact_type="code_diff" + interact_config. Binary / oversized /
unresolvable / non-matching inputs fall back to a plain confirmation
policy, preserving the legacy UI transparently.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PuPu adapter — dead-code cleanup + propagation regression test

**Files:**
- Modify: `~/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py:133-138`
- Create: `~/Desktop/GITRepo/PuPu/unchain_runtime/server/tests/test_adapter_code_diff_propagation.py`

### 5A — Regression test first

- [ ] **Step 5.1: Check whether a tests directory already exists**

```bash
ls ~/Desktop/GITRepo/PuPu/unchain_runtime/server/tests/ 2>&1
```

If it does not exist, create it:

```bash
mkdir -p ~/Desktop/GITRepo/PuPu/unchain_runtime/server/tests
touch ~/Desktop/GITRepo/PuPu/unchain_runtime/server/tests/__init__.py
```

- [ ] **Step 5.2: Write the regression test**

Create `~/Desktop/GITRepo/PuPu/unchain_runtime/server/tests/test_adapter_code_diff_propagation.py`:

```python
"""Regression test: PuPu adapter propagates code_diff interact fields."""
from __future__ import annotations

import sys
from pathlib import Path

# Make the sibling unchain repo importable (mirrors production bootstrap)
_UNCHAIN_SRC = Path(__file__).resolve().parents[3].parent / "unchain" / "src"
if _UNCHAIN_SRC.is_dir() and str(_UNCHAIN_SRC) not in sys.path:
    sys.path.insert(0, str(_UNCHAIN_SRC))

# Make the server package importable
_SERVER_DIR = Path(__file__).resolve().parents[1]
if str(_SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVER_DIR))

from unchain_adapter import _build_tool_confirmation_request_payload  # noqa: E402


class _FakeReq:
    def __init__(self, raw):
        self._raw = raw

    def to_dict(self):
        return dict(self._raw)


def test_code_diff_interact_fields_preserved():
    cfg = {
        "title": "Edit /abs/foo.py",
        "operation": "edit",
        "path": "/abs/foo.py",
        "unified_diff": "--- a/foo.py\n+++ b/foo.py\n@@ -1 +1 @@\n-old\n+new\n",
        "truncated": False,
        "total_lines": 5,
        "displayed_lines": 5,
        "fallback_description": "edit /abs/foo.py (+1 -1)",
    }
    req = _FakeReq({
        "tool_name": "write",
        "call_id": "c-xyz",
        "arguments": {"path": "/abs/foo.py", "content": "new"},
        "description": "Edit /abs/foo.py",
        "interact_type": "code_diff",
        "interact_config": cfg,
    })

    payload = _build_tool_confirmation_request_payload(req)

    assert payload["interact_type"] == "code_diff"
    assert payload["interact_config"] == cfg
    assert payload["tool_name"] == "write"
    assert payload["arguments"] == {"path": "/abs/foo.py", "content": "new"}


def test_default_interact_type_is_confirmation():
    req = _FakeReq({
        "tool_name": "write",
        "call_id": "c-2",
        "arguments": {},
        "description": "",
    })
    payload = _build_tool_confirmation_request_payload(req)
    assert payload["interact_type"] == "confirmation"
    assert payload["interact_config"] == {}
```

- [ ] **Step 5.3: Run the regression test**

```bash
cd ~/Desktop/GITRepo/PuPu
PYTHONPATH=unchain_runtime/server python -m pytest unchain_runtime/server/tests/test_adapter_code_diff_propagation.py -v
```

Expected: both tests PASS (the adapter already does the right thing — this locks the contract).

### 5B — Dead-code cleanup

- [ ] **Step 5.4: Read the current legacy list and its call sites**

```bash
grep -n "_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES" ~/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py
```

Expected matches: the definition (~line 133-138), `_should_force_legacy_confirmation` (~line 1442), and `_mark_workspace_tools_for_confirmation` (~line 2454).

- [ ] **Step 5.5: Patch the list**

In `~/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py`, locate:

```python
_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES = {
    "write_file",
    "delete_file",
    "move_file",
    "terminal_exec",
}
```

Replace with:

```python
_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES = {
    # Standalone unchain CoreToolkit names
    "write",
    "edit",
    # TerminalToolkit (unchanged)
    "terminal_exec",
}
```

- [ ] **Step 5.6: Check the toolkit_id guard in `_should_force_legacy_confirmation`**

```bash
sed -n '1440,1455p' ~/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py
```

This function checks `toolkit_id in {"workspace_toolkit", "terminal_toolkit"}`. The standalone unchain's CoreToolkit has `toolkit_id == "core"`, so `write` / `edit` still won't match this guard — which is fine, because CoreToolkit already hard-codes `requires_confirmation=True` on these tools at registration time. Leave the guard as-is; do NOT add `"core"`. The list cleanup is a pure cleanup — confirmation for `write`/`edit` continues to flow through the tool's own `requires_confirmation` attribute.

Add a clarifying comment above the legacy list:

```python
# NOTE: this list originally forced legacy confirmation for miso's old
# workspace/terminal tools. In the standalone unchain repo, CoreToolkit's
# `write` and `edit` already declare `requires_confirmation=True` at
# registration time (see unchain core.py), so inclusion here is mostly
# defensive / cleanup. TerminalToolkit's `terminal_exec` still depends on
# this list via `_should_force_legacy_confirmation`.
_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES = {
    "write",
    "edit",
    "terminal_exec",
}
```

- [ ] **Step 5.7: Rerun the regression test**

```bash
cd ~/Desktop/GITRepo/PuPu
PYTHONPATH=unchain_runtime/server python -m pytest unchain_runtime/server/tests/test_adapter_code_diff_propagation.py -v
```

Expected: still passing.

- [ ] **Step 5.8: Commit**

Per PuPu's `.claude/CLAUDE.md`, run impact analysis before editing any symbol. Since `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` is a module-level constant, run:

```bash
cd ~/Desktop/GITRepo/PuPu
# Use the gitnexus MCP server from Claude Code; from a terminal this is
# an indicative check only. The human reviewer running this plan should
# invoke gitnexus_impact({target: "_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES",
#                         direction: "upstream"}) and confirm d=1 callers
# are limited to _should_force_legacy_confirmation and
# _mark_workspace_tools_for_confirmation (both inside unchain_adapter.py).
```

Then commit:

```bash
git add \
  unchain_runtime/server/unchain_adapter.py \
  unchain_runtime/server/tests/test_adapter_code_diff_propagation.py \
  unchain_runtime/server/tests/__init__.py
git commit -m "$(cat <<'EOF'
fix(adapter): update legacy confirmation list for standalone unchain

Replaces stale {write_file, delete_file, move_file} entries with the
standalone unchain tool names {write, edit}. Adds a regression test
that locks the adapter's propagation contract for the new code_diff
interact_type.

This is a dead-code cleanup: CoreToolkit already declares these tools
as requires_confirmation=True at registration, so runtime behavior is
unchanged. The comment above the list clarifies the current role.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `CodeDiffInteract` React component + RTL tests

**Files:**
- Create: `~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/code_diff_interact.js`
- Create: `~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/code_diff_interact.test.js`

### 6A — Read neighbors for convention alignment

- [ ] **Step 6.1: Read `confirm_interact.js` to mirror imports, style tokens, button pattern**

```bash
cat ~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/confirm_interact.js
```

Note: `useContext`, the `Button` import path, `theme?.modal || {}` access, `hexToRgba` helper, `buildActionStyle` pattern, `ACTION_BUTTON_WIDTH`, the `disabled` prop behavior.

- [ ] **Step 6.2: Read the existing interact registry to confirm the import shape**

```bash
cat ~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/interact_registry.js
```

Record whether components are default-exported or named-exported by `ConfirmInteract`, and match.

### 6B — Write the failing RTL tests

- [ ] **Step 6.3: Write `code_diff_interact.test.js`**

```js
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CodeDiffInteract from "./code_diff_interact";

const baseConfig = {
  title: "Edit /abs/foo.py",
  operation: "edit",
  path: "/abs/foo.py",
  unified_diff:
    "--- a/foo.py\n+++ b/foo.py\n@@ -1,2 +1,2 @@\n-old\n+new\n",
  truncated: false,
  total_lines: 4,
  displayed_lines: 4,
  fallback_description: "edit /abs/foo.py (+1 -1)",
};

const baseUiState = { status: "pending", error: null, resolved: false, decision: null };

describe("CodeDiffInteract", () => {
  test("pending state shows Approve/Reject buttons", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText("Edit /abs/foo.py")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.queryByText(/always allow/i)).not.toBeInTheDocument();
  });

  test("diff lines are classified by prefix", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText("-old")).toHaveAttribute(
      "data-diff-kind",
      "removed",
    );
    expect(screen.getByText("+new")).toHaveAttribute(
      "data-diff-kind",
      "added",
    );
  });

  test("approved state hides buttons and shows badge", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={{ ...baseUiState, status: "resolved", resolved: true, decision: "approved" }}
        isDark={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });

  test("rejected state shows reject badge", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={{ ...baseUiState, status: "resolved", resolved: true, decision: "rejected" }}
        isDark={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
    expect(screen.getByText(/rejected/i)).toBeInTheDocument();
  });

  test("truncated notice shows hidden line count", () => {
    const cfg = {
      ...baseConfig,
      truncated: true,
      total_lines: 500,
      displayed_lines: 200,
    };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText(/300 more lines hidden/i)).toBeInTheDocument();
  });

  test("Approve click emits {approved:true, scope:'once'}", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: true, scope: "once" });
  });

  test("Reject click emits {approved:false, scope:'once'}", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: false, scope: "once" });
  });

  test("malformed unified_diff renders fallback pre without crashing", () => {
    const cfg = { ...baseConfig, unified_diff: "NOT A VALID DIFF AT ALL" };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText("Edit /abs/foo.py")).toBeInTheDocument();
    expect(screen.getByTestId("code-diff-fallback-pre")).toBeInTheDocument();
  });

  test("disabled prop hides buttons", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
        disabled
      />,
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6.4: Run the tests to verify they fail**

```bash
cd ~/Desktop/GITRepo/PuPu
npx jest src/COMPONENTs/chat-bubble/interact/code_diff_interact.test.js --no-coverage
```

Expected: all fail (component does not exist).

### 6C — Implement the component

- [ ] **Step 6.5: Create `code_diff_interact.js`**

```jsx
/**
 * CodeDiffInteract – Approve / Reject with a unified diff preview.
 *
 * Props (standardised by InteractWrapper):
 *   config   – { title, operation, path, unified_diff, truncated,
 *               total_lines, displayed_lines, fallback_description }
 *   onSubmit – called with { approved: boolean, scope: "once" }
 *   uiState  – { status, error, resolved, decision }
 *   isDark   – theme flag
 *   disabled – true when actions should be blocked
 *
 * Does NOT support the "Always allow" scope. See
 * docs/superpowers/specs/2026-04-13-unchain-code-diff-ui-design.md §3.5.
 */

import { useContext, useMemo } from "react";
import ConfigContext from "../../../CONTAINERs/config/config_context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

const ACTION_BUTTON_WIDTH = 96;

const buildActionStyle = (accent) => ({
  width: ACTION_BUTTON_WIDTH,
  height: 28,
  borderRadius: 6,
  color: accent,
  borderColor: accent,
});

function parseDiffLines(unifiedDiff) {
  if (!unifiedDiff || typeof unifiedDiff !== "string") return [];
  const rows = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  const lines = unifiedDiff.split("\n");
  let sawHunk = false;
  for (const raw of lines) {
    if (raw.length === 0) continue;
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
      sawHunk = true;
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
  }
  // If no hunk header ever seen, treat as malformed → caller uses fallback.
  if (!sawHunk) return null;
  return rows;
}

function countPlusMinus(unifiedDiff) {
  if (!unifiedDiff) return { plus: 0, minus: 0 };
  let plus = 0;
  let minus = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
  }
  return { plus, minus };
}

const DiffBody = ({ unifiedDiff, isDark }) => {
  const rows = useMemo(() => parseDiffLines(unifiedDiff), [unifiedDiff]);
  if (rows === null || rows === undefined) {
    return (
      <pre
        data-testid="code-diff-fallback-pre"
        style={{
          fontFamily:
            "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 12,
          whiteSpace: "pre",
          padding: 8,
          margin: 0,
          backgroundColor: isDark ? "#0d1117" : "#f6f8fa",
          color: isDark ? "#e8e8e8" : "#1f2328",
          overflowX: "auto",
          borderRadius: 4,
        }}
      >
        {unifiedDiff || "(no changes)"}
      </pre>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          fontStyle: "italic",
          color: isDark ? "#8c959f" : "#656d76",
          padding: 8,
        }}
      >
        (no changes)
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.5,
        backgroundColor: isDark ? "#0d1117" : "#f6f8fa",
        borderRadius: 4,
        overflowX: "auto",
        border: `1px solid ${isDark ? "#30363d" : "#eaeef2"}`,
      }}
    >
      {rows.map((row, idx) => {
        let bg = "transparent";
        let fg = isDark ? "#e8e8e8" : "#1f2328";
        if (row.kind === "added") {
          bg = isDark ? "#033a16" : "#e6ffec";
        } else if (row.kind === "removed") {
          bg = isDark ? "#67060c" : "#ffebe9";
        } else if (row.kind === "hunk") {
          bg = isDark ? "#0c2d6b" : "#ddf4ff";
          fg = isDark ? "#79c0ff" : "#0969da";
        } else if (row.kind === "file-header") {
          fg = isDark ? "#8c959f" : "#8c959f";
        }
        return (
          <div
            key={idx}
            data-diff-kind={row.kind}
            style={{
              display: "flex",
              padding: "0 8px",
              whiteSpace: "pre",
              backgroundColor: bg,
              color: fg,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: isDark ? "#6e7681" : "#8c959f",
                userSelect: "none",
              }}
            >
              {row.oldNo ?? ""}
            </span>
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: isDark ? "#6e7681" : "#8c959f",
                userSelect: "none",
              }}
            >
              {row.newNo ?? ""}
            </span>
            <span>{row.text}</span>
          </div>
        );
      })}
    </div>
  );
};

const CodeDiffInteract = ({ config, onSubmit, uiState, disabled }) => {
  const { isDark, theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};
  const successAccent = mt.successAccent || (isDark ? "#4ADE80" : "#22C55E");
  const errorAccent = mt.errorAccent || (isDark ? "#F87171" : "#DC3545");

  const title = config?.title || "Code changes";
  const operation = config?.operation || "edit";
  const unifiedDiff = config?.unified_diff || "";
  const truncated = Boolean(config?.truncated);
  const totalLines = config?.total_lines || 0;
  const displayedLines = config?.displayed_lines || 0;
  const hiddenLines = Math.max(0, totalLines - displayedLines);

  const { plus, minus } = countPlusMinus(unifiedDiff);

  const resolved = Boolean(uiState?.resolved);
  const decision = uiState?.decision;

  let cardBorderLeft = `3px solid transparent`;
  let cardOpacity = 1;
  if (resolved && decision === "approved") {
    cardBorderLeft = `3px solid ${successAccent}`;
    cardOpacity = 0.75;
  } else if (resolved && decision === "rejected") {
    cardBorderLeft = `3px solid ${errorAccent}`;
    cardOpacity = 0.75;
  }

  return (
    <div
      style={{
        border: `1px solid ${isDark ? "#3a3a3a" : "#d0d7de"}`,
        borderLeft: cardBorderLeft,
        borderRadius: 8,
        padding: 12,
        margin: "8px 0",
        backgroundColor: isDark ? "#1b1b1b" : "#ffffff",
        color: isDark ? "#e8e8e8" : "#1f2328",
        opacity: cardOpacity,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            textTransform: "uppercase",
            backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            color: isDark ? "#cfcfcf" : "#57606a",
          }}
        >
          {operation}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          fontSize: 11,
          marginBottom: 6,
          alignItems: "center",
          color: isDark ? "#8c959f" : "#656d76",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        }}
      >
        <span>{config?.path || ""}</span>
        <span style={{ marginLeft: "auto" }}>
          +{plus} -{minus}
        </span>
      </div>
      <DiffBody unifiedDiff={unifiedDiff} isDark={isDark} />
      {truncated && (
        <div
          style={{
            fontSize: 11,
            color: isDark ? "#8c959f" : "#656d76",
            fontStyle: "italic",
            padding: "4px 0 0 0",
          }}
        >
          truncated — {hiddenLines} more lines hidden
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 10,
          alignItems: "center",
        }}
      >
        {!disabled && !resolved && (
          <>
            <Button
              label="Approve"
              onClick={() => onSubmit && onSubmit({ approved: true, scope: "once" })}
              style={buildActionStyle(successAccent)}
            />
            <Button
              label="Reject"
              onClick={() => onSubmit && onSubmit({ approved: false, scope: "once" })}
              style={buildActionStyle(errorAccent)}
            />
          </>
        )}
        {resolved && decision === "approved" && (
          <span
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 4,
              backgroundColor: isDark ? "#0f2b14" : "#dafbe1",
              color: isDark ? "#4ADE80" : "#1a7f37",
            }}
          >
            ✓ Approved
          </span>
        )}
        {resolved && decision === "rejected" && (
          <span
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 4,
              backgroundColor: isDark ? "#2b0f13" : "#ffebe9",
              color: isDark ? "#F87171" : "#82061e",
            }}
          >
            ✗ Rejected
          </span>
        )}
      </div>
    </div>
  );
};

export default CodeDiffInteract;
```

**Import path verification:** Step 6.1 determined the actual `ConfigContext` and `Button` module paths. Adjust the two import lines at the top of the file to match whatever `confirm_interact.js` uses. The paths `../../../CONTAINERs/config/config_context` and `../../../BUILTIN_COMPONENTs/input/button` above are the most likely based on the PuPu directory conventions in `CLAUDE.md`, but the source of truth is what the sibling `confirm_interact.js` actually imports.

- [ ] **Step 6.6: Run the tests to verify they pass**

```bash
cd ~/Desktop/GITRepo/PuPu
npx jest src/COMPONENTs/chat-bubble/interact/code_diff_interact.test.js --no-coverage
```

Expected: all 9 tests PASS. If any fail, read the assertion error and patch the component minimally — do NOT rewrite the tests.

- [ ] **Step 6.7: Commit**

```bash
git add src/COMPONENTs/chat-bubble/interact/code_diff_interact.js src/COMPONENTs/chat-bubble/interact/code_diff_interact.test.js
git commit -m "$(cat <<'EOF'
feat(ui): add CodeDiffInteract component

New interact component renders a unified diff with per-line +/-
coloring, two-column line numbers, pending / approved / rejected
states with D2 de-saturated styling, and Approve / Reject buttons.
Intentionally omits the "Always allow" button — code_diff does not
participate in session auto-approve (see spec §3.5).

onSubmit payload is { approved: boolean, scope: "once" } for
structural compatibility with ConfirmInteract.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Register `code_diff` in interact registry + verify `use_chat_stream` guard

**Files:**
- Modify: `~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/interact_registry.js`
- Create: `~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.code_diff_guard.test.js`
- Verify (no change): `~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js`

### 7A — Registry wiring

- [ ] **Step 7.1: Read the current registry file**

```bash
cat ~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/interact_registry.js
```

- [ ] **Step 7.2: Add the import and registry entry**

Edit `~/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/interact/interact_registry.js`. Add the import alongside the existing ones:

```js
import CodeDiffInteract from "./code_diff_interact";
```

Add the entry to the registry object (keep existing entries intact, match trailing comma / quoting style):

```js
const interactRegistry = {
  // ... existing entries
  code_diff: CodeDiffInteract,
};
```

### 7B — `use_chat_stream` guard verification

- [ ] **Step 7.3: Verify the tool_call dispatch is generic**

```bash
grep -n "interact_type\|ask_user_question\|HUMAN_INPUT_TOOL_NAME" \
  ~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js | head -20
```

Confirm that the `tool_call` frame handler dispatches to the interact path based on presence of `interact_type` in the payload, NOT hard-coded to `tool_name === "ask_user_question"`. If the check is generic, no change is needed.

- [ ] **Step 7.4: Verify the `isAutoApprovable` guard still excludes non-confirmation types**

```bash
grep -n "isAutoApprovable\|isSessionAllowed" \
  ~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js
```

The production line from commit `54f82c1` must be present and unchanged:

```js
(!itype || itype === "confirmation") &&
```

If the clause has been weakened (e.g. removed or changed to allow `code_diff`), this is a regression — fix it to restore the guard before proceeding. If the clause is present, no change is needed.

### 7C — Regression test for the guard

- [ ] **Step 7.5: Write a targeted jest test**

Create `~/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.code_diff_guard.test.js`:

```js
/**
 * Guard regression test: a tool_call frame with interact_type="code_diff"
 * must NOT be auto-approved even when the same toolkit:tool pair is in
 * the session auto-approve set. This locks the spec §5.3 verification.
 *
 * We verify the guard by reading the source file and asserting the
 * critical clause is present. A full hook integration test would drag
 * in the entire streaming pipeline; a source assertion is the lightest
 * way to lock the invariant against future refactors.
 */

const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream code_diff auto-approve guard", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("source file exists", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  test("isAutoApprovable clause excludes non-confirmation interact types", () => {
    // The exact clause from 54f82c1 — must remain literally in place.
    const clause = /\(!itype\s*\|\|\s*itype\s*===\s*"confirmation"\)/;
    expect(source).toMatch(clause);
  });

  test("isAutoApprovable branch references HUMAN_INPUT_TOOL_NAME", () => {
    // Human input must also be excluded from session auto-approve.
    expect(source).toMatch(/toolName\s*!==\s*HUMAN_INPUT_TOOL_NAME/);
  });

  test("sessionAutoApproveRef key shape is toolkitId:toolName", () => {
    // Ensure keys don't accidentally become path-scoped later, which
    // would broaden the auto-approve surface.
    expect(source).toMatch(/sessionAutoApproveRef\.current\.has\(\s*`\$\{toolkitId\}:\$\{toolName\}`\s*\)/);
  });
});
```

- [ ] **Step 7.6: Run the test to verify it passes**

```bash
cd ~/Desktop/GITRepo/PuPu
npx jest src/PAGEs/chat/hooks/use_chat_stream.code_diff_guard.test.js --no-coverage
```

Expected: all 4 tests PASS (assuming the guard is still in place; if it isn't, this test is the canary that will fire in CI forever).

### 7D — Sanity check and commit

- [ ] **Step 7.7: Boot the dev server for a sanity check**

```bash
cd ~/Desktop/GITRepo/PuPu
npm run start:web
```

Wait until the React dev server is ready (watch for "Compiled successfully" or similar). Open the app in a browser, confirm no JavaScript console errors at boot, confirm the existing `ConfirmInteract` still renders (by triggering any shell / ask_user_question flow). Kill the dev server.

If there are console errors introduced by the new registry entry, check for typos in the import path or missing default export; fix and re-run.

- [ ] **Step 7.8: Commit**

Per PuPu's `.claude/CLAUDE.md`, before committing run `gitnexus_detect_changes({scope: "staged"})` from Claude Code to verify the change set matches expectations.

```bash
git add \
  src/COMPONENTs/chat-bubble/interact/interact_registry.js \
  src/PAGEs/chat/hooks/use_chat_stream.code_diff_guard.test.js
git commit -m "$(cat <<'EOF'
feat(ui): register code_diff in interact registry + guard test

Wires CodeDiffInteract into the interact registry. Adds a regression
test that asserts the existing use_chat_stream.js isAutoApprovable
clause continues to exclude non-confirmation interact types (spec §5.3
safety red line).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: End-to-end manual verification

No file changes — this is the final verification gate.

- [ ] **Step 8.1: Boot PuPu in dev mode against the unchain branch**

In one terminal:

```bash
cd ~/Desktop/GITRepo/unchain
git log --oneline -1  # verify you're on the branch with Task 1-4 commits
```

In another terminal:

```bash
cd ~/Desktop/GITRepo/PuPu
UNCHAIN_SOURCE_PATH="$HOME/Desktop/GITRepo/unchain" npm start
```

The `UNCHAIN_SOURCE_PATH` env var (see `unchain_adapter.py:23-39`) forces PuPu to load the standalone unchain repo at the expected branch. Wait until both Flask and React are up.

- [ ] **Step 8.2: Run the E2E checklist**

For each scenario, prompt a real agent run and check the expected outcome. Check the box ONLY when green.

- [ ] **E2E-1 (write overwrite):** Ask the agent to rewrite an existing small `.py` file in the workspace. Expect: diff card appears with `-` / `+` lines, Approve button works, card de-saturates with a green left edge, diff still visible.
- [ ] **E2E-2 (write create):** Ask the agent to create a new `.md` file. Expect: card shows operation "create" badge; every line prefixed with `+`; Approve works.
- [ ] **E2E-3 (edit string replace):** Ask the agent to `edit` a single word in an existing file. Expect: one `-old` / `+new` pair in the diff; Approve works.
- [ ] **E2E-4 (truncation):** Pre-populate a file with ~500 lines of a pattern, ask the agent to `edit` with `replace_all` to change every line. Expect: diff shows ~200 lines, then "truncated — N more lines hidden" notice.
- [ ] **E2E-5 (binary fallback):** Ask the agent to `write` to a path whose existing content is binary (e.g. an existing PNG). Expect: falls back to the legacy `ConfirmInteract` UI (Allow once / Always allow / Deny buttons), no crash.
- [ ] **E2E-6 (reject):** On a `write` diff card, click Reject. Expect: card takes rejected style (red edge, "✗ Rejected"), agent receives `{"denied": True, ...}` and continues gracefully (no hang, no orphan event).
- [ ] **E2E-7 (history persistence):** After approving a diff, send several more messages so the chat scrolls. Scroll back up. Expect: the old diff card still renders correctly in approved state.
- [ ] **E2E-8 (session guard):** On a `write` diff card, click Approve. Immediately trigger another `write` to a different file. Expect: a NEW diff card appears (NOT auto-approved), proving the session auto-approve fast-lane does not swallow `code_diff`.
- [ ] **E2E-9 (regression: ConfirmInteract):** Trigger a flow that uses `ask_user_question` (any existing questionnaire path). Expect: unchanged behavior — single / multi / text_input UIs still work.
- [ ] **E2E-10 (regression: ConfirmInteract Always allow):** Trigger a `shell` confirmation (not code_diff — a non-file shell action). Click "Always allow". Trigger the same shell again. Expect: second call is auto-approved (existing behavior unchanged).

- [ ] **Step 8.3: If any E2E scenario fails**

Do NOT paper over with a quick fix. Root-cause it:
- Browser console errors → Task 6 or 7 component / registry issue
- PuPu Flask log errors → Task 5 adapter or propagation issue
- unchain log errors → Task 3 or 4 resolver / confirmation.py issue
- Frame stays pending forever → Task 3 propagation contract broken, or Task 7 stream handler regression

Narrow to the smallest repro, fix in the corresponding task, add a test that captures the bug, then re-run the failing scenario.

- [ ] **Step 8.4: Append a verification log to the plan**

Append to this file (`docs/superpowers/plans/2026-04-13-unchain-code-diff-ui.md`) at the bottom:

```markdown
---
## Verification Log
- Date: YYYY-MM-DD
- E2E-1 through E2E-10: [results]
- Follow-ups: [none | link to follow-up issues]
```

Commit:

```bash
cd ~/Desktop/GITRepo/PuPu
git add docs/superpowers/plans/2026-04-13-unchain-code-diff-ui.md
git commit -m "$(cat <<'EOF'
docs: record code_diff UI E2E verification results

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update auto-memory

- [ ] **Step 9.1: Create a project memory entry**

Create `~/.claude/projects/-Users-red-Desktop/memory/project_pupu_code_diff_ui.md`:

```markdown
---
name: PuPu code_diff interact UI
description: Unified diff approval UI for unchain CoreToolkit write/edit, completed YYYY-MM-DD
type: project
---

Standalone unchain repo (~/Desktop/GITRepo/unchain/) now surfaces a
unified diff as the approval UI for CoreToolkit.write and
CoreToolkit.edit via a new `interact_type="code_diff"`. Approved /
rejected cards persist in the PuPu chat timeline with de-saturated
styling. Binary / oversized / unresolvable inputs fall back to the
legacy confirmation UI transparently.

## Implementation
- unchain:
  - `src/unchain/tools/_diff_helpers.py` (pure stdlib diff builder)
  - `ToolConfirmationPolicy` extended with `interact_type` /
    `interact_config` fields at `src/unchain/tools/models.py`
  - `execute_confirmable_tool_call` propagates those fields from policy
    to request at `src/unchain/tools/confirmation.py`
  - `CoreToolkit._resolve_write_confirmation` and
    `_resolve_edit_confirmation` in
    `src/unchain/toolkits/builtin/core/core.py`, wired via
    `confirmation_resolver=` at tool registration
- PuPu:
  - `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` cleaned up
    (write_file/delete_file/move_file → write/edit), with a comment
    explaining the current dead-code-ish role
  - `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js` new
    component registered in `interact_registry.js`
  - Regression test at
    `src/PAGEs/chat/hooks/use_chat_stream.code_diff_guard.test.js`
    locks the spec §5.3 auto-approve guard

## Deliberate non-features (spec §2, §3.5, §9)
- Multi-file / batch diff UI (no such tool in unchain)
- Session-based auto-approve for code_diff (high-risk visualised
  operations do NOT share the fast-lane that ConfirmInteract uses)
- Shell-command parsing to reconstruct a diff
- Syntax highlighting, side-by-side view, partial approve

## How to apply
When adding a new file-mutating tool to CoreToolkit (or any unchain
toolkit), follow the resolver pattern:
1. Write a `_resolve_X_confirmation(arguments, execution_context)`
   method that reads the target file, simulates the edit in memory,
   calls `build_code_diff_payload`, and returns a
   `ToolConfirmationPolicy` with `interact_type="code_diff"` +
   `interact_config`.
2. Register via `self.register(..., confirmation_resolver=...)`.
3. No changes needed on PuPu front-end — the registry dispatches by
   `interact_type`.
```

- [ ] **Step 9.2: Update `MEMORY.md` index**

Append to `~/.claude/projects/-Users-red-Desktop/memory/MEMORY.md`:

```
- [PuPu code_diff UI](project_pupu_code_diff_ui.md) — unified diff approval UI for unchain CoreToolkit write/edit (complete)
```

- [ ] **Step 9.3: Also correct the stale `PuPu unchain migration` entry**

The existing entry `project_pupu_unchain_migration.md` still points at `~/Desktop/GITRepo/miso/src/unchain/`, which is obsolete — the live path is the standalone `~/Desktop/GITRepo/unchain/`. Edit that memory file and update the path references. This is a drive-by cleanup, not strictly required for the feature, but prevents future sessions from repeating the miso/unchain path confusion that cost us several commits in this project.

- [ ] **Step 9.4: No commit required for memory updates** (memory is outside any git repo).

---

## Self-Review Notes

**Spec coverage check** (against `docs/superpowers/specs/2026-04-13-unchain-code-diff-ui-design.md`):

- §1 Goal → Task 1-7 cover the end-to-end pipeline.
- §2 Non-goals → no task touches them.
- §3.1 Event shape → Task 4 produces the exact schema; Task 5 regression test locks its propagation; Task 6 tests render against the same schema.
- §3.2 Lifecycle → Task 4 (produce policy) → Task 3 (policy→request) → Task 5 (adapter) → Task 6 (component) → approve/reject returns via existing `use_chat_stream` path.
- §3.3 Fallback rules → Task 1 enforces thresholds in the helper; Task 4 returns plain policy on None.
- §3.4 Invariants → Task 3 is the one targeted change; dataclass/SSE/endpoint left alone.
- §3.5 Session-approval interaction → Task 6 omits "Always allow"; Task 7 guard test locks the red line.
- §4.1 unchain changes → Tasks 1-4 cover models, confirmation, core, helper.
- §4.2 PuPu adapter → Task 5 covers legacy-list cleanup + regression test.
- §4.3 Step 0 open questions → pre-resolved in Investigation Findings section.
- §5 Frontend → Tasks 6 (component) and 7 (registry + guard verification).
- §6 Testing → every production task has matching unit/integration tests; §6.6 manual checklist lives in Task 8.
- §7 Edge cases → Task 1 helper covers binary / oversize / exception; Task 4 resolver covers missing target / non-matching edit / path resolution failure; Task 6 component covers malformed diff fallback.
- §8 Impl order → this plan's Task 1→9 mirrors it.
- §9 Future work → explicitly out of scope.

**Placeholder scan:**
- No "TBD" / "TODO" / "implement later" strings.
- The exact `_register_tools` call sites in Task 4 Step 4.6 note "preserve any other kwargs already present" — this is a concrete instruction to keep the existing kwargs intact, not a placeholder.
- Task 6 Step 6.5 notes that import paths must be verified against `confirm_interact.js` — this is a concrete verification instruction with the expected paths spelled out.

**Type consistency check:**
- `build_code_diff_payload` return shape (`{path, sub_operation, unified_diff, truncated, total_lines, displayed_lines}`) used identically in Task 1 (definition), Task 4 (callers in resolvers), Task 6 (frontend config keys).
- `interact_config` schema (`{title, operation, path, unified_diff, truncated, total_lines, displayed_lines, fallback_description}`) identical in Task 4 resolvers, Task 5 regression test, Task 6 component tests.
- `onSubmit` payload `{approved, scope: "once"}` matches between Task 6 component and Task 7 dispatch.
- `ToolConfirmationPolicy` field names (`interact_type`, `interact_config`) consistent between Task 2 (definition), Task 3 (consumer), Task 4 (producer).

**Known risks to watch during execution:**
- Task 4 Step 4.2 might reveal extra kwargs on the existing `register` calls (e.g. `icon`, `aliases`) that must be preserved. The plan instructs to preserve them verbatim.
- Task 5 Step 5.2's regression test relies on `_build_tool_confirmation_request_payload` being importable from the `unchain_runtime/server` directory with a bootstrap that mirrors production. If PuPu uses a different test runner layout, Step 5.3 will surface the import error and the bootstrap can be adjusted.
- Task 6 Step 6.1 — the actual ConfigContext / Button import paths must match confirm_interact.js exactly. The plan spells out the most likely paths but Step 6.1 is the source of truth.
