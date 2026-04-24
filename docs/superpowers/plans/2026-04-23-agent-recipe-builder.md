# Agent Recipe Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named "Agent Recipes" to PuPu — user-composable bundles of agent prompt + toolkits + subagents — editable via a Hub-and-Spoke Builder inside `AgentsModal`'s "Agents" tab, selectable at chat time.

**Architecture:** Recipes persist as JSON in `~/.pupu/agent_recipes/<Name>.recipe`. Backend adds `recipe_loader.py` + `recipe_seeds.py` + Flask routes; `_build_developer_agent` gains a `recipe` parameter that filters toolkits and materializes subagents per recipe. Frontend replaces the "Agents" coming-soon with a `FlowEditor`-based Builder (Agent / Toolkit / Subagent Pool nodes + Inspector). Chat input gains a 4th selector that injects `recipe_name` into stream payloads.

**Tech Stack:** Python 3 (Flask, dataclasses) + React 19 (no TS, inline styles, custom FlowEditor) + Electron 40 IPC bridge.

**Spec:** `docs/superpowers/specs/2026-04-23-agent-recipe-builder-design.md`

---

## File Structure

### Backend (`unchain_runtime/server/`)
- **Create** `recipe.py` — `Recipe`, `ToolkitRef`, `SubagentRef`, `InlineSubagent`, `RecipeAgent` dataclasses + `parse_recipe_json(data) -> Recipe`
- **Create** `recipe_loader.py` — `recipes_dir()`, `list_recipes()`, `load_recipe(name)`, `save_recipe(recipe)`, `delete_recipe(name)`, `list_subagent_refs()`
- **Create** `recipe_seeds.py` — `ensure_recipe_seeds_written(dir)` + `DEFAULT_RECIPE` constant
- **Create** `route_recipes.py` — Flask blueprint with GET/POST/DELETE routes + subagent_refs endpoint
- **Modify** `main.py` — call `ensure_recipe_seeds_written()` at startup
- **Modify** `routes.py` — import `route_recipes` blueprint
- **Modify** `unchain_adapter.py` — add `_apply_recipe_toolkit_filter`, `_materialize_recipe_subagents`, extend `_build_developer_agent(recipe=None)`, wire `_create_agent` to load recipe
- **Create tests** `tests/test_recipe.py`, `tests/test_recipe_loader.py`, `tests/test_recipe_seeds.py`, `tests/test_route_recipes.py`; extend `tests/test_unchain_adapter_capabilities.py`

### Electron bridge (`electron/`)
- **Modify** `shared/channels.js` — add `LIST_RECIPES`, `GET_RECIPE`, `SAVE_RECIPE`, `DELETE_RECIPE`, `LIST_SUBAGENT_REFS`
- **Modify** `preload/bridges/unchain_bridge.js` — expose 5 methods
- **Modify** `main/ipc/register_handlers.js` — register 5 handlers
- **Modify** `main/services/unchain/service.js` — 5 HTTP relay methods

### Frontend (`src/`)
- **Modify** `SERVICEs/api.unchain.js` — 5 recipe methods
- **Modify** `COMPONENTs/agents/agents_modal.js` — replace "Agents" coming-soon with `<RecipesPage>`
- **Create** `COMPONENTs/agents/pages/recipes_page.js` — top layout (list + canvas + inspector)
- **Create** `COMPONENTs/agents/pages/recipes_page/recipe_list.js` — left sidebar
- **Create** `COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` — FlowEditor with rules
- **Create** `COMPONENTs/agents/pages/recipes_page/nodes/{agent_node,toolkit_node,subagent_pool_node}.js`
- **Create** `COMPONENTs/agents/pages/recipes_page/inspectors/{agent,toolkit,pool,subagent}_inspector.js`
- **Create** `COMPONENTs/agents/pages/recipes_page/subagent_picker.js`
- **Modify** `COMPONENTs/chat-input/components/attach_panel.js` — 4th Agents selector
- **Modify** `PAGEs/chat/hooks/use_chat_stream.js` — inject `recipe_name` into payload

---

## Task 1: Recipe dataclass + parser

**Files:**
- Create: `unchain_runtime/server/recipe.py`
- Test: `unchain_runtime/server/tests/test_recipe.py`

- [ ] **Step 1: Write failing tests**

```python
# unchain_runtime/server/tests/test_recipe.py
import unittest
from recipe import parse_recipe_json, RecipeValidationError


class ParseRecipeTests(unittest.TestCase):
    def _minimal(self):
        return {
            "name": "Coder",
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "You are..."},
            "toolkits": [],
            "subagent_pool": [],
        }

    def test_parses_minimal_recipe(self):
        recipe = parse_recipe_json(self._minimal())
        self.assertEqual(recipe.name, "Coder")
        self.assertIsNone(recipe.model)
        self.assertEqual(recipe.agent.prompt_format, "soul")
        self.assertEqual(recipe.toolkits, ())
        self.assertEqual(recipe.subagent_pool, ())

    def test_parses_toolkit_ref_with_enabled_tools(self):
        data = self._minimal()
        data["toolkits"] = [
            {"id": "core", "enabled_tools": None},
            {"id": "workspace", "enabled_tools": ["read", "grep"]},
        ]
        recipe = parse_recipe_json(data)
        self.assertIsNone(recipe.toolkits[0].enabled_tools)
        self.assertEqual(recipe.toolkits[1].enabled_tools, ("read", "grep"))

    def test_parses_subagent_ref(self):
        data = self._minimal()
        data["subagent_pool"] = [
            {"kind": "ref", "template_name": "Explore", "disabled_tools": ["shell"]}
        ]
        recipe = parse_recipe_json(data)
        entry = recipe.subagent_pool[0]
        self.assertEqual(entry.kind, "ref")
        self.assertEqual(entry.template_name, "Explore")
        self.assertEqual(entry.disabled_tools, ("shell",))

    def test_parses_inline_subagent(self):
        data = self._minimal()
        data["subagent_pool"] = [
            {
                "kind": "inline",
                "name": "Reviewer",
                "prompt_format": "skeleton",
                "template": {
                    "name": "Reviewer",
                    "description": "Reviews code",
                    "instructions": "Review carefully.",
                },
                "disabled_tools": [],
            }
        ]
        recipe = parse_recipe_json(data)
        entry = recipe.subagent_pool[0]
        self.assertEqual(entry.kind, "inline")
        self.assertEqual(entry.name, "Reviewer")
        self.assertEqual(entry.prompt_format, "skeleton")

    def test_rejects_invalid_name(self):
        data = self._minimal()
        data["name"] = "no/slashes"
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_missing_agent(self):
        data = self._minimal()
        del data["agent"]
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_unknown_prompt_format(self):
        data = self._minimal()
        data["agent"]["prompt_format"] = "xml"
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_unknown_subagent_kind(self):
        data = self._minimal()
        data["subagent_pool"] = [{"kind": "magic"}]
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe.py -v`
Expected: FAIL with "No module named 'recipe'"

- [ ] **Step 3: Implement `recipe.py`**

```python
# unchain_runtime/server/recipe.py
"""Recipe dataclasses + JSON parser for PuPu Agent Recipe system.

A Recipe is a named, user-composable agent configuration persisted as JSON
under ~/.pupu/agent_recipes/<Name>.recipe.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_\- ]{1,64}$")
_VALID_PROMPT_FORMATS = ("soul", "skeleton")
_VALID_SUBAGENT_KINDS = ("ref", "inline")

# Special sentinel: when agent.prompt equals this string, the adapter uses the
# built-in _DEVELOPER_PROMPT_SECTIONS instead of the literal prompt value.
BUILTIN_DEVELOPER_PROMPT_SENTINEL = "{{USE_BUILTIN_DEVELOPER_PROMPT}}"


class RecipeValidationError(ValueError):
    """Raised when JSON does not conform to the Recipe schema."""


@dataclass(frozen=True)
class RecipeAgent:
    prompt_format: Literal["soul", "skeleton"]
    prompt: str


@dataclass(frozen=True)
class ToolkitRef:
    id: str
    enabled_tools: tuple[str, ...] | None  # None = all tools enabled


@dataclass(frozen=True)
class SubagentRef:
    kind: Literal["ref"]
    template_name: str
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class InlineSubagent:
    kind: Literal["inline"]
    name: str
    prompt_format: Literal["soul", "skeleton"]
    template: dict  # raw SubagentTemplate-shaped dict
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class Recipe:
    name: str
    description: str
    model: str | None
    max_iterations: int | None
    agent: RecipeAgent
    toolkits: tuple[ToolkitRef, ...]
    subagent_pool: tuple[SubagentRef | InlineSubagent, ...]


def is_valid_recipe_name(name: str) -> bool:
    return isinstance(name, str) and bool(_NAME_PATTERN.match(name))


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise RecipeValidationError(msg)


def _as_str_tuple(value: Any, field: str) -> tuple[str, ...]:
    _require(isinstance(value, list), f"{field} must be a list")
    result: list[str] = []
    for item in value:
        _require(isinstance(item, str), f"{field}[] entries must be strings")
        result.append(item)
    return tuple(result)


def _parse_agent(data: Any) -> RecipeAgent:
    _require(isinstance(data, dict), "agent must be an object")
    prompt_format = data.get("prompt_format")
    _require(
        prompt_format in _VALID_PROMPT_FORMATS,
        f"agent.prompt_format must be one of {_VALID_PROMPT_FORMATS}",
    )
    prompt = data.get("prompt", "")
    _require(isinstance(prompt, str), "agent.prompt must be a string")
    return RecipeAgent(prompt_format=prompt_format, prompt=prompt)


def _parse_toolkit_ref(data: Any) -> ToolkitRef:
    _require(isinstance(data, dict), "toolkits[] entry must be an object")
    tid = data.get("id")
    _require(isinstance(tid, str) and tid, "toolkits[].id must be a non-empty string")
    enabled = data.get("enabled_tools", None)
    if enabled is None:
        return ToolkitRef(id=tid, enabled_tools=None)
    return ToolkitRef(id=tid, enabled_tools=_as_str_tuple(enabled, f"toolkits[{tid}].enabled_tools"))


def _parse_subagent_entry(data: Any) -> SubagentRef | InlineSubagent:
    _require(isinstance(data, dict), "subagent_pool[] entry must be an object")
    kind = data.get("kind")
    _require(kind in _VALID_SUBAGENT_KINDS, f"subagent_pool[].kind must be one of {_VALID_SUBAGENT_KINDS}")
    disabled = _as_str_tuple(data.get("disabled_tools", []), "subagent_pool[].disabled_tools")
    if kind == "ref":
        tname = data.get("template_name")
        _require(isinstance(tname, str) and tname, "ref subagent requires template_name")
        return SubagentRef(kind="ref", template_name=tname, disabled_tools=disabled)
    # inline
    name = data.get("name")
    _require(isinstance(name, str) and name, "inline subagent requires name")
    pformat = data.get("prompt_format")
    _require(pformat in _VALID_PROMPT_FORMATS, "inline.prompt_format must be soul or skeleton")
    template = data.get("template")
    _require(isinstance(template, dict), "inline.template must be an object")
    return InlineSubagent(
        kind="inline",
        name=name,
        prompt_format=pformat,
        template=template,
        disabled_tools=disabled,
    )


def parse_recipe_json(data: Any) -> Recipe:
    """Parse a JSON-decoded dict into a Recipe. Raises RecipeValidationError on any violation."""
    _require(isinstance(data, dict), "recipe root must be an object")
    name = data.get("name")
    _require(is_valid_recipe_name(name), f"recipe name invalid: {name!r}")

    description = data.get("description", "")
    _require(isinstance(description, str), "description must be a string")

    model = data.get("model", None)
    _require(model is None or isinstance(model, str), "model must be a string or null")

    max_iter = data.get("max_iterations", None)
    if max_iter is not None:
        _require(isinstance(max_iter, int) and max_iter > 0, "max_iterations must be positive int or null")

    agent = _parse_agent(data.get("agent"))

    toolkits_raw = data.get("toolkits", [])
    _require(isinstance(toolkits_raw, list), "toolkits must be a list")
    toolkits = tuple(_parse_toolkit_ref(tk) for tk in toolkits_raw)

    pool_raw = data.get("subagent_pool", [])
    _require(isinstance(pool_raw, list), "subagent_pool must be a list")
    pool = tuple(_parse_subagent_entry(entry) for entry in pool_raw)

    return Recipe(
        name=name,
        description=description,
        model=model,
        max_iterations=max_iter,
        agent=agent,
        toolkits=toolkits,
        subagent_pool=pool,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Stop (do not commit — user's standing feedback "永远不要主动 commit")**

Leave changes in working tree for user to review.

---

## Task 2: Recipe loader (read operations)

**Files:**
- Create: `unchain_runtime/server/recipe_loader.py`
- Test: `unchain_runtime/server/tests/test_recipe_loader.py`

- [ ] **Step 1: Write failing tests**

```python
# unchain_runtime/server/tests/test_recipe_loader.py
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from recipe_loader import list_recipes, load_recipe, recipes_dir


