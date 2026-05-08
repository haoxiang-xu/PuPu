# Agent Recipe Builder — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the Agent Recipe Builder with folder-capable Explorer, consolidated `toolpool` node, canvas context menu, edge delete, a fullscreen toggle, and full mini_ui migration of the inspector and toolbar.

**Architecture:** Keep the existing full-bleed canvas layout. Folders live client-side in `localStorage` (backend recipes stay flat) via a new `agent_folder_storage.js` service. Collapse the `tk:<id>` nodes into a single `toolpool` node whose UI aggregates `recipe.toolkits[]`. Introduce a reusable `ContextMenu` primitive (lifted from the side-menu pattern) so both Explorer and Canvas share one component. Add a `fullscreen` prop to `Modal`. Replace native `<input>`/`<button>`/`<select>` usages in the inspector tree and canvas toolbar with `BUILTIN_COMPONENTs/input/*` and `BUILTIN_COMPONENTs/select/*`.

**Tech Stack:** React 19, Electron 40, inline styles, `mini_ui` built-ins (`Button`, `Input`, `Switch`, `Slider`, `Select`, `Modal`, `Explorer`, `FlowEditor`).

---

## File Structure

### New files
- `src/BUILTIN_COMPONENTs/context_menu/context_menu.js` — shared ContextMenu primitive (lifted from side_menu_components.js)
- `src/SERVICEs/agent_folder_storage.js` — client-side folder tree + rename mappings for agent recipes
- `src/COMPONENTs/agents/pages/recipes_page/recipe_list_context_menu_items.js` — pure items builder for the left explorer
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js` — pure items builder for the canvas add-node menu
- `src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js` — new aggregated toolpool node component

### Modified files
- `src/BUILTIN_COMPONENTs/modal/modal.js` — add `fullscreen` prop
- `src/COMPONENTs/agents/agents_modal.js` — fullscreen toggle button (top-right area), thread `isFullscreen` state
- `src/COMPONENTs/agents/pages/recipes_page.js` — wire folder state, rename flow, delete confirm
- `src/COMPONENTs/agents/pages/recipes_page/recipe_list.js` — Explorer folders + inline rename + context menu; remove header "Agents" label redundancy, keep + button
- `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` — toolpool node id + context menu + edge delete + port restriction
- `src/COMPONENTs/agents/pages/recipes_page/recipe_inspector.js` — route `toolpool` id to PoolInspector-style panel, remove `tk:` prefix handling
- `src/COMPONENTs/agents/pages/recipes_page/inspectors/agent_inspector.js` — migrate to Input/Slider/Select
- `src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js` — repurpose as **ToolPoolInspector** (shows aggregated tools from all toolkits, per-tool Switch)
- `src/COMPONENTs/agents/pages/recipes_page/inspectors/pool_inspector.js` — migrate to Button/Input/Select
- `src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js` — migrate to Input/Button

### Deleted files
- `src/COMPONENTs/agents/pages/recipes_page/nodes/toolkit_node.js` — replaced by `tool_pool_node.js`

---

## Phase 0: Scaffolding — shared primitives

### Task 0.1: Extract shared ContextMenu primitive

**Files:**
- Create: `src/BUILTIN_COMPONENTs/context_menu/context_menu.js`

- [ ] **Step 1: Create the file**

```jsx
// src/BUILTIN_COMPONENTs/context_menu/context_menu.js
import { useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "../icon/icon";
import { ConfigContext } from "../../CONTAINERs/config/context";

export default function ContextMenu({ visible, x, y, items, onClose, isDark }) {
  const { theme: _theme } = useContext(ConfigContext);
  const ref = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const bg = isDark ? "#1e1e1e" : "#ffffff";
  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const shadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)"
    : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)";

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuW = 200;
  const menuH = items.length * 32;
  const left = Math.min(x, screenW - menuW - 8);
  const top = Math.min(y, screenH - menuH - 8);

  return createPortal(
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        backgroundColor: bg,
        border,
        borderRadius: 8,
        boxShadow: shadow,
        padding: 4,
        minWidth: menuW,
        userSelect: "none",
      }}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                margin: "4px 0",
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              }}
            />
          );
        }
        const textColor = item.danger
          ? isDark
            ? "rgba(255,100,100,0.9)"
            : "rgba(180,30,30,0.9)"
          : isDark
            ? "rgba(255,255,255,0.85)"
            : "rgba(0,0,0,0.80)";
        const hoverBg = item.danger
          ? isDark
            ? "rgba(220,50,50,0.15)"
            : "rgba(220,50,50,0.08)"
          : isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(0,0,0,0.05)";
        return (
          <MenuRow
            key={`item-${i}`}
            item={item}
            textColor={textColor}
            hoverBg={hoverBg}
            onClose={onClose}
          />
        );
      })}
    </div>,
    document.body,
  );
}

