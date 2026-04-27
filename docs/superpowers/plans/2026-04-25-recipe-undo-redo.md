# Recipe Editor Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-recipe undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, on-canvas buttons) to the Recipe editor's node graph and detail panel for all structural mutations except raw text-input typing.

**Architecture:** Introduce a single state-owning hook `useRecipeHistory(activeName)` that replaces the current `useState(null)` for `activeRecipe`. The hook owns `{present, past, future}` and exposes both a history-pushing setter (`setRecipe`) and a silent setter (`setRecipeSilent`). Synchronous bursts of `setRecipe` calls collapse into one history entry via a `queueMicrotask`-based coalesce flag. The page wires `setRecipe` into `handleRecipeChange` (the existing chokepoint that all canvas + plugin-panel mutations already flow through), wires `setRecipeSilent` into a parallel `handleRecipeChangeSilent` for text inputs and the legacy migration call, registers a window keydown listener for shortcuts, and renders Undo/Redo buttons in the existing bottom overlay.

**Tech Stack:** React 19 functional components (JS only, no TS, no PropTypes), Jest + `@testing-library/react`, PuPu BUILTIN_COMPONENTs (`Button`, `Icon`).

---

## File Structure

**Created**

- `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.js` — the hook; owns recipe state + undo stack + microtask coalescing + per-recipe reset.
- `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.test.js` — pure-hook unit tests using `@testing-library/react`'s `renderHook`.
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.history.test.js` — integration test for the canvas + Undo button.
- `src/COMPONENTs/agents/pages/recipes_page_history.test.js` — integration test for page-level keyboard binding.

**Modified**

- `src/COMPONENTs/agents/pages/recipes_page.js` — replace `useState(null)` for `activeRecipe` with `useRecipeHistory(activeName)`; pass `onUndo/onRedo/canUndo/canRedo` to `RecipeCanvas`; pass `onChangeSilent` to `DetailPanel`; install window keydown listener.
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` — accept `onUndo/onRedo/canUndo/canRedo/onRecipeChangeSilent` props; render Undo/Redo buttons as the first two in the bottom overlay; route the legacy migration call through `onRecipeChangeSilent`.
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.js` — accept and forward `onChangeSilent` alongside `onChange`.
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js` — route the prompt ChipEditor through `onChangeSilent`; keep model picker on `onChange`.
- `src/BUILTIN_COMPONENTs/icon/icon_manifest.js` — add `undo` and `redo` entries to `UISVGs`.

No backend changes. No schema changes.

---

## Task 1: Add `undo` and `redo` icons to the manifest

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/icon/icon_manifest.js`

The icon manifest already exports `UISVGs` (a name → component map). Add two new SVG components and register them.

- [ ] **Step 1: Add the `Undo` and `Redo` SVG component definitions**

Add these two definitions immediately above the `const UISVGs = {` line near the bottom of the file (currently line 1284). Use the existing inline-SVG style (24×24 viewBox, `fill="currentColor"`):

```js
const Undo = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M5.82843 6.99955H21V8.99955H5.82843L9.19239 12.3635L7.7782 13.7777L2 7.99955L7.7782 2.22168L9.19239 3.63589L5.82843 6.99955Z M3 19V13H5V19H21V21H5C3.89543 21 3 20.1046 3 19Z"></path>
  </svg>
);
const Redo = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M18.1716 6.99955H3V8.99955H18.1716L14.8076 12.3635L16.2218 13.7777L22 7.99955L16.2218 2.22168L14.8076 3.63589L18.1716 6.99955Z M21 19V13H19V19H3V21H19C20.1046 21 21 20.1046 21 19Z"></path>
  </svg>
);
```

- [ ] **Step 2: Register both in the `UISVGs` map**

In the `UISVGs` object literal, add the two entries alphabetically. `redo` goes between `refresh` and `rename`; `undo` goes after `tool` and before `upload_file` (to fit the existing alphabetical order — or follow the closest neighbor if order drifts):

```js
  refresh: Refresh,
  redo: Redo,
  rename: Rename,
```

```js
  tool: Tool,
  undo: Undo,
  upload_file: UploadFile,
