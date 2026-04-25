# Recipe Editor Undo/Redo Design

## Goal

Add backward/forward (undo/redo) history to the Recipe editor's node graph and detail panel. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z plus on-canvas buttons let the user step through structural edits (canvas operations, toolkit add/remove, switch toggles, model selection) without losing work.

## Scope

**In scope** — every state mutation that flows through `handleRecipeChange(next)` in `recipes_page.js`, except raw typing inside text inputs.

**Out of scope** — typing in textareas (prompt body, etc.). Native browser undo handles those while the textarea has focus, so our shortcut intentionally bows out.

## Boundary

History is per-active-recipe and lives in memory. Switching recipes resets `{past: [], future: []}` — the current `useEffect` already reloads the recipe from disk on switch, so unsaved edits and history vanish together. Reloading the app clears history. Save does not touch history (you can undo past a save; recipe stays dirty).

## Architecture

A new hook `useRecipeHistory(activeName)` in `recipes_page/use_recipe_history.js` owns the recipe state and the undo stack. It replaces the existing `useState(null)` for `activeRecipe`.

```js
function useRecipeHistory(activeName) {
  // resets when activeName changes
  return {
    recipe,                  // current
    setRecipe,               // pushes past, clears future
    setRecipeSilent,         // updates without history (text inputs, migration)
    undo, redo,
    canUndo, canRedo,
  };
}
```

Internal state: `{ present: Recipe|null, past: Recipe[], future: Recipe[] }`.

- `setRecipe(next)` — push `present` to `past`, set `present = next`, clear `future`. Cap `past` length at **50** (oldest dropped).
- `setRecipeSilent(next)` — only swap `present`. No history mutation. Used by detail-panel text inputs and the legacy-migration call.
- `undo()` — pop `past` into `present`, push old `present` onto `future`.
- `redo()` — pop `future` into `present`, push old `present` onto `past`.
- `canUndo = past.length > 0`, `canRedo = future.length > 0`.

### Microtask coalescing

When a single user action triggers multiple `onRecipeChange` calls in the same synchronous burst (e.g., the delete-node path fires `on_nodes_change` then `on_edges_change`, both routed through the existing `recipeRef`), we want one history entry, not two.

Implementation: `setRecipe` checks a `coalesceFlag` ref. If unset, push to `past` normally and queue a microtask to clear the flag. If already set, skip the push and just update `present`. The first call in a burst owns the history entry; later same-tick calls fold into it.

```js
const coalesceFlag = useRef(false);
function setRecipe(next) {
  if (!coalesceFlag.current) {
    setPast((p) => capN([...p, present], 50));
    setFuture([]);
    coalesceFlag.current = true;
    queueMicrotask(() => { coalesceFlag.current = false; });
  }
  setPresent(next);
}
```

### Recipe-switch reset

A `useEffect` keyed on `activeName` clears `{past: [], future: []}` and lets the existing API load populate `present` via `setRecipeSilent`.

## Call-site split

`recipes_page.js` passes two callbacks down. The detail panel's text inputs route through the silent one; everything else uses the normal one.

| Caller | Path | After |
|---|---|---|
| `recipe_canvas.js` drag/connect/delete/add | `onRecipeChange` (history) | unchanged |
| `recipe_canvas.js` legacy migration call | `onRecipeChange` (history) | switches to `onRecipeChangeSilent` |
| `toolpool_panel.js` toolkit add/remove, merge switch | `onChange` (history) | unchanged |
| `subagent_pool_panel.js` subagent add/remove | `onChange` (history) | unchanged |
| `agent_panel.js` prompt textarea | `onChange` | switches to `onChangeSilent` |
| `agent_panel.js` model picker, prompt-format toggle | `onChange` | unchanged |

`DetailPanel` and its children gain a second optional prop `onChangeSilent` alongside the existing `onChange`. Text-input handlers route through `onChangeSilent`. Non-text controls keep using `onChange`.

## UI integration

### Bottom overlay buttons