function MenuRow({ item, textColor, hoverBg, onClose }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (item.disabled) return;
        item.onClick?.();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 28,
        padding: "0 10px",
        borderRadius: 6,
        color: textColor,
        fontSize: 13,
        cursor: item.disabled ? "not-allowed" : "pointer",
        opacity: item.disabled ? 0.5 : 1,
        backgroundColor: hover && !item.disabled ? hoverBg : "transparent",
      }}
    >
      {item.icon && (
        <Icon src={item.icon} color={textColor} style={{ width: 14, height: 14 }} />
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Add `useState` import at top**

Fix missing import (the MenuRow uses `useState`):

```jsx
import { useContext, useEffect, useRef, useState } from "react";
```

- [ ] **Step 3: Commit**

```bash
git add src/BUILTIN_COMPONENTs/context_menu/context_menu.js
git commit -m "feat(context_menu): add shared ContextMenu primitive"
```

---

### Task 0.2: Add `fullscreen` prop to Modal

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/modal/modal.js`

- [ ] **Step 1: Accept prop and override panel styles**

In `src/BUILTIN_COMPONENTs/modal/modal.js`, update the `Modal` component signature to accept `fullscreen`:

```jsx
const Modal = ({ open, onClose, style, overlayStyle, fullscreen, children }) => {
```

Then in the inner panel `<div>` `style={{...}}` block, merge a fullscreen override **after** the existing `style` spread:

```jsx
<div
  style={{
    position: "relative",
    backgroundColor: mt.backgroundColor || "#fff",
    borderRadius: mt.borderRadius ?? 14,
    boxShadow: mt.boxShadow || "0 24px 80px rgba(0,0,0,0.18)",
    border: mt.border || "none",
    padding: mt.padding ?? 24,
    minWidth: mt.minWidth ?? 360,
    maxWidth: mt.maxWidth ?? 480,
    width: "100%",
    boxSizing: "border-box",
    transform: visible ? "translateY(0)" : "translateY(8px)",
    opacity: visible ? 1 : 0,
    transition: [
      `transform ${ANIM_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      `opacity ${ANIM_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
    ].join(", "),
    fontFamily: theme?.font?.fontFamily || "inherit",
    color: theme?.color || "#222",
    ...style,
    ...(fullscreen
      ? {
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          maxWidth: "100vw",
          maxHeight: "100vh",
          minWidth: 0,
          borderRadius: 0,
          margin: 0,
        }
      : null),
  }}
>
```

- [ ] **Step 2: Verify no existing Modal callers pass `fullscreen`**

Run: `grep -rn "fullscreen" src/BUILTIN_COMPONENTs/modal src/COMPONENTs src/PAGEs`
Expected: only your new addition inside modal.js — no other files reference a `fullscreen` prop on Modal yet.

- [ ] **Step 3: Commit**

```bash
git add src/BUILTIN_COMPONENTs/modal/modal.js
git commit -m "feat(modal): add fullscreen prop"
```

---

### Task 0.3: Add `agent_folder_storage` service

Recipes in the backend are flat (`~/.pupu/recipes/*.json`). Folder tree is kept client-side in `localStorage` and keyed by recipe name.

**Files:**
- Create: `src/SERVICEs/agent_folder_storage.js`

- [ ] **Step 1: Write the service**

```jsx
// src/SERVICEs/agent_folder_storage.js
const STORAGE_KEY = "agent_folder_tree_v1";

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_exc) {
    return null;
  }
}

function saveRaw(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_exc) {
    // noop
  }
}

function defaultState() {
  return { folders: {}, recipeFolder: {}, folderOrder: [] };
}

export function getFolderState() {
  return loadRaw() || defaultState();
}

export function setFolderState(next) {
  saveRaw(next);
  return next;
}

export function createFolder({ name, parentId = null } = {}) {
  const state = getFolderState();
  const id = `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  state.folders[id] = {
    id,
    name: name || "New Folder",
    parentId,
    childFolderIds: [],
    expanded: true,
  };
  if (parentId && state.folders[parentId]) {
    state.folders[parentId].childFolderIds.push(id);
  } else {
    state.folderOrder.push(id);
  }
  saveRaw(state);
  return { state, folderId: id };
}

export function renameFolder(folderId, nextName) {
  const state = getFolderState();
  if (!state.folders[folderId]) return state;
  state.folders[folderId].name = nextName;
  saveRaw(state);
  return state;
}

export function deleteFolder(folderId) {
  const state = getFolderState();
  const folder = state.folders[folderId];
  if (!folder) return state;

  // Unassign any recipes parented to this folder.
  Object.keys(state.recipeFolder).forEach((name) => {
    if (state.recipeFolder[name] === folderId) {
      delete state.recipeFolder[name];
    }
  });

  // Remove from parent's childFolderIds OR from root order.
  if (folder.parentId && state.folders[folder.parentId]) {
    const parent = state.folders[folder.parentId];
    parent.childFolderIds = parent.childFolderIds.filter((id) => id !== folderId);
  } else {
    state.folderOrder = state.folderOrder.filter((id) => id !== folderId);
  }

  // Recursively delete child folders.
  folder.childFolderIds.forEach((childId) => {
    deleteFolder(childId);
  });

  const refreshed = getFolderState();
  delete refreshed.folders[folderId];
  saveRaw(refreshed);
  return refreshed;
}

export function toggleFolderExpanded(folderId) {
  const state = getFolderState();
  const folder = state.folders[folderId];
  if (!folder) return state;
  folder.expanded = !folder.expanded;
  saveRaw(state);
  return state;
}

export function assignRecipeToFolder(recipeName, folderId) {
  const state = getFolderState();
  if (folderId === null) {
    delete state.recipeFolder[recipeName];
  } else {
    state.recipeFolder[recipeName] = folderId;
  }
  saveRaw(state);
  return state;
}

export function renameRecipeKey(oldName, newName) {
  const state = getFolderState();
  if (state.recipeFolder[oldName] !== undefined) {
    state.recipeFolder[newName] = state.recipeFolder[oldName];
    delete state.recipeFolder[oldName];
    saveRaw(state);
  }
  return state;
}

export function forgetRecipe(recipeName) {
  const state = getFolderState();
  if (state.recipeFolder[recipeName] !== undefined) {
    delete state.recipeFolder[recipeName];
    saveRaw(state);
  }
  return state;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SERVICEs/agent_folder_storage.js
git commit -m "feat(agents): add client-side folder storage for recipes"
```

---

## Phase 1: Explorer — folders, CRUD, context menu

### Task 1.1: Build `recipe_list_context_menu_items` items builder

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_list_context_menu_items.js`

- [ ] **Step 1: Write the items builder**

```jsx
// src/COMPONENTs/agents/pages/recipes_page/recipe_list_context_menu_items.js
// Pure items builder — no side effects, returns ContextMenu-compatible item array.
//
// node: { kind: "folder" | "recipe", id: string, label: string } | null (empty area)
// Handlers are all functions passed from recipe_list.js.

export function buildRecipeListContextMenuItems({
  node,
  onNewAgent,           // (parentFolderId) => void
  onNewFolder,          // (parentFolderId) => void
  onStartRename,        // (node) => void
  onDelete,             // (node) => void
  onDuplicate,          // (recipeName) => void
}) {
  if (!node) {
    return [
      { icon: "chat_new", label: "New Agent", onClick: () => onNewAgent(null) },
      { icon: "folder_new", label: "New Folder", onClick: () => onNewFolder(null) },
    ];
  }

  if (node.kind === "folder") {
    return [
      { icon: "chat_new", label: "New Agent", onClick: () => onNewAgent(node.id) },
      { icon: "folder_new", label: "New Folder", onClick: () => onNewFolder(node.id) },
      { type: "separator" },
      { icon: "rename", label: "Rename", onClick: () => onStartRename(node) },
      { type: "separator" },
      { icon: "delete", label: "Delete", danger: true, onClick: () => onDelete(node) },
    ];
  }

  if (node.kind === "recipe") {
    return [
      { icon: "rename", label: "Rename", onClick: () => onStartRename(node) },
      { icon: "copy", label: "Duplicate", onClick: () => onDuplicate(node.id) },
      { type: "separator" },
      { icon: "delete", label: "Delete", danger: true, onClick: () => onDelete(node) },
    ];
  }

  return [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_list_context_menu_items.js
git commit -m "feat(agents): context menu items builder for recipe list"
```

---

### Task 1.2: Extend api.unchain surface with `renameRecipe` + `deleteRecipe` + `duplicateRecipe`

**Assumption:** Check `src/SERVICEs/api.unchain.js` first. If these methods already exist, SKIP this task.

- [ ] **Step 1: Verify current surface**

Run: `grep -n "renameRecipe\|deleteRecipe\|duplicateRecipe\|saveRecipe\|listRecipes" src/SERVICEs/api.unchain.js`

If `renameRecipe`, `deleteRecipe` exist — go to Phase 1.3.
If only `saveRecipe` / `listRecipes` exist — implement below.

- [ ] **Step 2: Check the backend for matching endpoints**

Run: `grep -rn "rename_recipe\|delete_recipe\|duplicate_recipe" unchain_runtime/server/`

If a backend handler exists, wire the frontend facade to it. If not, implement client-side as:

```jsx
// In src/SERVICEs/api.unchain.js, inside the unchain facade:
deleteRecipe: async (name) => {
  // If backend has no delete endpoint, call saveRecipe with tombstone
  // OR use the filesystem route. For now, if there's no backend, fall back
  // to frontend-only state (but caller should be aware recipes persist on disk).
  return window.unchainAPI.deleteRecipe(name);
},
renameRecipe: async (oldName, newName) => {
  return window.unchainAPI.renameRecipe(oldName, newName);
},
duplicateRecipe: async (srcName, nextName) => {
  const recipe = await window.unchainAPI.getRecipe(srcName);
  await window.unchainAPI.saveRecipe({ ...recipe, name: nextName });
  return nextName;
},
```

- [ ] **Step 3: If backend endpoints are missing, add them**

If backend lacks delete/rename, add routes in `unchain_runtime/server/routes.py`:
- `POST /unchain/recipes/delete` → `{name}` — unlink `<recipes_dir>/<name>.json`
- `POST /unchain/recipes/rename` → `{old_name, new_name}` — rename the file

AND expose through IPC in `electron/preload/bridges/unchain_bridge.js` + `electron/main/ipc/register_handlers.js`.

**If this is a large change**, stop and ask the user whether they want client-side-only fallback OR a backend round-trip. Do NOT silently fabricate an endpoint.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(api): recipe rename/delete/duplicate endpoints"
```

---

### Task 1.3: Rewrite `recipe_list.js` with folders + context menu + inline rename

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_list.js`
- Test: none (UI, verify visually)

This is the largest task in Phase 1. Split into steps.

- [ ] **Step 1: Replace the whole component**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/recipe_list.js`:

```jsx
import { useMemo, useState, useCallback } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Explorer from "../../../../BUILTIN_COMPONENTs/explorer/explorer";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { buildRecipeListContextMenuItems } from "./recipe_list_context_menu_items";

export default function RecipeList({
  recipes,
  folderState,           // { folders, recipeFolder, folderOrder }
  activeName,
  renamingId,            // null | folderId | recipeName
  renamingDraft,         // string
  onRenamingDraftChange, // (val) => void
  onCommitRename,        // (oldId, newName) => void
  onCancelRename,        // () => void
  onSelect,              // (recipeName) => void
  onCollapse,            // () => void
  onContextMenuAction,   // (action, payload) => void  — see items builder
  onToggleFolder,        // (folderId) => void
  isDark,
}) {
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, node }
  const mutedColor = isDark ? "#888" : "#888";

  const openContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeContextMenu = () => setCtxMenu(null);

  const menuItems = useMemo(() => {
    if (!ctxMenu) return [];
    return buildRecipeListContextMenuItems({
      node: ctxMenu.node,
      onNewAgent: (parentFolderId) =>
        onContextMenuAction("new_agent", { parentFolderId }),
      onNewFolder: (parentFolderId) =>
        onContextMenuAction("new_folder", { parentFolderId }),
      onStartRename: (node) => onContextMenuAction("start_rename", { node }),
      onDelete: (node) => onContextMenuAction("delete", { node }),
      onDuplicate: (recipeName) =>
        onContextMenuAction("duplicate", { recipeName }),
    });
  }, [ctxMenu, onContextMenuAction]);

  const buildExplorerData = useCallback(() => {
    const map = {};
    const root = [];

    // Children of a folder = child folders + assigned recipes, in order.
    const folderChildren = (folderId) => {
      const folder = folderState.folders[folderId];
      const ids = [];
      if (folder) {
        folder.childFolderIds.forEach((id) => ids.push(id));
      }
      recipes.forEach((r) => {
        if (folderState.recipeFolder[r.name] === folderId) {
          ids.push(r.name);
        }
      });
      return ids;
    };

    const addFolder = (folderId) => {
      const folder = folderState.folders[folderId];
      if (!folder) return;
      const isRenaming = renamingId === folderId;
      map[folderId] = {
        label: isRenaming ? null : folder.name,
        prefix_icon: "folder",
        on_click: () => onToggleFolder(folderId),
        on_context_menu: (_node, e) =>
          openContextMenu(e, { kind: "folder", id: folderId, label: folder.name }),
        nodes: folder.expanded ? folderChildren(folderId) : undefined,
        custom_label: isRenaming
          ? renderRenameInput({
              value: renamingDraft,
              onChange: onRenamingDraftChange,
              onCommit: () => onCommitRename(folderId, renamingDraft),
              onCancel: onCancelRename,
              isDark,
            })
          : undefined,
      };
      folder.childFolderIds.forEach(addFolder);
    };

    folderState.folderOrder.forEach(addFolder);

    recipes.forEach((r) => {
      const assigned = folderState.recipeFolder[r.name];
      const isRenaming = renamingId === r.name;
      map[r.name] = {
        label: isRenaming ? null : r.name,
        prefix_icon: "bot",
        on_click: () => onSelect(r.name),
        on_context_menu: (_node, e) =>
          openContextMenu(e, { kind: "recipe", id: r.name, label: r.name }),
        custom_label: isRenaming
          ? renderRenameInput({
              value: renamingDraft,
              onChange: onRenamingDraftChange,
              onCommit: () => onCommitRename(r.name, renamingDraft),
              onCancel: onCancelRename,
              isDark,
            })
          : undefined,
      };
      if (!assigned || !folderState.folders[assigned]) {
        // Only add orphan recipes to root.
        root.push(r.name);
      }
    });

    folderState.folderOrder.forEach((id) => root.push(id));

    return { data: map, root };
  }, [
    recipes,
    folderState,
    renamingId,
    renamingDraft,
    onRenamingDraftChange,
    onCommitRename,
    onCancelRename,
    onSelect,
    onToggleFolder,
    isDark,
  ]);

  const { data, root } = buildExplorerData();

  return (
    <div
      onContextMenu={(e) => openContextMenu(e, null)}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: "10px 8px",
        gap: 2,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "2px 2px 8px 2px",
        }}
      >
        {onCollapse && (
          <Button
            prefix_icon="side_menu_close"
            onClick={onCollapse}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 4,
              opacity: 0.5,
              content: {
                prefixIconWrap: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 0,
                },
                icon: { width: 14, height: 14 },
              },
            }}
          />
        )}
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: mutedColor,
            userSelect: "none",
            WebkitUserSelect: "none",
            flex: 1,
          }}
        >
          Agents
        </div>
        <Button
          prefix_icon="add"
          onClick={() => onContextMenuAction("new_agent", { parentFolderId: null })}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 4,
            opacity: 0.55,
            content: {
              prefixIconWrap: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
              },
              icon: { width: 14, height: 14 },
            },
          }}
        />
      </div>

      {/* ── Explorer ── */}
      <div
        className="scrollable"
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        <Explorer
          data={data}
          root={root}
          active_node_id={activeName}
          style={{ width: "100%", fontSize: 13 }}
        />
      </div>

      <ContextMenu
        visible={!!ctxMenu}
        x={ctxMenu?.x || 0}
        y={ctxMenu?.y || 0}
        items={menuItems}
        onClose={closeContextMenu}
        isDark={isDark}
      />
    </div>
  );
}

function renderRenameInput({ value, onChange, onCommit, onCancel, isDark }) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      style={{
        width: "100%",
        padding: "2px 4px",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.2)" : "#aaa"}`,
        borderRadius: 4,
        fontSize: 13,
        background: isDark ? "#1e1e22" : "#fff",
        color: isDark ? "#fff" : "#222",
        boxSizing: "border-box",
      }}
    />
  );
}
```

- [ ] **Step 2: Check Explorer supports `custom_label`**

Run: `grep -n "custom_label\|label" src/BUILTIN_COMPONENTs/explorer/explorer.js | head -40`

If Explorer does NOT honor `custom_label`, fall back to rendering the rename input in a popover above the list OR modify Explorer to accept `custom_label` (render it in place of `label` when set).

- [ ] **Step 3: If `custom_label` needs to be added to Explorer, patch explorer.js**

In the label-rendering block of explorer.js, before rendering the text node:

```jsx
if (node.custom_label) return node.custom_label;
```

Run: `npm start` and verify the rename input appears when triggered.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_list.js src/BUILTIN_COMPONENTs/explorer/explorer.js
git commit -m "feat(agents): recipe list folders, rename, context menu"
```

