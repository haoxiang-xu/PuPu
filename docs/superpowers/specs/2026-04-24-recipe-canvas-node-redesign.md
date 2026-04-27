# Recipe Canvas Node Redesign — Design Spec

**Date:** 2026-04-24
**Goal:** Rework the visual + topological model of the recipe canvas so nodes are borderless cards that lift on selection, ports sit flush on all four sides, and the data model anticipates a future workflow mode by classifying nodes as *workflow* vs *plugin*.

---

## Scope

In scope:
- Visual redesign of `AgentNode`, `ToolPoolNode`, `SubagentPoolNode`
- Add `kind: "workflow" | "plugin"` classification (data + visual)
- Switch all nodes to 4-side ports (`top`, `right`, `bottom`, `left`)
- Default layout: tool pool above agent, subagent pool below agent (vertical attachment)
- Edge style differentiation: workflow solid, plugin dashed
- FlowEditor theme extension: `portShape: "bar" | "dot"` and per-edge style
- Edge delete already works in FlowEditor; verify cascade through `RecipeCanvas.handleEdgesChange`

Out of scope (separate rounds):
- Side menu refinement (folder/agent copy/paste/import/export)
- mini_ui inspector component migration
- Workflow mode runtime (start/end node *implementation* — only data-model placeholder)

---

## Visual Design Tokens

Single shared palette across all node kinds. Inline-styles only (per project convention).

```js
const NODE_TOKENS = {
  surface_light: "#ffffff",
  surface_dark:  "#1f2027",
  shadow_rest:   "0 1px 2px rgba(15,18,38,0.05), 0 4px 14px rgba(15,18,38,0.07)",
  shadow_lift:   "0 2px 4px rgba(15,18,38,0.07), 0 14px 36px rgba(15,18,38,0.14)",
  shadow_rest_dark: "0 1px 2px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.4)",
  shadow_lift_dark: "0 2px 4px rgba(0,0,0,0.6), 0 14px 36px rgba(0,0,0,0.6)",
  radius: 12,
  accent: "#4a5bd8",
  port_rest_light: "rgba(0,0,0,0.22)",
  port_rest_dark:  "rgba(255,255,255,0.32)",
  port_active:     "#4a5bd8",
  text:        { light: "#1d1d22", dark: "#f0f0f3" },
  text_soft:   { light: "#6b6b73", dark: "#a8a8b0" },
  text_muted:  { light: "#a0a0a8", dark: "#5d5d65" },
  chip_bg:     { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.05)" },
  divider:     { light: "rgba(0,0,0,0.07)", dark: "rgba(255,255,255,0.08)" },
};
```

**Selected state:** add `transform: translateY(-3px)` and switch `boxShadow` to `shadow_lift`. Transition `transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)`.

**Borders:** none. Selection signaled by shadow + lift only (no colored ring).

---

## Node Kinds

Two categories. Stored in node-data as `kind`. Drives port set, edge style, and connection rules.

| Kind | Members | Ports | Edge style | Connection rule |
|------|---------|-------|------------|-----------------|
| `workflow` | `agent` (and future `start`, `end`) | 4 sides | solid | workflow ↔ workflow |
| `plugin` | `toolpool`, `subagentpool` | 4 sides | dashed | plugin ↔ workflow `agent` only |

Plugin nodes connecting to non-agent workflow nodes are rejected at `on_connect`.

---

## Agent Node (workflow)

```
┌──────────────────────────┐
│  ▣  Default              │   ← 32px square avatar (accent fill, white "D")
│     claude-sonnet-4-6    │   ← model meta, 11px text_soft
└──────────────────────────┘
```

- Width: 200px
- Padding: 14px
- Avatar: 32×32, `borderRadius: 9`, accent bg, first letter of recipe name
- Title: 14px, weight 600
- Meta (model): 11px, `text_soft`
- All 4 ports

---

## Plugin Nodes (Tool Pool / Subagent Pool)

Same skeleton, different avatar gradient + chip content.

```
┌──────────────────────────┐
│  ▣  Tool Pool      [12]  │   ← gradient avatar, title, count chip on right
│     12 tools             │
│  ┌──┬──┬──┬──┐           │   ← 4-col grid of cells
│  │Rd│Ed│Wr│Gl│           │   ← cell = 1:1 aspect, chip_bg, 9.5px label
│  ├──┼──┼──┼──┤
│  │Gr│Bs│..│+1│
│  └──┴──┴──┴──┘
└──────────────────────────┘
```

- Width: 192px
- Padding: 12px 14px
- Avatar 26×26, `borderRadius: 8`
  - Tool pool: `linear-gradient(135deg, #f6a341, #ea7547)`
  - Subagent pool: `linear-gradient(135deg, #8a8cee, #5a5dd6)`
- Count chip top-right: 10px, weight 600, `chip_bg`, `borderRadius: 999`
- Body grid: `grid-template-columns: repeat(4, 1fr)`, gap 5px
- Cell: aspect 1:1, `chip_bg`, `borderRadius: 6`, centered 9.5px label (2-letter abbreviation)
- Overflow cell shows `+N` in `text_muted`, transparent background
- Empty pool: render the avatar/title row only, no grid

