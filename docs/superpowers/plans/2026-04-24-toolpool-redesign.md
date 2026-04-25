# ToolPool Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Recipe ToolPool detail panel as a per-toolkit (not per-tool) picker with rich icons, expandable tool-tag preview, and a real `merge_with_user_selected` switch wired through to the Python recipe filter.

**Architecture:** Node schema becomes `node.toolkits = [{id, config}]` (whole-toolkit only). Detail panel splits into Pool (added toolkits, each independently collapsible — expanded shows read-only tool name chips) and Installed (rich rows with `ToolkitIcon` + name + description + "Add" button; toolkits already in Pool are hidden). Recipe gains a top-level `merge_with_user_selected: boolean` flag (default `true`) that the Python `_apply_recipe_toolkit_filter` consults: ON unions recipe toolkits with the user's chat-time selection, OFF uses recipe toolkits only and ignores the user's selection. Catalog data comes from `api.unchain.listToolModalCatalog()` (rich) instead of `getToolkitCatalog()`. Scrolling uses the mini-ui `.scrollable` overlay class with `data-sb-edge` set so the track sits well below the panel's top edge.

**Tech Stack:** React 19 (function components, hooks, inline styles), JS only — no TS/PropTypes; mini-ui BUILTIN_COMPONENTs (`Button`, `Input`, `Switch`, `Icon`, `ToolkitIcon`); Python 3 dataclasses + Flask sidecar; Jest + `@testing-library/react`.

---

## File Structure

**Frontend — modify:**
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js` — full rewrite
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js` — full rewrite
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` — `add_node("toolpool")` defaults
- `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.js` — legacy `tools` → new `toolkits` mapping; default `merge_with_user_selected`
- `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.js` — read `node.toolkits` instead of `node.tools`; persist `merge_with_user_selected`

**Backend — modify:**
- `unchain_runtime/server/recipe.py` — add `merge_with_user_selected: bool` to `Recipe` dataclass + parser
- `unchain_runtime/server/unchain_adapter.py` — change `_apply_recipe_toolkit_filter` semantics; thread merge flag from `recipe` argument
- `unchain_runtime/server/recipe_seeds.py` — add `merge_with_user_selected: True` to `DEFAULT_RECIPE`

**Backend — tests:**
- `unchain_runtime/server/tests/test_recipe.py` — add cases for new field
- `unchain_runtime/server/tests/test_unchain_adapter_recipe_filter.py` — new file (or add to existing recipe filter test if any)

The toolpool panel grows substantially but stays a single file because all sub-pieces share `catalog`, `added_set`, and `tool_meta` derivations. Splitting would force prop-drilling without isolating any reusable concern.

---

## Task 1: Add `merge_with_user_selected` to Recipe schema (backend)

**Files:**
- Modify: `unchain_runtime/server/recipe.py:51-60` (`Recipe` dataclass), `:126-160` (`parse_recipe_json`)
- Test: `unchain_runtime/server/tests/test_recipe.py` (or wherever `parse_recipe_json` tests live — see Step 0)

- [ ] **Step 0: Locate existing recipe tests**

Run: `ls unchain_runtime/server/tests/ | grep -i recipe`
If a `test_recipe.py` exists, append; if not, create it with the imports below.

```python
import pytest
from recipe import parse_recipe_json, RecipeValidationError
```

- [ ] **Step 1: Write the failing test**

Add to `unchain_runtime/server/tests/test_recipe.py`:

```python
def _base_recipe_dict():
    return {
        "name": "T",
        "description": "",
        "model": None,
        "agent": {"prompt_format": "skeleton", "prompt": ""},
        "toolkits": [],
        "subagent_pool": [],
    }


def test_merge_with_user_selected_defaults_to_true():
    r = parse_recipe_json(_base_recipe_dict())
    assert r.merge_with_user_selected is True


def test_merge_with_user_selected_false_round_trip():
    data = _base_recipe_dict()
    data["merge_with_user_selected"] = False
    r = parse_recipe_json(data)
    assert r.merge_with_user_selected is False


def test_merge_with_user_selected_must_be_bool():
    data = _base_recipe_dict()
    data["merge_with_user_selected"] = "yes"
    with pytest.raises(RecipeValidationError):
        parse_recipe_json(data)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe.py -k merge_with_user_selected -v`
Expected: FAIL with `AttributeError: 'Recipe' object has no attribute 'merge_with_user_selected'` (or similar).

- [ ] **Step 3: Add the field to the dataclass**

Edit `unchain_runtime/server/recipe.py`:

Replace the `Recipe` dataclass:

```python
@dataclass(frozen=True)
class Recipe:
    name: str
    description: str
    model: str | None
    max_iterations: int | None
    agent: RecipeAgent
    toolkits: tuple[ToolkitRef, ...]
    subagent_pool: tuple[SubagentRef | InlineSubagent, ...]
    merge_with_user_selected: bool = True
```

- [ ] **Step 4: Parse the field**

In `parse_recipe_json`, after `pool = tuple(...)` and before the `return Recipe(...)`:

```python
    merge = data.get("merge_with_user_selected", True)
    _require(isinstance(merge, bool), "merge_with_user_selected must be a boolean")