---

### Task 1.4: Wire recipe_list into recipes_page with folder state

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page.js`

- [ ] **Step 1: Import folder storage helpers and ConfirmModal**

Add to the imports at the top of `recipes_page.js`:

```jsx
import { ConfirmModal } from "../../../BUILTIN_COMPONENTs/modal/modal";
import {
  getFolderState,
  setFolderState,
  createFolder as createFolderStorage,
  renameFolder,
  deleteFolder,
  toggleFolderExpanded,
  renameRecipeKey,
  forgetRecipe,
} from "../../../SERVICEs/agent_folder_storage";
```

- [ ] **Step 2: Add folder + rename + delete-confirm state**

Inside the component body, right after the existing `useState` declarations:

```jsx
const [folderState, setFolderStateLocal] = useState(() => getFolderState());
const [renamingId, setRenamingId] = useState(null);
const [renamingDraft, setRenamingDraft] = useState("");
const [confirmDelete, setConfirmDelete] = useState(null); // {kind, id, label} | null
```

- [ ] **Step 3: Add handlers**

Replace the existing `handleSave` block with the extended set of handlers below (append new handlers just after `handleSave`):

```jsx
const persistFolderState = (next) => {
  setFolderState(next);
  setFolderStateLocal({ ...next });
};

const handleToggleFolder = (folderId) => {
  const next = toggleFolderExpanded(folderId);
  persistFolderState(next);
};

