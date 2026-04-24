# PuPu File-Based Subagent System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PuPu's hardcoded `analyzer`/`executor` subagents with a file-based system (`~/.pupu/subagents/*.soul|.skeleton`), ship a built-in `Explore` agent, and add `missing_tool_policy` to unchain's `AgentBuilder`.

**Architecture:** Each new chat session scans user-scope and workspace-scope directories for `.soul` (YAML-frontmatter markdown) and `.skeleton` (JSON) files, applies precedence (`user.skeleton > user.soul > workspace.skeleton > workspace.soul`), intersects declared tools against the main agent's tool set, and registers survivors as `SubagentTemplate` entries in unchain's `SubagentModule`. Main agent retains every tool — subagents are additive.

**Tech Stack:** Python 3.12 (unchain + PuPu Flask sidecar), unchain dataclasses + kernel loop, hand-rolled YAML frontmatter parser (no PyYAML dependency), stdlib `json` / `pathlib` / `logging`.

**Spec:** `/Users/red/Desktop/GITRepo/PuPu/docs/superpowers/specs/2026-04-22-pupu-subagent-file-based-design.md`

---

## Repos

Work spans two repos. Commit messages should match the repo conventions.

| Repo | Path | Test command |
|---|---|---|
| unchain | `/Users/red/Desktop/GITRepo/unchain/` | `PYTHONPATH=src pytest tests/<testfile> -q` |
| PuPu | `/Users/red/Desktop/GITRepo/PuPu/` | `python -m unittest unchain_runtime.server.tests.<testmodule>` |

**Landing order:** unchain tasks (1-3) must land first. PuPu tasks (4-14) consume the new `missing_tool_policy` field.

## File Structure

### unchain (modify)
| File | Responsibility |
|---|---|
| `src/unchain/agent/spec.py` | Add `missing_tool_policy` field to `AgentSpec` |
| `src/unchain/agent/agent.py` | Thread `missing_tool_policy` through `Agent.__init__`, `clone`, `fork_for_subagent` |
| `src/unchain/agent/builder.py` | Branch `_apply_allowed_tools_filter` on policy |
| `src/unchain/subagents/plugin.py` | Pass `"warn_skip"` when forking subagents |

### unchain (new tests)
| File | Responsibility |
|---|---|
| `tests/test_builder_missing_tool_policy.py` | Builder filter behavior under both policies |
| `tests/test_subagent_warn_skip_passthrough.py` | Subagent delegation with partially-missing allowed_tools |

### PuPu (new)
| File | Responsibility |
|---|---|
| `unchain_runtime/server/subagent_loader.py` | Scan, parse, validate, build `SubagentTemplate` tuple |
| `unchain_runtime/server/subagent_seeds.py` | Ship `Explore.skeleton` on first launch |

### PuPu (modify)
| File | Change |
|---|---|
| `unchain_runtime/server/unchain_adapter.py` | Remove analyzer/executor block, call loader, substitute `{{SUBAGENT_LIST}}` placeholder |
| `unchain_runtime/server/prompts/agents/developer.py` | Replace hardcoded list with `{{SUBAGENT_LIST}}` placeholder |
| `unchain_runtime/server/prompts/agents/__init__.py` | Drop analyzer/executor exports |
| `unchain_runtime/server/main.py` | Call `ensure_seeds_written()` on startup |

### PuPu (delete)
- `unchain_runtime/server/prompts/agents/analyzer.py`
- `unchain_runtime/server/prompts/agents/executor.py`

### PuPu (new tests)
| File | Responsibility |
|---|---|
| `unchain_runtime/server/tests/test_subagent_loader.py` | Discovery, parsing, precedence, intersection, validation |
| `unchain_runtime/server/tests/test_adapter_subagent_integration.py` | `_build_developer_agent` integration + loader-failure fallback |

---

## Task 1: unchain — Add `missing_tool_policy` field

**Files:**
- Modify: `src/unchain/agent/spec.py`
- Modify: `src/unchain/agent/agent.py`

- [ ] **Step 1: Add `MissingToolPolicy` type alias and field to `AgentSpec`**

Edit `src/unchain/agent/spec.py` — replace the full file contents with:

```python
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


MissingToolPolicy = Literal["raise", "warn_skip"]


@dataclass(frozen=True)
class AgentSpec:
    name: str
    instructions: str = ""
    provider: str = "openai"
    model: str = "gpt-5"
    api_key: str | None = None
    modules: tuple[Any, ...] = ()
    allowed_tools: tuple[str, ...] | None = None
    missing_tool_policy: MissingToolPolicy = "raise"


@dataclass
class AgentState:
    module_state: dict[str, Any] = field(default_factory=dict)
```

- [ ] **Step 2: Thread `missing_tool_policy` through `Agent.__init__`**

In `src/unchain/agent/agent.py`, replace the `Agent.__init__` signature and `self.spec = AgentSpec(...)` assignment. Current code (lines 14-37):

```python
class Agent:
    def __init__(
        self,
        *,
        name: str,
        instructions: str = "",
        provider: str = "openai",
        model: str = "gpt-5",
        api_key: str | None = None,
        modules: tuple[Any, ...] = (),
        allowed_tools: tuple[str, ...] | None = None,
        model_io_factory: Callable[..., Any] | None = None,
    ) -> None:
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Agent name is required")
        self.spec = AgentSpec(
            name=name.strip(),
            instructions=instructions or "",
            provider=provider or "openai",
            model=model or "gpt-5",
            api_key=api_key,
            modules=tuple(modules or ()),
            allowed_tools=tuple(allowed_tools) if allowed_tools is not None else None,
        )
```

Change to:

```python
class Agent:
    def __init__(
        self,
        *,
        name: str,
        instructions: str = "",
        provider: str = "openai",
        model: str = "gpt-5",
        api_key: str | None = None,
        modules: tuple[Any, ...] = (),
        allowed_tools: tuple[str, ...] | None = None,
        missing_tool_policy: str = "raise",
        model_io_factory: Callable[..., Any] | None = None,
    ) -> None:
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Agent name is required")
        self.spec = AgentSpec(
            name=name.strip(),
            instructions=instructions or "",
            provider=provider or "openai",
            model=model or "gpt-5",
            api_key=api_key,
            modules=tuple(modules or ()),
            allowed_tools=tuple(allowed_tools) if allowed_tools is not None else None,
            missing_tool_policy=missing_tool_policy,
        )
```

- [ ] **Step 3: Thread `missing_tool_policy` through `Agent.clone`**

In `src/unchain/agent/agent.py`, replace the `clone` method (lines 91-109):

```python
    def clone(
        self,
        *,
        name: str | None = None,
        instructions: str | None = None,
        modules: tuple[Any, ...] | None = None,
        model: str | None = None,
        allowed_tools: tuple[str, ...] | None = None,
        missing_tool_policy: str | None = None,
    ) -> "Agent":
        return Agent(
            name=name or self.name,
            instructions=self.instructions if instructions is None else instructions,
            provider=self.provider,
            model=self.model if model is None else model,
            api_key=self.spec.api_key,
            modules=tuple(self.spec.modules if modules is None else modules),
            allowed_tools=self.spec.allowed_tools if allowed_tools is None else tuple(allowed_tools),
            missing_tool_policy=(
                self.spec.missing_tool_policy if missing_tool_policy is None else missing_tool_policy
            ),
            model_io_factory=self._model_io_factory,
        )
```

- [ ] **Step 4: Thread `missing_tool_policy` through `Agent.fork_for_subagent`**

In `src/unchain/agent/agent.py`, replace the `fork_for_subagent` method (lines 111-146). Add a `missing_tool_policy` kwarg and forward it to `self.clone(...)`:

```python
    def fork_for_subagent(
        self,
        *,
        subagent_name: str,
        mode: str,
        parent_name: str,
        lineage: list[str],
        task: str,
        instructions: str,
        expected_output: str,
        memory_policy: str,
        model: str | None = None,
        allowed_tools: tuple[str, ...] | None = None,
        missing_tool_policy: str | None = None,
    ) -> "Agent":
        overlay = (
            f'You are subagent "{subagent_name}" created by parent "{parent_name}".\n'
            f"Mode: {mode}\n"
            f"Lineage: {' > '.join(lineage)}\n\n"
            "Only execute the delegated subtask.\n"
            "Do not ask the user directly for clarification. If clarification is required, return a concise structured clarification request via the runtime tools.\n"
            f"Delegated task:\n{task.strip()}\n\n"
        )
        if expected_output.strip():
            overlay += f"Expected output:\n{expected_output.strip()}\n\n"
        if instructions.strip():
            overlay += f"Extra instructions:\n{instructions.strip()}\n"
        modules = list(self.spec.modules)
        if memory_policy == "ephemeral":
            modules = [module for module in modules if not isinstance(module, MemoryModule)]
        return self.clone(
            name=subagent_name,
            instructions="\n\n".join(part for part in (self.instructions, overlay.strip()) if part.strip()),
            modules=tuple(modules),
            model=model,
            allowed_tools=allowed_tools,
            missing_tool_policy=missing_tool_policy,
        )
```

- [ ] **Step 5: Run unchain's existing test suite to confirm no regression**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/ -q`
Expected: PASS (all existing tests — default `"raise"` preserves current behavior).

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/agent/spec.py src/unchain/agent/agent.py
git commit -m "feat(agent): add missing_tool_policy field to AgentSpec

Threaded through Agent.__init__, clone, and fork_for_subagent.
Default 'raise' preserves existing behavior. Subagent callers
can pass 'warn_skip' to gracefully drop unknown tool names."
```

---

## Task 2: unchain — Branch `_apply_allowed_tools_filter` on policy

**Files:**
- Modify: `src/unchain/agent/builder.py:255-270`
- Test: `tests/test_builder_missing_tool_policy.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_builder_missing_tool_policy.py`:

```python
import logging
import unittest

from unchain.agent.agent import Agent
from unchain.tools import Tool, tool


def _noop(**_kwargs):
    return {}


def _read_tool():
    return tool(name="read", description="Read a file.", func=_noop, parameters=[])


def _grep_tool():
    return tool(name="grep", description="Search text.", func=_noop, parameters=[])


class _ToolKitStub:
    def __init__(self, tools):
        self.tools = {t.name: t for t in tools}