```

Update the `return Recipe(...)` call:

```python
    return Recipe(
        name=name,
        description=description,
        model=model,
        max_iterations=max_iter,
        agent=agent,
        toolkits=toolkits,
        subagent_pool=pool,
        merge_with_user_selected=merge,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_recipe.py -k merge_with_user_selected -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add unchain_runtime/server/recipe.py unchain_runtime/server/tests/test_recipe.py
git commit -m "feat(recipe): add merge_with_user_selected schema field"
```

---

## Task 2: Change `_apply_recipe_toolkit_filter` to support merge semantics

**Files:**
- Modify: `unchain_runtime/server/unchain_adapter.py:3161-3189` (function body), `:3243-3244` (call site)
- Test: `unchain_runtime/server/tests/test_unchain_adapter_recipe_filter.py` (new file)

**Why this change:** Today the function always intersects "loaded user toolkits" with "recipe.toolkits refs" — there is no way to express "use exactly the recipe's toolkits regardless of what the user picked," nor "merge the recipe's toolkits with the user's." We rebuild the function to take both lists and a `merge` flag.

- [ ] **Step 1: Write the failing test**

Create `unchain_runtime/server/tests/test_unchain_adapter_recipe_filter.py`:

```python
"""Tests for unchain_adapter._apply_recipe_toolkit_filter merge semantics."""
from types import SimpleNamespace

from recipe import ToolkitRef
from unchain_adapter import _apply_recipe_toolkit_filter


def _tk(tk_id, tools=None):
    return SimpleNamespace(id=tk_id, name=tk_id, tools=dict(tools or {}))


def test_merge_off_returns_only_recipe_toolkits():
    user = [_tk("core", {"read": object(), "write": object()})]
    registry = [
        _tk("core", {"read": object(), "write": object()}),
        _tk("external_api", {"fetch": object()}),
    ]
    refs = (ToolkitRef(id="external_api", enabled_tools=None),)

    out = _apply_recipe_toolkit_filter(
        user_toolkits=user,
        registry_toolkits=registry,
        refs=refs,
        merge=False,
    )
    assert [tk.id for tk in out] == ["external_api"]


def test_merge_on_unions_user_and_recipe():
    user = [_tk("core", {"read": object()})]
    registry = [
        _tk("core", {"read": object()}),
        _tk("external_api", {"fetch": object()}),
    ]
    refs = (ToolkitRef(id="external_api", enabled_tools=None),)

    out = _apply_recipe_toolkit_filter(
        user_toolkits=user,
        registry_toolkits=registry,
        refs=refs,
        merge=True,
    )
    assert sorted(tk.id for tk in out) == ["core", "external_api"]


def test_merge_on_dedupes_when_recipe_overlaps_user():
    user = [_tk("core", {"read": object()})]
    registry = [_tk("core", {"read": object()})]
    refs = (ToolkitRef(id="core", enabled_tools=None),)

    out = _apply_recipe_toolkit_filter(
        user_toolkits=user,
        registry_toolkits=registry,
        refs=refs,
        merge=True,
    )
    assert [tk.id for tk in out] == ["core"]


def test_merge_off_skips_unknown_recipe_toolkit():
    registry = [_tk("core", {"read": object()})]
    refs = (ToolkitRef(id="ghost", enabled_tools=None),)
    out = _apply_recipe_toolkit_filter(
        user_toolkits=[],
        registry_toolkits=registry,
        refs=refs,
        merge=False,
    )
    assert out == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_recipe_filter.py -v`
Expected: FAIL with `TypeError: _apply_recipe_toolkit_filter() got an unexpected keyword argument 'user_toolkits'`.

- [ ] **Step 3: Rewrite the filter function**

Replace `_apply_recipe_toolkit_filter` in `unchain_runtime/server/unchain_adapter.py` (currently lines 3161-3189):

```python
def _apply_recipe_toolkit_filter(
    *,
    user_toolkits: list,
    registry_toolkits: list,
    refs: tuple,
    merge: bool,
) -> list:
    """Resolve final toolkit list for an agent run.

    - When `merge=True`: union(user_toolkits, recipe-referenced toolkits from registry).
      Preserves user_toolkits order; appends recipe-only toolkits after.
    - When `merge=False`: only recipe-referenced toolkits (user selection ignored).
    - Recipe refs whose `enabled_tools` is non-null narrow that toolkit's `tools` dict.
    - Recipe refs that don't resolve in the registry are skipped with a warning.
    """
    import copy as _copy

    registry_by_id = {
        getattr(tk, "id", getattr(tk, "name", None)): tk for tk in registry_toolkits
    }
    user_by_id = {
        getattr(tk, "id", getattr(tk, "name", None)): tk for tk in user_toolkits
    }

    recipe_resolved: dict[str, object] = {}
    for ref in refs:
        tk = registry_by_id.get(ref.id) or user_by_id.get(ref.id)
        if tk is None:
            _subagent_logger.warning(
                "[recipe] toolkit %s referenced by recipe is not loaded; skipping",
                ref.id,
            )
            continue
        if ref.enabled_tools is None:
            recipe_resolved[ref.id] = tk
            continue
        narrowed = _copy.copy(tk)
        allowed = set(ref.enabled_tools)
        narrowed.tools = {
            name: tool for name, tool in tk.tools.items() if name in allowed
        }
        recipe_resolved[ref.id] = narrowed

    if not merge:
        return list(recipe_resolved.values())

    merged: list = []
    seen: set[str] = set()
    for tk in user_toolkits:
        tk_id = getattr(tk, "id", getattr(tk, "name", None))
        if tk_id in seen:
            continue
        seen.add(tk_id)
        merged.append(tk)
    for tk_id, tk in recipe_resolved.items():
        if tk_id in seen:
            continue
        seen.add(tk_id)
        merged.append(tk)
    return merged
```

- [ ] **Step 4: Update the call site to pass the new arguments**

In `unchain_runtime/server/unchain_adapter.py:3243-3244`, replace:

```python
    if recipe is not None:
        toolkits = _apply_recipe_toolkit_filter(toolkits, recipe.toolkits)
```

with:

```python
    if recipe is not None:
        toolkits = _apply_recipe_toolkit_filter(
            user_toolkits=toolkits,
            registry_toolkits=_load_full_toolkit_registry(),
            refs=recipe.toolkits,
            merge=recipe.merge_with_user_selected,
        )
```

- [ ] **Step 5: Add `_load_full_toolkit_registry`**

The merge=ON path needs access to toolkits the user did not pre-select. Add this helper near the existing `_apply_recipe_toolkit_filter` (above it):

```python
def _load_full_toolkit_registry() -> list:
    """Return every loadable PuPu toolkit instance, regardless of user selection.

    Used when a Recipe references a toolkit the chat user hasn't enabled — we
    still need to resolve it. Falls back to an empty list if the registry import
    is unavailable in the current runtime build.
    """
    try:
        from toolkits import load_all_toolkits  # type: ignore
    except ImportError:
        return []
    try:
        return list(load_all_toolkits())
    except Exception as exc:  # noqa: BLE001
        _subagent_logger.warning("[recipe] failed to load full toolkit registry: %s", exc)
        return []
```

**Note for the executor:** the exact module path for `load_all_toolkits` may differ — search for the function PuPu currently uses to enumerate toolkits at startup (look in `unchain_adapter.py` for where `toolkits` originally gets built before user selection). If the actual entry point is named differently, update the import. This helper must NOT raise on missing toolkits; it just returns whatever is loadable.

Run: `grep -rn "def load_all_toolkits\|toolkit_registry\|all_toolkits" unchain_runtime/server/ | head -20` to locate the right function before editing.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd unchain_runtime/server && python -m pytest tests/test_unchain_adapter_recipe_filter.py -v`
Expected: 4 PASS.

- [ ] **Step 7: Run the broader suite to check nothing else broke**

Run: `cd unchain_runtime/server && python -m pytest tests/ -k "recipe or adapter" -v`
Expected: existing recipe / adapter tests still pass.

- [ ] **Step 8: Commit**

```bash
git add unchain_runtime/server/unchain_adapter.py unchain_runtime/server/tests/test_unchain_adapter_recipe_filter.py
git commit -m "feat(recipe): support merge_with_user_selected in toolkit filter"
```

---

## Task 3: Update `Default.recipe` seed

**Files:**
- Modify: `unchain_runtime/server/recipe_seeds.py:14-31`

- [ ] **Step 1: Edit `DEFAULT_RECIPE`**

Replace the existing `DEFAULT_RECIPE` dict entirely:

```python
DEFAULT_RECIPE: dict = {
    "name": "Default",
    "description": "PuPu 默认 agent 配置（复刻内置行为）",
    "model": None,
    "max_iterations": None,
    "merge_with_user_selected": True,
    "agent": {
        "prompt_format": "skeleton",
        "prompt": "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
    },
    "toolkits": [
        {"id": "core", "enabled_tools": None},
    ],
    "subagent_pool": [
        {"kind": "ref", "template_name": "Explore", "disabled_tools": []},
    ],
}
```

**Why:** removed legacy `workspace`/`terminal` toolkits (they don't exist in the current registry — runtime warned and dropped them). Added the new merge flag explicitly so users see it in the seeded file. `core` stays so the default agent has its built-in tools.

- [ ] **Step 2: Manually verify (no unit test needed — pure data)**

Delete an existing `~/.pupu/agent_recipes/Default.recipe` if any, restart the runtime once, and confirm a fresh file is written with the new shape.

```bash
rm -f ~/.pupu/agent_recipes/Default.recipe
# then start the runtime once
cat ~/.pupu/agent_recipes/Default.recipe
```

Expected: the JSON contains `"merge_with_user_selected": true` and only `core` in `toolkits`.

- [ ] **Step 3: Commit**

```bash
git add unchain_runtime/server/recipe_seeds.py
git commit -m "chore(recipe): clean up Default seed and add merge flag"
```

---

## Task 4: Migrate node schema `tools` → `toolkits` in `recipe_migration.js`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.js:45-65` (`make_toolpool_node`), `:79-151` (`migrate_recipe`)

**Why:** New schema is `node.toolkits = [{id: "core", config: {}}]` — whole-toolkit only, no per-tool entries. Legacy recipes have `node.tools = [{id: "core:read_file", enabled, config}]` and even older ones have a top-level `recipe.toolkits` array. Migration must collapse both into the new shape.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js` if it doesn't exist; otherwise append:

```javascript
import { migrate_recipe } from "./recipe_migration";

describe("recipe_migration toolkits schema", () => {
  test("legacy top-level toolkits become node.toolkits with whole-toolkit refs", () => {
    const legacy = {
      name: "X",
      agent: { model: "gpt", prompt: "" },
      toolkits: [
        { id: "core" },
        { id: "external_api", enabled_tools: ["fetch"] },
      ],
    };
    const out = migrate_recipe(legacy);
    const tp = out.nodes.find((n) => n.type === "toolpool");
    expect(tp).toBeTruthy();
    expect(tp.toolkits).toEqual([
      { id: "core", config: {} },
      { id: "external_api", config: {} },
    ]);
    expect(tp.tools).toBeUndefined();
  });

  test("merge_with_user_selected defaults to true on migration", () => {
    const legacy = { name: "X", agent: { prompt: "" } };
    const out = migrate_recipe(legacy);
    expect(out.merge_with_user_selected).toBe(true);
  });

  test("explicit merge_with_user_selected on legacy recipe is preserved", () => {
    const legacy = {
      name: "X",
      agent: { prompt: "" },
      merge_with_user_selected: false,
    };
    const out = migrate_recipe(legacy);
    expect(out.merge_with_user_selected).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test --watchAll=false src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js`
Expected: FAIL — `tp.toolkits` is undefined.

- [ ] **Step 3: Replace `make_toolpool_node`**

In `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.js`, replace the existing `make_toolpool_node` function:

```javascript
function make_toolpool_node(legacy_toolkits) {
  const seen = new Set();
  const toolkits = [];
  for (const tk of legacy_toolkits) {
    if (!tk || typeof tk.id !== "string") continue;
    if (seen.has(tk.id)) continue;
    seen.add(tk.id);
    toolkits.push({ id: tk.id, config: {} });
  }
  return {
    id: "tp_1",
    type: "toolpool",
    kind: "plugin",
    deletable: true,
    toolkits,
    x: TOOLPOOL_POS.x,
    y: TOOLPOOL_POS.y,
  };
}
```

- [ ] **Step 4: Add merge flag default in `migrate_recipe`**

Replace the final return inside `migrate_recipe`:

```javascript
  const { agent, toolkits, subagent_pool, ...rest } = recipe;
  const merge =
    typeof recipe.merge_with_user_selected === "boolean"
      ? recipe.merge_with_user_selected
      : true;
  return { ...rest, merge_with_user_selected: merge, nodes, edges };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx react-scripts test --watchAll=false src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js`
Expected: all 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_migration.js src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js
git commit -m "feat(recipe): migrate legacy tools field to whole-toolkit schema"
```

---

## Task 5: Update `recipe_canvas.js` to use new toolpool defaults

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js:147-155` (toolpool entry in `base_defaults`)

- [ ] **Step 1: Edit the toolpool default**

Replace the `toolpool` entry inside `base_defaults` (currently uses `tools: []`):

```javascript
      toolpool: {
        id,
        type: "toolpool",
        kind: "plugin",
        deletable: true,
        toolkits: [],
        x: 400,
        y: 100,
      },
```

- [ ] **Step 2: Manually verify (no unit test — config-only change)**

The cumulative test in Task 8 will exercise newly-added toolpools.

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js
git commit -m "feat(recipe): default new toolpool nodes with toolkits[] schema"
```

---

## Task 6: Update `recipe_save_payload.js` for new schema

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.js`

**Why:** The Python validator still expects legacy `recipe.toolkits = [{id, enabled_tools}]`. Now that the node holds whole-toolkit refs, every toolkit becomes `{id, enabled_tools: null}` — drop the per-tool grouping logic. Also persist `merge_with_user_selected` so the backend sees it.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`:

```javascript
import { to_save_payload } from "./recipe_save_payload";

const baseAgent = {
  id: "agent_main",
  type: "agent",
  override: { model: "gpt", prompt: "hi" },
};

test("converts node.toolkits to legacy whole-toolkit refs", () => {
  const recipe = {
    name: "X",
    nodes: [
      baseAgent,
      {
        id: "tp_1",
        type: "toolpool",
        toolkits: [
          { id: "core", config: {} },
          { id: "external_api", config: {} },
        ],
      },
    ],
    edges: [],
  };
  const out = to_save_payload(recipe);
  expect(out.toolkits).toEqual([{ id: "core" }, { id: "external_api" }]);
});

test("dedupes duplicate toolkit ids", () => {
  const recipe = {
    name: "X",
    nodes: [
      baseAgent,
      {
        id: "tp_1",
        type: "toolpool",
        toolkits: [
          { id: "core", config: {} },
          { id: "core", config: {} },
        ],
      },
    ],
    edges: [],
  };
  const out = to_save_payload(recipe);
  expect(out.toolkits).toEqual([{ id: "core" }]);
});

test("persists merge_with_user_selected, defaulting to true", () => {
  const r1 = { name: "X", nodes: [baseAgent], edges: [] };
  expect(to_save_payload(r1).merge_with_user_selected).toBe(true);

  const r2 = { ...r1, merge_with_user_selected: false };
  expect(to_save_payload(r2).merge_with_user_selected).toBe(false);
});

test("missing toolpool node yields empty toolkits", () => {
  const recipe = { name: "X", nodes: [baseAgent], edges: [] };
  expect(to_save_payload(recipe).toolkits).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test --watchAll=false src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`
Expected: FAIL — current code reads `node.tools`, not `node.toolkits`.

- [ ] **Step 3: Replace the file**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.js`:

```javascript
/* Build a save-ready payload from a node/edge recipe.
 *
 * The Python backend (recipe.py) validates a legacy schema with top-level
 * `toolkits`, `agent`, `subagent_pool`, plus our new `merge_with_user_selected`.
 * We derive these from the current nodes; recipe_loader.save_recipe writes the
 * full dict verbatim, so unknown keys (nodes, edges) round-trip. */

function toolkits_from_node(tp_node) {
  if (!tp_node || !Array.isArray(tp_node.toolkits)) return [];
  const seen = new Set();
  const out = [];
  for (const tk of tp_node.toolkits) {
    if (!tk || typeof tk.id !== "string" || !tk.id) continue;
    if (seen.has(tk.id)) continue;
    seen.add(tk.id);
    out.push({ id: tk.id });
  }
  return out;
}

function subagents_from_node(sp_node) {
  if (!sp_node || !Array.isArray(sp_node.subagents)) return [];
  return sp_node.subagents.map((s) => ({ ...s }));
}

export function to_save_payload(recipe) {
  if (!recipe || !Array.isArray(recipe.nodes)) return recipe;

  const agent_node =
    recipe.nodes.find((n) => n.id === "agent_main" && n.type === "agent") ||
    recipe.nodes.find((n) => n.type === "agent");
  const tp_node = recipe.nodes.find((n) => n.type === "toolpool");
  const sp_node = recipe.nodes.find((n) => n.type === "subagent_pool");

  const override = agent_node?.override || {};
  const agent = {
    prompt_format: override.prompt_format || "skeleton",
    prompt: typeof override.prompt === "string" ? override.prompt : "",
  };

  const model =
    typeof override.model === "string" && override.model
      ? override.model
      : recipe.model ?? null;

  const merge =
    typeof recipe.merge_with_user_selected === "boolean"
      ? recipe.merge_with_user_selected
      : true;

  return {
    ...recipe,
    agent,
    model,
    merge_with_user_selected: merge,
    toolkits: toolkits_from_node(tp_node),
    subagent_pool: subagents_from_node(sp_node),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test --watchAll=false src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.js src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js
git commit -m "feat(recipe): emit legacy toolkits from new node schema and persist merge flag"
```

---

## Task 7: Rewrite `toolpool_panel.js` with new design

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js` — full rewrite
- The matching test rewrite is **Task 8** below.

**Design summary (confirmed with user):**
- Top: tiny header "ToolPool" + a `Switch` row labeled "Merge with user-selected" — toggling writes `recipe.merge_with_user_selected`.
- **Pool section** (added toolkits): each toolkit is a row showing `ToolkitIcon` + name + tool count + chevron + `×` remove button. Clicking the row toggles **only that toolkit's** expansion (not all). Expanded view shows the toolkit's tools as read-only rounded chips wrapped in a flex row. Each toolkit's expansion state is keyed by toolkit id.
- **Search bar:** filters the **Installed** list only (not the pool).
- **Tabs:** `Installed` | `Store`. Store tab shows the existing "coming soon" placeholder.
- **Installed section:** rich rows (`ToolkitIcon` + name + description) with an "Add" `Button` (label, not just icon) on the right. Toolkits already in the pool are **hidden** from this list. Empty state when nothing matches.
- **Scrolling:** the entire panel content is wrapped in a `<div className="scrollable" data-sb-edge="14">` so the mini-ui overlay scrollbar's track sits 14px from both top and bottom — keeping it well clear of the panel's top edge.

The data source switches from `getToolkitCatalog()` to `listToolModalCatalog()` for icon and description metadata.

- [ ] **Step 1: Read the rich catalog shape**

Run: `grep -n "listToolModalCatalog\|toolkitIcon\|toolkitName\|toolkitDescription" src/COMPONENTs/toolkit/components/toolkit_row.js src/SERVICEs/api.unchain.js | head -30`

Confirm the response shape — each toolkit object has `{ toolkitId, toolkitName, toolkitIcon, toolkitDescription, tools: [{name, description}] }`. Use these field names below.

- [ ] **Step 2: Replace the file**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`:

```javascript
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import { Input } from "../../../../../BUILTIN_COMPONENTs/input/input";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import ToolkitIcon from "../../../../toolkit/components/toolkit_icon";

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const TABS = [
  { key: "installed", label: "Installed", icon: "tool" },
  { key: "store", label: "Store", icon: "search" },
];

export default function ToolPoolPanel({ node, recipe, onChange, isDark }) {
  const [catalog, setCatalog] = useState([]);
  const [active_tab, setActiveTab] = useState("installed");
  const [search, setSearch] = useState("");
  const [pool_expanded, setPoolExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await api.unchain.listToolModalCatalog();
        const tks = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
        if (!cancelled) setCatalog(tks);
      } catch (_exc) {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toolkits = Array.isArray(node.toolkits) ? node.toolkits : [];

  const added_set = useMemo(() => {
    const s = new Set();
    for (const t of toolkits) {
      if (t && typeof t.id === "string") s.add(t.id);
    }
    return s;
  }, [toolkits]);

  const meta_by_id = useMemo(() => {
    const map = {};
    for (const tk of catalog) {
      if (tk && typeof tk.toolkitId === "string") map[tk.toolkitId] = tk;
    }
    return map;
  }, [catalog]);

  const merge_on =
    typeof recipe.merge_with_user_selected === "boolean"
      ? recipe.merge_with_user_selected
      : true;

  function update_recipe(patch) {
    onChange({ ...recipe, ...patch });
  }

  function update_node(patch) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  }

  function set_merge(on) {
    update_recipe({ merge_with_user_selected: !!on });
  }

  function add_toolkit(tk_id) {
    if (added_set.has(tk_id)) return;
    update_node({ toolkits: [...toolkits, { id: tk_id, config: {} }] });
  }

  function remove_toolkit(tk_id) {
    update_node({ toolkits: toolkits.filter((t) => t.id !== tk_id) });
  }

  function toggle_pool_expanded(tk_id) {
    setPoolExpanded((p) => ({ ...p, [tk_id]: !p[tk_id] }));
  }

  const filtered_installed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((tk) => !added_set.has(tk.toolkitId))
      .filter((tk) => {
        if (!q) return true;
        const name = (tk.toolkitName || tk.toolkitId || "").toLowerCase();
        const desc = (tk.toolkitDescription || "").toLowerCase();
        if (name.includes(q) || desc.includes(q)) return true;
        const tools = Array.isArray(tk.tools) ? tk.tools : [];
        return tools.some((t) => (t.name || "").toLowerCase().includes(q));
      });
  }, [catalog, added_set, search]);

  const muted = isDark ? "#9a9aa3" : "#86868b";
  const accent = "#4a5bd8";
  const divider = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const row_bg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";
  const chip_bg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.045)";
  const chip_color = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.7)";

  return (
    <div
      className="scrollable"
      data-sb-edge="14"
      style={{
        position: "relative",
        maxHeight: "100%",
        overflow: "auto",
        paddingTop: 14,
        paddingBottom: 6,
        paddingLeft: 2,
        paddingRight: 2,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #f6a341, #ea7547)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          T
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>ToolPool</div>
      </div>

      {/* Merge switch */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 8px",
          borderRadius: 6,
          background: row_bg,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            Merge with user-selected
          </span>
          <span style={{ fontSize: 10.5, color: muted }}>
            {merge_on
              ? "Recipe toolkits + user's chat-time selection"
              : "Recipe toolkits only (ignore user selection)"}
          </span>
        </div>
        <Switch
          on={merge_on}
          set_on={set_merge}
          style={{ width: 32, height: 18 }}
        />
      </div>

      {/* Pool section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={SECTION_LABEL}>Pool</span>
          <span style={{ fontSize: 11, color: muted }}>
            {toolkits.length} toolkit{toolkits.length === 1 ? "" : "s"}
          </span>
        </div>
        {toolkits.length === 0 && (
          <span style={{ fontSize: 11, color: muted }}>
            Add toolkits from the list below.
          </span>
        )}
        {toolkits.map((entry) => {
          const tk = meta_by_id[entry.id] || {
            toolkitId: entry.id,
            toolkitName: entry.id,
            toolkitIcon: {},
            tools: [],
          };
          const tools = Array.isArray(tk.tools) ? tk.tools : [];
          const expanded = !!pool_expanded[entry.id];
          return (
            <div
              key={entry.id}
              style={{
                background: row_bg,
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                onClick={() => toggle_pool_expanded(entry.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 6px 6px 8px",
                  cursor: "pointer",
                }}
              >
                <Icon
                  src={expanded ? "arrow_down" : "arrow_right"}
                  style={{ width: 9, height: 9, opacity: 0.55 }}
                />
                <ToolkitIcon
                  icon={tk.toolkitIcon}
                  size={16}
                  fallbackColor={accent}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tk.toolkitName || entry.id}
                </span>
                <span style={{ fontSize: 10.5, color: muted }}>
                  {tools.length}
                </span>
                <Button
                  prefix_icon="close"
                  onClick={(e) => {
                    if (e?.stopPropagation) e.stopPropagation();
                    remove_toolkit(entry.id);
                  }}
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 3,
                    borderRadius: 4,
                    content: { icon: { width: 11, height: 11 } },
                  }}
                />
              </div>
              {expanded && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    padding: "0 8px 8px 28px",
                  }}
                >
                  {tools.length === 0 && (
                    <span style={{ fontSize: 11, color: muted }}>
                      No tools.
                    </span>
                  )}
                  {tools.map((t) => (
                    <span
                      key={t.name}
                      style={{
                        fontSize: 10.5,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        color: chip_color,
                        background: chip_bg,
                        padding: "2px 7px",
                        borderRadius: 999,
                      }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs + Installed list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 6,
          borderTop: `1px solid ${divider}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {TABS.map((tab) => {
            const is_active = active_tab === tab.key;
            return (
              <Button
                key={tab.key}
                prefix_icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  opacity: is_active ? 1 : 0.5,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  gap: 4,
                  content: { icon: { width: 12, height: 12 } },
                }}
              />
            );
          })}
        </div>

        {active_tab === "installed" && (
          <>
            <Input
              prefix_icon="search"
              value={search}
              set_value={setSearch}
              placeholder="Search tools..."
              style={{
                fontSize: 12,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 6,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered_installed.length === 0 && (
                <span style={{ fontSize: 11, color: muted }}>
                  {catalog.length === 0
                    ? "No toolkits installed."
                    : added_set.size === catalog.length
                      ? "All installed toolkits are in the pool."
                      : `No toolkits matching "${search.trim()}"`}
                </span>
              )}
              {filtered_installed.map((tk) => {
                const tools = Array.isArray(tk.tools) ? tk.tools : [];
                return (
                  <div
                    key={tk.toolkitId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: row_bg,
                    }}
                  >
                    <ToolkitIcon
                      icon={tk.toolkitIcon}
                      size={28}
                      fallbackColor={accent}
                      style={{ borderRadius: 8, flexShrink: 0 }}
                    />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tk.toolkitName || tk.toolkitId}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tk.toolkitDescription || `${tools.length} tools`}
                      </span>
                    </div>
                    <Button
                      prefix_icon="add"
                      label="Add"
                      onClick={() => add_toolkit(tk.toolkitId)}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        gap: 3,
                        color: accent,
                        content: { icon: { width: 11, height: 11 } },
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {active_tab === "store" && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              fontSize: 11.5,
              color: muted,
            }}
          >
            Tool Store coming soon.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-build (no test yet — Task 8 covers tests)**

Run: `npx react-scripts test --watchAll=false --listTests src/COMPONENTs/agents/pages/recipes_page/detail_panel/`
Expected: tests are listed without import errors.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js
git commit -m "feat(recipe): redesign ToolPool panel with collapsible pool and rich installed list"
```

---

## Task 8: Rewrite `toolpool_panel.test.js`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js` — full rewrite

- [ ] **Step 1: Replace the file**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`:

```javascript
import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import ToolPoolPanel from "./toolpool_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

jest.mock("../../../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listToolModalCatalog: jest.fn(),
    },
  },
}));

const { api } = require("../../../../../SERVICEs/api");

beforeEach(() => {
  api.unchain.listToolModalCatalog.mockReset();
  api.unchain.listToolModalCatalog.mockResolvedValue({
    toolkits: [
      {
        toolkitId: "core",
        toolkitName: "Core",
        toolkitIcon: {},
        toolkitDescription: "Built-in tools",
        tools: [
          { name: "read_file", description: "Read content of a file." },
          { name: "write_file" },
        ],
      },
      {
        toolkitId: "external_api",
        toolkitName: "External API",
        toolkitIcon: {},
        toolkitDescription: "HTTP fetch",
        tools: [{ name: "fetch" }],
      },
    ],
  });
});

function makeRecipe(extra = {}) {
  const node = { id: "tp", type: "toolpool", toolkits: [], ...extra };
  return {
    node,
    recipe: { nodes: [node], edges: [], merge_with_user_selected: true },
  };
}

describe("ToolPoolPanel — pool", () => {
  test("renders pool entries with toolkit name and tool count", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    // tool count "2" appears in pool row
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("clicking a pool row expands only that toolkit", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [
        { id: "core", config: {} },
        { id: "external_api", config: {} },
      ],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Core"));
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("write_file")).toBeInTheDocument();
    // external_api stays collapsed → its only tool 'fetch' is not visible yet
    expect(screen.queryByText("fetch")).not.toBeInTheDocument();
  });

  test("clicking × removes the toolkit from the pool", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    const onChange = jest.fn();
    const { container } = render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    // close button is the only Button in the pool row with no label
    const buttons = container.querySelectorAll("button");
    const closeBtn = Array.from(buttons).find(
      (b) => b.textContent.trim() === "" && b.querySelector("img,svg") !== null,
    );
    fireEvent.click(closeBtn);
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits).toEqual([]);
  });
});

describe("ToolPoolPanel — installed list", () => {
  test("hides toolkits already in the pool", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("External API")).toBeInTheDocument();
    });
    // "Core" appears once in the pool row but NOT in the installed list.
    // Installed list rows render a description line; verify Core's description
    // ("Built-in tools") is absent.
    expect(screen.queryByText("Built-in tools")).not.toBeInTheDocument();
    expect(screen.getByText("HTTP fetch")).toBeInTheDocument();
  });

  test("clicking Add adds the toolkit and removes it from installed", async () => {
    const { node, recipe } = makeRecipe();
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[0]); // first installed row → Core
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits).toEqual([{ id: "core", config: {} }]);
  });

  test("search filters installed list by name and tool name", async () => {
    const { node, recipe } = makeRecipe();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    const search = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(search, { target: { value: "fetch" } });
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("External API")).toBeInTheDocument();
  });
});

describe("ToolPoolPanel — merge switch", () => {
  test("toggling the merge switch updates recipe.merge_with_user_selected", async () => {
    const { node, recipe } = makeRecipe();
    const onChange = jest.fn();
    const { container } = render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Merge with user-selected")).toBeInTheDocument();
    });
    const track = container.querySelector(".mini-ui-switch-track");
    expect(track).toBeTruthy();
    fireEvent.click(track);
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.merge_with_user_selected).toBe(false);
  });
});

describe("ToolPoolPanel — Store tab", () => {
  test("shows the coming-soon placeholder", async () => {
    const { node, recipe } = makeRecipe();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Store"));
    expect(screen.getByText("Tool Store coming soon.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx react-scripts test --watchAll=false src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js
git commit -m "test(recipe): cover ToolPool redesign — pool collapse, add/remove, merge, search"
```

---

## Task 9: End-to-end manual smoke check

**Files:** None (verification only).

- [ ] **Step 1: Run the full app**

```bash
npm start
```

- [ ] **Step 2: Open the Agent Recipe Builder, select the toolpool node, verify**:

1. Switch "Merge with user-selected" toggles between two helper-text states.
2. Pool section: rows show real toolkit icons; clicking one row expands its tool chips without affecting other rows.
3. `×` on a pool row removes that toolkit; it then reappears in the Installed list.
4. Installed rows show icon + name + description + "Add" button; clicking "Add" moves the toolkit to the pool and hides it from Installed.
5. Search bar filters Installed list (not Pool).
6. Switching to "Store" tab shows the placeholder text.
7. Scrollbar track sits well below the panel's top edge (~14px gap), and the Pool section's first row is not clipped.
8. Save the recipe, then reopen — state round-trips: merge flag, pool toolkits, all preserved.
9. Open `~/.pupu/agent_recipes/Default.recipe` (or whichever recipe was saved) — confirm it contains `merge_with_user_selected` at the top level and `toolkits: [{id: "..."}]` (whole-toolkit shape).

- [ ] **Step 3: Run the full Jest suite once**

Run: `npx react-scripts test --watchAll=false`
Expected: no new failures introduced by these changes.

- [ ] **Step 4: Run the full Python test suite**

Run: `cd unchain_runtime/server && python -m pytest tests/ -v`
Expected: all green.

If any pre-existing tests fail unrelated to this change, list them in the final report rather than papering over.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Pool collapse per toolkit → Task 7 (`pool_expanded` keyed by toolkit id)
- ✅ Tool chips on expand (read-only) → Task 7 (chip styling, no enable/disable)
- ✅ × removes → Task 7 + Task 8 close-button test
- ✅ Disable removed (no per-tool switch) → Task 7 (no `enabled` field)
- ✅ Installed icons → Task 7 (`ToolkitIcon`)
- ✅ Add button with label → Task 7 (`label="Add"`)
- ✅ Hide added from Installed → Task 7 (`!added_set.has(...)`) + Task 8 test
- ✅ No per-tool add (whole toolkit only) → Task 4 + Task 6 schema flatten
- ✅ Independent expand → Task 7 + Task 8 test
- ✅ mini-ui scrollable + top distance → Task 7 (`className="scrollable" data-sb-edge="14"` + `paddingTop: 14`)
- ✅ Merge switch (real backend) → Tasks 1, 2, 7, 8

**Placeholder scan:** none — every test, every code block is concrete.

**Type-consistency check:**
- `node.toolkits` shape `{id, config}` is used identically in Tasks 4, 5, 6, 7, 8. ✓
- `recipe.merge_with_user_selected` (boolean) defaulted to `true` in Tasks 1, 4, 6, 7. ✓
- Backend `_apply_recipe_toolkit_filter` keyword args (`user_toolkits`, `registry_toolkits`, `refs`, `merge`) match between Tasks 2 (rewrite), Task 2 Step 4 (call site), and the test (Task 2 Step 1). ✓

**Risk flags before implementation:**
- Task 2 Step 5 references `load_all_toolkits` from a `toolkits` module that may not exist by that name — the executor must `grep` the actual loader and adjust the import. The plan calls this out explicitly.
- Manual smoke (Task 9) is the only place where the merge=ON path is end-to-end tested with a live registry — there is no automated test for `_load_full_toolkit_registry` because it depends on PuPu's runtime toolkit registry, not unit-testable in isolation. This is acceptable: the merge logic is unit-tested with a mock registry in Task 2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-24-toolpool-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