`recipe_canvas.js` already renders a centered bottom overlay with Center + Save. Insert Undo and Redo as the first two buttons in that row using `BUILTIN_COMPONENTs/input/button` with `prefix_icon`. Add `undo` and `redo` to `BUILTIN_COMPONENTs/icon/icon_manifest.js` if not already present.

Disabled state mirrors `canUndo` / `canRedo`. Tooltip text shows the keyboard shortcut (`⌘Z` on mac, `Ctrl+Z` on win/linux).

New props on `RecipeCanvas`: `onUndo`, `onRedo`, `canUndo`, `canRedo`.

### Keyboard binding

A `useEffect` in `recipes_page.js` registers a window keydown listener:

- `(e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey` → `undo()`
- `(e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey` → `redo()`
- Also `(e.ctrlKey) && e.key === 'y'` → `redo()` (Windows convention)
- Skip when `document.activeElement?.tagName` is `INPUT` or `TEXTAREA` (let native browser undo win)
- Skip when `activeRecipe == null`
- `e.preventDefault()` when handled

Bound at the page level (not the canvas) so shortcuts work regardless of which sub-panel currently has non-text focus.

## Edge cases

- **Recipe switch mid-edit** — handled by the `useEffect` reset.
- **Legacy migration** — uses `setRecipeSilent` so the migration doesn't appear as the first undo target.
- **Save** — does not interact with history. Undoing past a save re-dirties the recipe; user can re-save.
- **Empty recipe** (`activeRecipe == null`) — buttons disabled, keyboard no-op.
- **Rapid same-action repeats** (e.g., spam Delete on multiple nodes) — each keydown is its own microtask boundary, so each delete is its own undo step.
- **History cap** — when `past.length > 50`, oldest entry drops. `future` is bounded by `past` (you can only redo what you undid).

## Testing

Three Jest test files:

### `recipes_page/use_recipe_history.test.js`

Unit tests for the hook:
- `setRecipe` pushes the current `present` to `past` and clears `future`.
- `undo` moves `past.last` to `present` and old `present` to `future`.
- `redo` mirrors `undo`.
- `setRecipeSilent` does not touch `past` or `future`.
- Two `setRecipe` calls in the same microtask produce one `past` entry.
- Cap at 50: 51 sequential `setRecipe` calls leave `past.length === 50`, oldest dropped.
- Changing `activeName` resets `{past: [], future: []}`.

### `recipes_page/recipe_canvas.history.test.js`

Integration test for the canvas:
- Render `RecipeCanvas` with the hook wired in.
- Simulate add-node → undo button enables → click Undo → recipe reverts.
- Simulate delete-node (which fires nodes+edges chained) → one undo step reverts both.

### `recipes_page_history.test.js` (new)

Integration test for keyboard + page-level binding:
- Mount `RecipesPage` with mocked `api.unchain`.
- Fire a structural change → `Cmd+Z` keydown on `document.body` → recipe reverts.
- Same shortcut while a textarea has focus → no-op.
- Switch recipe → history clears, undo button disabled.

## File-level changes

**Created**
- `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.js`
- `src/COMPONENTs/agents/pages/recipes_page/use_recipe_history.test.js`
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.history.test.js`
- `src/COMPONENTs/agents/pages/recipes_page_history.test.js`

**Modified**
- `src/COMPONENTs/agents/pages/recipes_page.js` — replace `useState` for `activeRecipe` with `useRecipeHistory`; pass `onUndo/onRedo/canUndo/canRedo` to canvas, `onChangeSilent` to detail panel; add window keydown listener.
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` — render Undo/Redo buttons in the bottom overlay; route the legacy migration call through `onRecipeChangeSilent`.
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.js` — accept and forward `onChangeSilent`.
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js` — route prompt textarea through `onChangeSilent`.
- `src/BUILTIN_COMPONENTs/icon/icon_manifest.js` — add `undo` and `redo` icons if missing.

No backend changes. No schema changes. No mini-ui component additions beyond the icon entries.