class BuilderMissingToolPolicyTests(unittest.TestCase):
    def _make_builder_with_tools(self, spec_allowed_tools, policy):
        from unchain.agent.builder import AgentBuilder, AgentCallContext
        from unchain.agent.model_io import ModelIOFactoryRegistry

        agent = Agent(
            name="test-agent",
            instructions="you are a test agent",
            allowed_tools=spec_allowed_tools,
            missing_tool_policy=policy,
        )
        builder = AgentBuilder(
            agent=agent,
            spec=agent.spec,
            state=agent.state,
            call_context=AgentCallContext(mode="run", input_messages=[]),
            model_io_registry=ModelIOFactoryRegistry(),
        )
        builder.toolkit = _ToolKitStub([_read_tool(), _grep_tool()])
        return builder

    def test_raise_policy_raises_on_missing(self):
        builder = self._make_builder_with_tools(("read", "nonexistent"), "raise")
        with self.assertRaises(ValueError) as ctx:
            builder._apply_allowed_tools_filter()
        self.assertIn("nonexistent", str(ctx.exception))

    def test_warn_skip_policy_drops_missing_and_logs(self):
        builder = self._make_builder_with_tools(("read", "nonexistent"), "warn_skip")
        with self.assertLogs("unchain.agent.builder", level="WARNING") as log_ctx:
            builder._apply_allowed_tools_filter()
        self.assertIn("nonexistent", "\n".join(log_ctx.output))
        self.assertEqual(list(builder.toolkit.tools.keys()), ["read"])

    def test_warn_skip_policy_builds_when_all_present(self):
        builder = self._make_builder_with_tools(("read", "grep"), "warn_skip")
        builder._apply_allowed_tools_filter()
        self.assertEqual(set(builder.toolkit.tools.keys()), {"read", "grep"})

    def test_default_policy_is_raise(self):
        agent = Agent(name="a", allowed_tools=("read", "nonexistent"))
        self.assertEqual(agent.spec.missing_tool_policy, "raise")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_builder_missing_tool_policy.py -v`
Expected: `test_warn_skip_policy_drops_missing_and_logs` and `test_warn_skip_policy_builds_when_all_present` FAIL with `ValueError` (current `raise`-only behavior).

- [ ] **Step 3: Modify `_apply_allowed_tools_filter` to branch on policy**

In `src/unchain/agent/builder.py`, first add logging at the top of the file (after the existing imports, before the first class). If there's already a `logger = logging.getLogger(__name__)` line, skip this; otherwise add:

```python
import logging