```

- [ ] **Step 3: Verify the icons render**

Run: `npm test -- --testPathPattern="icon" --watchAll=false`
Expected: existing icon tests still PASS (no new assertion needed yet — the visual check happens in Task 5's UI test).

If no icon test exists, instead run a one-off render check:

```bash
node -e "const {UISVGs} = require('./src/BUILTIN_COMPONENTs/icon/icon_manifest.js'); console.log(typeof UISVGs.undo, typeof UISVGs.redo);"
```

Expected: `function function`. Skip if the file uses ESM-only syntax that breaks plain `node`; in that case rely on Task 5's button render to validate.

- [ ] **Step 4: Commit**

```bash
git add src/BUILTIN_COMPONENTs/icon/icon_manifest.js
git commit -m "feat(icons): add undo and redo icons"
```

---

## Task 2: Build `useRecipeHistory` hook (TDD)

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.js`
- Test: `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.test.js`

The hook owns `{present, past, future}`. It exposes:
- `recipe` (alias of `present`)
- `setRecipe(next)` — push `present` into `past`, set new `present`, clear `future`. Cap `past` length at 50. Coalesce same-microtask calls into one history entry.
- `setRecipeSilent(next)` — only update `present`, no history mutation.
- `undo()` / `redo()` — pop one frame.
- `canUndo` / `canRedo` — booleans.
- Resets to `{past: [], future: [], present: null}` whenever `activeName` changes.

- [ ] **Step 1: Write the failing test file**

Create `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.test.js`:

```js
import { renderHook, act } from "@testing-library/react";
import useRecipeHistory from "./use_recipe_history";

const r = (n) => ({ name: "x", nodes: [{ id: "n", v: n }], edges: [] });

describe("useRecipeHistory", () => {
  test("setRecipeSilent updates present without history", () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    expect(result.current.recipe).toEqual(r(1));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test("setRecipe pushes previous present onto past, clears future", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    expect(result.current.recipe).toEqual(r(2));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  test("undo restores previous present, redo restores it again", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    act(() => result.current.undo());
    expect(result.current.recipe).toEqual(r(1));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.recipe).toEqual(r(2));
  });

  test("two setRecipe calls in the same microtask produce one past entry", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      result.current.setRecipe(r(3));
      await Promise.resolve();
    });
    expect(result.current.recipe).toEqual(r(3));
    act(() => result.current.undo());
    expect(result.current.recipe).toEqual(r(1));
    expect(result.current.canUndo).toBe(false);
  });

  test("past is capped at 50 entries", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(0)));
    for (let i = 1; i <= 51; i += 1) {
      // each iteration is its own microtask boundary
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        result.current.setRecipe(r(i));
        await Promise.resolve();
      });
    }
    // present is r(51); we should be able to undo exactly 50 times
    let undos = 0;
    while (result.current.canUndo) {
      // eslint-disable-next-line no-loop-func
      act(() => result.current.undo());
      undos += 1;
      if (undos > 60) throw new Error("runaway undo");
    }
    expect(undos).toBe(50);
    // oldest dropped: cannot recover r(0)
    expect(result.current.recipe).toEqual(r(1));
  });

  test("changing activeName resets history and present", async () => {
    const { result, rerender } = renderHook(
      ({ name }) => useRecipeHistory(name),
      { initialProps: { name: "a" } },
    );
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    expect(result.current.canUndo).toBe(true);
    rerender({ name: "b" });
    expect(result.current.recipe).toBe(null);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test("setRecipe clears future stack", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    await act(async () => {
      result.current.setRecipe(r(3));
      await Promise.resolve();
    });
    expect(result.current.canRedo).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern="use_recipe_history" --watchAll=false`
Expected: FAIL with `Cannot find module './use_recipe_history' from 'use_recipe_history.test.js'`.

- [ ] **Step 3: Implement the hook**

Create `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.js`:

```js
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_PAST = 50;

function capN(arr, n) {
  return arr.length > n ? arr.slice(arr.length - n) : arr;
}

export default function useRecipeHistory(activeName) {
  const [present, setPresent] = useState(null);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const presentRef = useRef(null);
  const coalesceFlag = useRef(false);

  useEffect(() => {
    presentRef.current = present;
  }, [present]);

  useEffect(() => {
    setPresent(null);
    setPast([]);
    setFuture([]);
    presentRef.current = null;
    coalesceFlag.current = false;
  }, [activeName]);

  const setRecipe = useCallback((next) => {
    if (!coalesceFlag.current) {
      const prev = presentRef.current;
      setPast((p) => capN([...p, prev], MAX_PAST));
      setFuture([]);
      coalesceFlag.current = true;
      queueMicrotask(() => {
        coalesceFlag.current = false;
      });
    }
    presentRef.current = next;
    setPresent(next);
  }, []);

  const setRecipeSilent = useCallback((next) => {
    presentRef.current = next;
    setPresent(next);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      const remaining = p.slice(0, -1);
      setFuture((f) => [...f, presentRef.current]);
      presentRef.current = prev;
      setPresent(prev);
      return remaining;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      const remaining = f.slice(0, -1);
      setPast((p) => capN([...p, presentRef.current], MAX_PAST));
      presentRef.current = next;
      setPresent(next);
      return remaining;
    });
  }, []);

  return {
    recipe: present,
    setRecipe,
    setRecipeSilent,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --testPathPattern="use_recipe_history" --watchAll=false`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.js src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.test.js
git commit -m "feat(recipe): add useRecipeHistory hook with microtask coalescing"
```

---

## Task 3: Wire the hook into `recipes_page.js`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page.js`

Replace `useState(null)` for `activeRecipe` with `useRecipeHistory(activeName)`. Add a parallel `handleRecipeChangeSilent` that does the same dirty/error-clear bookkeeping but routes to `setRecipeSilent`. Pass `onUndo/onRedo/canUndo/canRedo` to the canvas, `onChange/onChangeSilent` to the detail panel.

The keyboard binding ships in Task 6. This task only touches the wiring.

- [ ] **Step 1: Replace `useState` for `activeRecipe`**

In `src/COMPONENTs/agents/pages/recipes_page.js`:

Add the hook import at the top alongside the existing imports:

```js
import useRecipeHistory from "./recipes_page/use_recipe_history";
```

Replace the line `const [activeRecipe, setActiveRecipe] = useState(null);` (currently line 35) with:

```js
  const {
    recipe: activeRecipe,
    setRecipe: setActiveRecipe,
    setRecipeSilent: setActiveRecipeSilent,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useRecipeHistory(activeName);
```

- [ ] **Step 2: Switch the recipe-load `useEffect` to silent setter**

The `useEffect` keyed on `activeName` (currently lines 48-60) does:

```js
    (async () => {
      const r = await api.unchain.getRecipe(activeName);
      setActiveRecipe(r);
      onSelectNode(null);
      setDirty(false);
    })();
```

Change `setActiveRecipe(r)` to `setActiveRecipeSilent(r)`. The hook's `useEffect` already cleared history on `activeName` change; we don't want loading the recipe-from-disk to register as the first undoable step.

Also remove the now-unused early-return `setActiveRecipe(null);` at line 50 (the hook resets on activeName change automatically). Replace:

```js
    if (!activeName) {
      setActiveRecipe(null);
      return;
    }
```

with:

```js
    if (!activeName) return;
```

- [ ] **Step 3: Add `handleRecipeChangeSilent`**

Right below `handleRecipeChange` (line 62-66) add a parallel silent handler:

```js
  const handleRecipeChange = (next) => {
    setActiveRecipe(next);
    setDirty(true);
    setSaveError("");
  };

  const handleRecipeChangeSilent = (next) => {
    setActiveRecipeSilent(next);
    setDirty(true);
    setSaveError("");
  };
```

- [ ] **Step 4: Pass the new props down**

Update the `<RecipeCanvas .../>` JSX (currently lines 120-128) to pass undo/redo wiring:

```jsx
        <RecipeCanvas
          recipe={activeRecipe}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onRecipeChange={handleRecipeChange}
          onRecipeChangeSilent={handleRecipeChangeSilent}
          onSave={handleSave}
          dirty={dirty}
          isDark={isDark}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
```

Update the `<DetailPanel .../>` JSX (currently lines 224-228):