class RecipesDirTests(unittest.TestCase):
    def test_uses_user_home(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(
                    recipes_dir(), Path(tmp) / ".pupu" / "agent_recipes"
                )


class ListRecipesTests(unittest.TestCase):
    def test_returns_empty_list_when_dir_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(list_recipes(), [])

    def test_lists_valid_recipes(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe_dir = Path(tmp) / ".pupu" / "agent_recipes"
            recipe_dir.mkdir(parents=True)
            (recipe_dir / "Coder.recipe").write_text(
                json.dumps({
                    "name": "Coder",
                    "description": "code",
                    "model": "anthropic:claude-sonnet-4-6",
                    "max_iterations": 30,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [{"id": "core", "enabled_tools": None}],
                    "subagent_pool": [],
                })
            )
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                recipes = list_recipes()
                self.assertEqual(len(recipes), 1)
                self.assertEqual(recipes[0]["name"], "Coder")
                self.assertEqual(recipes[0]["description"], "code")
                self.assertEqual(recipes[0]["model"], "anthropic:claude-sonnet-4-6")
                self.assertEqual(recipes[0]["toolkit_ids"], ["core"])
                self.assertEqual(recipes[0]["subagent_count"], 0)

    def test_skips_broken_recipes_with_warn(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe_dir = Path(tmp) / ".pupu" / "agent_recipes"
            recipe_dir.mkdir(parents=True)
            (recipe_dir / "Bad.recipe").write_text("{ not json")
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(list_recipes(), [])  # skipped silently


class LoadRecipeTests(unittest.TestCase):
    def test_returns_none_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertIsNone(load_recipe("Ghost"))

    def test_loads_valid_recipe(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe_dir = Path(tmp) / ".pupu" / "agent_recipes"
            recipe_dir.mkdir(parents=True)
            (recipe_dir / "Coder.recipe").write_text(
                json.dumps({
                    "name": "Coder",
                    "description": "",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "hi"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
            )
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                recipe = load_recipe("Coder")
                self.assertIsNotNone(recipe)
                self.assertEqual(recipe.name, "Coder")

    def test_returns_none_for_invalid_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertIsNone(load_recipe("bad/name"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe_loader.py -v`
Expected: FAIL with "No module named 'recipe_loader'"

- [ ] **Step 3: Implement `recipe_loader.py`**

```python
# unchain_runtime/server/recipe_loader.py
"""Loader for Agent Recipes under ~/.pupu/agent_recipes/.

Recipes live in files named <Name>.recipe with JSON content. Invalid files are
skipped with a warning — never raised — to keep the agent creation path robust.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from recipe import Recipe, RecipeValidationError, is_valid_recipe_name, parse_recipe_json

_logger = logging.getLogger(__name__)
_RECIPE_SUFFIX = ".recipe"


def recipes_dir() -> Path:
    """Return ~/.pupu/agent_recipes (not created)."""
    return Path.home() / ".pupu" / "agent_recipes"


def _read_recipe_file(path: Path) -> Recipe | None:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        return parse_recipe_json(data)
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, RecipeValidationError) as exc:
        _logger.warning("[recipe_loader] %s: parse failed — %s", path, exc)
        return None
    except OSError as exc:
        _logger.warning("[recipe_loader] %s: read failed — %s", path, exc)
        return None


def list_recipes() -> list[dict[str, Any]]:
    """Return lightweight summary records for all valid recipes in the user dir."""
    root = recipes_dir()
    if not root.is_dir():
        return []
    result: list[dict[str, Any]] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_file() or entry.suffix != _RECIPE_SUFFIX:
            continue
        recipe = _read_recipe_file(entry)
        if recipe is None:
            continue
        result.append({
            "name": recipe.name,
            "description": recipe.description,
            "model": recipe.model,
            "toolkit_ids": [tk.id for tk in recipe.toolkits],
            "subagent_count": len(recipe.subagent_pool),
        })
    return result


def load_recipe(name: str) -> Recipe | None:
    """Load a recipe by name. Returns None if missing, invalid, or name malformed."""
    if not is_valid_recipe_name(name):
        return None
    path = recipes_dir() / f"{name}{_RECIPE_SUFFIX}"
    return _read_recipe_file(path)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe_loader.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Stop (no commit)**

---

## Task 3: Recipe seeds (Default.recipe)

**Files:**
- Create: `unchain_runtime/server/recipe_seeds.py`
- Test: `unchain_runtime/server/tests/test_recipe_seeds.py`

- [ ] **Step 1: Write failing tests**

```python
# unchain_runtime/server/tests/test_recipe_seeds.py
import json
import tempfile
import unittest
from pathlib import Path

from recipe import parse_recipe_json
from recipe_seeds import ensure_recipe_seeds_written


class EnsureRecipeSeedsTests(unittest.TestCase):
    def test_creates_default_recipe_when_dir_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            default_path = target_dir / "Default.recipe"
            self.assertTrue(default_path.exists())

    def test_idempotent_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            target_dir.mkdir(parents=True)
            default_path = target_dir / "Default.recipe"
            default_path.write_text("{ user modified }")
            ensure_recipe_seeds_written(target_dir)
            self.assertEqual(default_path.read_text(), "{ user modified }")

    def test_respects_user_deletion(self):
        # Once seeded, if the user deletes Default.recipe we should NOT regenerate it.
        # This contract parallels subagent_seeds.ensure_seeds_written.
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            (target_dir / "Default.recipe").unlink()
            # By design seeds DO regenerate on re-call (user can delete to reset).
            # Spec: "Reset to Default" = delete file → next load_recipe triggers re-seed.
            ensure_recipe_seeds_written(target_dir)
            self.assertTrue((target_dir / "Default.recipe").exists())

    def test_default_recipe_parses_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            data = json.loads((target_dir / "Default.recipe").read_text())
            recipe = parse_recipe_json(data)
            self.assertEqual(recipe.name, "Default")
            self.assertEqual(
                recipe.agent.prompt,
                "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
            )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe_seeds.py -v`
Expected: FAIL with "No module named 'recipe_seeds'"

- [ ] **Step 3: Implement `recipe_seeds.py`**

```python
# unchain_runtime/server/recipe_seeds.py
"""Seed a Default.recipe file on first launch.

Idempotent: re-runs are no-ops if Default.recipe already exists. Users can
delete Default.recipe to force a re-seed on next call ("Reset to Default").
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

_logger = logging.getLogger(__name__)

DEFAULT_RECIPE: dict = {
    "name": "Default",
    "description": "PuPu 默认 agent 配置（复刻内置行为）",
    "model": None,
    "max_iterations": None,
    "agent": {
        "prompt_format": "skeleton",
        "prompt": "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
    },
    "toolkits": [
        {"id": "core", "enabled_tools": None},
        {"id": "workspace", "enabled_tools": None},
        {"id": "terminal", "enabled_tools": None},
    ],
    "subagent_pool": [
        {"kind": "ref", "template_name": "Explore", "disabled_tools": []},
    ],
}


def ensure_recipe_seeds_written(target_dir: Path) -> None:
    """Write Default.recipe if missing. Never overwrites user edits."""
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except (FileExistsError, OSError) as exc:
        _logger.warning("[recipe_seeds] cannot create %s: %s", target_dir, exc)
        return

    default_path = target_dir / "Default.recipe"
    if default_path.exists():
        return
    try:
        default_path.write_text(
            json.dumps(DEFAULT_RECIPE, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        _logger.warning("[recipe_seeds] write failed %s: %s", default_path, exc)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe_seeds.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Stop (no commit)**

---

## Task 4: Main.py startup wiring

**Files:**
- Modify: `unchain_runtime/server/main.py`

- [ ] **Step 1: Read current startup hook**

Read `unchain_runtime/server/main.py` lines 35-55 (around `subagent_seeds` invocation).

- [ ] **Step 2: Add recipe seed invocation immediately after subagent seed invocation**

Insert after the existing subagent_seeds `try/except` block (around line 46):

```python
try:
    from recipe_seeds import ensure_recipe_seeds_written
    from pathlib import Path
    ensure_recipe_seeds_written(Path.home() / ".pupu" / "agent_recipes")
except Exception as exc:
    import logging
    logging.getLogger(__name__).warning(
        "[recipe_seeds] seed-write failed: %s", exc
    )
```

- [ ] **Step 3: Smoke-test by importing main.py**

Run: `cd unchain_runtime/server && python -c "import main; print('ok')"`
Expected: output `ok` with no traceback. `~/.pupu/agent_recipes/Default.recipe` should now exist on the developer's machine — but do not assert that in a test (it depends on real HOME).

- [ ] **Step 4: Run full test suite to make sure nothing regressed**

Run: `cd unchain_runtime/server && python -m pytest tests/ -x --ignore=tests/test_adapter_subagent_integration.py -q`
Expected: All existing tests pass; 3 known-preexisting failures unrelated to this change may appear — ignore those.

- [ ] **Step 5: Stop (no commit)**

---

## Task 5: Recipe writer (save + delete + name validation)

**Files:**
- Modify: `unchain_runtime/server/recipe_loader.py`
- Test: append to `unchain_runtime/server/tests/test_recipe_loader.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_recipe_loader.py`:

```python
from recipe_loader import delete_recipe, save_recipe, list_subagent_refs


class SaveRecipeTests(unittest.TestCase):
    def _valid_dict(self, name="NewRecipe"):
        return {
            "name": name,
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "x"},
            "toolkits": [],
            "subagent_pool": [],
        }

    def test_save_writes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                save_recipe(self._valid_dict("MyAgent"))
                expected = Path(tmp) / ".pupu" / "agent_recipes" / "MyAgent.recipe"
                self.assertTrue(expected.exists())

    def test_save_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                save_recipe(self._valid_dict("Rt"))
                loaded = load_recipe("Rt")
                self.assertIsNotNone(loaded)
                self.assertEqual(loaded.name, "Rt")

    def test_save_rejects_invalid_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                with self.assertRaises(ValueError):
                    save_recipe(self._valid_dict("bad/name"))

    def test_save_rejects_invalid_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                bad = self._valid_dict("Valid")
                bad["agent"]["prompt_format"] = "xml"
                with self.assertRaises(ValueError):
                    save_recipe(bad)


class DeleteRecipeTests(unittest.TestCase):
    def test_delete_removes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                save_recipe({
                    "name": "Gone",
                    "description": "",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                delete_recipe("Gone")
                self.assertIsNone(load_recipe("Gone"))

    def test_delete_rejects_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                with self.assertRaises(ValueError):
                    delete_recipe("Default")

    def test_delete_missing_is_noop(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                delete_recipe("NotThere")  # no raise


class ListSubagentRefsTests(unittest.TestCase):
    def test_empty_when_dir_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(list_subagent_refs(), [])

    def test_lists_soul_and_skeleton(self):
        with tempfile.TemporaryDirectory() as tmp:
            sa_dir = Path(tmp) / ".pupu" / "subagents"
            sa_dir.mkdir(parents=True)
            (sa_dir / "Explore.skeleton").write_text(
                json.dumps({
                    "name": "Explore",
                    "description": "scout",
                    "instructions": "look",
                })
            )
            (sa_dir / "Reviewer.soul").write_text(
                "---\nname: Reviewer\ndescription: reviews\n---\nBody\n"
            )
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                refs = list_subagent_refs()
                names = {r["name"] for r in refs}
                self.assertEqual(names, {"Explore", "Reviewer"})
                formats = {r["name"]: r["format"] for r in refs}
                self.assertEqual(formats["Explore"], "skeleton")
                self.assertEqual(formats["Reviewer"], "soul")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe_loader.py -v`
Expected: FAIL with `ImportError` on save_recipe / delete_recipe / list_subagent_refs.

- [ ] **Step 3: Add implementations to `recipe_loader.py`**

Append to `recipe_loader.py`:

```python
from recipe import parse_recipe_json as _parse_recipe_json


def save_recipe(data: dict) -> None:
    """Validate and write a recipe dict to ~/.pupu/agent_recipes/<Name>.recipe.

    Raises ValueError (via RecipeValidationError) on invalid data.
    """
    recipe = _parse_recipe_json(data)  # raises RecipeValidationError on bad schema
    root = recipes_dir()
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{recipe.name}{_RECIPE_SUFFIX}"
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    # Atomic replace to avoid half-written files
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(target)


def delete_recipe(name: str) -> None:
    """Delete a recipe by name. Raises ValueError if name is 'Default' or invalid."""
    if name == "Default":
        raise ValueError("Default recipe cannot be deleted (delete the file manually to reset)")
    if not is_valid_recipe_name(name):
        raise ValueError(f"invalid recipe name: {name!r}")
    target = recipes_dir() / f"{name}{_RECIPE_SUFFIX}"
    try:
        target.unlink()
    except FileNotFoundError:
        pass  # idempotent


def list_subagent_refs() -> list[dict[str, str]]:
    """List available subagent source files from ~/.pupu/subagents/.

    Returns records suitable for the Builder's "Import from file" picker:
    {"name": str, "format": "soul"|"skeleton", "description": str}.

    Parse errors are skipped; this function never raises.
    """
    result: list[dict[str, str]] = []
    sa_dir = Path.home() / ".pupu" / "subagents"
    if not sa_dir.is_dir():
        return result
    for entry in sorted(sa_dir.iterdir()):
        if not entry.is_file():
            continue
        if entry.suffix not in (".soul", ".skeleton"):
            continue
        try:
            # Late import to avoid circular dep
            from subagent_loader import parse_skeleton, parse_soul  # type: ignore
            parsed = parse_skeleton(entry) if entry.suffix == ".skeleton" else parse_soul(entry)
            result.append({
                "name": parsed.name,
                "format": entry.suffix.lstrip("."),
                "description": parsed.description,
            })
        except Exception as exc:
            _logger.warning("[recipe_loader] cannot read subagent ref %s: %s", entry, exc)
            continue
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe_loader.py -v`
Expected: PASS (all 13 tests in the file now).

- [ ] **Step 5: Stop (no commit)**

---

## Task 6: Flask routes for recipes

**Files:**
- Create: `unchain_runtime/server/route_recipes.py`
- Modify: `unchain_runtime/server/routes.py` — import the new blueprint module
- Test: `unchain_runtime/server/tests/test_route_recipes.py`

- [ ] **Step 1: Inspect existing route pattern**

Read `unchain_runtime/server/route_characters.py` lines 1-60 to confirm the `api_blueprint`, `_root()`, `_is_authorized()`, `_json_error()` helper pattern.

- [ ] **Step 2: Write failing tests**

```python
# unchain_runtime/server/tests/test_route_recipes.py
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# Reuse existing app fixture pattern from test_route_characters.py if present.
# Simple standalone approach: instantiate the Flask app directly.


def _make_client(tmpdir: Path):
    # Patch HOME first so recipes_dir points into tmpdir.
    with patch("pathlib.Path.home", return_value=tmpdir):
        from routes import create_app  # type: ignore
        app = create_app(auth_token="test-token")
        return app.test_client()


class RecipeRoutesTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)
        self.home_patch = patch("pathlib.Path.home", return_value=self.tmpdir)
        self.home_patch.start()
        # Seed Default via recipe_seeds
        from recipe_seeds import ensure_recipe_seeds_written
        ensure_recipe_seeds_written(self.tmpdir / ".pupu" / "agent_recipes")
        from routes import create_app  # type: ignore
        self.app = create_app(auth_token="test-token")
        self.client = self.app.test_client()
        self.auth = {"x-unchain-auth": "test-token"}

    def tearDown(self):
        self.home_patch.stop()
        self._tmp.cleanup()

    def test_list_returns_default(self):
        resp = self.client.get("/agent_recipes", headers=self.auth)
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        names = [r["name"] for r in body["recipes"]]
        self.assertIn("Default", names)

    def test_get_returns_full_recipe(self):
        resp = self.client.get("/agent_recipes/Default", headers=self.auth)
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertEqual(body["name"], "Default")

    def test_get_returns_404_for_missing(self):
        resp = self.client.get("/agent_recipes/Ghost", headers=self.auth)
        self.assertEqual(resp.status_code, 404)

    def test_post_saves_new_recipe(self):
        payload = {
            "name": "Coder",
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "hi"},
            "toolkits": [],
            "subagent_pool": [],
        }
        resp = self.client.post(
            "/agent_recipes",
            headers={**self.auth, "Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue((self.tmpdir / ".pupu" / "agent_recipes" / "Coder.recipe").exists())

    def test_post_rejects_invalid_name(self):
        payload = {
            "name": "bad/name",
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "x"},
            "toolkits": [],
            "subagent_pool": [],
        }
        resp = self.client.post(
            "/agent_recipes",
            headers={**self.auth, "Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_removes_recipe(self):
        self.client.post(
            "/agent_recipes",
            headers={**self.auth, "Content-Type": "application/json"},
            data=json.dumps({
                "name": "Tmp",
                "description": "",
                "model": None,
                "max_iterations": None,
                "agent": {"prompt_format": "soul", "prompt": "x"},
                "toolkits": [],
                "subagent_pool": [],
            }),
        )
        resp = self.client.delete("/agent_recipes/Tmp", headers=self.auth)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse((self.tmpdir / ".pupu" / "agent_recipes" / "Tmp.recipe").exists())

    def test_delete_refuses_default(self):
        resp = self.client.delete("/agent_recipes/Default", headers=self.auth)
        self.assertEqual(resp.status_code, 400)

    def test_subagent_refs_list(self):
        sa_dir = self.tmpdir / ".pupu" / "subagents"
        sa_dir.mkdir(parents=True)
        (sa_dir / "Explore.skeleton").write_text(
            json.dumps({"name": "Explore", "description": "scout", "instructions": "x"})
        )
        resp = self.client.get("/agent_recipes/subagent_refs", headers=self.auth)
        self.assertEqual(resp.status_code, 200)
        names = [r["name"] for r in resp.get_json()["refs"]]
        self.assertIn("Explore", names)

    def test_unauthorized_without_token(self):
        resp = self.client.get("/agent_recipes")
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2b: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_route_recipes.py -v`
Expected: FAIL (route not registered → 404 or ImportError).

- [ ] **Step 3: Implement `route_recipes.py`**

```python
# unchain_runtime/server/route_recipes.py
"""Flask routes for Agent Recipes.

Registered onto the shared `api_blueprint` defined in routes.py. Follows the
existing auth + error-handling pattern from route_characters.py.
"""
from __future__ import annotations

import logging

from flask import jsonify, request

from routes import api_blueprint, _root  # type: ignore

_logger = logging.getLogger(__name__)


@api_blueprint.get("/agent_recipes")
def list_agent_recipes():
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import list_recipes
        recipes = list_recipes()
        return jsonify({"recipes": recipes, "count": len(recipes)})
    except Exception as exc:
        _logger.exception("[route_recipes] list failed")
        return jsonify({"error": {"code": "recipe_list_failed", "message": str(exc)}}), 500


@api_blueprint.get("/agent_recipes/subagent_refs")
def list_agent_recipe_subagent_refs():
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import list_subagent_refs
        refs = list_subagent_refs()
        return jsonify({"refs": refs, "count": len(refs)})
    except Exception as exc:
        _logger.exception("[route_recipes] subagent_refs failed")
        return jsonify({"error": {"code": "subagent_refs_failed", "message": str(exc)}}), 500


@api_blueprint.get("/agent_recipes/<name>")
def get_agent_recipe(name: str):
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import load_recipe
        recipe = load_recipe(name)
        if recipe is None:
            return root._json_error("not_found", "Recipe not found", 404)
        # Re-serialize via dict form the FE can round-trip
        path = (__import__("recipe_loader").recipes_dir() / f"{name}.recipe")
        import json as _json
        return jsonify(_json.loads(path.read_text(encoding="utf-8")))
    except Exception as exc:
        _logger.exception("[route_recipes] get failed")
        return jsonify({"error": {"code": "recipe_get_failed", "message": str(exc)}}), 500


@api_blueprint.post("/agent_recipes")
def save_agent_recipe():
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        payload = request.get_json(force=True) or {}
        from recipe_loader import save_recipe
        save_recipe(payload)
        return jsonify({"ok": True, "name": payload.get("name")})
    except ValueError as exc:
        # Includes RecipeValidationError
        return jsonify({"error": {"code": "recipe_invalid", "message": str(exc)}}), 400
    except Exception as exc:
        _logger.exception("[route_recipes] save failed")
        return jsonify({"error": {"code": "recipe_save_failed", "message": str(exc)}}), 500


@api_blueprint.delete("/agent_recipes/<name>")
def delete_agent_recipe(name: str):
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import delete_recipe
        delete_recipe(name)
        return jsonify({"ok": True})
    except ValueError as exc:
        return jsonify({"error": {"code": "recipe_delete_refused", "message": str(exc)}}), 400
    except Exception as exc:
        _logger.exception("[route_recipes] delete failed")
        return jsonify({"error": {"code": "recipe_delete_failed", "message": str(exc)}}), 500
```

- [ ] **Step 4: Register the blueprint module in `routes.py`**

At the bottom of `routes.py` (after the existing `from route_characters import *  # noqa: F401,F403` line, or at the equivalent import aggregation point — search for `route_characters` to find the exact spot):

```python
from route_recipes import *  # noqa: F401,F403
```

If no such aggregation point exists, add at the end of the file (after `create_app` definition):

```python
# Register recipe routes onto api_blueprint
import route_recipes  # noqa: F401
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_route_recipes.py -v`
Expected: PASS (9 tests).

- [ ] **Step 6: Stop (no commit)**

---

## Task 7: Toolkit filter helper in unchain_adapter

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py` — add `_apply_recipe_toolkit_filter`
- Test: `unchain_runtime/server/tests/test_unchain_adapter_capabilities.py` — append tests

- [ ] **Step 1: Write failing tests**

Append to `tests/test_unchain_adapter_capabilities.py`:

```python
class ApplyRecipeToolkitFilterTests(unittest.TestCase):
    def _mk_tool(self, name):
        tool = type("T", (), {})()
        tool.name = name
        return tool

    def _mk_toolkit(self, tid, tool_names):
        tk = type("TK", (), {})()
        tk.id = tid
        tk.name = tid
        tk.tools = {n: self._mk_tool(n) for n in tool_names}
        return tk

    def test_filter_keeps_listed_toolkits_only(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read", "grep"]),
                   self._mk_toolkit("workspace", ["write"])]
        refs = (ToolkitRef(id="core", enabled_tools=None),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual([t.id for t in filtered], ["core"])

    def test_filter_respects_enabled_tools_whitelist(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read", "grep", "write"])]
        refs = (ToolkitRef(id="core", enabled_tools=("read", "grep")),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual(set(filtered[0].tools.keys()), {"read", "grep"})

    def test_filter_warns_on_missing_toolkit(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read"])]
        refs = (ToolkitRef(id="ghost", enabled_tools=None),)
        # Missing toolkit is silently dropped with a warning (not an error).
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual(filtered, [])

    def test_null_enabled_tools_keeps_all(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read", "grep"])]
        refs = (ToolkitRef(id="core", enabled_tools=None),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual(set(filtered[0].tools.keys()), {"read", "grep"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::ApplyRecipeToolkitFilterTests -v`
Expected: FAIL — `_apply_recipe_toolkit_filter` does not exist.

- [ ] **Step 3: Add the helper to `unchain_adapter.py`**

Locate `_build_developer_agent` (around line 3046). Immediately above that function, add:

```python
def _apply_recipe_toolkit_filter(toolkits: list, refs: tuple) -> list:
    """Filter PuPu toolkits to the set referenced by a Recipe.

    - Drops toolkits not listed in `refs`.
    - For each kept toolkit, narrows its `tools` dict to `enabled_tools`
      when that list is non-null.
    - Missing/unloaded toolkits are skipped with a warning; caller is left
      with a smaller list rather than an error.
    """
    import copy as _copy
    by_id = {getattr(tk, "id", getattr(tk, "name", None)): tk for tk in toolkits}
    result: list = []
    for ref in refs:
        tk = by_id.get(ref.id)
        if tk is None:
            _subagent_logger.warning(
                "[recipe] toolkit %s referenced by recipe is not loaded; skipping",
                ref.id,
            )
            continue
        if ref.enabled_tools is None:
            result.append(tk)
            continue
        # Shallow copy then narrow tools dict; original toolkit untouched.
        narrowed = _copy.copy(tk)
        allowed = set(ref.enabled_tools)
        narrowed.tools = {
            name: tool for name, tool in tk.tools.items() if name in allowed
        }
        result.append(narrowed)
    return result
```

Note: `_subagent_logger` already exists in `unchain_adapter.py` (used by existing subagent code) — re-use it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::ApplyRecipeToolkitFilterTests -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Stop (no commit)**

---

## Task 8: Subagent materializer in unchain_adapter

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py` — add `_materialize_recipe_subagents`
- Test: append to `unchain_runtime/server/tests/test_unchain_adapter_capabilities.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_unchain_adapter_capabilities.py`:

```python
class MaterializeRecipeSubagentsTests(unittest.TestCase):
    def test_ref_kind_loads_template_and_applies_disabled_tools(self):
        """Spec: ref subagent pulls from ~/.pupu/subagents and honors disabled_tools."""
        from unchain_adapter import _materialize_recipe_subagents
        from recipe import Recipe, RecipeAgent, SubagentRef
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                from subagent_seeds import ensure_seeds_written
                ensure_seeds_written(Path(tmp) / ".pupu" / "subagents")

                recipe = Recipe(
                    name="T",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="x"),
                    toolkits=(),
                    subagent_pool=(
                        SubagentRef(kind="ref", template_name="Explore",
                                    disabled_tools=("shell",)),
                    ),
                )

                # Mock the unchain modules minimally.
                UnchainAgent = type("UA", (), {})
                ToolsModule = type("TM", (), {})
                PoliciesModule = type("PM", (), {})

                class _FakeST:
                    def __init__(self, **kw):
                        self.kw = kw

                class _FakeTool:
                    def __init__(self, n): self.name = n
                class _FakeTK:
                    def __init__(self, tid, names):
                        self.id = tid
                        self.name = tid
                        self.tools = {n: _FakeTool(n) for n in names}

                toolkits = [_FakeTK("core", ["read", "grep", "shell"])]
                templates = _materialize_recipe_subagents(
                    recipe=recipe,
                    toolkits=toolkits,
                    provider="anthropic",
                    model="claude-sonnet-4-6",
                    api_key="k",
                    max_iterations=5,
                    UnchainAgent=UnchainAgent,
                    ToolsModule=ToolsModule,
                    PoliciesModule=PoliciesModule,
                    SubagentTemplate=_FakeST,
                )
                self.assertEqual(len(templates), 1)
                # disabled_tools=("shell",) → shell removed from effective tools
                allowed = templates[0].kw.get("allowed_tools") or ()
                self.assertNotIn("shell", allowed)

    def test_missing_ref_logs_warning_and_skips(self):
        from unchain_adapter import _materialize_recipe_subagents
        from recipe import Recipe, RecipeAgent, SubagentRef
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                # No subagents seeded
                recipe = Recipe(
                    name="T", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="x"),
                    toolkits=(),
                    subagent_pool=(
                        SubagentRef(kind="ref", template_name="Ghost", disabled_tools=()),
                    ),
                )
                templates = _materialize_recipe_subagents(
                    recipe=recipe, toolkits=[],
                    provider="anthropic", model="m", api_key="k", max_iterations=5,
                    UnchainAgent=type("UA", (), {}),
                    ToolsModule=type("TM", (), {}),
                    PoliciesModule=type("PM", (), {}),
                    SubagentTemplate=type("ST", (), {"__init__": lambda s, **kw: setattr(s, "kw", kw) or None}),
                )
                self.assertEqual(templates, ())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::MaterializeRecipeSubagentsTests -v`
Expected: FAIL — `_materialize_recipe_subagents` does not exist.

- [ ] **Step 3: Add the helper**

In `unchain_adapter.py`, below `_apply_recipe_toolkit_filter` (added in Task 7), add:

```python
def _materialize_recipe_subagents(
    *,
    recipe,
    toolkits: list,
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    UnchainAgent,
    ToolsModule,
    PoliciesModule,
    SubagentTemplate,
) -> tuple:
    """Build SubagentTemplate instances from a Recipe's subagent_pool.

    - `ref` entries: load the named template from ~/.pupu/subagents via
      subagent_loader; apply `disabled_tools` to narrow allowed_tools.
    - `inline` entries: feed the embedded template dict through the same
      validation path (parse_skeleton for skeleton; parse_soul_text for soul).
    - Missing refs and parse failures are logged and skipped.
    """
    from pathlib import Path as _Path
    import json as _json
    import tempfile as _tempfile

    try:
        from subagent_loader import (
            _build_child_agent,  # type: ignore
            _compute_effective_tools,  # type: ignore
            parse_skeleton,
            parse_soul,
        )
    except ImportError:
        _subagent_logger.warning("[recipe] subagent_loader unavailable; recipe subagents disabled")
        return ()

    sa_dir = _Path.home() / ".pupu" / "subagents"
    main_tool_names = {
        name for tk in toolkits for name in getattr(tk, "tools", {}).keys()
    }

    built: list = []
    for entry in recipe.subagent_pool:
        parsed = None
        if entry.kind == "ref":
            # Prefer skeleton, then soul (matches loader precedence within user scope)
            for ext in (".skeleton", ".soul"):
                candidate = sa_dir / f"{entry.template_name}{ext}"
                if candidate.exists():
                    try:
                        parsed = parse_skeleton(candidate) if ext == ".skeleton" else parse_soul(candidate)
                    except Exception as exc:
                        _subagent_logger.warning(
                            "[recipe] subagent %s parse failed: %s", candidate, exc
                        )
                        parsed = None
                    break
            if parsed is None:
                _subagent_logger.warning(
                    "[recipe] subagent ref %s not found in %s; skipping",
                    entry.template_name, sa_dir,
                )
                continue
        else:  # inline
            # Write the inline template to a temp file and reuse the same parser.
            # This keeps validation centralized in subagent_loader.
            try:
                with _tempfile.TemporaryDirectory() as td:
                    ext = ".skeleton" if entry.prompt_format == "skeleton" else ".soul"
                    tmp_path = _Path(td) / f"{entry.name}{ext}"
                    if ext == ".skeleton":
                        tmp_path.write_text(_json.dumps(entry.template), encoding="utf-8")
                        parsed = parse_skeleton(tmp_path)
                    else:
                        # For soul: template dict expected to carry "prompt" (raw soul text)
                        tmp_path.write_text(str(entry.template.get("prompt", "")), encoding="utf-8")
                        parsed = parse_soul(tmp_path)
            except Exception as exc:
                _subagent_logger.warning("[recipe] inline subagent %s invalid: %s", entry.name, exc)
                continue

        # Compute effective tools: (allowed_tools ∩ main toolset) − disabled_tools
        effective = _compute_effective_tools(
            parsed.allowed_tools, main_tool_names
        )
        effective = tuple(t for t in effective if t not in set(entry.disabled_tools))
        if not effective:
            _subagent_logger.warning(
                "[recipe] subagent %s has no effective tools after filters; skipping",
                parsed.name,
            )
            continue

        # Build child agent + wrap in SubagentTemplate (mirrors subagent_loader path)
        child_agent = _build_child_agent(
            UnchainAgent=UnchainAgent,
            ToolsModule=ToolsModule,
            PoliciesModule=PoliciesModule,
            toolkits=tuple(toolkits),
            provider=provider,
            model=parsed.model or model,
            api_key=api_key,
            max_iterations=max_iterations,
            instructions=parsed.instructions,
            effective_tool_names=effective,
        )
        built.append(
            SubagentTemplate(
                name=parsed.name,
                description=parsed.description,
                agent=child_agent,
                allowed_modes=parsed.allowed_modes,
                output_mode=parsed.output_mode,
                memory_policy=parsed.memory_policy,
                parallel_safe=parsed.parallel_safe,
                allowed_tools=effective,
                model=parsed.model,
            )
        )
    return tuple(built)
```

NOTE: `_build_child_agent` and `_compute_effective_tools` need to be importable from `subagent_loader.py`. If they are currently inlined private helpers (e.g. the current code does this inline inside `load_templates`), expose them by renaming the inline blocks to module-level functions in `subagent_loader.py`:

```python
# In subagent_loader.py — at module level (if not already extracted):

def _compute_effective_tools(
    allowed_tools: tuple[str, ...] | None,
    main_tool_names: set[str],
) -> tuple[str, ...]:
    """Intersect allowed_tools with main agent's toolset; None means 'all'."""
    if allowed_tools is None:
        return tuple(sorted(main_tool_names))
    return tuple(t for t in allowed_tools if t in main_tool_names)


def _build_child_agent(
    *,
    UnchainAgent,
    ToolsModule,
    PoliciesModule,
    toolkits: tuple,
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    instructions: str,
    effective_tool_names: tuple[str, ...],
):
    """Construct a child Agent instance for a subagent template.

    Extracted from the inline body of load_templates so it can be reused by
    unchain_adapter._materialize_recipe_subagents.
    """
    child_modules = []
    if toolkits:
        child_modules.append(ToolsModule(tools=tuple(toolkits)))
    child_modules.append(PoliciesModule(max_iterations=max(1, max_iterations // 2)))
    return UnchainAgent(
        provider=provider,
        model=model,
        api_key=api_key,
        instructions=instructions,
        modules=tuple(child_modules),
    )
```

If those helpers already exist (check `subagent_loader.py` before adding), skip that edit.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::MaterializeRecipeSubagentsTests -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Stop (no commit)**

---

## Task 9: `_build_developer_agent(recipe=...)`

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py` — extend signature and branching logic

- [ ] **Step 1: Write failing test**

Append to `tests/test_unchain_adapter_capabilities.py`:

```python
class BuildDeveloperAgentRecipeBranchTests(unittest.TestCase):
    def _common_kwargs(self, tmpdir):
        class _FakeAgent:
            def __init__(self, **kw): self.kw = kw
        class _FakeToolsModule:
            def __init__(self, **kw): self.kw = kw
        class _FakeMemoryModule:
            def __init__(self, **kw): pass
        class _FakePoliciesModule:
            def __init__(self, **kw): pass
        class _FakeST:
            def __init__(self, **kw): self.kw = kw
        class _FakeSM:
            def __init__(self, **kw): pass
        class _FakeSP:
            pass
        class _FakeTool:
            def __init__(self, n): self.name = n
        class _FakeTK:
            def __init__(self, tid, names):
                self.id = tid; self.name = tid
                self.tools = {n: _FakeTool(n) for n in names}

        toolkits = [_FakeTK("core", ["read", "grep"]),
                    _FakeTK("workspace", ["write", "edit"])]
        return dict(
            UnchainAgent=_FakeAgent,
            ToolsModule=_FakeToolsModule,
            MemoryModule=_FakeMemoryModule,
            PoliciesModule=_FakePoliciesModule,
            SubagentModule=_FakeSM,
            SubagentTemplate=_FakeST,
            SubagentPolicy=_FakeSP,
            provider="anthropic",
            model="claude-sonnet-4-6",
            api_key="k",
            user_modules=None,
            max_iterations=10,
            toolkits=toolkits,
            memory_manager=None,
            options=None,
        )

    def test_recipe_none_uses_all_toolkits(self):
        from unchain_adapter import _build_developer_agent
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                agent = _build_developer_agent(**kw, recipe=None)
                # The ToolsModule kwargs should include both toolkits.
                modules = agent.kw.get("modules", ())
                tool_modules = [m for m in modules if hasattr(m, "kw") and "tools" in m.kw]
                self.assertEqual(len(tool_modules), 1)
                tool_ids = {getattr(t, "id", None) for t in tool_modules[0].kw["tools"]}
                self.assertEqual(tool_ids, {"core", "workspace"})

    def test_recipe_filters_toolkits(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent, ToolkitRef
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="Coder", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="body"),
                    toolkits=(ToolkitRef(id="core", enabled_tools=None),),
                    subagent_pool=(),
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                modules = agent.kw.get("modules", ())
                tool_modules = [m for m in modules if hasattr(m, "kw") and "tools" in m.kw]
                tool_ids = {getattr(t, "id", None) for t in tool_modules[0].kw["tools"]}
                self.assertEqual(tool_ids, {"core"})

    def test_recipe_soul_prompt_used_as_instructions(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="X", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="CUSTOM SOUL BODY"),
                    toolkits=(), subagent_pool=(),
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                self.assertIn("CUSTOM SOUL BODY", agent.kw.get("instructions", ""))

    def test_recipe_sentinel_uses_builtin_prompt(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent, BUILTIN_DEVELOPER_PROMPT_SENTINEL
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="Default", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(
                        prompt_format="skeleton",
                        prompt=BUILTIN_DEVELOPER_PROMPT_SENTINEL,
                    ),
                    toolkits=(), subagent_pool=(),
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                instr = agent.kw.get("instructions", "")
                # Built-in prompt contains these marker tokens; the sentinel itself should be gone.
                self.assertNotIn(BUILTIN_DEVELOPER_PROMPT_SENTINEL, instr)
                # Built-in prompt is non-trivial (> 200 chars).
                self.assertGreater(len(instr), 200)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::BuildDeveloperAgentRecipeBranchTests -v`
Expected: FAIL — `recipe` kwarg not accepted.

- [ ] **Step 3: Extend `_build_developer_agent`**

Modify `unchain_adapter.py::_build_developer_agent`:

1. **Add `recipe` to the signature** (alongside existing kwargs):

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
    options: Dict[str, object] | None = None,
    recipe=None,   # NEW: Recipe | None from recipe.py
):
```

2. **Immediately after the signature**, branch toolkit filtering:

```python
    if recipe is not None:
        toolkits = _apply_recipe_toolkit_filter(toolkits, recipe.toolkits)
```

3. **Replace subagent loading block** (the existing `if enable_subagents and ...` block around lines 3099-3127) with recipe-aware branching:

```python
    templates: tuple = ()
    if (
        enable_subagents
        and SubagentModule is not None
        and SubagentTemplate is not None
        and SubagentPolicy is not None
    ):
        if recipe is not None:
            try:
                templates = _materialize_recipe_subagents(
                    recipe=recipe,
                    toolkits=toolkits,
                    provider=provider,
                    model=model,
                    api_key=api_key or None,
                    max_iterations=max_iterations,
                    UnchainAgent=UnchainAgent,
                    ToolsModule=ToolsModule,
                    PoliciesModule=PoliciesModule,
                    SubagentTemplate=SubagentTemplate,
                )
            except Exception as exc:
                _subagent_logger.warning(
                    "[recipe] subagent materialization failed; continuing without subagents: %s",
                    exc,
                )
                templates = ()
        else:
            # Existing legacy path
            try:
                from subagent_loader import load_templates
                workspace_dir = _resolve_workspace_subagent_dir_for_loader(options)
                templates = load_templates(
                    toolkits=tuple(toolkits),
                    provider=provider,
                    model=model,
                    api_key=api_key or None,
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
```

4. **Replace the prompt construction** (around lines 3146-3155). Current code builds modular prompt then does `{{SUBAGENT_LIST}}` replacement. Factor out for recipe branch:

```python
    # ---- Instructions (prompt body) ----
    if recipe is not None:
        instructions = _resolve_recipe_prompt(recipe)
    else:
        instructions = _build_modular_prompt(
            builtin_modules=_BUILTIN_MODULES,
            agent_modules=_DEVELOPER_PROMPT_SECTIONS,
            user_modules=user_modules or {},
        )

    subagent_list_md = (
        "\n".join(f"- {tpl.name}: {tpl.description}" for tpl in templates)
        or "(no subagents registered)"
    )
    instructions = instructions.replace("{{SUBAGENT_LIST}}", subagent_list_md)
```

5. **Add `_resolve_recipe_prompt` helper** above `_build_developer_agent`:

```python
def _resolve_recipe_prompt(recipe) -> str:
    """Convert Recipe.agent.prompt into developer instructions.

    - Sentinel "{{USE_BUILTIN_DEVELOPER_PROMPT}}" → fall back to built-in sections.
    - prompt_format="soul": use prompt string verbatim as instructions.
    - prompt_format="skeleton": JSON-decode and extract .instructions field.
    - {{SUBAGENT_LIST}} placeholder replacement happens in the caller.
    """
    from recipe import BUILTIN_DEVELOPER_PROMPT_SENTINEL
    raw = recipe.agent.prompt or ""
    if raw.strip() == BUILTIN_DEVELOPER_PROMPT_SENTINEL:
        return _build_modular_prompt(
            builtin_modules=_BUILTIN_MODULES,
            agent_modules=_DEVELOPER_PROMPT_SECTIONS,
            user_modules={},
        )
    if recipe.agent.prompt_format == "skeleton":
        import json as _json
        try:
            parsed = _json.loads(raw)
            return str(parsed.get("instructions", ""))
        except (ValueError, json.JSONDecodeError):
            _subagent_logger.warning(
                "[recipe] skeleton prompt is not valid JSON; using raw string"
            )
            return raw
    return raw
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::BuildDeveloperAgentRecipeBranchTests -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full capabilities test file to ensure no regression**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py -v`
Expected: All tests pass (pre-existing + new).

- [ ] **Step 6: Stop (no commit)**

---

## Task 10: `_create_agent` loads recipe from options

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py` — `_create_agent`

- [ ] **Step 1: Write failing test**

Append to `tests/test_unchain_adapter_capabilities.py`:

```python
class CreateAgentRecipeWiringTests(unittest.TestCase):
    def test_create_agent_uses_default_recipe_when_name_unspecified(self):
        import unchain_adapter as ua
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                from recipe_seeds import ensure_recipe_seeds_written
                ensure_recipe_seeds_written(Path(tmp) / ".pupu" / "agent_recipes")
                captured = {}
                real = ua._build_developer_agent
                def _spy(**kw):
                    captured.update(kw)
                    return real(**kw)
                with patch.object(ua, "_build_developer_agent", _spy):
                    try:
                        ua._create_agent({}, session_id="s")
                    except Exception:
                        pass  # Agent construction may fail in test env; we only care about recipe wiring
                self.assertIsNotNone(captured.get("recipe"))
                self.assertEqual(captured["recipe"].name, "Default")

    def test_create_agent_loads_named_recipe(self):
        import unchain_adapter as ua
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                from recipe_loader import save_recipe
                save_recipe({
                    "name": "Coder",
                    "description": "",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                captured = {}
                def _spy(**kw):
                    captured.update(kw)
                    return None
                with patch.object(ua, "_build_developer_agent", _spy):
                    try:
                        ua._create_agent({"recipe_name": "Coder"}, session_id="s")
                    except Exception:
                        pass
                self.assertIsNotNone(captured.get("recipe"))
                self.assertEqual(captured["recipe"].name, "Coder")

    def test_options_model_overrides_recipe_model(self):
        import unchain_adapter as ua
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                from recipe_loader import save_recipe
                save_recipe({
                    "name": "R",
                    "description": "",
                    "model": "anthropic:claude-sonnet-4-6",
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                captured = {}
                def _spy(**kw):
                    captured.update(kw)
                    return None
                with patch.object(ua, "_build_developer_agent", _spy):
                    try:
                        ua._create_agent(
                            {"recipe_name": "R", "modelId": "openai:gpt-4o"},
                            session_id="s",
                        )
                    except Exception:
                        pass
                # options.modelId wins over recipe.model
                self.assertIn("gpt-4o", captured.get("model", ""))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::CreateAgentRecipeWiringTests -v`
Expected: FAIL — `_create_agent` ignores `recipe_name`.

- [ ] **Step 3: Wire recipe into `_create_agent`**

In `unchain_adapter.py::_create_agent` (around line 3166):

1. Near the top of the function body, after `options = options or {}`:

```python
    # Recipe resolution: default to "Default" if unspecified
    try:
        from recipe_loader import load_recipe
        recipe_name = str(options.get("recipe_name") or "Default")
        recipe = load_recipe(recipe_name)
        if recipe is None and recipe_name != "Default":
            _subagent_logger.warning(
                "[recipe] recipe %r not found; falling back to Default", recipe_name,
            )
            recipe = load_recipe("Default")
    except Exception as exc:
        _subagent_logger.warning("[recipe] load failed: %s", exc)
        recipe = None
```

2. **Model/max_iterations precedence** — after existing model resolution, apply recipe-level defaults **only if options did not specify**:

```python
    # If options did NOT specify a model, fall back to recipe.model (if any)
    if (not options.get("modelId")) and recipe is not None and recipe.model:
        selected_config = dict(selected_config)
        # The provider:model string convention: "<provider>:<model>"
        if ":" in recipe.model:
            prov, mdl = recipe.model.split(":", 1)
            selected_config["provider"] = prov
            selected_config["model"] = mdl

    if recipe is not None and recipe.max_iterations is not None and not options.get("max_iterations"):
        max_iterations = recipe.max_iterations
```

3. **Pass `recipe=recipe`** at the `_build_developer_agent` call site:

```python
    agent = _build_developer_agent(
        ...existing kwargs...,
        options=options,
        recipe=recipe,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py::CreateAgentRecipeWiringTests -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the entire capabilities test file + integration tests**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_capabilities.py tests/test_adapter_subagent_integration.py -v`
Expected: All pass (including the existing `test_create_agent_builds_developer_directly_with_selected_model` and `test_create_agent_routes_waiting_approval_mode_directly_to_developer`, which seed Explore — they continue to work because Default.recipe references Explore).

- [ ] **Step 6: Stop (no commit)**

---

## Task 11: IPC channels + preload bridge

**Files:**
- Modify: `electron/shared/channels.js`
- Modify: `electron/preload/bridges/unchain_bridge.js`

- [ ] **Step 1: Add channel constants**

In `electron/shared/channels.js`, find the `UNCHAIN` channel group (search for `LIST_CHARACTERS`). Add alongside:

```javascript
LIST_RECIPES: "unchain:list-recipes",
GET_RECIPE: "unchain:get-recipe",
SAVE_RECIPE: "unchain:save-recipe",
DELETE_RECIPE: "unchain:delete-recipe",
LIST_SUBAGENT_REFS: "unchain:list-subagent-refs",
```

- [ ] **Step 2: Expose bridge methods**

In `electron/preload/bridges/unchain_bridge.js`, find where `listCharacters` is exposed. Add alongside:

```javascript
listRecipes: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_RECIPES),
getRecipe: (recipeName) =>
  ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_RECIPE, { recipeName }),
saveRecipe: (payload = {}) =>
  ipcRenderer.invoke(CHANNELS.UNCHAIN.SAVE_RECIPE, payload),
deleteRecipe: (recipeName) =>
  ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_RECIPE, { recipeName }),
listSubagentRefs: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_SUBAGENT_REFS),
```

- [ ] **Step 3: Verify via Node test**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && node -e "const c = require('./electron/shared/channels.js'); console.log(c.CHANNELS.UNCHAIN.LIST_RECIPES);"`
Expected: prints `unchain:list-recipes`.

- [ ] **Step 4: Stop (no commit)**

---

## Task 12: Main process handlers + HTTP relay service

**Files:**
- Modify: `electron/main/ipc/register_handlers.js`
- Modify: `electron/main/services/unchain/service.js`

- [ ] **Step 1: Register IPC handlers**

In `electron/main/ipc/register_handlers.js`, find the cluster that registers character handlers (`CHANNELS.UNCHAIN.LIST_CHARACTERS`). Add alongside:

```javascript
ipcMain.handle(CHANNELS.UNCHAIN.LIST_RECIPES, async () =>
  unchainService.listMisoRecipes(),
);
ipcMain.handle(
  CHANNELS.UNCHAIN.GET_RECIPE,
  async (_event, payload = {}) =>
    unchainService.getMisoRecipe(payload.recipeName),
);
ipcMain.handle(CHANNELS.UNCHAIN.SAVE_RECIPE, async (_event, payload = {}) =>
  unchainService.saveMisoRecipe(payload),
);
ipcMain.handle(
  CHANNELS.UNCHAIN.DELETE_RECIPE,
  async (_event, payload = {}) =>
    unchainService.deleteMisoRecipe(payload.recipeName),
);
ipcMain.handle(CHANNELS.UNCHAIN.LIST_SUBAGENT_REFS, async () =>
  unchainService.listMisoSubagentRefs(),
);
```

- [ ] **Step 2: Add service methods**

In `electron/main/services/unchain/service.js`, find `listMisoCharacters` (around line 759). Use its exact fetch pattern — same auth header, same JSON handling — and add below it (still inside the class or module):

```javascript
async listMisoRecipes() {
  const url = `http://127.0.0.1:${this._port}/agent_recipes`;
  const res = await this._fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`listMisoRecipes: ${res.status}`);
  return res.json();
}

async getMisoRecipe(recipeName) {
  if (!recipeName) throw new Error("getMisoRecipe: recipeName required");
  const url = `http://127.0.0.1:${this._port}/agent_recipes/${encodeURIComponent(recipeName)}`;
  const res = await this._fetch(url, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getMisoRecipe: ${res.status}`);
  return res.json();
}

async saveMisoRecipe(payload) {
  const url = `http://127.0.0.1:${this._port}/agent_recipes`;
  const res = await this._fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `saveMisoRecipe: ${res.status}`);
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

async deleteMisoRecipe(recipeName) {
  if (!recipeName) throw new Error("deleteMisoRecipe: recipeName required");
  const url = `http://127.0.0.1:${this._port}/agent_recipes/${encodeURIComponent(recipeName)}`;
  const res = await this._fetch(url, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `deleteMisoRecipe: ${res.status}`);
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

async listMisoSubagentRefs() {
  const url = `http://127.0.0.1:${this._port}/agent_recipes/subagent_refs`;
  const res = await this._fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`listMisoSubagentRefs: ${res.status}`);
  return res.json();
}
```

NOTE: `this._fetch` and `this._port` match the style of `listMisoCharacters` in the same file. If that method uses different internal helpers (e.g., `this._authedFetch`), mirror the exact style — check the file before writing.

- [ ] **Step 3: Smoke-test by starting app**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm start`
Open DevTools in the Electron window and run:
```js
await window.unchainAPI.listRecipes()
```
Expected: returns `{ recipes: [{name: "Default", ...}], count: 1 }`. If not, check main-process logs.

Kill with `Ctrl+C` after verification.

- [ ] **Step 4: Stop (no commit)**

---

## Task 13: Frontend API facade

**Files:**
- Modify: `src/SERVICEs/api.unchain.js`

- [ ] **Step 1: Add recipe methods**

Near the existing `listCharacters` method in `src/SERVICEs/api.unchain.js`, add:

```javascript
listRecipes: async () => {
  const method = assertBridgeMethod("unchainAPI", "listRecipes");
  const response = await withTimeout(
    () => method(),
    15000,
    "recipe_list_timeout",
    "Recipe list request timed out",
  );
  return {
    recipes: Array.isArray(response?.recipes) ? response.recipes : [],
    count: Number.isFinite(Number(response?.count)) ? Number(response.count) : 0,
  };
},

getRecipe: async (recipeName) => {
  const method = assertBridgeMethod("unchainAPI", "getRecipe");
  return withTimeout(
    () => method(recipeName),
    15000,
    "recipe_get_timeout",
    "Recipe get request timed out",
  );
},

saveRecipe: async (payload = {}) => {
  const method = assertBridgeMethod("unchainAPI", "saveRecipe");
  return withTimeout(
    () => method(isObject(payload) ? payload : {}),
    20000,
    "recipe_save_timeout",
    "Recipe save request timed out",
  );
},

deleteRecipe: async (recipeName) => {
  const method = assertBridgeMethod("unchainAPI", "deleteRecipe");
  return withTimeout(
    () => method(recipeName),
    30000,
    "recipe_delete_timeout",
    "Recipe delete request timed out",
  );
},

listSubagentRefs: async () => {
  const method = assertBridgeMethod("unchainAPI", "listSubagentRefs");
  const response = await withTimeout(
    () => method(),
    15000,
    "subagent_refs_timeout",
    "Subagent refs request timed out",
  );
  return {
    refs: Array.isArray(response?.refs) ? response.refs : [],
    count: Number.isFinite(Number(response?.count)) ? Number(response.count) : 0,
  };
},
```

- [ ] **Step 2: Manually smoke-test in the dev app**

Start `npm start`, open DevTools, and run:
```js
await api.unchain.listRecipes()
```
Expected: `{ recipes: [...], count: 1 }` (Default).

- [ ] **Step 3: Stop (no commit)**

---

## Task 14: RecipesPage scaffold + wire into AgentsModal

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page.js`
- Modify: `src/COMPONENTs/agents/agents_modal.js`

- [ ] **Step 1: Create scaffold**

```javascript
// src/COMPONENTs/agents/pages/recipes_page.js
import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import api from "../../../SERVICEs/api.unchain";
import RecipeList from "./recipes_page/recipe_list";
import RecipeCanvas from "./recipes_page/recipe_canvas";
import RecipeInspector from "./recipes_page/recipe_inspector";

export default function RecipesPage({ isDark }) {
  const { theme } = useContext(ConfigContext);
  const [recipes, setRecipes] = useState([]);
  const [activeName, setActiveName] = useState(null);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const { recipes: list } = await api.listRecipes();
      setRecipes(list);
      if (list.length > 0) setActiveName(list[0].name);
    })();
  }, []);

  useEffect(() => {
    if (!activeName) {
      setActiveRecipe(null);
      return;
    }
    (async () => {
      const r = await api.getRecipe(activeName);
      setActiveRecipe(r);
      setSelectedNodeId("agent");
      setDirty(false);
    })();
  }, [activeName]);

  const handleRecipeChange = (next) => {
    setActiveRecipe(next);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!activeRecipe) return;
    await api.saveRecipe(activeRecipe);
    const { recipes: list } = await api.listRecipes();
    setRecipes(list);
    setDirty(false);
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px 1fr 300px",
      gap: 12,
      height: "100%",
      padding: 12,
    }}>
      <RecipeList
        recipes={recipes}
        activeName={activeName}
        onSelect={setActiveName}
        onListChange={setRecipes}
        isDark={isDark}
      />
      <RecipeCanvas
        recipe={activeRecipe}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onRecipeChange={handleRecipeChange}
        onSave={handleSave}
        dirty={dirty}
        isDark={isDark}
      />
      <RecipeInspector
        recipe={activeRecipe}
        selectedNodeId={selectedNodeId}
        onRecipeChange={handleRecipeChange}
        isDark={isDark}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into AgentsModal**

In `src/COMPONENTs/agents/agents_modal.js`:

1. Import at top:
```javascript
import RecipesPage from "./pages/recipes_page";
```

2. Find the `activeSection.key === "agents"` render branch (currently shows coming-soon). Replace that branch's body with:

```javascript
{activeSection.key === "agents" && (
  <RecipesPage isDark={isDark} />
)}
```

Keep the `"characters"` branch unchanged.

- [ ] **Step 3: Smoke-test render**

Run: `npm start`, open the app, click the Agents button in the side menu to open AgentsModal, switch to "Agents" tab.
Expected: three-column layout loads. Stub sub-components (RecipeList / RecipeCanvas / RecipeInspector) don't yet exist so you will get a render error — expected; next tasks create them.

- [ ] **Step 4: Stop (no commit)**

---

## Task 15: RecipeList (sidebar) + basic CRUD actions

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_list.js`

- [ ] **Step 1: Implement**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/recipe_list.js
import { useContext, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import api from "../../../../SERVICEs/api.unchain";

export default function RecipeList({
  recipes,
  activeName,
  onSelect,
  onListChange,
  isDark,
}) {
  const { theme } = useContext(ConfigContext);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const accent = "#4a5bd8";
  const mutedColor = isDark ? "#888" : "#888";
  const rowBase = {
    padding: "7px 10px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 2,
    color: isDark ? "#ddd" : "#222",
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const payload = {
      name,
      description: "",
      model: null,
      max_iterations: null,
      agent: { prompt_format: "soul", prompt: "" },
      toolkits: [],
      subagent_pool: [],
    };
    await api.saveRecipe(payload);
    const { recipes: updated } = await api.listRecipes();
    onListChange(updated);
    onSelect(name);
    setCreating(false);
    setNewName("");
  };

  const handleDelete = async (name, ev) => {
    ev.stopPropagation();
    if (name === "Default") return;
    if (!confirm(`Delete recipe "${name}"?`)) return;
    await api.deleteRecipe(name);
    const { recipes: updated } = await api.listRecipes();
    onListChange(updated);
    if (activeName === name) {
      onSelect(updated[0]?.name || null);
    }
  };

  const handleDuplicate = async (name, ev) => {
    ev.stopPropagation();
    const full = await api.getRecipe(name);
    const base = `${name} Copy`;
    full.name = base;
    await api.saveRecipe(full);
    const { recipes: updated } = await api.listRecipes();
    onListChange(updated);
    onSelect(base);
  };

  return (
    <div style={{
      borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e5e5e7"}`,
      paddingRight: 8,
      display: "flex",
      flexDirection: "column",
      gap: 2,
    }}>
      <div style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: mutedColor,
        margin: "4px 4px 8px",
      }}>
        Agents
      </div>
      {recipes.map((r) => (
        <div
          key={r.name}
          onClick={() => onSelect(r.name)}
          style={{
            ...rowBase,
            backgroundColor: r.name === activeName
              ? (isDark ? "rgba(74,91,216,0.18)" : "#eef1ff")
              : "transparent",
            color: r.name === activeName ? accent : rowBase.color,
            fontWeight: r.name === activeName ? 600 : 400,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{r.name}</span>
          {r.name !== "Default" && (
            <span style={{ display: "flex", gap: 4, opacity: 0.6 }}>
              <button
                onClick={(e) => handleDuplicate(r.name, e)}
                title="Duplicate"
                style={{ border: "none", background: "transparent",
                         cursor: "pointer", fontSize: 11 }}
              >⎘</button>
              <button
                onClick={(e) => handleDelete(r.name, e)}
                title="Delete"
                style={{ border: "none", background: "transparent",
                         cursor: "pointer", fontSize: 11 }}
              >✕</button>
            </span>
          )}
        </div>
      ))}
      {creating ? (
        <div style={{ padding: "6px 4px" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            placeholder="Name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            style={{
              width: "100%",
              padding: "4px 6px",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#ccc"}`,
              borderRadius: 4,
              fontSize: 12,
              background: isDark ? "#1e1e22" : "#fff",
              color: isDark ? "#fff" : "#222",
            }}
          />
        </div>
      ) : (
        <div
          onClick={() => setCreating(true)}
          style={{
            ...rowBase,
            border: `1px dashed ${isDark ? "rgba(255,255,255,0.15)" : "#d0d0d5"}`,
            color: mutedColor,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          + New Agent
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

Run: `npm start`, open AgentsModal → Agents. List should render with "Default" item. Click "+ New Agent", type a name, press Enter. Expected: new item appears and becomes active. Delete it with the ✕ button — expected: confirm dialog, then item removed.

- [ ] **Step 3: Stop (no commit)**

---

## Task 16: RecipeCanvas with FlowEditor — three node types + toolbar

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/toolkit_node.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js`

- [ ] **Step 1: Implement three node renderers**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js
export default function AgentNode({ node, isDark, selected }) {
  const accent = "#4a5bd8";
  return (
    <div style={{
      minWidth: 200,
      padding: "10px 12px",
      border: `${selected ? "1.5" : "1"}px solid ${selected ? accent : (isDark ? "rgba(255,255,255,0.2)" : "#d6d6db")}`,
      borderRadius: 10,
      background: isDark ? "#242428" : "#fff",
      boxShadow: selected
        ? `0 0 0 3px rgba(74,91,216,0.15)`
        : "0 2px 6px rgba(0,0,0,0.06)",
      fontSize: 12,
    }}>
      <div style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
        color: accent, marginBottom: 4,
      }}>Agent</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: isDark ? "#fff" : "#222" }}>
        {node.label || "(unnamed)"}
      </div>
      {node.model && (
        <div style={{ color: isDark ? "#aaa" : "#666", marginTop: 4, fontSize: 11 }}>
          {node.model}
        </div>
      )}
    </div>
  );
}
```

```javascript
// src/COMPONENTs/agents/pages/recipes_page/nodes/toolkit_node.js
export default function ToolkitNode({ node, isDark, selected }) {
  return (
    <div style={{
      minWidth: 140,
      padding: "10px 12px",
      border: `${selected ? "1.5" : "1"}px solid ${selected ? "#4a5bd8" : (isDark ? "rgba(255,255,255,0.2)" : "#d6d6db")}`,
      borderRadius: 10,
      background: isDark ? "#242428" : "#fff",
      boxShadow: selected ? "0 0 0 3px rgba(74,91,216,0.15)" : "0 2px 6px rgba(0,0,0,0.06)",
      fontSize: 12,
    }}>
      <div style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
        color: isDark ? "#888" : "#888", marginBottom: 4,
      }}>Toolkit</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: isDark ? "#fff" : "#222" }}>
        {node.label}
      </div>
      <div style={{ color: isDark ? "#aaa" : "#666", marginTop: 4, fontSize: 11 }}>
        {node.enabledCount}/{node.totalCount} tools
      </div>
    </div>
  );
}
```

```javascript
// src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js
export default function SubagentPoolNode({ node, isDark, selected }) {
  const accent = "#4a5bd8";
  return (
    <div style={{
      minWidth: 170,
      padding: "10px 12px",
      border: `${selected ? "1.5" : "1"}px solid ${selected ? accent : (isDark ? "rgba(255,255,255,0.2)" : "#d6d6db")}`,
      borderRadius: 10,
      background: isDark ? "#242428" : "#fff",
      boxShadow: selected ? "0 0 0 3px rgba(74,91,216,0.15)" : "0 2px 6px rgba(0,0,0,0.06)",
      fontSize: 12,
    }}>
      <div style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
        color: isDark ? "#888" : "#888", marginBottom: 4,
      }}>Subagent Pool</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: isDark ? "#fff" : "#222" }}>
        {node.count} subagents
      </div>
      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {(node.chips || []).slice(0, 3).map((c) => (
          <span key={c} style={{
            display: "inline-block",
            background: isDark ? "rgba(74,91,216,0.25)" : "#eef1ff",
            color: accent,
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 10,
          }}>{c}</span>
        ))}
        {(node.chips || []).length > 3 && (
          <span style={{ fontSize: 10, color: isDark ? "#888" : "#888" }}>
            +{node.chips.length - 3}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement RecipeCanvas**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js
import { useContext, useMemo, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import AgentNode from "./nodes/agent_node";
import ToolkitNode from "./nodes/toolkit_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";

// Layout constants — nodes are positioned deterministically so the graph
// always looks like hub-and-spoke regardless of recipe content.
const AGENT_POS = { x: 420, y: 240 };
const TOOLKIT_COL_X = 80;
const POOL_POS = { x: 760, y: 240 };

export default function RecipeCanvas({
  recipe,
  selectedNodeId,
  onSelectNode,
  onRecipeChange,
  onSave,
  dirty,
  isDark,
}) {
  const { theme } = useContext(ConfigContext);
  const [allToolkits, setAllToolkits] = useState([]);

  // Build nodes/edges from recipe
  const { nodes, edges } = useMemo(() => {
    if (!recipe) return { nodes: [], edges: [] };
    const nodeArr = [];
    const edgeArr = [];

    // Agent node (fixed hub)
    nodeArr.push({
      id: "agent",
      type: "agent",
      x: AGENT_POS.x, y: AGENT_POS.y,
      label: recipe.name,
      model: recipe.model,
    });

    // Toolkit nodes
    recipe.toolkits.forEach((tk, idx) => {
      const id = `tk:${tk.id}`;
      const y = 100 + idx * 140;
      nodeArr.push({
        id,
        type: "toolkit",
        x: TOOLKIT_COL_X, y,
        label: tk.id,
        enabledCount: tk.enabled_tools === null ? "all" : tk.enabled_tools.length,
        totalCount: "?",
      });
      edgeArr.push({
        id: `e:agent:${id}`,
        source_node_id: "agent",
        source_port_id: "left",
        target_node_id: id,
        target_port_id: "right",
      });
    });

    // Subagent pool (at most one)
    if (recipe.subagent_pool.length > 0) {
      nodeArr.push({
        id: "pool",
        type: "pool",
        x: POOL_POS.x, y: POOL_POS.y,
        count: recipe.subagent_pool.length,
        chips: recipe.subagent_pool.map((e) =>
          e.kind === "ref" ? e.template_name : e.name,
        ),
      });
      edgeArr.push({
        id: `e:agent:pool`,
        source_node_id: "agent",
        source_port_id: "right",
        target_node_id: "pool",
        target_port_id: "left",
      });
    }
    return { nodes: nodeArr, edges: edgeArr };
  }, [recipe]);

  const renderNode = (node) => {
    const selected = node.id === selectedNodeId;
    if (node.type === "agent")
      return <AgentNode node={node} isDark={isDark} selected={selected} />;
    if (node.type === "toolkit")
      return <ToolkitNode node={node} isDark={isDark} selected={selected} />;
    if (node.type === "pool")
      return <SubagentPoolNode node={node} isDark={isDark} selected={selected} />;
    return null;
  };

  const handleAddToolkit = (toolkitId) => {
    if (!recipe) return;
    if (recipe.toolkits.some((t) => t.id === toolkitId)) return;
    onRecipeChange({
      ...recipe,
      toolkits: [...recipe.toolkits, { id: toolkitId, enabled_tools: null }],
    });
  };

  const handleAddPool = () => {
    if (!recipe) return;
    if (recipe.subagent_pool.length > 0) return;
    onRecipeChange({
      ...recipe,
      subagent_pool: [],
    });
    // Empty array still registers the node — picker adds entries
  };

  const handleConnect = () => {
    // All legal edges are static (Agent ↔ Toolkit/Pool). Reject manual connects
    // in this release; connection state is derived from recipe arrays.
  };

  const toolbarBtn = {
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
    background: isDark ? "#1e1e22" : "#fff",
    color: isDark ? "#ddd" : "#333",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={toolbarBtn} onClick={() => {
          const id = prompt("Toolkit id (core/workspace/terminal):");
          if (id) handleAddToolkit(id);
        }}>
          + Toolkit
        </button>
        <button
          style={{ ...toolbarBtn, opacity: recipe && recipe.subagent_pool.length === 0 ? 1 : 0.4 }}
          onClick={handleAddPool}
          disabled={!recipe || recipe.subagent_pool.length > 0}
        >
          + Subagent Pool
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={{
            ...toolbarBtn,
            background: dirty ? "#4a5bd8" : toolbarBtn.background,
            color: dirty ? "#fff" : toolbarBtn.color,
            borderColor: dirty ? "#4a5bd8" : toolbarBtn.border,
          }}
          onClick={onSave}
          disabled={!dirty}
        >
          Save
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minHeight: 480, position: "relative" }}>
        <FlowEditor
          style={{
            width: "100%",
            height: "100%",
            minHeight: 480,
            background: isDark ? "#16161a" : "#fafafb",
            borderRadius: 6,
          }}
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          render_node={renderNode}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test**

Run: `npm start`, open AgentsModal → Agents tab. Select "Default".
Expected: Canvas shows Agent node in center (labeled "Default"), 3 Toolkit nodes on the left (core / workspace / terminal), 1 Subagent Pool node on the right with "Explore" chip. Save button is disabled.

- [ ] **Step 4: Stop (no commit)**

---

## Task 17: Inspector — Agent / Toolkit / Pool / Subagent dispatcher

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_inspector.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/inspectors/agent_inspector.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/inspectors/pool_inspector.js`

- [ ] **Step 1: Implement dispatcher**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/recipe_inspector.js
import AgentInspector from "./inspectors/agent_inspector";
import ToolkitInspector from "./inspectors/toolkit_inspector";
import PoolInspector from "./inspectors/pool_inspector";

export default function RecipeInspector({
  recipe, selectedNodeId, onRecipeChange, isDark,
}) {
  const borderLeft = `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e5e5e7"}`;
  if (!recipe) {
    return <div style={{ borderLeft, paddingLeft: 12, fontSize: 12,
                         color: isDark ? "#888" : "#888" }}>Select a recipe</div>;
  }
  if (!selectedNodeId) {
    return <div style={{ borderLeft, paddingLeft: 12, fontSize: 12,
                         color: isDark ? "#888" : "#888" }}>Click a node</div>;
  }

  let content = null;
  if (selectedNodeId === "agent") {
    content = <AgentInspector recipe={recipe} onRecipeChange={onRecipeChange} isDark={isDark} />;
  } else if (selectedNodeId.startsWith("tk:")) {
    const toolkitId = selectedNodeId.slice(3);
    content = (
      <ToolkitInspector
        recipe={recipe} toolkitId={toolkitId}
        onRecipeChange={onRecipeChange} isDark={isDark}
      />
    );
  } else if (selectedNodeId === "pool") {
    content = <PoolInspector recipe={recipe} onRecipeChange={onRecipeChange} isDark={isDark} />;
  }
  return (
    <div style={{ borderLeft, paddingLeft: 12, overflowY: "auto", minWidth: 0 }}>
      {content}
    </div>
  );
}
```

- [ ] **Step 2: Implement AgentInspector**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/inspectors/agent_inspector.js
import { useState } from "react";

export default function AgentInspector({ recipe, onRecipeChange, isDark }) {
  const [format, setFormat] = useState(recipe.agent.prompt_format);

  const label = (text) => (
    <div style={{
      fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
      color: isDark ? "#888" : "#888", marginBottom: 4, marginTop: 12,
    }}>{text}</div>
  );
  const input = {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
    borderRadius: 4,
    fontSize: 12,
    background: isDark ? "#1e1e22" : "#fff",
    color: isDark ? "#fff" : "#222",
    boxSizing: "border-box",
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#fff" : "#222" }}>
        {recipe.name}
      </div>
      <div style={{ fontSize: 11, color: isDark ? "#888" : "#888", marginTop: 2 }}>
        Agent node
      </div>

      {label("Description")}
      <input
        style={input}
        value={recipe.description || ""}
        onChange={(e) => onRecipeChange({ ...recipe, description: e.target.value })}
      />

      {label("Model")}
      <input
        style={input}
        placeholder="e.g., anthropic:claude-sonnet-4-6 (empty = system default)"
        value={recipe.model || ""}
        onChange={(e) => onRecipeChange({ ...recipe, model: e.target.value || null })}
      />

      {label("Max iterations")}
      <input
        type="number"
        style={input}
        placeholder="empty = system default"
        value={recipe.max_iterations ?? ""}
        onChange={(e) => onRecipeChange({
          ...recipe,
          max_iterations: e.target.value ? parseInt(e.target.value, 10) : null,
        })}
      />

      {label("Prompt format")}
      <div style={{ display: "inline-flex", gap: 0,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
                    borderRadius: 4, overflow: "hidden" }}>
        {["soul", "skeleton"].map((f) => (
          <span
            key={f}
            onClick={() => {
              setFormat(f);
              onRecipeChange({
                ...recipe,
                agent: { ...recipe.agent, prompt_format: f },
              });
            }}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              cursor: "pointer",
              background: format === f ? "#4a5bd8" : "transparent",
              color: format === f ? "#fff" : (isDark ? "#aaa" : "#888"),
            }}
          >{f}</span>
        ))}
      </div>

      {label(format === "soul" ? "Prompt (soul body)" : "Prompt (skeleton JSON)")}
      <textarea
        rows={14}
        style={{
          ...input,
          fontFamily: "ui-monospace, monospace",
          lineHeight: 1.5,
          resize: "vertical",
        }}
        value={recipe.agent.prompt || ""}
        onChange={(e) => onRecipeChange({
          ...recipe,
          agent: { ...recipe.agent, prompt: e.target.value },
        })}
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement ToolkitInspector**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js
import { useEffect, useState } from "react";
import api from "../../../../../SERVICEs/api.unchain";

export default function ToolkitInspector({
  recipe, toolkitId, onRecipeChange, isDark,
}) {
  const [allTools, setAllTools] = useState([]);

  useEffect(() => {
    (async () => {
      // Fetch catalog; this API already exists for the Tools selector.
      try {
        const { toolkits } = await api.listToolkits();
        const match = (toolkits || []).find((tk) => tk.id === toolkitId);
        setAllTools(match ? match.tools || [] : []);
      } catch (exc) {
        setAllTools([]);
      }
    })();
  }, [toolkitId]);

  const current = recipe.toolkits.find((tk) => tk.id === toolkitId);
  if (!current) return <div>(toolkit not in recipe)</div>;

  const allOn = current.enabled_tools === null;
  const enabledSet = new Set(current.enabled_tools || []);
  const isEnabled = (toolName) => allOn || enabledSet.has(toolName);

  const setEnabled = (toolName, on) => {
    let nextList;
    if (allOn) {
      // Transition from null → explicit list (all tools except this one)
      nextList = allTools.map((t) => t.name).filter((n) => n !== toolName || on);
    } else {
      const s = new Set(current.enabled_tools);
      if (on) s.add(toolName); else s.delete(toolName);
      nextList = Array.from(s);
    }
    onRecipeChange({
      ...recipe,
      toolkits: recipe.toolkits.map((tk) =>
        tk.id === toolkitId ? { ...tk, enabled_tools: nextList } : tk,
      ),
    });
  };

  const resetToAll = () => {
    onRecipeChange({
      ...recipe,
      toolkits: recipe.toolkits.map((tk) =>
        tk.id === toolkitId ? { ...tk, enabled_tools: null } : tk,
      ),
    });
  };

  const removeToolkit = () => {
    if (!confirm(`Remove toolkit "${toolkitId}" from this recipe?`)) return;
    onRecipeChange({
      ...recipe,
      toolkits: recipe.toolkits.filter((tk) => tk.id !== toolkitId),
    });
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#fff" : "#222" }}>
        {toolkitId}
      </div>
      <div style={{ fontSize: 11, color: isDark ? "#888" : "#888", marginTop: 2 }}>
        Toolkit
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={resetToAll} style={{
          padding: "3px 8px", fontSize: 11,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
          background: "transparent",
          color: isDark ? "#ddd" : "#333",
          borderRadius: 4, cursor: "pointer",
        }}>Enable all</button>
        <button onClick={removeToolkit} style={{
          padding: "3px 8px", fontSize: 11,
          border: `1px solid #c44`,
          background: "transparent",
          color: "#c44", borderRadius: 4, cursor: "pointer",
        }}>Remove from recipe</button>
      </div>

      <div style={{ marginTop: 14 }}>
        {allTools.map((tool) => (
          <label key={tool.name} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "5px 0",
            borderBottom: `1px dashed ${isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"}`,
            color: isDark ? "#ddd" : "#333",
          }}>
            <span>{tool.name}</span>
            <input
              type="checkbox"
              checked={isEnabled(tool.name)}
              onChange={(e) => setEnabled(tool.name, e.target.checked)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement PoolInspector (stub — picker wired in Task 18)**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/inspectors/pool_inspector.js
import { useState } from "react";
import SubagentPicker from "../subagent_picker";

export default function PoolInspector({ recipe, onRecipeChange, isDark }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const removeAt = (idx) => {
    onRecipeChange({
      ...recipe,
      subagent_pool: recipe.subagent_pool.filter((_, i) => i !== idx),
    });
  };

  const add = (entry) => {
    onRecipeChange({
      ...recipe,
      subagent_pool: [...recipe.subagent_pool, entry],
    });
    setPickerOpen(false);
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#fff" : "#222" }}>
        Subagent Pool
      </div>
      <div style={{ fontSize: 11, color: isDark ? "#888" : "#888", marginTop: 2 }}>
        {recipe.subagent_pool.length} subagents
      </div>

      <div style={{ marginTop: 14 }}>
        {recipe.subagent_pool.map((entry, idx) => (
          <div key={idx} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 0",
            borderBottom: `1px dashed ${isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"}`,
          }}>
            <span style={{ color: isDark ? "#ddd" : "#333" }}>
              {entry.kind === "ref" ? entry.template_name : entry.name}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{
                fontSize: 10,
                color: isDark ? "#888" : "#888",
                padding: "1px 6px",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
                borderRadius: 10,
              }}>{entry.kind}</span>
              <button
                onClick={() => removeAt(idx)}
                style={{ border: "none", background: "transparent",
                         cursor: "pointer", color: "#c44" }}
              >✕</button>
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setPickerOpen(true)}
        style={{
          marginTop: 12, padding: "4px 10px",
          border: `1px solid #4a5bd8`,
          background: "transparent",
          color: "#4a5bd8",
          borderRadius: 4, fontSize: 12, cursor: "pointer",
        }}
      >+ Add subagent</button>

      {pickerOpen && (
        <SubagentPicker
          onPick={add}
          onClose={() => setPickerOpen(false)}
          isDark={isDark}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Smoke-test**

Run: `npm start`. Open Agents tab, select Default. Click Agent node → prompt editor shows the sentinel. Click a toolkit node → tool checkboxes appear (will be empty if `listToolkits()` hasn't been wired — that's OK for this task). Click the pool node → pool list with Explore.

- [ ] **Step 6: Stop (no commit)**

---

## Task 18: Subagent picker dialog + ref/inline sub-inspector

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js`

- [ ] **Step 1: Implement picker**

```javascript
// src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js
import { useEffect, useState } from "react";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import api from "../../../../SERVICEs/api.unchain";

export default function SubagentPicker({ onPick, onClose, isDark }) {
  const [tab, setTab] = useState("import");
  const [refs, setRefs] = useState([]);
  const [inlineName, setInlineName] = useState("");
  const [inlineFormat, setInlineFormat] = useState("soul");
  const [inlinePrompt, setInlinePrompt] = useState("");

  useEffect(() => {
    (async () => {
      const { refs: list } = await api.listSubagentRefs();
      setRefs(list);
    })();
  }, []);

  const tabBtn = (key, label) => (
    <span
      onClick={() => setTab(key)}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        cursor: "pointer",
        color: tab === key ? "#4a5bd8" : (isDark ? "#aaa" : "#666"),
        borderBottom: `2px solid ${tab === key ? "#4a5bd8" : "transparent"}`,
      }}
    >{label}</span>
  );

  const pickRef = (name) => {
    onPick({ kind: "ref", template_name: name, disabled_tools: [] });
  };

  const pickInline = () => {
    if (!inlineName.trim()) return;
    const template = inlineFormat === "skeleton"
      ? { name: inlineName, description: "", instructions: inlinePrompt }
      : { prompt: inlinePrompt };
    onPick({
      kind: "inline",
      name: inlineName.trim(),
      prompt_format: inlineFormat,
      template,
      disabled_tools: [],
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      style={{
        width: 520, height: 440,
        padding: 0,
        background: isDark ? "#1e1e22" : "#fff",
        color: isDark ? "#fff" : "#222",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 16px",
                    borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e5e5e7"}` }}>
        <div style={{ fontWeight: 600 }}>Add subagent</div>
        <div style={{ marginTop: 10, display: "flex", gap: 4 }}>
          {tabBtn("import", "Import from file")}
          {tabBtn("inline", "Author inline")}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", fontSize: 12 }}>
        {tab === "import" && (
          <div>
            {refs.length === 0 ? (
              <div style={{ color: isDark ? "#888" : "#888" }}>
                No subagent files in ~/.pupu/subagents/
              </div>
            ) : refs.map((r) => (
              <div key={r.name}
                onClick={() => pickRef(r.name)}
                style={{
                  padding: "8px 6px",
                  borderBottom: `1px dashed ${isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"}`,
                  cursor: "pointer",
                }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: isDark ? "#888" : "#888" }}>
                  {r.format} · {r.description}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "inline" && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <input
                placeholder="Subagent name"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                style={{
                  width: "100%", padding: "6px 8px",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
                  borderRadius: 4, fontSize: 12,
                  background: isDark ? "#141417" : "#fff",
                  color: isDark ? "#fff" : "#222",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ marginRight: 12 }}>
                <input
                  type="radio"
                  checked={inlineFormat === "soul"}
                  onChange={() => setInlineFormat("soul")}
                /> soul
              </label>
              <label>
                <input
                  type="radio"
                  checked={inlineFormat === "skeleton"}
                  onChange={() => setInlineFormat("skeleton")}
                /> skeleton
              </label>
            </div>
            <textarea
              rows={12}
              placeholder={inlineFormat === "skeleton"
                ? "(instructions text)"
                : "You are..."}
              value={inlinePrompt}
              onChange={(e) => setInlinePrompt(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
                borderRadius: 4,
                background: isDark ? "#141417" : "#fff",
                color: isDark ? "#fff" : "#222",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                onClick={pickInline}
                disabled={!inlineName.trim()}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  border: `1px solid #4a5bd8`,
                  background: inlineName.trim() ? "#4a5bd8" : "transparent",
                  color: inlineName.trim() ? "#fff" : "#4a5bd8",
                  borderRadius: 4,
                  cursor: inlineName.trim() ? "pointer" : "not-allowed",
                }}
              >Add</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Smoke-test**

Run: `npm start`. Open Agents → select Default → click Pool node → click "+ Add subagent". Picker appears with Explore in the Import tab. Click Explore → should add it (but it's already in Default, so now you'll have 2 "Explore" entries — acceptable for this skeleton; dedup can be a later enhancement).

Switch to "Author inline", type a name, pick skeleton, write some text, click Add. New entry appears in pool list.

- [ ] **Step 3: Stop (no commit)**

---

## Task 19: Chat attach_panel — Agents selector

**Files:**
- Modify: `src/COMPONENTs/chat-input/components/attach_panel.js`

- [ ] **Step 1: Read current selector rendering**

Read `src/COMPONENTs/chat-input/components/attach_panel.js` — find the flex container that renders `[Model] [Tools] [Workspaces]` selectors (likely around lines 278-440 per earlier exploration).

- [ ] **Step 2: Add a 4th Select for Agents**

Add props to the component's function signature (append to existing props):

```javascript
selectedRecipeName,      // string | null
onSelectRecipe,          // (name: string | null) => void
recipeOptions = [],      // [{ value: string, label: string }]
```

After the Workspace selector JSX, append:

```javascript
<Select
  options={recipeOptions}
  value={selectedRecipeName || "Default"}
  set_value={(v) => onSelectRecipe(v)}
  placeholder="Default"
  filterable={true}
  filter_mode="panel"
  search_placeholder="Search agents..."
  show_trigger_icon={true}
  open={openSelector === "agents"}
  on_open_change={(o) => setOpenSelector(o ? "agents" : null)}
  style={{ ...pillStyle, maxWidth: 160 }}
  dropdown_style={{ maxWidth: 240, minWidth: 160, maxHeight: 240 }}
/>
```

- [ ] **Step 3: Hide Tools selector when recipe ≠ null**

Locate the Tools `<Select>` rendering. Wrap in:

```javascript
{(!selectedRecipeName || selectedRecipeName === "Default") && (
  <Select ...tools props... />
)}
```

Rationale: per spec, Default recipe = legacy behavior, so keep Tools visible; any non-Default recipe hides it.

- [ ] **Step 4: Feed options from parent**

In the component's parent (where `AttachPanel` is rendered — likely `chat-input/chat_input.js` or `use_chat_stream.js` caller), add state + fetch:

```javascript
const [recipeOptions, setRecipeOptions] = useState([{ value: "Default", label: "Default" }]);
const [selectedRecipeName, setSelectedRecipeName] = useState("Default");

useEffect(() => {
  (async () => {
    try {
      const { recipes } = await api.unchain.listRecipes();
      setRecipeOptions(recipes.map((r) => ({ value: r.name, label: r.name })));
    } catch (exc) {
      /* keep Default fallback */
    }
  })();
}, []);
```

Pass to `<AttachPanel ... selectedRecipeName={selectedRecipeName} onSelectRecipe={setSelectedRecipeName} recipeOptions={recipeOptions} />`.

- [ ] **Step 5: Smoke-test**

Run: `npm start`. Open a chat. Confirm 4th selector appears showing "Default". Click it → dropdown shows any recipes (at minimum Default).

- [ ] **Step 6: Stop (no commit)**

---

## Task 20: Inject `recipe_name` into chat stream payload

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js`

- [ ] **Step 1: Thread selectedRecipeName through to use_chat_stream**

In `use_chat_stream.js`, find the hook signature and add `selectedRecipeName` to the args. Callers pass from their state. Example:

```javascript
export function useChatStream({
  threadId, selectedModelId, selectedToolkitIds, selectedWorkspaceIds,
  selectedRecipeName,        // ← NEW
  ...
}) {
```

- [ ] **Step 2: Inject into options**

Locate the `startStreamV2` call (around line 1423). In the `options: {...}` block, add:

```javascript
...(selectedRecipeName && selectedRecipeName !== "Default"
  ? { recipe_name: selectedRecipeName }
  : selectedRecipeName === "Default"
    ? { recipe_name: "Default" }
    : {}),
```

Simpler version (since Default is a real recipe, always send it):

```javascript
...(selectedRecipeName ? { recipe_name: selectedRecipeName } : {}),
```

Use the simpler version.

- [ ] **Step 3: End-to-end smoke**

Run: `npm start`. In a chat, select an Agent (e.g., Default), send a message "hi". Expected: chat works as before. Switch to any custom recipe you created in Task 15; message still works. Check the main-process logs for `[recipe]` log lines confirming the recipe was loaded.

- [ ] **Step 4: Stop (no commit)**

---

## Task 21: End-to-end verification + edge cases

**Files:** None (manual testing + spec check)

- [ ] **Step 1: Default recipe roundtrip**

- Open Agents tab → Default → toolkits show "core/workspace/terminal", pool shows "Explore"
- Chat with Default selected → behavior identical to pre-recipe PuPu
- Log line `[recipe]` confirms it was loaded

- [ ] **Step 2: Custom recipe save/delete**

- Create new recipe "Tester": soul prompt "Always start replies with 'TEST:'", one toolkit (core), pool with Explore ref
- Save (button should enable, then disable after save)
- Select in chat → send message → response begins with "TEST:"
- Delete "Tester" from list → confirm dialog → gone

- [ ] **Step 3: Missing toolkit / missing subagent**

- Manually edit `~/.pupu/agent_recipes/Default.recipe`: change one toolkit id to `ghost`
- Restart server, chat → Agents still works (log line: `[recipe] toolkit ghost referenced by recipe is not loaded; skipping`)
- Revert the edit.
- Delete `~/.pupu/subagents/Explore.skeleton`
- Chat with Default → log line: `[recipe] subagent ref Explore not found`. Agent still runs, just without Explore.

- [ ] **Step 4: Model override precedence**

- Create recipe with `model: "anthropic:claude-sonnet-4-6"`
- Select in chat; change Model dropdown to "openai:gpt-4o"
- Send message → server log should show `gpt-4o` (options.modelId wins over recipe.model)

- [ ] **Step 5: Run full backend test suite**

Run: `cd unchain_runtime/server && python -m pytest tests/ -q`
Expected: All tests pass (minus 3 preexisting failures unrelated to recipes).

- [ ] **Step 6: Stop (no commit)**

Summarize completion state in a message to the user and point to the dirty files for their review.

---

## Success Verification

This plan is complete when:

1. `cd unchain_runtime/server && python -m pytest tests/ -q` → all tests green (except 3 preexisting unrelated failures)
2. `npm start` launches PuPu; AgentsModal shows working "Agents" tab with Default recipe
3. Creating / editing / saving / deleting custom recipes works end-to-end
4. Selecting a recipe in chat makes the backend filter toolkits + materialize subagents per recipe (visible in Flask logs)
5. Default.recipe auto-seeded on first launch; `{{USE_BUILTIN_DEVELOPER_PROMPT}}` sentinel makes it equivalent to legacy behavior
6. Missing toolkit / missing ref / broken file → warn + fallback, never crash