const handleStartRename = (node) => {
  setRenamingId(node.id);
  setRenamingDraft(node.label);
};

const handleCancelRename = () => {
  setRenamingId(null);
  setRenamingDraft("");
};

const handleCommitRename = async (oldId, nextName) => {
  const trimmed = (nextName || "").trim();
  if (!trimmed) {
    handleCancelRename();
    return;
  }
  const isFolder = !!folderState.folders[oldId];
  if (isFolder) {
    const next = renameFolder(oldId, trimmed);
    persistFolderState(next);
  } else {
    if (trimmed === oldId) {
      handleCancelRename();
      return;
    }
    try {
      await api.unchain.renameRecipe(oldId, trimmed);
      const { recipes: list } = await api.unchain.listRecipes();
      setRecipes(list);
      const nextFolder = renameRecipeKey(oldId, trimmed);
      persistFolderState(nextFolder);
      if (activeName === oldId) setActiveName(trimmed);
    } catch (exc) {
      console.error("rename_recipe_failed", exc);
    }
  }
  handleCancelRename();
};

const handleCreateFolder = async (parentFolderId) => {
  const { state, folderId } = createFolderStorage({ parentId: parentFolderId });
  persistFolderState(state);
  setRenamingId(folderId);
  setRenamingDraft("New Folder");
};

const handleCreateAgent = async (parentFolderId) => {
  let base = "New Agent";
  let idx = 1;
  const existing = new Set(recipes.map((r) => r.name));
  let candidate = base;
  while (existing.has(candidate)) {
    candidate = `${base} ${idx++}`;
  }
  const payload = {
    name: candidate,
    description: "",
    model: null,
    max_iterations: null,
    agent: { prompt_format: "soul", prompt: "" },
    toolkits: [],
    subagent_pool: [],
  };
  await api.unchain.saveRecipe(payload);
  const { recipes: list } = await api.unchain.listRecipes();
  setRecipes(list);
  if (parentFolderId) {
    const next = { ...folderState };
    next.recipeFolder = { ...next.recipeFolder, [candidate]: parentFolderId };
    persistFolderState(next);
  }
  setActiveName(candidate);
  setRenamingId(candidate);
  setRenamingDraft(candidate);
};

const handleDuplicate = async (recipeName) => {
  const existing = new Set(recipes.map((r) => r.name));
  let copy = `${recipeName} (copy)`;
  let idx = 2;
  while (existing.has(copy)) {
    copy = `${recipeName} (copy ${idx++})`;
  }
  await api.unchain.duplicateRecipe(recipeName, copy);
  const { recipes: list } = await api.unchain.listRecipes();
  setRecipes(list);
  setActiveName(copy);
};

const handleRequestDelete = (node) => {
  setConfirmDelete(node);
};

const handleConfirmDelete = async () => {
  if (!confirmDelete) return;
  if (confirmDelete.kind === "folder") {
    const next = deleteFolder(confirmDelete.id);
    persistFolderState(next);
  } else if (confirmDelete.kind === "recipe") {
    await api.unchain.deleteRecipe(confirmDelete.id);
    const next = forgetRecipe(confirmDelete.id);
    persistFolderState(next);
    const { recipes: list } = await api.unchain.listRecipes();
    setRecipes(list);
    if (activeName === confirmDelete.id) {
      setActiveName(list[0]?.name || null);
    }
  }
  setConfirmDelete(null);
};

const handleContextMenuAction = (action, payload) => {
  if (action === "new_agent") handleCreateAgent(payload.parentFolderId);
  else if (action === "new_folder") handleCreateFolder(payload.parentFolderId);
  else if (action === "start_rename") handleStartRename(payload.node);
  else if (action === "delete") handleRequestDelete(payload.node);
  else if (action === "duplicate") handleDuplicate(payload.recipeName);
};
```

- [ ] **Step 4: Thread props into `RecipeList`**

Replace the existing `<RecipeList .../>` block with:

```jsx
<RecipeList
  recipes={recipes}
  folderState={folderState}
  activeName={activeName}
  renamingId={renamingId}
  renamingDraft={renamingDraft}
  onRenamingDraftChange={setRenamingDraft}
  onCommitRename={handleCommitRename}
  onCancelRename={handleCancelRename}
  onSelect={setActiveName}
  onCollapse={() => setListCollapsed(true)}
  onContextMenuAction={handleContextMenuAction}
  onToggleFolder={handleToggleFolder}
  isDark={isDark}
/>
```

Note: remove the old `onListChange={setRecipes}` prop — state flows through the action handlers now.

- [ ] **Step 5: Render confirm modal**

Inside the outermost `<div>` (still inside the JSX tree), add at the bottom before closing:

```jsx
<ConfirmModal
  open={!!confirmDelete}
  onClose={() => setConfirmDelete(null)}
  onConfirm={handleConfirmDelete}
  title={confirmDelete?.kind === "folder" ? "Delete Folder" : "Delete Agent"}
  message={
    confirmDelete?.kind === "folder"
      ? `Delete folder "${confirmDelete?.label}"? Contained agents will move to the root.`
      : `Delete agent "${confirmDelete?.label}"? This cannot be undone.`
  }
  confirmLabel="Delete"
/>
```

**Correction** — folders currently cascade-delete in storage (`deleteFolder` removes the folder and child folders). The ConfirmModal copy should reflect the actual behavior; update `handleConfirmDelete` to *orphan* recipes instead if you want the message to be accurate. The current code already does this (recipes get their `recipeFolder` entry removed because folder deletion doesn't touch recipe disk files, only the folder index). Verify once by deleting a populated folder and confirming recipes remain in the root.

- [ ] **Step 6: Manual verification**

Run: `npm start`. In the Recipes page:
- Right-click blank space → "New Agent" / "New Folder" appear
- Rename a folder → inline input shows, Enter commits
- Duplicate an agent → copy appears, auto-selected
- Delete a recipe → confirm modal → confirmed → disappears

- [ ] **Step 7: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page.js
git commit -m "feat(agents): folder state + rename/delete/duplicate handlers"
```

---

## Phase 2: Node graph — toolpool, canvas context menu, edge delete, port restriction