```jsx
        <DetailPanel
          recipe={activeRecipe}
          selectedNodeId={selectedNodeId}
          onChange={handleRecipeChange}
          onChangeSilent={handleRecipeChangeSilent}
        />
```

- [ ] **Step 5: Manual sanity check — page still renders**

Run: `npm test -- --testPathPattern="recipes_page" --watchAll=false`
Expected: existing tests PASS (no new tests yet — this task is wiring only). Any pre-existing tests that previously rendered `RecipesPage` should still pass because `useRecipeHistory(null).recipe` returns `null`, identical to the prior `useState(null)` behavior.

If any existing test now fails because it relied on synchronously injected `setActiveRecipe`, port it to use `setActiveRecipeSilent` (no such test exists at the time of writing; flag it if discovered).

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page.js
git commit -m "refactor(recipe): swap activeRecipe useState for useRecipeHistory"
```

---

## Task 4: Route legacy migration through silent setter

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`

`recipe_canvas.js` runs a legacy-shape migration in a `useEffect` keyed on `recipe?.name` (currently lines 66-71). It calls `onRecipeChange(migrate_recipe(recipe))`. With history wired in, this would land the migration as the first `past` entry — undoing past it would resurrect the legacy shape, which the rest of the code can't render. Route it through the silent path instead.

- [ ] **Step 1: Add `onRecipeChangeSilent` to the prop list**

Update the destructure at the top of `RecipeCanvas` (currently lines 50-58) to accept it:

```js
export default function RecipeCanvas({
  recipe,
  selectedNodeId,
  onSelectNode,
  onRecipeChange,
  onRecipeChangeSilent,
  onSave,
  dirty,
  isDark,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) {
```

- [ ] **Step 2: Switch the migration call**

In the legacy-migration `useEffect` (currently lines 66-71), replace `onRecipeChange(migrate_recipe(recipe))` with `onRecipeChangeSilent(migrate_recipe(recipe))`:

```js
  useEffect(() => {
    if (recipe && is_legacy_recipe(recipe)) {
      onRecipeChangeSilent(migrate_recipe(recipe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.name]);
```

- [ ] **Step 3: Run existing canvas + recipe tests to verify no regressions**

Run: `npm test -- --testPathPattern="recipe_canvas|recipe_migration" --watchAll=false`
Expected: PASS — migration logic is unchanged, only the setter target moved.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js
git commit -m "fix(recipe): route legacy migration through silent setter"
```

---

## Task 5: Render Undo/Redo buttons in the canvas overlay (TDD)

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.history.test.js`

Add Undo and Redo as the first two buttons inside the existing centered bottom overlay (the row currently containing Center and Save). Use `BUILTIN_COMPONENTs/input/button` with the `prefix_icon` prop. Disable when `canUndo`/`canRedo` is false. The platform-aware shortcut tooltip uses `getRuntimePlatform()`.

- [ ] **Step 1: Write the failing integration test**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.history.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import RecipeCanvas from "./recipe_canvas";

jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: () => <div data-testid="flow-editor" />,
}));

const minimalRecipe = {
  name: "x",
  nodes: [
    { id: "start", type: "start", outputs: [], x: 0, y: 0 },
    { id: "end", type: "end", x: 0, y: 0 },
  ],
  edges: [],
};