**Cell label derivation:** first 2 letters of the tool/subagent name, capitalized (`Read` → `Rd`, `WebFetch` → `We`, `code-reviewer` → `Co`). For collisions (rare), no special handling — the tooltip on hover (added in inspector) provides the full name.

---

## Port System (FlowEditor extension)

Add per-instance theme fields:

```js
theme = {
  ...existing,
  portShape: "bar",          // "bar" | "dot" (default "dot" for back-compat)
  portRestColor: "...",      // visible at rest
  portRestOpacity: 0.6,
  portActiveColor: "#4a5bd8",
  portActiveExtend: 6,       // pixels to extend when port is active (has edge)
};
```

`flow_editor/node.js` `render_port`:

- When `portShape === "bar"`:
  - Top/bottom: `width 16, height 3, borderRadius 999`
  - Left/right: `width 3, height 16, borderRadius 999`
  - Position at `{side}: -1.5px` so the bar half-overlaps the node edge
- When `portShape === "dot"`: existing behavior unchanged
- **Visibility:** override existing hover-only behavior. Show at `portRestOpacity` when port is *connected* (has an edge), or at full opacity when hovered/connecting/selected
- Connected ports get `portActiveColor` + extend by `portActiveExtend` along the bar's long axis

Determining "connected" inside `node.js`: pass `connected_port_ids` Set down from `flow_editor.js`, computed once per render from `edges`.

---

## Edge Styles

`flow_editor/utils.js` already returns a path string. We add per-edge style hints by reading `edge.style` (string: `"solid" | "dashed"` — default `"solid"`).

In `flow_editor.js` edge SVG render:
- `solid` → no `stroke-dasharray`
- `dashed` → `stroke-dasharray: "4 3"`

`RecipeCanvas` derives `edge.style`:
- `e:agent:toolpool`, `e:agent:pool` → `"dashed"` (plugin)
- All others (workflow → workflow, future) → `"solid"`

---

## Default Layout

Update positions in `recipe_canvas.js`:

```js
const AGENT_POS    = { x: 380, y: 260 };
const TOOLPOOL_POS = { x: 384, y: 60  };  // above agent
const POOL_POS     = { x: 384, y: 460 };  // below agent
```

Edge wiring updated to use vertical ports:

| Edge | source | source_port | target | target_port |
|------|--------|-------------|--------|-------------|
| `e:agent:toolpool` | `toolpool` | `bottom` | `agent` | `top` |
| `e:agent:pool` | `agent` | `bottom` | `pool` | `top` |

LR_PORTS constant is replaced with FOUR_PORTS:

```js
const FOUR_PORTS = [
  { id: "top",    side: "top" },
  { id: "right",  side: "right" },
  { id: "bottom", side: "bottom" },
  { id: "left",   side: "left" },
];
```

Existing per-recipe layout overrides (`recipe.layout.nodes[id] = {x, y}`) still take priority — we only change defaults.

---

## Data Model

Recipe JSON gains an optional `layout` field already used for drag positions; we extend with no schema change required. The `kind` classification lives only in the rendered node-data (added in `recipe_canvas.js` when building `nodes` array), not on disk:

```js
nodeArr.push({
  id: "agent",
  type: "agent",
  kind: "workflow",        // ← new
  ports: FOUR_PORTS,
  ...
});

nodeArr.push({
  id: "toolpool",
  type: "toolpool",
  kind: "plugin",          // ← new
  ports: FOUR_PORTS,
  ...
});
```

Node renderers don't need `kind` for visuals (each kind has its own component) but `recipe_canvas.handleConnect` uses it to enforce plugin-attaches-to-agent-only.

---

## Connect Validation

Currently `handleConnect` is a no-op (`/* Edges are derived; reject manual connect. */`). Spec keeps it a no-op for now (manual connect not enabled). Future workflow-mode work will replace it with kind-aware validation.

---

## Files

| File | Change |
|------|--------|
| `src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js` | Rewrite per token + 32px avatar |
| `src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js` | Rewrite per token + 4-col grid |
| `src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js` | Rewrite per token + 4-col grid |
| `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` | FOUR_PORTS, layout defaults, plugin edge style, `kind` field |
| `src/BUILTIN_COMPONENTs/flow_editor/node.js` | `portShape`, connected-port awareness, bar rendering |
| `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js` | Pass `connected_port_ids` to nodes; render `edge.style` dashed/solid |

No new files. No backend changes. No Python changes.

---

## Verification

Manual (no automated UI tests for canvas):
1. Open Agents modal → pick `Default`. All 3 nodes render in new style.
2. Tool pool sits above agent, subagent pool below agent. Edges curve from bottom→top ports.
3. Edges show dashed stroke for plugins.
4. Hover any node → its 4 bar ports become visible (full opacity).
5. Connected ports stay visible at ~60% opacity even when not hovered.
6. Click an edge to select → press Backspace → edge removed → corresponding `toolkits` / `subagent_pool` cleared in recipe → Save button activates.
7. Drag any node → Save button activates, position persists in `recipe.layout.nodes`.
8. Toggle dark mode → all surfaces, ports, chips invert correctly.
9. Tool pool with empty `enabled_tools` resolves to all catalog tools (existing behavior preserved).
10. ESLint clean.