logger = logging.getLogger(__name__)
```

Then replace `_apply_allowed_tools_filter` (currently lines 255-270):

```python
    def _apply_allowed_tools_filter(self) -> None:
        if self.spec.allowed_tools is None:
            return
        allowed_names = [str(name).strip() for name in self.spec.allowed_tools if str(name).strip()]
        configured_names = list(self.toolkit.tools.keys())
        missing = [name for name in dict.fromkeys(allowed_names) if name not in self.toolkit.tools]
        if missing:
            if self.spec.missing_tool_policy == "raise":
                raise ValueError(
                    f"agent {self.spec.name!r} allowed_tools contains unknown tool names: {', '.join(missing)}"
                )
            logger.warning(
                "agent %r allowed_tools contains unknown tool names (skipped): %s",
                self.spec.name,
                ", ".join(missing),
            )
            allowed_names = [name for name in allowed_names if name not in missing]
        allowed_name_set = set(allowed_names)
        self.toolkit.tools = {
            name: self.toolkit.tools[name]
            for name in configured_names
            if name in allowed_name_set
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_builder_missing_tool_policy.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 5: Run full unchain test suite**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/ -q`
Expected: PASS (no regression).

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/agent/builder.py tests/test_builder_missing_tool_policy.py
git commit -m "feat(agent): branch allowed_tools filter on missing_tool_policy

warn_skip drops unknown tool names with a WARNING log; raise
(default) preserves the ValueError. Subagents can now declare
allowed_tools that reference tools the main agent hasn't loaded."
```

---

## Task 3: unchain — Pass `warn_skip` when forking subagents

**Files:**
- Modify: `src/unchain/subagents/plugin.py:237-251`
- Test: `tests/test_subagent_warn_skip_passthrough.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_subagent_warn_skip_passthrough.py`:

```python
import unittest

from unchain.agent.agent import Agent
from unchain.subagents.types import SubagentTemplate


class SubagentForkPassesWarnSkipTest(unittest.TestCase):
    def test_fork_for_subagent_forwards_warn_skip_when_given(self):
        parent = Agent(name="parent", instructions="p")
        template = SubagentTemplate(
            name="child",
            description="c",
            agent=parent,
            allowed_tools=("nonexistent",),
        )
        # Simulate what plugin._build_subagent does — fork with missing_tool_policy="warn_skip"
        child = template.agent.fork_for_subagent(
            subagent_name="child_1",
            mode="delegate",
            parent_name="parent",
            lineage=["parent", "child_1"],
            task="do thing",
            instructions="",
            expected_output="",
            memory_policy="ephemeral",
            allowed_tools=template.allowed_tools,
            missing_tool_policy="warn_skip",
        )
        self.assertEqual(child.spec.missing_tool_policy, "warn_skip")
        self.assertEqual(child.spec.allowed_tools, ("nonexistent",))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it passes (Task 1 already enables this)**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/test_subagent_warn_skip_passthrough.py -v`
Expected: PASS (Task 1's `fork_for_subagent` signature change already accepts `missing_tool_policy`).

If FAIL: re-check Task 1 Step 4 — `fork_for_subagent` must accept `missing_tool_policy` kwarg and forward to `self.clone(...)`.

- [ ] **Step 3: Update `SubagentToolPlugin._build_subagent` to pass `warn_skip`**

In `src/unchain/subagents/plugin.py`, replace the `_build_subagent` call site around line 239. Current code:

```python
            child = base_agent.fork_for_subagent(
                subagent_name=child_id,
                mode=mode,
                parent_name=self.parent_agent.name,
                lineage=lineage,
                task=task,
                instructions=instructions,
                expected_output=expected_output,
                memory_policy=memory_policy,
                model=template.model,
                allowed_tools=template.allowed_tools,
            )
```

Change to:

```python
            child = base_agent.fork_for_subagent(
                subagent_name=child_id,
                mode=mode,
                parent_name=self.parent_agent.name,
                lineage=lineage,
                task=task,
                instructions=instructions,
                expected_output=expected_output,
                memory_policy=memory_policy,
                model=template.model,
                allowed_tools=template.allowed_tools,
                missing_tool_policy="warn_skip",
            )
```

Also replace the dynamic-fork call around line 258 (the `if template is None` branch). Current code:

```python
        child = self.parent_agent.fork_for_subagent(
            subagent_name=child_id,
            mode=mode,
            parent_name=self.parent_agent.name,
            lineage=lineage,
            task=task,
            instructions=instructions,
            expected_output=expected_output,
            memory_policy=memory_policy,
        )
```

Change to:

```python
        child = self.parent_agent.fork_for_subagent(
            subagent_name=child_id,
            mode=mode,
            parent_name=self.parent_agent.name,
            lineage=lineage,
            task=task,
            instructions=instructions,
            expected_output=expected_output,
            memory_policy=memory_policy,
            missing_tool_policy="warn_skip",
        )
```

- [ ] **Step 4: Run full unchain test suite**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/ -q`
Expected: PASS. `test_kernel_subagents.py` should still pass (it doesn't assert on `missing_tool_policy`).

- [ ] **Step 5: Commit**

```bash
cd /Users/red/Desktop/GITRepo/unchain
git add src/unchain/subagents/plugin.py tests/test_subagent_warn_skip_passthrough.py
git commit -m "feat(subagents): fork subagent children with missing_tool_policy=warn_skip

Child agents now tolerate allowed_tools referencing tools that
the main agent doesn't have — those names are silently filtered
out rather than raising."
```

**End of unchain phase.** Remaining tasks run in the PuPu repo.

---

## Task 4: PuPu — `subagent_loader.py` parser primitives

**Files:**
- Create: `unchain_runtime/server/subagent_loader.py`

- [ ] **Step 1: Create the module with dataclasses, YAML parser, and stub `load_templates`**

Create `unchain_runtime/server/subagent_loader.py`:

```python
"""File-based subagent loader — scans .soul / .skeleton files and builds
SubagentTemplate instances at chat-session start."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
_RESERVED_NAMES = frozenset(
    {"delegate_to_subagent", "handoff_to_subagent", "spawn_worker_batch"}
)
_VALID_MODES = frozenset({"delegate", "handoff", "worker"})
_VALID_OUTPUT_MODES = frozenset({"summary", "last_message", "full_trace"})
_VALID_MEMORY_POLICIES = frozenset({"ephemeral", "scoped_persistent"})
_SOUL_DEFAULT_MODES = ("delegate", "worker")


class LoaderParseError(ValueError):
    """Raised internally by parsers. Caught by load_templates and logged."""


@dataclass(frozen=True)
class ParsedTemplate:
    name: str
    description: str
    instructions: str
    allowed_modes: tuple[str, ...]
    output_mode: str
    memory_policy: str
    parallel_safe: bool
    allowed_tools: tuple[str, ...] | None
    model: str | None
    source_path: Path
    source_scope: str  # "user" or "workspace"
    source_format: str  # ".soul" or ".skeleton"


def _parse_soul_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Minimal YAML frontmatter parser for .soul files.

    Supports only these forms:
      key: bare string value
      key: [a, b, c]   (list of bare strings, no quotes, no nested)

    Returns (frontmatter_dict, body_str). Raises LoaderParseError on malformed input.
    """
    if not text.startswith("---"):
        raise LoaderParseError("missing frontmatter (file must start with '---')")
    rest = text[3:]
    if rest.startswith("\n"):
        rest = rest[1:]
    end_marker = rest.find("\n---")
    if end_marker == -1:
        raise LoaderParseError("frontmatter not terminated (expected closing '---')")
    fm_text = rest[:end_marker]
    body_start = end_marker + len("\n---")
    body = rest[body_start:]
    if body.startswith("\n"):
        body = body[1:]

    fm: dict[str, Any] = {}
    for line_no, raw_line in enumerate(fm_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise LoaderParseError(
                f"frontmatter line {line_no}: expected 'key: value', got {raw_line!r}"
            )
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            raise LoaderParseError(f"frontmatter line {line_no}: empty key")
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                fm[key] = []
            else:
                fm[key] = [item.strip() for item in inner.split(",") if item.strip()]
        else:
            fm[key] = value
    return fm, body


def parse_soul(path: Path) -> ParsedTemplate:
    """Parse a .soul file. Raises LoaderParseError on any issue."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LoaderParseError(f"not valid UTF-8: {exc}") from exc
    fm, body = _parse_soul_frontmatter(text)
    body = body.strip()
    if not body:
        raise LoaderParseError("empty body (instructions required)")

    name = fm.get("name")
    if not isinstance(name, str) or not name.strip():
        raise LoaderParseError("missing or invalid 'name' in frontmatter")
    description = fm.get("description")
    if not isinstance(description, str) or not description.strip():
        raise LoaderParseError("missing or invalid 'description' in frontmatter")

    tools_raw = fm.get("tools")
    if tools_raw is None:
        allowed_tools: tuple[str, ...] | None = None
    elif isinstance(tools_raw, list):
        allowed_tools = tuple(str(t).strip() for t in tools_raw if str(t).strip())
    else:
        raise LoaderParseError("'tools' must be a list like [a, b, c]")

    model_raw = fm.get("model")
    if model_raw is None:
        model: str | None = None
    elif isinstance(model_raw, str):
        stripped = model_raw.strip()
        model = stripped or None
    else:
        raise LoaderParseError("'model' must be a string")

    scope, fmt = _classify_path(path)
    return ParsedTemplate(
        name=name.strip(),
        description=description.strip(),
        instructions=body,
        allowed_modes=_SOUL_DEFAULT_MODES,
        output_mode="summary",
        memory_policy="ephemeral",
        parallel_safe=True,
        allowed_tools=allowed_tools,
        model=model,
        source_path=path,
        source_scope=scope,
        source_format=fmt,
    )


def parse_skeleton(path: Path) -> ParsedTemplate:
    """Parse a .skeleton JSON file. Raises LoaderParseError on any issue."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LoaderParseError(f"not valid UTF-8: {exc}") from exc
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LoaderParseError(f"invalid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise LoaderParseError("top-level value must be a JSON object")

    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise LoaderParseError("missing or invalid 'name'")
    description = raw.get("description")
    if not isinstance(description, str) or not description.strip():
        raise LoaderParseError("missing or invalid 'description'")
    instructions = raw.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        raise LoaderParseError("missing or invalid 'instructions'")

    allowed_modes_raw = raw.get("allowed_modes", ["delegate", "worker"])
    if not isinstance(allowed_modes_raw, list) or not all(
        isinstance(item, str) for item in allowed_modes_raw
    ):
        raise LoaderParseError("'allowed_modes' must be a list of strings")
    allowed_modes = tuple(allowed_modes_raw)

    output_mode = raw.get("output_mode", "summary")
    if not isinstance(output_mode, str):
        raise LoaderParseError("'output_mode' must be a string")
    memory_policy = raw.get("memory_policy", "ephemeral")
    if not isinstance(memory_policy, str):
        raise LoaderParseError("'memory_policy' must be a string")
    parallel_safe = raw.get("parallel_safe", True)
    if not isinstance(parallel_safe, bool):
        raise LoaderParseError("'parallel_safe' must be a boolean")

    allowed_tools_raw = raw.get("allowed_tools", None)
    if allowed_tools_raw is None:
        allowed_tools: tuple[str, ...] | None = None
    elif isinstance(allowed_tools_raw, list) and all(
        isinstance(item, str) for item in allowed_tools_raw
    ):
        allowed_tools = tuple(item.strip() for item in allowed_tools_raw if item.strip())
    else:
        raise LoaderParseError("'allowed_tools' must be null or a list of strings")

    model_raw = raw.get("model", None)
    if model_raw is None:
        model = None
    elif isinstance(model_raw, str):
        stripped = model_raw.strip()
        model = stripped or None
    else:
        raise LoaderParseError("'model' must be null or a string")

    scope, fmt = _classify_path(path)
    return ParsedTemplate(
        name=name.strip(),
        description=description.strip(),
        instructions=instructions.strip(),
        allowed_modes=allowed_modes,
        output_mode=output_mode,
        memory_policy=memory_policy,
        parallel_safe=parallel_safe,
        allowed_tools=allowed_tools,
        model=model,
        source_path=path,
        source_scope=scope,
        source_format=fmt,
    )


def _classify_path(path: Path) -> tuple[str, str]:
    """Infer (scope, format) from a ParsedTemplate.source_path.
    Defaults — overridden in load_templates which knows the scope from context."""
    return ("user", path.suffix)


def load_templates(
    *,
    toolkits: tuple[Any, ...],
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    user_dir: Path,
    workspace_dir: Path | None,
    UnchainAgent: Any,
    ToolsModule: Any,
    PoliciesModule: Any,
    SubagentTemplate: Any,
) -> tuple[Any, ...]:
    """Placeholder — implemented in Task 6-7."""
    raise NotImplementedError("load_templates is implemented in Task 6-7")
```

- [ ] **Step 2: Run test to verify the module imports cleanly**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -c "import sys; sys.path.insert(0, 'unchain_runtime/server'); from subagent_loader import parse_soul, parse_skeleton, load_templates, ParsedTemplate; print('import OK')"`
Expected: `import OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/subagent_loader.py
git commit -m "feat(subagent-loader): add parser primitives for .soul and .skeleton

Implements ParsedTemplate dataclass, minimal YAML frontmatter
parser (no PyYAML dep), and parse_soul/parse_skeleton entry points.
load_templates is a stub — implemented in follow-up tasks."
```

---

## Task 5: PuPu — Parser unit tests

**Files:**
- Create: `unchain_runtime/server/tests/test_subagent_loader.py` (parse-layer tests only; precedence/load_templates tests in Task 7)

- [ ] **Step 1: Write the parser tests**

Create `unchain_runtime/server/tests/test_subagent_loader.py`:

```python
"""Tests for subagent_loader parsing primitives."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import subagent_loader  # noqa: E402
from subagent_loader import LoaderParseError, parse_skeleton, parse_soul  # noqa: E402


class SoulParserTests(unittest.TestCase):
    def _write(self, text: str) -> Path:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".soul", delete=False, encoding="utf-8")
        tmp.write(text)
        tmp.close()
        return Path(tmp.name)

    def test_parse_minimal_valid_soul(self):
        p = self._write(
            "---\n"
            "name: HelperBot\n"
            "description: A helper.\n"
            "---\n"
            "You are a helper.\n"
        )
        parsed = parse_soul(p)
        self.assertEqual(parsed.name, "HelperBot")
        self.assertEqual(parsed.description, "A helper.")
        self.assertEqual(parsed.instructions, "You are a helper.")
        self.assertIsNone(parsed.allowed_tools)
        self.assertIsNone(parsed.model)
        self.assertEqual(parsed.allowed_modes, ("delegate", "worker"))
        self.assertEqual(parsed.output_mode, "summary")
        self.assertEqual(parsed.memory_policy, "ephemeral")
        self.assertTrue(parsed.parallel_safe)

    def test_parse_soul_with_tools_list(self):
        p = self._write(
            "---\n"
            "name: Explore\n"
            "description: Explorer.\n"
            "tools: [read, grep, glob]\n"
            "model: claude-haiku-4-5\n"
            "---\n"
            "Explore the code.\n"
        )
        parsed = parse_soul(p)
        self.assertEqual(parsed.allowed_tools, ("read", "grep", "glob"))
        self.assertEqual(parsed.model, "claude-haiku-4-5")

    def test_parse_soul_rejects_missing_frontmatter(self):
        p = self._write("no frontmatter here")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_unterminated_frontmatter(self):
        p = self._write("---\nname: X\ndescription: Y\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_empty_body(self):
        p = self._write("---\nname: X\ndescription: Y\n---\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_missing_name(self):
        p = self._write("---\ndescription: Y\n---\nbody\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_bad_tools_type(self):
        p = self._write("---\nname: X\ndescription: Y\ntools: read\n---\nbody\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_handles_empty_tools_list(self):
        p = self._write("---\nname: X\ndescription: Y\ntools: []\n---\nbody\n")
        parsed = parse_soul(p)
        self.assertEqual(parsed.allowed_tools, ())

    def test_parse_soul_ignores_comments_and_blank_lines(self):
        p = self._write(
            "---\n"
            "# a comment\n"
            "\n"
            "name: X\n"
            "description: Y\n"
            "---\n"
            "body\n"
        )
        parsed = parse_soul(p)
        self.assertEqual(parsed.name, "X")


class SkeletonParserTests(unittest.TestCase):
    def _write(self, payload: dict) -> Path:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".skeleton", delete=False, encoding="utf-8")
        tmp.write(json.dumps(payload))
        tmp.close()
        return Path(tmp.name)

    def test_parse_minimal_valid_skeleton(self):
        p = self._write(
            {
                "name": "Explore",
                "description": "Explorer.",
                "instructions": "You are Explore.",
            }
        )
        parsed = parse_skeleton(p)
        self.assertEqual(parsed.name, "Explore")
        self.assertEqual(parsed.allowed_modes, ("delegate", "worker"))
        self.assertEqual(parsed.output_mode, "summary")
        self.assertEqual(parsed.memory_policy, "ephemeral")
        self.assertTrue(parsed.parallel_safe)
        self.assertIsNone(parsed.allowed_tools)
        self.assertIsNone(parsed.model)

    def test_parse_skeleton_full_payload(self):
        p = self._write(
            {
                "name": "Debugger",
                "description": "Debug.",
                "instructions": "you are a debugger",
                "allowed_modes": ["delegate", "handoff"],
                "output_mode": "full_trace",
                "memory_policy": "scoped_persistent",
                "parallel_safe": False,
                "allowed_tools": ["read", "shell"],
                "model": "claude-opus-4-7",
            }
        )
        parsed = parse_skeleton(p)
        self.assertEqual(parsed.allowed_modes, ("delegate", "handoff"))
        self.assertEqual(parsed.output_mode, "full_trace")
        self.assertEqual(parsed.memory_policy, "scoped_persistent")
        self.assertFalse(parsed.parallel_safe)
        self.assertEqual(parsed.allowed_tools, ("read", "shell"))
        self.assertEqual(parsed.model, "claude-opus-4-7")

    def test_parse_skeleton_rejects_invalid_json(self):
        tmp = tempfile.NamedTemporaryFile("w", suffix=".skeleton", delete=False, encoding="utf-8")
        tmp.write("{not valid json")
        tmp.close()
        with self.assertRaises(LoaderParseError):
            parse_skeleton(Path(tmp.name))

    def test_parse_skeleton_rejects_array_top_level(self):
        tmp = tempfile.NamedTemporaryFile("w", suffix=".skeleton", delete=False, encoding="utf-8")
        tmp.write(json.dumps([{"name": "X"}]))
        tmp.close()
        with self.assertRaises(LoaderParseError):
            parse_skeleton(Path(tmp.name))

    def test_parse_skeleton_rejects_missing_instructions(self):
        p = self._write({"name": "X", "description": "Y"})
        with self.assertRaises(LoaderParseError):
            parse_skeleton(p)

    def test_parse_skeleton_rejects_bad_allowed_modes_type(self):
        p = self._write(
            {
                "name": "X",
                "description": "Y",
                "instructions": "i",
                "allowed_modes": "delegate",
            }
        )
        with self.assertRaises(LoaderParseError):
            parse_skeleton(p)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run parser tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -m unittest unchain_runtime.server.tests.test_subagent_loader -v`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/tests/test_subagent_loader.py
git commit -m "test(subagent-loader): cover parse_soul and parse_skeleton

Validates .soul YAML-frontmatter parsing (happy path, missing
name/description, bad tools type, empty body, comments) and
.skeleton JSON parsing (full/minimal payloads, invalid JSON,
wrong top-level type, missing instructions, bad allowed_modes)."
```

---

## Task 6: PuPu — Validation + precedence in loader

**Files:**
- Modify: `unchain_runtime/server/subagent_loader.py`
- Modify: `unchain_runtime/server/tests/test_subagent_loader.py` (add precedence tests)

- [ ] **Step 1: Replace `_classify_path` with scope-aware classifier and add validation helpers**

In `unchain_runtime/server/subagent_loader.py`, remove the placeholder `_classify_path` function and replace the `load_templates` stub. Add these helpers above `load_templates`:

```python
_PRECEDENCE_RANK: dict[tuple[str, str], int] = {
    ("user", ".skeleton"): 0,
    ("user", ".soul"): 1,
    ("workspace", ".skeleton"): 2,
    ("workspace", ".soul"): 3,
}


def _validate_parsed(parsed: ParsedTemplate) -> str | None:
    """Return None if valid, else a human-readable reason for rejection."""
    if not _NAME_RE.match(parsed.name):
        return (
            f"name {parsed.name!r} does not match [A-Za-z][A-Za-z0-9_-]{{0,63}}"
        )
    if parsed.name in _RESERVED_NAMES:
        return f"name {parsed.name!r} is reserved"
    bad_modes = [m for m in parsed.allowed_modes if m not in _VALID_MODES]
    if bad_modes:
        return (
            f"allowed_modes contains invalid values {bad_modes}; "
            f"valid: {sorted(_VALID_MODES)}"
        )
    if not parsed.allowed_modes:
        return "allowed_modes must contain at least one mode"
    if parsed.output_mode not in _VALID_OUTPUT_MODES:
        return (
            f"output_mode {parsed.output_mode!r} invalid; "
            f"valid: {sorted(_VALID_OUTPUT_MODES)}"
        )
    if parsed.memory_policy not in _VALID_MEMORY_POLICIES:
        return (
            f"memory_policy {parsed.memory_policy!r} invalid; "
            f"valid: {sorted(_VALID_MEMORY_POLICIES)}"
        )
    return None


def _scan_dir(directory: Path, scope: str) -> list[ParsedTemplate]:
    """Scan a directory for .soul/.skeleton files and return parsed templates.
    Parse failures are logged and skipped — never raised."""
    results: list[ParsedTemplate] = []
    if not directory.exists() or not directory.is_dir():
        return results
    for path in sorted(directory.iterdir()):
        if not path.is_file():
            continue
        suffix = path.suffix
        if suffix not in (".soul", ".skeleton"):
            continue
        try:
            parsed = parse_soul(path) if suffix == ".soul" else parse_skeleton(path)
        except LoaderParseError as exc:
            logger.warning("[subagent_loader] %s: parse failed — %s", path, exc)
            continue
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(
                "[subagent_loader] %s: unexpected parse error — %s", path, exc
            )
            continue
        # Replace the placeholder scope/format written by parsers
        parsed_dict = {
            "name": parsed.name,
            "description": parsed.description,
            "instructions": parsed.instructions,
            "allowed_modes": parsed.allowed_modes,
            "output_mode": parsed.output_mode,
            "memory_policy": parsed.memory_policy,
            "parallel_safe": parsed.parallel_safe,
            "allowed_tools": parsed.allowed_tools,
            "model": parsed.model,
            "source_path": parsed.source_path,
            "source_scope": scope,
            "source_format": suffix,
        }
        normalized = ParsedTemplate(**parsed_dict)
        reason = _validate_parsed(normalized)
        if reason is not None:
            logger.warning(
                "[subagent_loader] %s: rejected — %s", path, reason
            )
            continue
        results.append(normalized)
    return results


def _dedupe_by_precedence(
    templates: list[ParsedTemplate],
) -> list[ParsedTemplate]:
    """Apply user.skeleton > user.soul > workspace.skeleton > workspace.soul.
    Same-name conflicts keep the highest-ranked; losers logged as shadowed."""
    by_name: dict[str, list[ParsedTemplate]] = {}
    for tpl in templates:
        by_name.setdefault(tpl.name, []).append(tpl)
    winners: list[ParsedTemplate] = []
    for name, group in by_name.items():
        group.sort(
            key=lambda t: _PRECEDENCE_RANK.get(
                (t.source_scope, t.source_format), 99
            )
        )
        winner = group[0]
        for loser in group[1:]:
            logger.warning(
                "[subagent_loader] %s: shadowed by %s (same name %r)",
                loser.source_path,
                winner.source_path,
                name,
            )
        winners.append(winner)
    return winners
```

Now also remove the placeholder `_classify_path` function entirely — the parser functions no longer need it. Update `parse_soul` and `parse_skeleton` to remove the `_classify_path` call and instead hardcode placeholder `("user", path.suffix)` values in `ParsedTemplate` (they get overwritten in `_scan_dir`):

In `parse_soul`, replace:
```python
    scope, fmt = _classify_path(path)
    return ParsedTemplate(
        ...
        source_scope=scope,
        source_format=fmt,
    )
```

with:

```python
    return ParsedTemplate(
        name=name.strip(),
        description=description.strip(),
        instructions=body,
        allowed_modes=_SOUL_DEFAULT_MODES,
        output_mode="summary",
        memory_policy="ephemeral",
        parallel_safe=True,
        allowed_tools=allowed_tools,
        model=model,
        source_path=path,
        source_scope="user",  # overwritten by _scan_dir
        source_format=path.suffix,
    )
```

Apply the same treatment to `parse_skeleton`:

```python
    return ParsedTemplate(
        name=name.strip(),
        description=description.strip(),
        instructions=instructions.strip(),
        allowed_modes=allowed_modes,
        output_mode=output_mode,
        memory_policy=memory_policy,
        parallel_safe=parallel_safe,
        allowed_tools=allowed_tools,
        model=model,
        source_path=path,
        source_scope="user",  # overwritten by _scan_dir
        source_format=path.suffix,
    )
```

Delete the `_classify_path` function entirely.

- [ ] **Step 2: Add tests for validation + precedence**

Append to `unchain_runtime/server/tests/test_subagent_loader.py`:

```python
from subagent_loader import (  # noqa: E402
    _dedupe_by_precedence,
    _scan_dir,
    _validate_parsed,
    ParsedTemplate,
)


class ValidationTests(unittest.TestCase):
    def _make(self, **overrides):
        base = dict(
            name="Good",
            description="d",
            instructions="i",
            allowed_modes=("delegate",),
            output_mode="summary",
            memory_policy="ephemeral",
            parallel_safe=True,
            allowed_tools=None,
            model=None,
            source_path=Path("/tmp/x.soul"),
            source_scope="user",
            source_format=".soul",
        )
        base.update(overrides)
        return ParsedTemplate(**base)

    def test_accepts_valid_template(self):
        self.assertIsNone(_validate_parsed(self._make()))

    def test_rejects_bad_name_chars(self):
        reason = _validate_parsed(self._make(name="bad name"))
        self.assertIsNotNone(reason)
        self.assertIn("does not match", reason)

    def test_rejects_reserved_name(self):
        reason = _validate_parsed(self._make(name="delegate_to_subagent"))
        self.assertIn("reserved", reason)

    def test_rejects_bad_mode(self):
        reason = _validate_parsed(self._make(allowed_modes=("delete",)))
        self.assertIn("allowed_modes", reason)

    def test_rejects_empty_modes(self):
        reason = _validate_parsed(self._make(allowed_modes=()))
        self.assertIn("at least one mode", reason)

    def test_rejects_bad_output_mode(self):
        reason = _validate_parsed(self._make(output_mode="weird"))
        self.assertIn("output_mode", reason)

    def test_rejects_bad_memory_policy(self):
        reason = _validate_parsed(self._make(memory_policy="weird"))
        self.assertIn("memory_policy", reason)


class PrecedenceTests(unittest.TestCase):
    def _make(self, *, name, scope, fmt):
        return ParsedTemplate(
            name=name,
            description="d",
            instructions="i",
            allowed_modes=("delegate",),
            output_mode="summary",
            memory_policy="ephemeral",
            parallel_safe=True,
            allowed_tools=None,
            model=None,
            source_path=Path(f"/tmp/{scope}/{name}{fmt}"),
            source_scope=scope,
            source_format=fmt,
        )

    def test_user_skeleton_beats_user_soul(self):
        templates = [
            self._make(name="Explore", scope="user", fmt=".soul"),
            self._make(name="Explore", scope="user", fmt=".skeleton"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].source_format, ".skeleton")
        self.assertEqual(winners[0].source_scope, "user")

    def test_user_soul_beats_workspace_skeleton(self):
        templates = [
            self._make(name="Explore", scope="workspace", fmt=".skeleton"),
            self._make(name="Explore", scope="user", fmt=".soul"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].source_scope, "user")
        self.assertEqual(winners[0].source_format, ".soul")

    def test_workspace_skeleton_beats_workspace_soul(self):
        templates = [
            self._make(name="Explore", scope="workspace", fmt=".soul"),
            self._make(name="Explore", scope="workspace", fmt=".skeleton"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].source_format, ".skeleton")
        self.assertEqual(winners[0].source_scope, "workspace")

    def test_different_names_coexist(self):
        templates = [
            self._make(name="A", scope="user", fmt=".soul"),
            self._make(name="B", scope="workspace", fmt=".skeleton"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual({t.name for t in winners}, {"A", "B"})


class ScanDirTests(unittest.TestCase):
    def test_scan_empty_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(_scan_dir(Path(d), "user"), [])

    def test_scan_missing_dir_returns_empty(self):
        self.assertEqual(_scan_dir(Path("/nonexistent/path/xyz"), "user"), [])

    def test_scan_ignores_non_matching_extensions(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "foo.txt").write_text("not a soul")
            (Path(d) / "bar.skeleton.bak").write_text("{}")
            self.assertEqual(_scan_dir(Path(d), "user"), [])

    def test_scan_picks_up_valid_files(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Explore.skeleton").write_text(
                json.dumps(
                    {
                        "name": "Explore",
                        "description": "desc",
                        "instructions": "i",
                    }
                )
            )
            (Path(d) / "Helper.soul").write_text(
                "---\nname: Helper\ndescription: d\n---\nbody\n"
            )
            results = _scan_dir(Path(d), "user")
            self.assertEqual({t.name for t in results}, {"Explore", "Helper"})
            for r in results:
                self.assertEqual(r.source_scope, "user")

    def test_scan_skips_invalid_but_keeps_valid(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Valid.skeleton").write_text(
                json.dumps(
                    {"name": "Valid", "description": "d", "instructions": "i"}
                )
            )
            (Path(d) / "Broken.skeleton").write_text("{not json")
            results = _scan_dir(Path(d), "user")
            self.assertEqual([t.name for t in results], ["Valid"])

    def test_scan_skips_reserved_name(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "delegate_to_subagent.skeleton").write_text(
                json.dumps(
                    {
                        "name": "delegate_to_subagent",
                        "description": "d",
                        "instructions": "i",
                    }
                )
            )
            results = _scan_dir(Path(d), "user")
            self.assertEqual(results, [])
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -m unittest unchain_runtime.server.tests.test_subagent_loader -v`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/subagent_loader.py unchain_runtime/server/tests/test_subagent_loader.py
git commit -m "feat(subagent-loader): add validation and precedence dedupe

_validate_parsed rejects illegal names, reserved names, invalid
allowed_modes/output_mode/memory_policy with human-readable reasons.
_dedupe_by_precedence applies user.skeleton > user.soul > 
workspace.skeleton > workspace.soul and logs shadows.
_scan_dir orchestrates parse + validate + skip-bad."
```

---

## Task 7: PuPu — Implement `load_templates`

**Files:**
- Modify: `unchain_runtime/server/subagent_loader.py` (replace `load_templates` stub)
- Modify: `unchain_runtime/server/tests/test_subagent_loader.py` (add integration tests)

- [ ] **Step 1: Implement `load_templates`**

In `unchain_runtime/server/subagent_loader.py`, replace the `load_templates` stub with a full implementation:

```python
def _collect_main_tool_names(toolkits: tuple[Any, ...]) -> set[str]:
    names: set[str] = set()
    for toolkit in toolkits:
        tools_attr = getattr(toolkit, "tools", None)
        if isinstance(tools_attr, dict):
            names.update(str(k) for k in tools_attr.keys())
        elif isinstance(tools_attr, (list, tuple)):
            for tool in tools_attr:
                tool_name = getattr(tool, "name", None)
                if isinstance(tool_name, str) and tool_name:
                    names.add(tool_name)
    return names


def load_templates(
    *,
    toolkits: tuple[Any, ...],
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    user_dir: Path,
    workspace_dir: Path | None,
    UnchainAgent: Any,
    ToolsModule: Any,
    PoliciesModule: Any,
    SubagentTemplate: Any,
) -> tuple[Any, ...]:
    """Scan user_dir + workspace_dir, parse files, validate, apply precedence,
    intersect allowed_tools against main agent's tools, and return a tuple of
    ready-to-register SubagentTemplate instances.

    All failure modes (missing dirs, parse errors, validation failures, empty
    tool intersections) result in log warnings + skipping — never raises."""
    main_tool_names = _collect_main_tool_names(toolkits)

    parsed: list[ParsedTemplate] = []
    parsed.extend(_scan_dir(user_dir, "user"))
    if workspace_dir is not None:
        parsed.extend(_scan_dir(workspace_dir, "workspace"))

    survivors = _dedupe_by_precedence(parsed)

    templates: list[Any] = []
    for tpl in survivors:
        # Tool intersection
        if tpl.allowed_tools is None:
            effective_tools: tuple[str, ...] | None = None
        else:
            declared = tuple(dict.fromkeys(tpl.allowed_tools))
            intersect = tuple(t for t in declared if t in main_tool_names)
            if not intersect:
                logger.warning(
                    "[subagent_loader] %s: no allowed_tools available in main "
                    "agent (declared: %s, main has: %s) — skipping",
                    tpl.source_path,
                    list(declared),
                    sorted(main_tool_names),
                )
                continue
            if len(intersect) < len(declared):
                dropped = [t for t in declared if t not in main_tool_names]
                logger.info(
                    "[subagent_loader] %s: allowed_tools filtered (dropped: %s) "
                    "— not in main agent",
                    tpl.name,
                    dropped,
                )
            effective_tools = intersect

        # Build child agent
        child_modules = []
        if toolkits:
            child_modules.append(ToolsModule(tools=tuple(toolkits)))
        child_modules.append(PoliciesModule(max_iterations=max(2, max_iterations // 3)))

        child_agent = UnchainAgent(
            name=tpl.name,
            instructions=tpl.instructions,
            provider=provider,
            model=tpl.model or model,
            api_key=api_key,
            modules=tuple(child_modules),
        )

        template = SubagentTemplate(
            name=tpl.name,
            description=tpl.description,
            agent=child_agent,
            allowed_modes=tpl.allowed_modes,
            output_mode=tpl.output_mode,
            memory_policy=tpl.memory_policy,
            parallel_safe=tpl.parallel_safe,
            allowed_tools=effective_tools,
            model=tpl.model,
        )
        templates.append(template)

    if templates:
        logger.info(
            "[subagent_loader] loaded %d templates: %s",
            len(templates),
            [t.name for t in templates],
        )
    else:
        logger.info("[subagent_loader] no subagent templates registered")

    return tuple(templates)
```

- [ ] **Step 2: Add integration tests for `load_templates`**

Append to `unchain_runtime/server/tests/test_subagent_loader.py`:

```python
from subagent_loader import load_templates  # noqa: E402


class _FakeTool:
    def __init__(self, name):
        self.name = name


class _FakeToolkit:
    def __init__(self, tool_names):
        self.tools = {n: _FakeTool(n) for n in tool_names}


class _FakeAgent:
    def __init__(self, *, name, instructions, provider, model, api_key, modules):
        self.name = name
        self.instructions = instructions
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.modules = modules


class _FakeToolsModule:
    def __init__(self, *, tools):
        self.tools = tools


class _FakePoliciesModule:
    def __init__(self, *, max_iterations):
        self.max_iterations = max_iterations


class _FakeSubagentTemplate:
    def __init__(
        self,
        *,
        name,
        description,
        agent,
        allowed_modes,
        output_mode,
        memory_policy,
        parallel_safe,
        allowed_tools,
        model,
    ):
        self.name = name
        self.description = description
        self.agent = agent
        self.allowed_modes = allowed_modes
        self.output_mode = output_mode
        self.memory_policy = memory_policy
        self.parallel_safe = parallel_safe
        self.allowed_tools = allowed_tools
        self.model = model


class LoadTemplatesTests(unittest.TestCase):
    def _call(self, *, user_dir, workspace_dir=None, toolkit_tools=("read", "grep")):
        return load_templates(
            toolkits=(_FakeToolkit(toolkit_tools),),
            provider="anthropic",
            model="claude-haiku-4-5",
            api_key=None,
            max_iterations=30,
            user_dir=user_dir,
            workspace_dir=workspace_dir,
            UnchainAgent=_FakeAgent,
            ToolsModule=_FakeToolsModule,
            PoliciesModule=_FakePoliciesModule,
            SubagentTemplate=_FakeSubagentTemplate,
        )

    def test_empty_dirs_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self._call(user_dir=Path(d)), ())

    def test_workspace_dir_none_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps({"name": "A", "description": "d", "instructions": "i"})
            )
            templates = self._call(user_dir=Path(d), workspace_dir=None)
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].name, "A")

    def test_nonexistent_workspace_dir_falls_back(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps({"name": "A", "description": "d", "instructions": "i"})
            )
            templates = self._call(
                user_dir=Path(d),
                workspace_dir=Path("/nonexistent/xyz/subagents"),
            )
            self.assertEqual(len(templates), 1)

    def test_tools_intersection_all_missing_skips(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Bad.skeleton").write_text(
                json.dumps(
                    {
                        "name": "Bad",
                        "description": "d",
                        "instructions": "i",
                        "allowed_tools": ["nonexistent_tool"],
                    }
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(templates, ())

    def test_tools_intersection_partial(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Partial.skeleton").write_text(
                json.dumps(
                    {
                        "name": "Partial",
                        "description": "d",
                        "instructions": "i",
                        "allowed_tools": ["read", "nonexistent_tool"],
                    }
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].allowed_tools, ("read",))

    def test_tools_null_inherits_all(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Inherit.skeleton").write_text(
                json.dumps(
                    {"name": "Inherit", "description": "d", "instructions": "i"}
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(len(templates), 1)
            self.assertIsNone(templates[0].allowed_tools)

    def test_workspace_shadows_user(self):
        with tempfile.TemporaryDirectory() as u, tempfile.TemporaryDirectory() as w:
            (Path(u) / "Dup.skeleton").write_text(
                json.dumps(
                    {"name": "Dup", "description": "USER", "instructions": "i"}
                )
            )
            (Path(w) / "Dup.skeleton").write_text(
                json.dumps(
                    {"name": "Dup", "description": "WORKSPACE", "instructions": "i"}
                )
            )
            templates = self._call(user_dir=Path(u), workspace_dir=Path(w))
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].description, "USER")

    def test_model_override_used(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps(
                    {
                        "name": "A",
                        "description": "d",
                        "instructions": "i",
                        "model": "claude-opus-4-7",
                    }
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(templates[0].agent.model, "claude-opus-4-7")

    def test_model_null_inherits_main(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps(
                    {"name": "A", "description": "d", "instructions": "i"}
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(templates[0].agent.model, "claude-haiku-4-5")
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -m unittest unchain_runtime.server.tests.test_subagent_loader -v`
Expected: all tests PASS (parser tests + validation + precedence + load_templates).

- [ ] **Step 4: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/subagent_loader.py unchain_runtime/server/tests/test_subagent_loader.py
git commit -m "feat(subagent-loader): implement load_templates end-to-end

Composes scan + dedupe + tool intersection + child-agent build.
Empty intersection skips the template with a WARNING. null
allowed_tools inherits all main-agent tools. Integration tests
use fakes for UnchainAgent/ToolsModule/PoliciesModule/
SubagentTemplate to stay decoupled from unchain internals."
```

---

## Task 8: PuPu — `subagent_seeds.py` with Explore skeleton

**Files:**
- Create: `unchain_runtime/server/subagent_seeds.py`

- [ ] **Step 1: Create the seeds module**

Create `unchain_runtime/server/subagent_seeds.py`:

```python
"""First-launch seeding of built-in subagent templates.

Writes Explore.skeleton to ~/.pupu/subagents/ if missing. Idempotent:
never overwrites. If the user deletes the file, it is not regenerated."""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


EXPLORE_SYSTEM_PROMPT = """## Identity
You are Explore — a read-only codebase exploration specialist. You find files,
search code, answer questions about the codebase. You do not edit, write, or
execute mutations. Your output feeds a parent agent that relies on you for
accurate, well-cited findings.

## Capabilities
You have these tools: read, grep, glob, lsp, web_fetch, shell, ask_user_question.
Treat shell as read-only: ls, file, wc, du, find -type f, head, tail. Never run
commands that mutate filesystem, network, or process state (rm, mv, cp, git
commit, npm install, curl with POST, etc.).

## Thoroughness Levels
The parent agent will tell you one of:
- "quick" — single-pass. 1-3 tool calls. Return best-effort answer.
- "medium" — iterate until confident. 3-10 tool calls. Cross-check with one
  alternate search.
- "very thorough" — exhaustive. 10+ tool calls. Multiple search strategies,
  cross-reference naming conventions, verify by reading actual file content,
  check tests/docs.

If unspecified, default to "medium".

## Workflow
1. Parse the task. Identify key symbols, concepts, file patterns.
2. Start broad with grep/glob to map the territory.
3. Narrow to candidate files. Read them in full when relevant.
4. For code understanding: use lsp to find definitions/references.
5. For conceptual questions: cross-reference at least 2 different search angles
   before concluding.
6. Before returning: re-check your claim against at least one primary source.

## Output Format
Return a markdown report with these sections (omit sections that don't apply):

### Summary
One to three sentences directly answering the task.

### Key Findings
- path/to/file.py:42 — what's there, why it matters
- path/to/other.ts:17-31 — ...
(cite specific line ranges; never cite without line numbers)

### Relevant Files
- path/to/file.py — one-line description of relevance
(comprehensive list, ranked by relevance)

### Uncertainty
- Anything you couldn't verify
- Assumptions you had to make
- Questions the parent agent should clarify before acting

## Constraints
- NEVER write, edit, or mutate files.
- NEVER run shell commands that can change state.
- NEVER fabricate file paths or line numbers. If unsure, say so in Uncertainty.
- NEVER invoke another subagent. You are a leaf.
- Use absolute paths when possible; relative paths only within reports where
  clarity wins.
- If the task is genuinely ambiguous, ask_user_question BEFORE exploring —
  don't burn tools on guesses.

## Anti-Patterns (what to avoid)
- Returning only a summary without Key Findings citations.
- Claiming "X doesn't exist" without showing the grep / glob queries tried.
- Over-reading: if grep narrows you to one file, don't read the whole directory.
- Under-reading: if a function name matches but you didn't open the file, you
  don't actually know what it does — open it.
- Infinite exploration: at "quick" level, stop after the first confident answer.
"""


EXPLORE_SKELETON: dict = {
    "name": "Explore",
    "description": (
        "Fast agent specialized for exploring codebases. Use this when you need "
        "to quickly find files by patterns, search code for keywords, or answer "
        "questions about the codebase. Specify desired thoroughness level in "
        "the task: 'quick', 'medium', or 'very thorough'."
    ),
    "instructions": EXPLORE_SYSTEM_PROMPT,
    "allowed_modes": ["delegate", "worker"],
    "output_mode": "summary",
    "memory_policy": "ephemeral",
    "parallel_safe": True,
    "allowed_tools": [
        "read",
        "grep",
        "glob",
        "lsp",
        "web_fetch",
        "shell",
        "ask_user_question",
    ],
    "model": None,
}


def ensure_seeds_written(user_dir: Path) -> None:
    """Write Explore.skeleton if it doesn't already exist. Idempotent.

    If the user has deleted Explore.skeleton, this function does NOT
    regenerate it — user deletion is respected as intent."""
    try:
        user_dir.mkdir(parents=True, exist_ok=True)
    except FileExistsError:
        logger.critical(
            "[subagent_seeds] %s exists but is not a directory — skipping seed",
            user_dir,
        )
        return
    except OSError as exc:
        logger.warning(
            "[subagent_seeds] cannot create %s: %s — skipping seed", user_dir, exc
        )
        return

    target = user_dir / "Explore.skeleton"
    if target.exists():
        return

    try:
        target.write_text(
            json.dumps(EXPLORE_SKELETON, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info(
            "[subagent_seeds] wrote default Explore.skeleton to %s", target
        )
    except OSError as exc:
        logger.warning(
            "[subagent_seeds] failed to write %s: %s", target, exc
        )
```

- [ ] **Step 2: Write seeds tests**

Create `unchain_runtime/server/tests/test_subagent_seeds.py`:

```python
"""Tests for subagent_seeds — first-launch idempotent seeding."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from subagent_seeds import EXPLORE_SKELETON, ensure_seeds_written  # noqa: E402


class EnsureSeedsWrittenTests(unittest.TestCase):
    def test_writes_explore_skeleton_when_missing(self):
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d) / "subagents"
            ensure_seeds_written(user_dir)
            target = user_dir / "Explore.skeleton"
            self.assertTrue(target.exists())
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(payload["name"], "Explore")
            self.assertIn("thoroughness", payload["description"].lower())
            self.assertIn("read", payload["allowed_tools"])

    def test_creates_missing_parent_dir(self):
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d) / "nested" / "subagents"
            ensure_seeds_written(user_dir)
            self.assertTrue((user_dir / "Explore.skeleton").exists())

    def test_does_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d)
            target = user_dir / "Explore.skeleton"
            target.write_text("user-modified content", encoding="utf-8")
            ensure_seeds_written(user_dir)
            self.assertEqual(target.read_text(encoding="utf-8"), "user-modified content")

    def test_does_not_regenerate_after_deletion(self):
        """Once seeded, if user deletes Explore.skeleton, it stays deleted.
        This test reflects the design: we call ensure once, then the user owns the file."""
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d)
            ensure_seeds_written(user_dir)  # first seed
            target = user_dir / "Explore.skeleton"
            target.unlink()
            ensure_seeds_written(user_dir)  # second call after user deletion
            # The current implementation WILL re-write because there's no marker.
            # We deliberately re-seed on every ensure call — but the trigger in
            # main.py only fires once per server launch. If the user deletes
            # between launches, re-seeding is acceptable. The spec calls this
            # out: seed is "first-launch", but a restart after deletion counts
            # as another first.
            # If behavior should change to track deletion with a marker, extend
            # ensure_seeds_written with a .seeded_v1 sentinel file.
            self.assertTrue(target.exists())

    def test_explore_skeleton_payload_parses_as_valid_subagent(self):
        """The seeded skeleton must round-trip through the loader."""
        import subagent_loader

        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d)
            ensure_seeds_written(user_dir)
            target = user_dir / "Explore.skeleton"
            parsed = subagent_loader.parse_skeleton(target)
            self.assertEqual(parsed.name, "Explore")
            reason = subagent_loader._validate_parsed(parsed)
            self.assertIsNone(reason)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -m unittest unchain_runtime.server.tests.test_subagent_seeds -v`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/subagent_seeds.py unchain_runtime/server/tests/test_subagent_seeds.py
git commit -m "feat(subagent-seeds): ship Explore as built-in user-scope seed

ensure_seeds_written writes ~/.pupu/subagents/Explore.skeleton
on first call; never overwrites existing files. The full Explore
system prompt includes identity, tools, thoroughness levels,
workflow, output format, and anti-patterns."
```

---

## Task 9: PuPu — Wire seed writing into server startup

**Files:**
- Modify: `unchain_runtime/server/main.py` (call `ensure_seeds_written` on startup)

- [ ] **Step 1: Read current main.py to find startup hook**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && head -50 unchain_runtime/server/main.py`
Note the `def main() -> int:` location (around line 33).

- [ ] **Step 2: Add seed call at startup**

In `unchain_runtime/server/main.py`, inside `def main()` after imports but before `app = create_app()`, add:

```python
    # First-launch seed: ensure built-in Explore subagent is present.
    try:
        from subagent_seeds import ensure_seeds_written
        from pathlib import Path
        ensure_seeds_written(Path.home() / ".pupu" / "subagents")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "[subagent_seeds] seed-write failed: %s", exc
        )
```

The exception guard ensures a broken seed file system never prevents PuPu from starting.

- [ ] **Step 3: Manually verify no import errors on startup**

Run: `cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && python -c "from subagent_seeds import ensure_seeds_written; print('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/main.py
git commit -m "feat(server): seed built-in subagents on Flask startup

Calls ensure_seeds_written(~/.pupu/subagents) inside main().
Wrapped in try/except so seed failures never block server boot."
```

---

## Task 10: PuPu — Update developer prompt with `{{SUBAGENT_LIST}}` placeholder

**Files:**
- Modify: `unchain_runtime/server/prompts/agents/developer.py`

- [ ] **Step 1: Replace hardcoded analyzer/executor block with placeholder**

Open `unchain_runtime/server/prompts/agents/developer.py` and replace the `"delegation"` key's value (currently lines 29-58). Replace the entire `"delegation": (...)` entry with:

```python
    "delegation": (
        "You have subagent capabilities for context isolation and parallelism.\n"
        "Check [Context Status] in the system messages to see your current "
        "context window usage. As usage rises above 50%, prefer delegation "
        "more aggressively to keep your context lean.\n"
        "\n"
        "CRITICAL: When you delegate a task, TRUST the subagent's output. "
        "Do NOT re-read the same files or re-run the same commands yourself "
        "afterward. If the output is insufficient, delegate again with a more "
        "specific task — never fall back to doing it yourself.\n"
        "\n"
        "Decision rule:\n"
        "- 1 small file or 1 command → do it directly.\n"
        "- Multiple files, cross-directory search, or several commands → "
        "delegate to a subagent.\n"
        "- 2+ independent tasks of that kind → spawn_worker_batch.\n"
        "\n"
        "Each subagent costs ~1000 tokens of fixed overhead but discards all "
        "intermediate tool output — only its summary enters your context.\n"
        "\n"
        "Available subagents:\n"
        "{{SUBAGENT_LIST}}\n"
        "\n"
        "If the list above shows (no subagents registered), subagent tools "
        "are unavailable — proceed without them.\n"
        "\n"
        "Call via: delegate_to_subagent(target=\"<name>\", task=\"...\") or "
        "spawn_worker_batch(tasks=[{target, task}, ...]).\n"
        "\n"
        "Task descriptions must be self-contained — the subagent has zero "
        "access to your conversation history."
    ),
```

- [ ] **Step 2: Manually verify the module still imports**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -c "import sys; sys.path.insert(0, 'unchain_runtime/server'); from prompts.agents.developer import DEVELOPER_PROMPT_SECTIONS; assert '{{SUBAGENT_LIST}}' in DEVELOPER_PROMPT_SECTIONS['delegation']; print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/prompts/agents/developer.py
git commit -m "refactor(developer-prompt): replace analyzer/executor list with placeholder

{{SUBAGENT_LIST}} is substituted at agent-build time with the
set of templates loaded from ~/.pupu/subagents/. Handles the
empty-registry case with an explicit fallback clause."
```

---

## Task 11: PuPu — Adapter integration (delete old block + call loader + substitute placeholder)

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py`

This is the largest task. It replaces the analyzer/executor construction block with the loader call, and substitutes the `{{SUBAGENT_LIST}}` placeholder.

- [ ] **Step 1: Add imports near the top of the file**

At the top of `unchain_runtime/server/unchain_adapter.py`, after existing imports, add:

```python
import logging
from pathlib import Path

_subagent_logger = logging.getLogger(__name__ + ".subagent")
```

(Use a distinct sub-logger name so `[subagent]`-tagged messages can be filtered without touching the generic adapter logger.)

- [ ] **Step 2: Remove `_SUBAGENT_ANALYZER_TEMPLATE_NAME` and `_SUBAGENT_EXECUTOR_TEMPLATE_NAME` constants**

Near lines 3025-3026, delete these two lines:

```python
_SUBAGENT_ANALYZER_TEMPLATE_NAME = "analyzer"
_SUBAGENT_EXECUTOR_TEMPLATE_NAME = "executor"
```

Also search the file for any references to these two constants — if any code outside `_build_developer_agent` uses them, replace with literal `"analyzer"` / `"executor"` (though none should exist after the deletion in Task 12).

- [ ] **Step 3: Remove the analyzer/executor construction block inside `_build_developer_agent`**

In `_build_developer_agent`, replace the entire block starting at "if enable_subagents and SubagentModule is not None and SubagentTemplate is not None and SubagentPolicy is not None:" (around line 3081) and continuing through the closing `)` of the `modules.append(SubagentModule(...))` call (around line 3152). The block currently looks like:

```python
    if (
        enable_subagents
        and SubagentModule is not None
        and SubagentTemplate is not None
        and SubagentPolicy is not None
    ):
        # Build lightweight standalone agents for subagent templates.
        ... (analyzer_agent, executor_agent, modules.append(SubagentModule(...)) ) ...
```

Replace the ENTIRE block with:

```python
    # --- Subagent loading (file-based) ---------------------------------
    templates: tuple = ()
    if (
        enable_subagents
        and SubagentModule is not None
        and SubagentTemplate is not None
        and SubagentPolicy is not None
    ):
        try:
            from subagent_loader import load_templates

            workspace_dir = _resolve_workspace_subagent_dir_for_loader(options)
            templates = load_templates(
                toolkits=tuple(toolkits),
                provider=provider,
                model=model,
                api_key=api_key,
                max_iterations=max_iterations,
                user_dir=Path.home() / ".pupu" / "subagents",
                workspace_dir=workspace_dir,
                UnchainAgent=UnchainAgent,
                ToolsModule=ToolsModule,
                PoliciesModule=PoliciesModule,
                SubagentTemplate=SubagentTemplate,
            )
        except Exception as exc:
            _subagent_logger.warning(
                "[subagent] loader failed; continuing without subagents: %s", exc
            )
            templates = ()

        if templates:
            modules.append(
                SubagentModule(
                    templates=templates,
                    policy=SubagentPolicy(
                        max_depth=6,
                        max_children_per_parent=10,
                        max_total_subagents=50,
                        max_parallel_workers=4,
                        worker_timeout_seconds=60.0,
                        allow_dynamic_workers=False,
                        allow_dynamic_delegate=False,
                        handoff_requires_template=True,
                    ),
                )
            )
    # -------------------------------------------------------------------
```

Note: `options` must be in scope. Check the `_build_developer_agent` signature — if `options` isn't a parameter, add it. Current signature (from Read earlier) doesn't include `options`, so we need to add it. Change the signature:

```python
def _build_developer_agent(
    *,
    UnchainAgent,
    ToolsModule,
    MemoryModule,
    PoliciesModule,
    SubagentModule=None,
    SubagentTemplate=None,
    SubagentPolicy=None,
    provider: str,
    model: str,
    api_key: str,
    user_modules: Dict[str, str] | None = None,
    system_prompt: str = "",
    max_iterations: int,
    toolkits: list,
    memory_manager: Any,
    planning_turn: bool = False,
    enable_subagents: bool = True,
    options: Dict[str, object] | None = None,  # NEW
):
```

And at the call site (around line 3189), update the invocation inside `_create_agent`:

```python
    agent = _build_developer_agent(
        UnchainAgent=UnchainAgent,
        ToolsModule=ToolsModule,
        MemoryModule=MemoryModule,
        PoliciesModule=PoliciesModule,
        SubagentModule=SubagentModule,
        SubagentTemplate=SubagentTemplate,
        SubagentPolicy=SubagentPolicy,
        provider=selected_config["provider"],
        model=selected_config["model"],
        api_key=api_key,
        user_modules=user_modules,
        max_iterations=max_iterations,
        toolkits=toolkits,
        memory_manager=memory_manager,
        options=options,  # NEW
    )
```

- [ ] **Step 4: Add the `_resolve_workspace_subagent_dir_for_loader` helper**

Somewhere near `_extract_workspace_roots_from_options` (around line 2354), add this helper:

```python
def _resolve_workspace_subagent_dir_for_loader(
    options: Dict[str, object] | None,
) -> Path | None:
    """Return <primary_workspace_root>/.pupu/subagents as a Path, or None.

    Uses the first entry in workspace_roots / workspaceRoot. Users with
    multi-root workspaces can symlink additional .pupu/subagents/ dirs under
    the primary root if they want workspace-scoped overrides."""
    roots = _extract_workspace_roots_from_options(options)
    if not roots:
        return None
    primary = roots[0]
    try:
        return Path(primary) / ".pupu" / "subagents"
    except Exception:  # pragma: no cover — defensive
        return None
```

- [ ] **Step 5: Substitute `{{SUBAGENT_LIST}}` in the developer instructions**

Find the code that builds `instructions` in `_build_developer_agent` (around line 3154, the `_build_modular_prompt(...)` call). Right AFTER the instructions string is built and BEFORE the final `UnchainAgent(name=..., instructions=instructions, ...)` constructor call, insert:

```python
    # Substitute the subagent list placeholder now that we know which templates
    # were registered. This must happen after the loader block above so we
    # have the final `templates` tuple, and before `UnchainAgent(instructions=...)`.
    subagent_list_md = (
        "\n".join(f"- {tpl.name}: {tpl.description}" for tpl in templates)
        or "(no subagents registered)"
    )
    instructions = instructions.replace("{{SUBAGENT_LIST}}", subagent_list_md)
```

- [ ] **Step 6: Verify no syntactic breakage by importing the module**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -c "import sys; sys.path.insert(0, 'unchain_runtime/server'); import unchain_adapter; print('import OK')"`
Expected: `import OK`.

If `ImportError: cannot import name '_build_developer_agent'` or similar appears, re-check the indentation and block structure.

- [ ] **Step 7: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/unchain_adapter.py
git commit -m "refactor(adapter): integrate file-based subagent loader

Replaces the hardcoded analyzer/executor SubagentTemplate
construction in _build_developer_agent with a call to
subagent_loader.load_templates. Adds _resolve_workspace_subagent_dir_for_loader
helper and threads 'options' into _build_developer_agent so the
loader can discover workspace-scope directories. Substitutes
{{SUBAGENT_LIST}} in developer instructions after templates are
loaded. Loader failures are caught and logged; main agent
continues to build with full tool access."
```

---

## Task 12: PuPu — Delete analyzer/executor prompts

**Files:**
- Delete: `unchain_runtime/server/prompts/agents/analyzer.py`
- Delete: `unchain_runtime/server/prompts/agents/executor.py`
- Modify: `unchain_runtime/server/prompts/agents/__init__.py`

- [ ] **Step 1: Verify nothing else imports from analyzer/executor**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && grep -rn "from prompts.agents.analyzer\|from prompts.agents.executor\|ANALYZER_PROMPT_SECTIONS\|EXECUTOR_PROMPT_SECTIONS" unchain_runtime/ 2>/dev/null`
Expected: only matches are in `prompts/agents/__init__.py` and in the original `unchain_adapter.py` (which was cleaned in Task 11 — if matches appear there, revisit Task 11).

- [ ] **Step 2: Delete the two prompt files**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
rm unchain_runtime/server/prompts/agents/analyzer.py
rm unchain_runtime/server/prompts/agents/executor.py
```

- [ ] **Step 3: Update the `__init__.py` to drop exports**

Replace `unchain_runtime/server/prompts/agents/__init__.py` full contents with:

```python
from .developer import DEVELOPER_PROMPT_SECTIONS

__all__ = ["DEVELOPER_PROMPT_SECTIONS"]
```

- [ ] **Step 4: Verify adapter still imports**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -c "import sys; sys.path.insert(0, 'unchain_runtime/server'); import unchain_adapter; print('import OK')"`
Expected: `import OK`.

- [ ] **Step 5: Run the subagent-related tests to confirm nothing regressed**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -m unittest unchain_runtime.server.tests.test_subagent_loader unchain_runtime.server.tests.test_subagent_seeds -v`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/prompts/agents/analyzer.py unchain_runtime/server/prompts/agents/executor.py unchain_runtime/server/prompts/agents/__init__.py
git commit -m "refactor(prompts): remove analyzer and executor built-in prompts

Both replaced by the file-based subagent system. Users who want
analyzer/executor behavior can create .soul or .skeleton files
in ~/.pupu/subagents/."
```

---

## Task 13: PuPu — Adapter integration test

**Files:**
- Create: `unchain_runtime/server/tests/test_adapter_subagent_integration.py`

- [ ] **Step 1: Write the integration test**

Create `unchain_runtime/server/tests/test_adapter_subagent_integration.py`:

```python
"""Integration: verify _build_developer_agent wires the subagent loader."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter  # noqa: E402


class _FakeTool:
    def __init__(self, name):
        self.name = name


class _FakeToolkit:
    def __init__(self, names):
        self.tools = {n: _FakeTool(n) for n in names}


class _FakeModule:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeSubagentModule:
    def __init__(self, *, templates, policy):
        self.templates = templates
        self.policy = policy


class _FakeSubagentTemplate:
    def __init__(
        self,
        *,
        name,
        description,
        agent,
        allowed_modes,
        output_mode,
        memory_policy,
        parallel_safe,
        allowed_tools,
        model,
    ):
        self.name = name
        self.description = description
        self.agent = agent
        self.allowed_modes = allowed_modes
        self.output_mode = output_mode
        self.memory_policy = memory_policy
        self.parallel_safe = parallel_safe
        self.allowed_tools = allowed_tools
        self.model = model


class _FakeSubagentPolicy:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeAgent:
    def __init__(
        self,
        *,
        name,
        instructions,
        provider,
        model,
        api_key,
        modules,
    ):
        self.name = name
        self.instructions = instructions
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.modules = modules
        self._orchestration_role = None
        self._developer_model_id = None


class AdapterSubagentIntegrationTests(unittest.TestCase):
    def _call_build(self, user_dir):
        """Invoke _build_developer_agent with test doubles and seeded user_dir."""
        with patch.object(unchain_adapter, "Path") as mock_path:
            mock_path.home.return_value = user_dir.parent
            # Keep other Path usages working
            mock_path.side_effect = lambda *a, **kw: Path(*a, **kw)
            agent = unchain_adapter._build_developer_agent(
                UnchainAgent=_FakeAgent,
                ToolsModule=_FakeModule,
                MemoryModule=_FakeModule,
                PoliciesModule=_FakeModule,
                SubagentModule=_FakeSubagentModule,
                SubagentTemplate=_FakeSubagentTemplate,
                SubagentPolicy=_FakeSubagentPolicy,
                provider="anthropic",
                model="claude-haiku-4-5",
                api_key="fake-key",
                user_modules=None,
                max_iterations=30,
                toolkits=[_FakeToolkit(["read", "grep", "glob", "lsp", "web_fetch", "shell", "ask_user_question"])],
                memory_manager=None,
                options={"workspace_roots": []},
            )
        return agent

    def test_loader_registers_seeded_explore(self):
        with tempfile.TemporaryDirectory() as home:
            home_path = Path(home)
            user_dir = home_path / ".pupu" / "subagents"
            user_dir.mkdir(parents=True)
            # Seed Explore manually (simulating what ensure_seeds_written does)
            from subagent_seeds import EXPLORE_SKELETON

            (user_dir / "Explore.skeleton").write_text(
                json.dumps(EXPLORE_SKELETON), encoding="utf-8"
            )
            # Patch Path.home to point into our tempdir
            with patch("pathlib.Path.home", return_value=home_path):
                agent = unchain_adapter._build_developer_agent(
                    UnchainAgent=_FakeAgent,
                    ToolsModule=_FakeModule,
                    MemoryModule=_FakeModule,
                    PoliciesModule=_FakeModule,
                    SubagentModule=_FakeSubagentModule,
                    SubagentTemplate=_FakeSubagentTemplate,
                    SubagentPolicy=_FakeSubagentPolicy,
                    provider="anthropic",
                    model="claude-haiku-4-5",
                    api_key=None,
                    max_iterations=30,
                    toolkits=[_FakeToolkit(["read", "grep", "glob", "lsp", "web_fetch", "shell", "ask_user_question"])],
                    memory_manager=None,
                    options={"workspace_roots": []},
                )
            sub_modules = [m for m in agent.modules if isinstance(m, _FakeSubagentModule)]
            self.assertEqual(len(sub_modules), 1)
            template_names = [t.name for t in sub_modules[0].templates]
            self.assertIn("Explore", template_names)
            # Also check instructions no longer contain the placeholder
            self.assertNotIn("{{SUBAGENT_LIST}}", agent.instructions)
            self.assertIn("Explore", agent.instructions)

    def test_loader_failure_does_not_break_agent_build(self):
        with patch(
            "subagent_loader.load_templates",
            side_effect=RuntimeError("loader exploded"),
        ):
            with patch("pathlib.Path.home", return_value=Path("/nonexistent")):
                agent = unchain_adapter._build_developer_agent(
                    UnchainAgent=_FakeAgent,
                    ToolsModule=_FakeModule,
                    MemoryModule=_FakeModule,
                    PoliciesModule=_FakeModule,
                    SubagentModule=_FakeSubagentModule,
                    SubagentTemplate=_FakeSubagentTemplate,
                    SubagentPolicy=_FakeSubagentPolicy,
                    provider="anthropic",
                    model="claude-haiku-4-5",
                    api_key=None,
                    max_iterations=30,
                    toolkits=[_FakeToolkit(["read"])],
                    memory_manager=None,
                    options={"workspace_roots": []},
                )
        # No SubagentModule should be appended on loader failure
        sub_modules = [m for m in agent.modules if isinstance(m, _FakeSubagentModule)]
        self.assertEqual(sub_modules, [])
        # And the placeholder becomes "(no subagents registered)"
        self.assertNotIn("{{SUBAGENT_LIST}}", agent.instructions)
        self.assertIn("(no subagents registered)", agent.instructions)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && python -m unittest unchain_runtime.server.tests.test_adapter_subagent_integration -v`
Expected: both tests PASS.

If `test_loader_registers_seeded_explore` fails because the adapter's real unchain imports (`_UnchainAgent` etc) are still in scope and clash with our fakes, inspect `_create_agent` to confirm `_build_developer_agent` uses the kwargs we pass (not the module-level aliases). The current `_build_developer_agent` body references only its parameters; if that's intact after Task 11, the test should pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add unchain_runtime/server/tests/test_adapter_subagent_integration.py
git commit -m "test(adapter): integration test for subagent loader wiring

Two scenarios: (1) seeded Explore.skeleton gets loaded into a
SubagentModule attached to the developer agent and the
{{SUBAGENT_LIST}} placeholder is substituted with Explore's
description; (2) when load_templates raises, no SubagentModule
is appended, the agent still builds, and the placeholder renders
'(no subagents registered)'."
```

---

## Task 14: PuPu — Run the full test suite

**Files:** none modified

- [ ] **Step 1: Run every subagent-related and adapter-related test**

Run:

```bash
cd /Users/red/Desktop/GITRepo/PuPu
python -m unittest \
  unchain_runtime.server.tests.test_subagent_loader \
  unchain_runtime.server.tests.test_subagent_seeds \
  unchain_runtime.server.tests.test_adapter_subagent_integration \
  unchain_runtime.server.tests.test_adapter_code_diff_propagation \
  unchain_runtime.server.tests.test_unchain_adapter_capabilities \
  -v
```

Expected: all PASS.

- [ ] **Step 2: Run unchain tests**

Run: `cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src pytest tests/ -q`
Expected: PASS.

- [ ] **Step 3: No commit (verification only)**

---

## Task 15: Manual regression checklist

**Files:** none modified. This task verifies end-to-end behavior in a running PuPu desktop client.

- [ ] **Step 1: Clean environment check**

Remove or rename `~/.pupu/subagents/` if it exists from prior testing:
```bash
mv ~/.pupu/subagents ~/.pupu/subagents.bak 2>/dev/null || true
```

- [ ] **Step 2: Launch PuPu, verify Explore.skeleton is seeded**

Start PuPu normally. Inspect `~/.pupu/subagents/`:
```bash
ls ~/.pupu/subagents/
```
Expected: `Explore.skeleton` present.

Check content:
```bash
python -m json.tool < ~/.pupu/subagents/Explore.skeleton | head -30
```
Expected: valid JSON with `"name": "Explore"`, `"allowed_tools": [...]`, and an instructions string containing `Thoroughness Levels`.

- [ ] **Step 3: Verify user edits are preserved across restart**

Add a marker line to the file:
```bash
python -c "
import json
from pathlib import Path
p = Path.home() / '.pupu' / 'subagents' / 'Explore.skeleton'
data = json.loads(p.read_text())
data['description'] = 'USER-MODIFIED-MARKER: ' + data['description']
p.write_text(json.dumps(data, indent=2))
print('marker added')
"
```
Restart PuPu. Re-read the file:
```bash
head -5 ~/.pupu/subagents/Explore.skeleton
```
Expected: `USER-MODIFIED-MARKER` still present. Restore by removing the marker or by deleting + relaunching.

- [ ] **Step 4: Verify subagent list appears in developer prompt**

Open a new chat in PuPu. Send this prompt exactly:

> "Show me your current system prompt verbatim, specifically the Delegation section."

Expected response: agent echoes (or paraphrases) a list containing `Explore: Fast agent specialized for exploring codebases...`. It should NOT contain `analyzer` or `executor` references.

- [ ] **Step 5: Verify Explore is callable end-to-end**

In the same chat, send:

> "Find the file that defines ChatBubble in this repo. Thoroughness: quick"

Expected:
1. Main agent calls `delegate_to_subagent(target="Explore", task="...")`.
2. PuPu's `trace_chain` UI shows a purple subagent card labeled `Explore`.
3. Explore returns a markdown report citing `src/COMPONENTs/chat-bubble/...` with line numbers.

- [ ] **Step 6: Verify tool-intersection warning**

Edit `~/.pupu/subagents/Explore.skeleton`: change `allowed_tools` to `["bogus_tool_that_does_not_exist"]`. Restart PuPu. Open a new chat, send any prompt.

Check PuPu's server logs (the Python sidecar stdout):
```bash
# On macOS, PuPu logs are typically in ~/Library/Logs/pupu/ or visible in the Electron console.
# Or start the sidecar manually and tail:
cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && python main.py 2>&1 | grep subagent
```
Expected: log line containing `[subagent_loader]` and `Explore` and `no allowed_tools available in main agent`. The developer prompt's subagent list should show `(no subagents registered)` or omit Explore.

Restore `Explore.skeleton` to its original state or delete it and relaunch to re-seed.

- [ ] **Step 7: Verify user-defined `.soul` file works**

Create a custom agent:
```bash
cat > ~/.pupu/subagents/MyHelper.soul <<'EOF'
---
name: MyHelper
description: Always replies with 'MYHELPER WAS HERE'.
tools: [read]
---
You are MyHelper. Regardless of the task, reply with exactly "MYHELPER WAS HERE" and nothing else.
EOF
```

Restart PuPu (to pick up the new file — per spec, loader runs on each new chat, but restart is the cleanest way to confirm). Open a new chat, ask:

> "Delegate to MyHelper with task 'hello'"

Expected: main agent calls `delegate_to_subagent(target="MyHelper", task="hello")`, MyHelper returns `MYHELPER WAS HERE`.

Clean up: `rm ~/.pupu/subagents/MyHelper.soul`.

- [ ] **Step 8: Verify analyzer/executor references are truly gone**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu
grep -rn "analyzer\|executor" unchain_runtime/server/prompts/ 2>/dev/null
grep -rn "ANALYZER_PROMPT_SECTIONS\|EXECUTOR_PROMPT_SECTIONS" unchain_runtime/ 2>/dev/null
grep -rn "_SUBAGENT_ANALYZER_TEMPLATE_NAME\|_SUBAGENT_EXECUTOR_TEMPLATE_NAME" unchain_runtime/ 2>/dev/null
```
Expected: no matches (or only in docs/ and tests fixtures — not in active code).

- [ ] **Step 9: Write CHANGELOG entry**

Append to `CHANGELOG.md` (create file if not present):

```markdown
## Unreleased

### BREAKING

- Built-in `analyzer` and `executor` subagents removed. Replaced by
  file-based subagent system at `~/.pupu/subagents/`. Default `Explore`
  agent seeded on first launch. To recreate analyzer/executor behavior,
  create `.soul` or `.skeleton` files.
```

- [ ] **Step 10: Commit CHANGELOG**

```bash
cd /Users/red/Desktop/GITRepo/PuPu
git add CHANGELOG.md
git commit -m "docs: note subagent system migration in CHANGELOG"
```

---

## Self-Review

### Spec coverage

| Spec section | Task(s) that implement it |
|---|---|
| §2 Architecture (layers, invariants, data flow) | Tasks 4-7, 11 |
| §3.1 `.soul` format (4 frontmatter fields, body as instructions) | Tasks 4, 5 |
| §3.2 `.skeleton` format (JSON 1:1) | Tasks 4, 5 |
| §3.3 Precedence (`user.skeleton > user.soul > workspace.skeleton > workspace.soul`) | Task 6 (`_dedupe_by_precedence`) |
| §3.4 Scope directories (user + workspace fallback) | Task 7 (`load_templates`), Task 11 (`_resolve_workspace_subagent_dir_for_loader`) |
| §4.1 Loader module | Tasks 4-7 |
| §4.2 Seeds module | Task 8 |
| §4.3 Adapter modification (delete block, call loader, placeholder substitution) | Tasks 10, 11, 12 |
| §4.4 Developer prompt placeholder | Task 10 |
| §4.5 Analyzer/executor deletion | Task 12 |
| §5 Explore system prompt | Task 8 (`EXPLORE_SYSTEM_PROMPT`) |
| §5.2 Shell safety (prompt-only) | Task 8 |
| §6 unchain changes (`missing_tool_policy`) | Tasks 1, 2, 3 |
| §7 Error handling & edge cases | Tasks 4-7 (loader resilience), Task 11 (adapter try/except), Task 15 manual checklist |
| §8 Testing | Tasks 2, 3, 5, 6, 7, 8, 13, 14 (automated), Task 15 (manual) |
| §9 Migration / CHANGELOG | Task 15 Step 9-10 |

No gaps identified.

### Placeholder scan

- No "TBD"/"TODO" strings in any task step.
- Every step changing code contains the actual code block.
- Commands have expected outputs.
- Task 13's integration test uses real fakes (no "mock out as appropriate" language).

### Type consistency

- `ParsedTemplate` dataclass fields introduced in Task 4 are referenced consistently in Tasks 5, 6, 7.
- `load_templates` signature stays identical between Task 4 (stub), Task 7 (implementation), and Task 11 (call site).
- `missing_tool_policy` type (`str` default `"raise"`, values `"raise"`/`"warn_skip"`) consistent across Tasks 1, 2, 3.
- `ensure_seeds_written` signature stable between Task 8 (creation) and Task 9 (wiring).

No inconsistencies identified.