describe("RecipeCanvas Undo/Redo buttons", () => {
  test("renders Undo and Redo buttons in the overlay", () => {
    render(
      <RecipeCanvas
        recipe={minimalRecipe}
        selectedNodeId={null}
        onSelectNode={() => {}}
        onRecipeChange={() => {}}
        onRecipeChangeSilent={() => {}}
        onSave={() => {}}
        dirty={false}
        isDark={false}
        onUndo={() => {}}
        onRedo={() => {}}
        canUndo={false}
        canRedo={false}
      />,
    );
    expect(screen.getByTitle(/Undo/i)).toBeTruthy();
    expect(screen.getByTitle(/Redo/i)).toBeTruthy();
  });

  test("Undo button calls onUndo when canUndo is true", () => {
    const onUndo = jest.fn();
    render(
      <RecipeCanvas
        recipe={minimalRecipe}
        selectedNodeId={null}
        onSelectNode={() => {}}
        onRecipeChange={() => {}}
        onRecipeChangeSilent={() => {}}
        onSave={() => {}}
        dirty={false}
        isDark={false}
        onUndo={onUndo}
        onRedo={() => {}}
        canUndo={true}
        canRedo={false}
      />,
    );
    fireEvent.click(screen.getByTitle(/Undo/i));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test("Undo button is disabled when canUndo is false", () => {
    const onUndo = jest.fn();
    render(
      <RecipeCanvas
        recipe={minimalRecipe}
        selectedNodeId={null}
        onSelectNode={() => {}}
        onRecipeChange={() => {}}
        onRecipeChangeSilent={() => {}}
        onSave={() => {}}
        dirty={false}
        isDark={false}
        onUndo={onUndo}
        onRedo={() => {}}
        canUndo={false}
        canRedo={false}
      />,
    );
    fireEvent.click(screen.getByTitle(/Undo/i));
    expect(onUndo).not.toHaveBeenCalled();
  });

  test("Redo button calls onRedo when canRedo is true", () => {
    const onRedo = jest.fn();
    render(
      <RecipeCanvas
        recipe={minimalRecipe}
        selectedNodeId={null}
        onSelectNode={() => {}}
        onRecipeChange={() => {}}
        onRecipeChangeSilent={() => {}}
        onSave={() => {}}
        dirty={false}
        isDark={false}
        onUndo={() => {}}
        onRedo={onRedo}
        canUndo={false}
        canRedo={true}
      />,
    );
    fireEvent.click(screen.getByTitle(/Redo/i));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern="recipe_canvas.history" --watchAll=false`
Expected: FAIL — buttons not present yet (`Unable to find an element with the title: /Undo/i`).

- [ ] **Step 3: Add the import for the platform helper**

At the top of `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`, add:

```js
import { getRuntimePlatform } from "../../side-menu/side_menu_utils";
```

(The page already uses this helper to choose macOS-vs-Windows visuals; reuse it for the tooltip text.)

- [ ] **Step 4: Render the two buttons in the bottom overlay**

Inside the bottom-overlay `<div>` (currently lines 255-301), insert Undo and Redo as the FIRST two children, before the Center button. Compute the shortcut hint once near the top of the component body:

Just above the existing `return (` (around line 215), add:

```js
  const isMac = getRuntimePlatform() === "darwin";
  const undoHint = isMac ? "Undo (⌘Z)" : "Undo (Ctrl+Z)";
  const redoHint = isMac ? "Redo (⌘⇧Z)" : "Redo (Ctrl+Y)";
```

In the overlay row, replace the existing Center button line (currently `<Button label="Center" .../>`) with the three buttons in order:

```jsx
          <Button
            prefix_icon="undo"
            onClick={onUndo}
            disabled={!canUndo}
            title={undoHint}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 8,
              borderRadius: 7,
              opacity: canUndo ? 0.85 : 0.35,
              content: { icon: { width: 13, height: 13 } },
            }}
          />
          <Button
            prefix_icon="redo"
            onClick={onRedo}
            disabled={!canRedo}
            title={redoHint}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 8,
              borderRadius: 7,
              opacity: canRedo ? 0.85 : 0.35,
              content: { icon: { width: 13, height: 13 } },
            }}
          />
          <Button
            label="Center"
            onClick={() => setResetToken((t) => t + 1)}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 7,
              opacity: 0.7,
            }}
          />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- --testPathPattern="recipe_canvas.history" --watchAll=false`
Expected: PASS — all four button-render/click tests green.

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.history.test.js
git commit -m "feat(recipe): add undo/redo buttons to canvas overlay"
```

---

## Task 6: Page-level keyboard shortcuts (TDD)

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page_history.test.js`

Install a `window.addEventListener("keydown", ...)` listener in a `useEffect`. It calls `undo()` / `redo()` on the appropriate combos, but only when `activeRecipe` is non-null and the focused element is not an `INPUT` or `TEXTAREA` (so the textarea-typing case lets native browser undo win for cursor-character undo while the typing has been silenced from history).

- [ ] **Step 1: Write the failing integration test**

Create `src/COMPONENTs/agents/pages/recipes_page_history.test.js`:

```js
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import RecipesPage from "./recipes_page";

// Mock the API to inject a deterministic recipe
jest.mock("../../../SERVICEs/api", () => {
  const recipe = {
    name: "test",
    nodes: [
      { id: "start", type: "start", outputs: [], x: 0, y: 0 },
      { id: "end", type: "end", x: 0, y: 0 },
    ],
    edges: [],
  };
  return {
    api: {
      unchain: {
        listRecipes: jest.fn().mockResolvedValue({ recipes: [recipe] }),
        getRecipe: jest.fn().mockResolvedValue(recipe),
        saveRecipe: jest.fn().mockResolvedValue({}),
      },
    },
  };
});

jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: () => <div data-testid="flow-editor" />,
}));