### Task 2.1: Create `ToolPoolNode` component

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js`

- [ ] **Step 1: Write the component**

```jsx
// src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function ToolPoolNode({ node, isDark, selected }) {
  const accent = "#4a5bd8";
  const borderColor = selected
    ? accent
    : isDark
      ? "rgba(255,255,255,0.14)"
      : "rgba(0,0,0,0.1)";
  const textColor = isDark ? "#ddd" : "#222";
  const iconColor = selected ? accent : isDark ? "#bbb" : "#666";
  const mutedColor = isDark ? "#888" : "#888";

  return (
    <div
      style={{
        minWidth: 170,
        padding: "10px 12px",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        background: isDark ? "#1e1e22" : "#fff",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon src="tool" style={{ width: 14, height: 14 }} color={iconColor} />
        <div style={{ fontWeight: 500, fontSize: 13, color: textColor }}>
          {node.count ?? 0} tools
        </div>
      </div>
      {node.chips && node.chips.length > 0 && (
        <div
          style={{
            marginTop: 6,
            marginLeft: 22,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {node.chips.slice(0, 3).map((c) => (
            <span key={c} style={{ fontSize: 10, color: mutedColor }}>
              {c}
            </span>
          ))}
          {node.chips.length > 3 && (
            <span style={{ fontSize: 10, color: mutedColor }}>
              +{node.chips.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js
git commit -m "feat(agents): ToolPoolNode component"
```

---

### Task 2.2: Canvas context menu items builder

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js`

- [ ] **Step 1: Write builder**

```jsx
// src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js
export function buildRecipeCanvasContextMenuItems({
  hasToolPool,          // boolean
  hasSubagentPool,      // boolean
  onAddToolPool,
  onAddSubagentPool,
  onDeleteEdge,         // null | () => void   (set when right-clicked on an edge)
  onDeleteNode,         // null | () => void
}) {
  const items = [];

  if (onDeleteEdge) {
    items.push({
      icon: "delete",
      label: "Delete Edge",
      danger: true,
      onClick: onDeleteEdge,
    });
    return items;
  }

  if (onDeleteNode) {
    items.push({
      icon: "delete",
      label: "Delete Node",
      danger: true,
      onClick: onDeleteNode,
    });
    return items;
  }

  items.push({
    icon: "tool",
    label: hasToolPool ? "Tool Pool (added)" : "Add Tool Pool",
    disabled: hasToolPool,
    onClick: onAddToolPool,
  });
  items.push({
    icon: "bot",
    label: hasSubagentPool ? "Subagent Pool (added)" : "Add Subagent Pool",
    disabled: hasSubagentPool,
    onClick: onAddSubagentPool,
  });
  return items;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js
git commit -m "feat(agents): canvas context menu items builder"
```

---

### Task 2.3: Rewrite `recipe_canvas.js` — toolpool, context menu, edge delete, ports

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`

- [ ] **Step 1: Inspect FlowEditor port API**

Before editing, confirm how to restrict ports to left/right. Run:

```bash
grep -n "DEFAULT_PORTS\|ports\s*=\s*\[" src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js | head -20
```

Document what you find. If each node accepts a `ports: [{id, side}]` array, use `ports: [{ id: "left", side: "left" }, { id: "right", side: "right" }]` per node. If the port model differs, adjust the snippet below to match.

- [ ] **Step 2: Confirm `on_edges_change` and right-click callbacks exist**

```bash
grep -n "on_edges_change\|on_edge_context_menu\|on_canvas_context_menu\|on_node_context_menu\|on_background_context_menu" src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js
```

If any of the context-menu callbacks are missing, STOP and note the gap. Fallback: attach a plain `onContextMenu` to the FlowEditor wrapper div in recipe_canvas and inspect `e.target` to figure out whether an edge/node was clicked (less clean but avoids a FlowEditor change).

- [ ] **Step 3: Rewrite recipe_canvas.js**

Overwrite the file:

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import { api } from "../../../../SERVICEs/api";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import AgentNode from "./nodes/agent_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import { buildRecipeCanvasContextMenuItems } from "./recipe_canvas_context_menu_items";

const AGENT_POS = { x: 420, y: 240 };
const TOOLPOOL_POS = { x: 80, y: 240 };
const POOL_POS = { x: 760, y: 240 };
const PORTS = [
  { id: "left", side: "left" },
  { id: "right", side: "right" },
];

export default function RecipeCanvas({
  recipe,
  selectedNodeId,
  onSelectNode,
  onRecipeChange,
  onSave,
  dirty,
  isDark,
}) {
  const [toolkitCatalog, setToolkitCatalog] = useState([]);
  const [positions, setPositions] = useState({});
  const [ctxMenu, setCtxMenu] = useState(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { toolkits } = await api.unchain.getToolkitCatalog();
        setToolkitCatalog(toolkits || []);
      } catch (_exc) {
        setToolkitCatalog([]);
      }
    })();
  }, []);

  useEffect(() => {
    setPositions({});
  }, [recipe?.name]);

  const hasToolPool = !!recipe && recipe.toolkits.length > 0;
  const hasSubagentPool = !!recipe && recipe.subagent_pool.length > 0;

  const { nodes, edges } = useMemo(() => {
    if (!recipe) return { nodes: [], edges: [] };
    const nodeArr = [];
    const edgeArr = [];

    const pos = (id, defaultX, defaultY) => {
      const p = positions[id];
      return p ? { x: p.x, y: p.y } : { x: defaultX, y: defaultY };
    };

    const agentXY = pos("agent", AGENT_POS.x, AGENT_POS.y);
    nodeArr.push({
      id: "agent",
      type: "agent",
      x: agentXY.x,
      y: agentXY.y,
      ports: PORTS,
      label: recipe.name,
      model: recipe.model,
    });

    if (hasToolPool) {
      const xy = pos("toolpool", TOOLPOOL_POS.x, TOOLPOOL_POS.y);
      const totalEnabled = recipe.toolkits.reduce(
        (acc, tk) =>
          acc + (tk.enabled_tools === null ? 1 : tk.enabled_tools.length),
        0,
      );
      nodeArr.push({
        id: "toolpool",
        type: "toolpool",
        x: xy.x,
        y: xy.y,
        ports: PORTS,
        count: totalEnabled,
        chips: recipe.toolkits.map((t) => t.id),
      });
      edgeArr.push({
        id: "e:agent:toolpool",
        source_node_id: "agent",
        source_port_id: "left",
        target_node_id: "toolpool",
        target_port_id: "right",
      });
    }

    if (hasSubagentPool) {
      const xy = pos("pool", POOL_POS.x, POOL_POS.y);
      nodeArr.push({
        id: "pool",
        type: "pool",
        x: xy.x,
        y: xy.y,
        ports: PORTS,
        count: recipe.subagent_pool.length,
        chips: recipe.subagent_pool.map((e) =>
          e.kind === "ref" ? e.template_name : e.name,
        ),
      });
      edgeArr.push({
        id: "e:agent:pool",
        source_node_id: "agent",
        source_port_id: "right",
        target_node_id: "pool",
        target_port_id: "left",
      });
    }

    return { nodes: nodeArr, edges: edgeArr };
  }, [recipe, positions, hasToolPool, hasSubagentPool]);

  const handleNodesChange = (nextNodes) => {
    setPositions((prev) => {
      const next = { ...prev };
      nextNodes.forEach((n) => {
        next[n.id] = { x: n.x, y: n.y };
      });
      return next;
    });
  };

  const handleEdgesChange = (nextEdges) => {
    if (!recipe) return;
    const presentIds = new Set(nextEdges.map((e) => e.id));
    let mutated = { ...recipe };
    let changed = false;
    if (hasToolPool && !presentIds.has("e:agent:toolpool")) {
      mutated = { ...mutated, toolkits: [] };
      changed = true;
    }
    if (hasSubagentPool && !presentIds.has("e:agent:pool")) {
      mutated = { ...mutated, subagent_pool: [] };
      changed = true;
    }
    if (changed) onRecipeChange(mutated);
  };

  const handleDeleteNode = (nodeId) => {
    if (!recipe) return;
    if (nodeId === "toolpool") {
      onRecipeChange({ ...recipe, toolkits: [] });
    } else if (nodeId === "pool") {
      onRecipeChange({ ...recipe, subagent_pool: [] });
    }
    if (selectedNodeId === nodeId) onSelectNode(null);
  };

  const renderNode = (node) => {
    const selected = node.id === selectedNodeId;
    if (node.type === "agent")
      return <AgentNode node={node} isDark={isDark} selected={selected} />;
    if (node.type === "toolpool")
      return <ToolPoolNode node={node} isDark={isDark} selected={selected} />;
    if (node.type === "pool")
      return (
        <SubagentPoolNode node={node} isDark={isDark} selected={selected} />
      );
    return null;
  };

  const handleAddToolPool = () => {
    if (!recipe || hasToolPool) return;
    const firstToolkit = toolkitCatalog[0]?.id;
    if (!firstToolkit) return;
    onRecipeChange({
      ...recipe,
      toolkits: [{ id: firstToolkit, enabled_tools: null }],
    });
  };

  const handleAddSubagentPool = () => {
    if (!recipe || hasSubagentPool) return;
    // The pool is considered "added" if its array is non-empty.
    // But the data model treats [] as "no pool". We seed with an empty ref-style
    // placeholder to make the node visible immediately.
    // Instead, for this UI, we treat "pool added" as length > 0; toggling adds
    // a placeholder subagent that the user edits in the inspector.
    onRecipeChange({
      ...recipe,
      subagent_pool: [
        { kind: "inline", name: "New Subagent", prompt: "", model: null },
      ],
    });
  };

  const openCanvasMenu = (e, overrides = {}) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, ...overrides });
  };

  const menuItems = useMemo(() => {
    if (!ctxMenu) return [];
    return buildRecipeCanvasContextMenuItems({
      hasToolPool,
      hasSubagentPool,
      onAddToolPool: handleAddToolPool,
      onAddSubagentPool: handleAddSubagentPool,
      onDeleteEdge: ctxMenu.edgeId
        ? () => handleEdgesChange(edges.filter((e) => e.id !== ctxMenu.edgeId))
        : null,
      onDeleteNode: ctxMenu.nodeId
        ? () => handleDeleteNode(ctxMenu.nodeId)
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxMenu, hasToolPool, hasSubagentPool, edges, recipe]);

  const handleConnect = () => {
    // Edges are derived from recipe arrays; reject manual connects.
  };

  return (
    <div
      ref={wrapperRef}
      onContextMenu={(e) => {
        // Fallback path if FlowEditor doesn't emit a canvas-context-menu callback:
        // treat any context menu on the blank canvas as "add node".
        openCanvasMenu(e);
      }}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          bottom: 6,
          left: 6,
          overflow: "hidden",
        }}
      >
        <FlowEditor
          style={{
            width: "100%",
            height: "100%",
            background: isDark ? "#1a1a1a" : "#fafafb",
            borderRadius: 8,
          }}
          theme={{
            nodeBackground: "transparent",
            nodeShadow: "none",
            nodeShadowHover: "none",
            nodeSelectedBorder: "transparent",
          }}
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          on_nodes_change={handleNodesChange}
          on_edges_change={handleEdgesChange}
          on_node_context_menu={(node, e) =>
            openCanvasMenu(e, { nodeId: node.id })
          }
          on_edge_context_menu={(edge, e) =>
            openCanvasMenu(e, { edgeId: edge.id })
          }
          render_node={renderNode}
        />
      </div>

      {/* Bottom toolbar — kept minimal: only the Save button stays */}
      <BottomToolbar isDark={isDark} dirty={dirty} onSave={onSave} />

      <ContextMenu
        visible={!!ctxMenu}
        x={ctxMenu?.x || 0}
        y={ctxMenu?.y || 0}
        items={menuItems}
        onClose={() => setCtxMenu(null)}
        isDark={isDark}
      />
    </div>
  );
}

function BottomToolbar({ isDark, dirty, onSave }) {
  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 10,
        backgroundColor: overlayBg,
        border: overlayBorder,
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        boxShadow: isDark
          ? "0 4px 24px rgba(0,0,0,0.4)"
          : "0 4px 24px rgba(0,0,0,0.08)",
      }}
    >
      <SaveButton dirty={dirty} onSave={onSave} isDark={isDark} />
    </div>
  );
}

function SaveButton({ dirty, onSave, isDark }) {
  // Imported Button will replace this in Phase 4.
  // Keep a minimal inline styled button for now.
  return (
    <button
      onClick={onSave}
      disabled={!dirty}
      style={{
        border: `1px solid ${dirty ? "#4a5bd8" : isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
        background: dirty ? "#4a5bd8" : "transparent",
        color: dirty ? "#fff" : isDark ? "#ddd" : "#333",
        padding: "4px 10px",
        borderRadius: 7,
        fontSize: 12,
        cursor: dirty ? "pointer" : "default",
      }}
    >
      Save
    </button>
  );
}
```

- [ ] **Step 4: Verify FlowEditor actually emits the context-menu callbacks**

If Step 2 showed `on_node_context_menu` / `on_edge_context_menu` do NOT exist, use a fallback: rely entirely on the wrapper `onContextMenu` and distinguish between hitting blank canvas vs. node/edge by checking `e.target.closest` for known node selectors. Simpler fallback: skip edge delete via context menu and let users press `Delete` on a selected edge (FlowEditor's built-in keyboard delete).

Document the final approach in your commit message.

- [ ] **Step 5: Manual verification**

Run `npm start` and check:
- Right-click empty canvas → "Add Tool Pool", "Add Subagent Pool" appear
- Adding Tool Pool while `toolkitCatalog` is empty fails silently — OK for now
- Right-click edge → "Delete Edge" removes it; recipe.toolkits/subagent_pool cleared
- Dragging nodes updates positions and they persist across selection

- [ ] **Step 6: Delete the obsolete toolkit_node.js**

```bash
git rm src/COMPONENTs/agents/pages/recipes_page/nodes/toolkit_node.js
```

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat(agents): toolpool node + canvas context menu + edge delete + port restriction"
```

---

### Task 2.4: Update `recipe_inspector.js` routing

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_inspector.js`

- [ ] **Step 1: Replace `tk:` prefix handling with `toolpool` routing**

Edit the branch block:

```jsx
if (selectedNodeId === "agent") {
  content = (
    <AgentInspector
      recipe={recipe}
      onRecipeChange={onRecipeChange}
      isDark={isDark}
    />
  );
} else if (selectedNodeId === "toolpool") {
  content = (
    <ToolkitInspector
      recipe={recipe}
      onRecipeChange={onRecipeChange}
      isDark={isDark}
    />
  );
} else if (selectedNodeId === "pool") {
  content = (
    <PoolInspector
      recipe={recipe}
      onRecipeChange={onRecipeChange}
      isDark={isDark}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_inspector.js
git commit -m "refactor(agents): inspector routes toolpool instead of tk:<id>"
```

---

### Task 2.5: Refactor `toolkit_inspector.js` → aggregated tool-pool inspector

The inspector must now show ALL configured toolkits in one panel, with a Select to add a toolkit, and a per-tool Switch matrix.

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js`

- [ ] **Step 1: Read current file to capture what you're replacing**

```bash
cat src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js | head -50
```

Note the existing API surface the single-toolkit inspector uses. Your refactor must preserve the recipe mutation pattern (`onRecipeChange({...recipe, toolkits: [...]})`).

- [ ] **Step 2: Overwrite with the aggregated version**

```jsx
import { useEffect, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";

export default function ToolkitInspector({ recipe, onRecipeChange, isDark }) {
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { toolkits } = await api.unchain.getToolkitCatalog();
        setCatalog(toolkits || []);
      } catch (_exc) {
        setCatalog([]);
      }
    })();
  }, []);

  if (!recipe) return null;

  const toolkits = recipe.toolkits || [];
  const availableToAdd = catalog.filter(
    (tk) => !toolkits.some((t) => t.id === tk.id),
  );

  const addToolkit = (toolkitId) => {
    if (!toolkitId) return;
    if (toolkits.some((t) => t.id === toolkitId)) return;
    onRecipeChange({
      ...recipe,
      toolkits: [...toolkits, { id: toolkitId, enabled_tools: null }],
    });
  };

  const removeToolkit = (toolkitId) => {
    onRecipeChange({
      ...recipe,
      toolkits: toolkits.filter((t) => t.id !== toolkitId),
    });
  };

  const setToolEnabled = (toolkitId, toolName, enabled) => {
    const next = toolkits.map((t) => {
      if (t.id !== toolkitId) return t;
      const catalogEntry = catalog.find((c) => c.id === toolkitId);
      const allTools = catalogEntry?.tools?.map((x) => x.name) || [];
      const currentEnabled =
        t.enabled_tools === null ? allTools.slice() : t.enabled_tools.slice();
      let nextEnabled;
      if (enabled) {
        nextEnabled = Array.from(new Set([...currentEnabled, toolName]));
      } else {
        nextEnabled = currentEnabled.filter((n) => n !== toolName);
      }
      return { ...t, enabled_tools: nextEnabled };
    });
    onRecipeChange({ ...recipe, toolkits: next });
  };

  const labelColor = isDark ? "#888" : "#888";
  const textColor = isDark ? "#ddd" : "#222";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: labelColor,
            marginBottom: 6,
          }}
        >
          Tool Pool
        </div>
        <Select
          placeholder={
            availableToAdd.length === 0 ? "All toolkits added" : "Add toolkit"
          }
          options={availableToAdd.map((tk) => ({ value: tk.id, label: tk.id }))}
          value={null}
          onChange={(v) => addToolkit(v)}
          disabled={availableToAdd.length === 0}
        />
      </div>

      {toolkits.length === 0 && (
        <div style={{ fontSize: 12, color: labelColor }}>
          No toolkits configured.
        </div>
      )}

      {toolkits.map((t) => {
        const entry = catalog.find((c) => c.id === t.id);
        const allTools = entry?.tools || [];
        const enabled = new Set(
          t.enabled_tools === null ? allTools.map((x) => x.name) : t.enabled_tools,
        );
        return (
          <div
            key={t.id}
            style={{
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: 8,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 500, color: textColor, flex: 1 }}>
                {t.id}
              </div>
              <Button
                prefix_icon="delete"
                onClick={() => removeToolkit(t.id)}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  opacity: 0.55,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allTools.map((tool) => (
                <div
                  key={tool.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ flex: 1, color: textColor }}>{tool.name}</div>
                  <Switch
                    checked={enabled.has(tool.name)}
                    onChange={(v) => setToolEnabled(t.id, tool.name, v)}
                  />
                </div>
              ))}
              {allTools.length === 0 && (
                <div style={{ fontSize: 11, color: labelColor }}>
                  No tools available for this toolkit.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Verify API assumptions before committing:**
- Select's props: `options`, `value`, `onChange`, `placeholder`, `disabled` — read `src/BUILTIN_COMPONENTs/select/select.js` to confirm. If the API differs (e.g., uses `items` or `on_change`), adjust.
- Switch's props: `checked`, `onChange` — read `src/BUILTIN_COMPONENTs/input/switch.js` to confirm.

Run:
```bash
grep -n "^function\|export default\|props\|checked\|onChange" src/BUILTIN_COMPONENTs/input/switch.js | head -20
grep -n "^function\|export default\|props\|options\|onChange\|on_change" src/BUILTIN_COMPONENTs/select/select.js | head -20
```

Adjust prop names to match.

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js
git commit -m "refactor(agents): toolkit inspector aggregates all toolkits"
```

---

## Phase 3: Fullscreen toggle

### Task 3.1: Thread fullscreen state through AgentsModal

**Files:**
- Modify: `src/COMPONENTs/agents/agents_modal.js`

- [ ] **Step 1: Add state and fullscreen prop**

Inside `AgentsModal`, add near the existing `useState` calls:

```jsx
const [isFullscreen, setIsFullscreen] = useState(false);
```

Reset in the open-toggle `useEffect`:

```jsx
useEffect(() => {
  if (!open) {
    setSelectedSection("agents");
    setSelectedNodeId(null);
    setIsFullscreen(false);
  }
}, [open]);
```

- [ ] **Step 2: Pass `fullscreen` to Modal and override size**

Update the `<Modal .../>` props:

```jsx
<Modal
  open={open}
  onClose={handleClose}
  fullscreen={isFullscreen}
  style={
    isFullscreen
      ? {
          padding: 0,
          backgroundColor: panelBg,
          color: isDark ? "#fff" : "#222",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }
      : {
          width: 920,
          maxWidth: "92vw",
          height: 600,
          maxHeight: "88vh",
          padding: 0,
          backgroundColor: panelBg,
          color: isDark ? "#fff" : "#222",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }
  }
>
```

- [ ] **Step 3: Add the fullscreen toggle button**

Right above the existing close button, add a toggle button:

```jsx
<Button
  prefix_icon={isFullscreen ? "collapse" : "expand"}
  onClick={() => setIsFullscreen((v) => !v)}
  style={{
    position: "absolute",
    top: 12,
    right: 46,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    opacity: 0.45,
    zIndex: 4,
    content: {
      prefixIconWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      },
      icon: { width: 14, height: 14 },
    },
  }}
/>
```

- [ ] **Step 4: Verify icons exist**

Run:
```bash
grep -rn "\"expand\"\|\"collapse\"\|\"fullscreen\"\|expand\.svg\|collapse\.svg" src/BUILTIN_COMPONENTs/icon/ 2>/dev/null | head
```

If `expand`/`collapse` icons don't exist, use `"plus"` / `"minus"` as placeholders OR use `"arrow_up_right"` / `"arrow_down_left"`. Run `grep -rn "\"arrow_up_right\"" src/BUILTIN_COMPONENTs/icon/` to find the right name.

Do NOT invent icon names — always verify from the icon registry.

- [ ] **Step 5: Manual verification**

Run `npm start`, open the Agents modal, click the fullscreen icon. Confirm:
- Modal expands to full viewport
- Click again → returns to default size
- Close button still works
- Fullscreen resets when modal is closed

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/agents/agents_modal.js
git commit -m "feat(agents): fullscreen toggle button"
```

---

## Phase 4: mini_ui migration — inspectors + bottom toolbar

### Task 4.1: Migrate `agent_inspector.js`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/inspectors/agent_inspector.js`

- [ ] **Step 1: Read current file**

```bash
cat src/COMPONENTs/agents/pages/recipes_page/inspectors/agent_inspector.js
```

Note all native `<input>`, `<textarea>`, `<select>` usages. Each will be replaced:
- `<input type="text">` → `Input` from `BUILTIN_COMPONENTs/input/input.js` (read the file to confirm prop names)
- `<textarea>` → keep native OR use `TextField` if one exists (`BUILTIN_COMPONENTs/input/textfield.js`)
- `<input type="number">` / slider-like → `Slider` from `BUILTIN_COMPONENTs/input/slider.js`
- `<select>` model picker → `Select` from `BUILTIN_COMPONENTs/select/select.js`

- [ ] **Step 2: Confirm each built-in's API**

Run:
```bash
head -50 src/BUILTIN_COMPONENTs/input/input.js src/BUILTIN_COMPONENTs/input/textfield.js src/BUILTIN_COMPONENTs/input/slider.js src/BUILTIN_COMPONENTs/select/select.js
```

Record the prop signatures (value/onChange or value/on_change, etc.) — you'll use them in the rewrite.

- [ ] **Step 3: Rewrite `agent_inspector.js`**

Replace each native control with the corresponding built-in. Preserve the existing mutation pattern — every change calls `onRecipeChange({ ...recipe, ...patch })`.

Skeleton (fill in with the exact props from Step 2):

```jsx
import { useEffect, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import Slider from "../../../../../BUILTIN_COMPONENTs/input/slider";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";

export default function AgentInspector({ recipe, onRecipeChange, isDark }) {
  const [models, setModels] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { models: m } = await api.unchain.getModelCatalog();
        setModels(m || []);
      } catch (_exc) {
        setModels([]);
      }
    })();
  }, []);

  if (!recipe) return null;

  const labelColor = isDark ? "#888" : "#888";
  const patch = (update) => onRecipeChange({ ...recipe, ...update });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Name" isDark={isDark}>
        <Input
          value={recipe.name}
          onChange={(v) => patch({ name: v })}
          placeholder="Agent name"
        />
      </Field>

      <Field label="Description" isDark={isDark}>
        <TextField
          value={recipe.description || ""}
          onChange={(v) => patch({ description: v })}
          placeholder="Describe this agent"
          rows={3}
        />
      </Field>

      <Field label="Model" isDark={isDark}>
        <Select
          value={recipe.model}
          options={models.map((m) => ({ value: m.id, label: m.id }))}
          onChange={(v) => patch({ model: v })}
          placeholder="Inherit from parent"
        />
      </Field>

      <Field
        label={`Max iterations (${recipe.max_iterations ?? "∞"})`}
        isDark={isDark}
      >
        <Slider
          min={1}
          max={50}
          value={recipe.max_iterations ?? 10}
          onChange={(v) => patch({ max_iterations: v })}
        />
      </Field>

      <Field label="System Prompt" isDark={isDark}>
        <TextField
          value={recipe.agent?.prompt || ""}
          onChange={(v) =>
            patch({ agent: { ...recipe.agent, prompt: v } })
          }
          placeholder="You are..."
          rows={6}
        />
      </Field>
    </div>
  );
}

function Field({ label, isDark, children }) {
  const labelColor = isDark ? "#888" : "#888";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: labelColor,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
```

**Important:** Before committing, verify:
- `TextField` exists and accepts `rows` (if not, use `<textarea>` styled manually and defer migration)
- `Select`'s prop names match (likely `value`, `options`, `onChange` — but may be `on_change`)
- `Slider`'s prop names match

If a prop name differs, fix it in place rather than guessing.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/inspectors/agent_inspector.js
git commit -m "refactor(agents): migrate agent inspector to mini_ui built-ins"
```

---

### Task 4.2: Migrate `pool_inspector.js`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/inspectors/pool_inspector.js`

- [ ] **Step 1: Read current file**

```bash
cat src/COMPONENTs/agents/pages/recipes_page/inspectors/pool_inspector.js
```

- [ ] **Step 2: Apply the same substitutions**

Replace `<input>` with `Input`, `<textarea>` with `TextField`, `<select>` with `Select`, add/remove buttons with `Button`. Preserve the existing subagent_pool shape `{kind, name?, template_name?, prompt?, model?}`.

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/inspectors/pool_inspector.js
git commit -m "refactor(agents): migrate pool inspector to mini_ui built-ins"
```

---

### Task 4.3: Migrate `subagent_picker.js`

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js`

- [ ] **Step 1: Read and migrate**

```bash
cat src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js
```

Replace any native input/select/button with mini_ui equivalents. Preserve the callback signatures.

- [ ] **Step 2: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js
git commit -m "refactor(agents): migrate subagent picker to mini_ui built-ins"
```

---

### Task 4.4: Migrate bottom toolbar Save button

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`

- [ ] **Step 1: Replace inline `<button>` with `Button`**

In the `BottomToolbar`/`SaveButton` helpers added in Task 2.3, replace the native `<button>` with:

```jsx
import Button from "../../../../BUILTIN_COMPONENTs/input/button";

function SaveButton({ dirty, onSave, isDark }) {
  return (
    <Button
      label="Save"
      onClick={onSave}
      disabled={!dirty}
      style={{
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 7,
        background: dirty ? { color: "#4a5bd8" } : undefined,
        content: {
          label: {
            fontSize: 12,
            color: dirty ? "#fff" : isDark ? "#ddd" : "#333",
          },
        },
      }}
    />
  );
}
```

- [ ] **Step 2: Verify Button supports `disabled` + `label` prop**

Read `src/BUILTIN_COMPONENTs/input/button.js` — confirm prop shape. If `label` is not a supported prop (Button might require `children`), adjust.

- [ ] **Step 3: Commit**

```bash
git add src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js
git commit -m "refactor(agents): migrate canvas save button to mini_ui Button"
```

---

### Task 4.5: Final manual smoke test

- [ ] **Step 1: Run the app**

```bash
npm start
```

- [ ] **Step 2: Walk through the UI**

In the Agents modal:
1. Create a new folder, move an agent into it (drag — or, if drag isn't supported in this phase, skip)
2. Rename folder and agent inline
3. Duplicate an agent
4. Delete a folder with children — confirm recipes survive at root
5. Toggle fullscreen
6. Add Tool Pool via canvas right-click
7. Select Tool Pool → inspector shows aggregated tools with Switch toggles
8. Delete the edge from Agent to Tool Pool → toolkits array clears
9. Save the recipe and reload — ensure state persists

- [ ] **Step 3: Finalize**

Stop here — do NOT commit on the user's behalf. Report the final state and let the user inspect and commit.

---

## Self-Review Notes

- **Spec coverage:** All four user-requested features are covered:
  1. Explorer with folders / create / rename / delete / context menu → Phase 1
  2. Toolpool node + canvas context menu + port restriction + edge delete → Phase 2
  3. Fullscreen button → Phase 3
  4. mini_ui migration of inspectors and bottom toolbar → Phase 4

- **Assumptions the implementer must verify before coding:**
  - `api.unchain.renameRecipe` / `deleteRecipe` exist (Task 1.2). If missing, decide with the user whether to add a backend route or use a client-only fallback.
  - `FlowEditor` emits `on_edges_change`, `on_node_context_menu`, `on_edge_context_menu` (Task 2.3 Step 2). If not, use the `onContextMenu` wrapper fallback.
  - `Explorer` honors a `custom_label` node field (Task 1.3 Step 2). If not, patch Explorer OR render rename input separately.
  - `Input`, `Switch`, `Slider`, `Select`, `TextField`, `Button` prop names (Tasks 2.5, 4.1, 4.2, 4.3, 4.4). Verify before wiring.
  - Icon names (`folder`, `rename`, `copy`, `delete`, `expand`, `collapse`, `tool`, `bot`, `chat_new`, `folder_new`) exist in the icon registry. If any are missing, substitute or add them.

- **Known scope edges:**
  - Drag-and-drop recipes between folders is NOT in scope — only assignment via "New Agent inside folder" context menu and no-move.
  - Folder tree is client-local, not synced across machines.
  - Recipe rename mutates only the on-disk file name; any references held elsewhere (chat sessions pointing at the recipe) must be handled by existing backend, not by this plan.

- **Risk level:** Moderate. Highest-risk item is Task 1.2 if backend endpoints for rename/delete are missing — that crosses the Python + Electron IPC boundary and would require additional tests. Check first, then decide.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-agent-builder-phase-2.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