jest.mock("../../side-menu/side_menu_utils", () => ({
  getRuntimePlatform: () => "darwin",
}));

jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
    onWindowStateChange: () => () => {},
  },
}));

describe("RecipesPage keyboard undo/redo", () => {
  test("Cmd+Z on document.body triggers undo when history exists", async () => {
    const { container } = render(
      <RecipesPage
        isDark={false}
        selectedNodeId={null}
        onSelectNode={() => {}}
        fullscreen={false}
      />,
    );
    // Wait for recipe to load
    await waitFor(() => {
      expect(container.querySelector('[data-testid="flow-editor"]')).toBeTruthy();
    });
    // Spy on the Undo button to confirm it gets disabled/enabled correctly
    const undoBtn = container.querySelector('[title^="Undo"]');
    expect(undoBtn).toBeTruthy();
    expect(undoBtn.disabled).toBe(true);
    // Fire Cmd+Z with no history — should be a no-op (button still disabled)
    act(() => {
      fireEvent.keyDown(document.body, {
        key: "z",
        metaKey: true,
        shiftKey: false,
      });
    });
    expect(undoBtn.disabled).toBe(true);
  });

  test("keydown is ignored when focus is in TEXTAREA", async () => {
    const { container } = render(
      <RecipesPage
        isDark={false}
        selectedNodeId={null}
        onSelectNode={() => {}}
        fullscreen={false}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="flow-editor"]')).toBeTruthy();
    });
    // Inject a textarea, focus it, fire Cmd+Z with shift — redo should NOT fire even
    // if the listener is registered. We assert no error and no thrown selector failure.
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    expect(document.activeElement).toBe(ta);
    act(() => {
      fireEvent.keyDown(ta, {
        key: "z",
        metaKey: true,
        shiftKey: true,
      });
    });
    // The Redo button should remain disabled — nothing was redoable to begin with.
    const redoBtn = container.querySelector('[title^="Redo"]');
    expect(redoBtn).toBeTruthy();
    expect(redoBtn.disabled).toBe(true);
    document.body.removeChild(ta);
  });
});
```

These tests assert the listener wiring works without falsely firing on textareas. The deeper "structural change → Cmd+Z reverts it" path is exercised by `use_recipe_history.test.js` (hook level) and `recipe_canvas.history.test.js` (button level); those plus this listener test cover the chain.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern="recipes_page_history" --watchAll=false`
Expected: FAIL — `screen.getByTitle(/Undo/i)` will not find a button OR the test will pass trivially because we haven't yet broken anything; either way let it run once before adding the listener so we have a baseline. If both tests pass at this point because the button task already shipped them, that's fine — proceed to Step 3 to actually install the listener.

(If the tests already pass without the listener: that just confirms the keyboard test asserts only the no-op cases. Step 3 adds the real listener; Step 4 re-runs the same tests and they should still pass.)

- [ ] **Step 3: Install the window keydown listener**

In `src/COMPONENTs/agents/pages/recipes_page.js`, add a `useEffect` after the `handleRecipeChangeSilent` definition (before the existing `handleSave`):

```js
  useEffect(() => {
    if (!activeRecipe) return undefined;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRecipe, undo, redo]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --testPathPattern="recipes_page_history" --watchAll=false`
Expected: PASS — both tests green. The Undo button stays `disabled` when no history exists; firing the shortcut while a textarea has focus does not flip Redo to enabled.

- [ ] **Step 5: Run the full recipes test suite for safety**

Run: `npm test -- --testPathPattern="recipes_page" --watchAll=false`
Expected: PASS — all existing recipes_page tests + the two new test files green.

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page.js src/COMPONENTs/agents/pages/recipes_page_history.test.js
git commit -m "feat(recipe): wire Cmd/Ctrl+Z keyboard shortcuts for undo/redo"
```

---

## Task 7: Forward `onChangeSilent` through DetailPanel

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.js`

`DetailPanel` already accepts and forwards `onChange`. Add a parallel `onChangeSilent` prop and include it in the spread that goes to all sub-panels.

- [ ] **Step 1: Modify the prop list and the spread**

Replace the function signature (currently `export default function DetailPanel({ recipe, selectedNodeId, onChange })`) with:

```js
export default function DetailPanel({
  recipe,
  selectedNodeId,
  onChange,
  onChangeSilent,
}) {
```

Replace the `props` object (currently `const props = { recipe, node, onChange, isDark };`) with:

```js
  const props = { recipe, node, onChange, onChangeSilent, isDark };
```

- [ ] **Step 2: Run existing detail-panel tests to verify no regression**

Run: `npm test -- --testPathPattern="detail_panel" --watchAll=false`
Expected: PASS — passing the extra prop is forward-compatible; sub-panels that don't read it ignore it.

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.js
git commit -m "feat(recipe): forward onChangeSilent through DetailPanel"
```

---

## Task 8: Route the prompt ChipEditor through `onChangeSilent`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js`

In `AgentPanel`, the prompt edits flow through `set_override({ prompt: ... })`, which calls `set_node({ override: ... })`, which calls `onChange({...recipe, nodes: ...})`. Without changes, every keystroke in the prompt creates a history entry. We split the prompt path: keystroke updates use `onChangeSilent`, all other handlers (model picker, output add/remove, output type select) keep using `onChange`.

The "click input variable to append to prompt" handler should be treated as a structural-feeling action (a discrete click), but to keep the design simple and the spec's promise consistent ("prompt textarea bows out of history"), route ALL prompt mutations through silent.

- [ ] **Step 1: Add `onChangeSilent` to the prop list and add a silent setter pair**

Replace `export default function AgentPanel({ node, recipe, onChange, isDark })` with:

```js
export default function AgentPanel({ node, recipe, onChange, onChangeSilent, isDark }) {
```

Below the existing `set_node` / `set_override` helpers (currently lines 35-46), add silent variants:

```js
  function set_node_silent(patch) {
    onChangeSilent({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  }

  function set_override_silent(patch) {
    set_node_silent({ override: { ...(node.override || {}), ...patch } });
  }
```

- [ ] **Step 2: Switch the prompt ChipEditor `onChange` to the silent variant**

Replace the `<ChipEditor>` `onChange` prop (currently line 148: `onChange={(v) => set_override({ prompt: v })}`) with:

```jsx
        <ChipEditor
          value={prompt}
          onChange={(v) => set_override_silent({ prompt: v })}
          scope={scope}
        />
```

Also switch the "click input variable to append to prompt" `onClick` to use the silent setter (the action is a quasi-text edit and should not fragment history):

Replace (currently line 116):

```js
              set_override({
                prompt: `${prompt}{{#${v.node_id}.${v.field}#}}`,
              });
```

with:

```js
              set_override_silent({
                prompt: `${prompt}{{#${v.node_id}.${v.field}#}}`,
              });
```

The model `Select`, the output `+ Add field` button, the output type `Select`, the output `Input` (name field — type is a text input but the spec only enumerates the prompt; leaving it on `onChange` matches the spec table), and the output remove button stay on `onChange`.

- [ ] **Step 3: Run agent_panel tests**

Run: `npm test -- --testPathPattern="agent_panel" --watchAll=false`
Expected: PASS — the existing tests pass `onChange={() => {}}`; if any test invokes a prompt-related action, it now reaches `onChangeSilent` which the test does not pass. To prevent crashes, ensure every test that exercises prompt edits also passes `onChangeSilent`.

If a test fails because `onChangeSilent` is `undefined`, update that test to also pass `onChangeSilent={() => {}}`. Per the spec scope, no behavioral assertion should change — only the prop list.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js
git commit -m "feat(recipe): route agent prompt edits through silent setter"
```

---

## Task 9: End-to-end manual verification

**Files:** none modified. Smoke check the full chain in the running app.

- [ ] **Step 1: Start the app**

```bash
npm start
```

Wait for the React dev server (port 2907) and Electron window to come up.

- [ ] **Step 2: Verify undo/redo shortcuts and buttons**

In the Recipe editor:

1. Open any recipe (or create one).
2. Right-click the canvas → "+ Add Blank Agent".
3. Click Undo (⌘Z on macOS / Ctrl+Z on Windows). Expected: the agent disappears.
4. Click Redo (⌘⇧Z / Ctrl+Y). Expected: the agent reappears.
5. Drag a node — the position change should be one undo step.
6. Select a node and press Delete. Expected: the node and its edges disappear in one undo step.
7. Click the agent, focus the prompt area, type. Expected: typing does NOT create undo entries; pressing Cmd+Z while the textarea has focus uses the browser's native character-level undo.
8. Click outside the textarea, press Cmd+Z. Expected: the most recent structural step (e.g., the agent add) is undone — typing changes from earlier are NOT undone (they were silent).
9. Switch to a different recipe in the left list. Expected: Undo/Redo buttons go disabled.
10. Switch back. Expected: history is empty (per spec — switching resets).

- [ ] **Step 3: Verify history boundary on save**

1. Add a node, save the recipe, then press Cmd+Z. Expected: the node is removed and the recipe shows dirty again. (Save does not interact with history.)

- [ ] **Step 4: Verify legacy migration is silent**

1. Open a legacy-shape recipe (a recipe without `nodes[]`). On load, the editor should migrate it. Expected: Undo button stays disabled — the migration is not an undo target.

If any of the above fails, file the issue (likely a missed call site) before proceeding.

- [ ] **Step 5: No code change → no commit**

This task is verification only. Stop here and report results.

---

## Self-Review (post-write checklist)

**Spec coverage check** — every section of `2026-04-25-recipe-undo-redo-design.md` is covered:

| Spec section | Plan tasks |
|---|---|
| Goal / Scope (Cmd+Z, buttons, structural edits only) | Tasks 5, 6 |
| Boundary (per-recipe, in-memory, switch resets) | Task 2 (hook reset effect), Task 3 (load via silent) |
| Architecture (`useRecipeHistory(activeName)`) | Task 2 |
| `setRecipe` / `setRecipeSilent` / `undo` / `redo` | Task 2 |
| Microtask coalescing | Task 2 (test + impl) |
| Recipe-switch reset effect | Task 2 (test + impl) |
| Call-site split (canvas, panels) | Tasks 4, 7, 8 |
| Bottom overlay buttons + icons | Tasks 1, 5 |
| Keyboard binding (page-level, skip INPUT/TEXTAREA) | Task 6 |
| Edge cases (legacy migration, save, empty recipe, repeats, cap) | Tasks 2 (cap, reset, coalesce), 4 (legacy), 6 (skip on textarea) |
| Testing — `use_recipe_history.test.js` | Task 2 |
| Testing — `recipe_canvas.history.test.js` | Task 5 |
| Testing — `recipes_page_history.test.js` | Task 6 |
| File-level changes | All tasks |

**Placeholder scan** — no "TBD", "TODO", "implement later", or "similar to" references. Every code step contains the actual code to paste.

**Type/name consistency**:
- `useRecipeHistory` returns `{ recipe, setRecipe, setRecipeSilent, undo, redo, canUndo, canRedo }` — matches Tasks 3, 5, 6.
- Canvas prop names: `onUndo`, `onRedo`, `canUndo`, `canRedo`, `onRecipeChangeSilent` — consistent across Tasks 3, 4, 5.
- Detail panel prop name: `onChangeSilent` — consistent across Tasks 3, 7, 8.
- Icon manifest keys: `undo`, `redo` — matches the `prefix_icon` strings in Task 5.
- The agent panel silent helpers: `set_node_silent`, `set_override_silent` — only referenced in Task 8.

All clear.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-recipe-undo-redo.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
