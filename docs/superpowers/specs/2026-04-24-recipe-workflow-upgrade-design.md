# Recipe Workflow Upgrade — Design Spec

> Feature #2 in the "four-feature" batch (Explorer menu / Node canvas / Fullscreen / mini_ui migration). This spec covers **Node canvas only**.

**Date:** 2026-04-24
**Scope:** Phase 1 (frontend) — Phase 2 runtime is a separate spec.

---

## 1. Goal

Upgrade the Agent Recipe Builder canvas from a single-agent "recipe" shape into a **multi-node workflow graph**: `start → agent → ... → end`, with plugin nodes (ToolPool / SubagentPool) attached to agents. Introduce a **variable reference** system (Dify-style) so downstream agents can pull upstream outputs into their prompts.

## 2. Non-goals (Phase 1)

- Backend runtime (real sequential execution, agent context passing) — Phase 2.
- Fan-in / fan-out / branching — deferred, to be implemented later via dedicated *function nodes* (router, merger).
- Explorer drag-from-sidebar wiring — depends on Feature #1; Phase 1 ships with a context-menu fallback.
- Editor-time variable substitution preview (showing what `{{#start.text#}}` will resolve to) — Phase 2.

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  RecipeCanvas page (unchanged outer layout)             │
│ ┌─────────────────────────────┐  ┌──────────────────┐   │
│ │ FlowEditor                  │  │ Detail Panel     │   │
│ │  ┌──┐   ┌──┐   ┌──┐   ┌──┐  │  │ (right)          │   │
│ │  │S │──▶│A1│──▶│A2│──▶│E │  │  │                  │   │
│ │  └──┘   └─┬┘   └──┘   └──┘  │  │ per-node content │   │
│ │         ┌─▼─┐                │  │ based on type    │   │
│ │         │TP │                │  │                  │   │
│ │         └───┘                │  │                  │   │
│ └─────────────────────────────┘  └──────────────────┘   │
│  [Center]  [Save]  (bottom control bar — unchanged)     │
└─────────────────────────────────────────────────────────┘
```

- **Canvas:** sits in the existing `RecipeCanvas` container (`src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`) — outer modal layout unchanged.
- **FlowEditor:** extended with port-kind awareness, connection validation, edge reconnect, and an edge delete × button.
- **Detail Panel:** right-side panel (replaces current ad-hoc selection UI). Content swaps by node type. Uses existing panel chrome.
- **Variable system:** prompt inputs become `contentEditable` fields rendering inline variable chips; `{{` triggers a variable picker dropdown.

## 4. Data Model

The on-disk filename stays `recipe`. Internal schema upgrades.

### 4.1 Recipe schema (new)

```js
{
  id: "recipe_abc123",
  name: "My Recipe",
  nodes: [
    {
      id: "start",
      type: "start",
      kind: "workflow",
      deletable: false,
      outputs: [
        { name: "text",   type: "string" },
        { name: "images", type: "image[]" },
        { name: "files",  type: "file[]" },
      ],
      x: 80, y: 240,
    },
    {
      id: "agent_1",
      type: "agent",
      kind: "workflow",
      deletable: true,
      template_ref: "researcher",        // null = local-only; else id of an Explorer agent template
      override: {                         // only fields that differ from template
        model: "claude-opus-4-7",
        prompt: "Analyze {{#start.text#}} ...",
      },
      outputs: [{ name: "output", type: "string" }],
      x: 380, y: 240,
    },
    {
      id: "end",
      type: "end",
      kind: "workflow",
      deletable: false,
      outputs_schema: [{ name: "output", type: "string" }],
      x: 780, y: 240,
    },
    {
      id: "tp_1",
      type: "toolpool",
      kind: "plugin",
      template_ref: null,
      tools: [
        { id: "web_search", enabled: true, config: {} },
        { id: "calc",       enabled: true, config: {} },
      ],
      x: 380, y: 80,
    },
    {
      id: "sp_1",
      type: "subagent_pool",
      kind: "plugin",
      template_ref: null,
      subagents: [{ kind: "ref", template_name: "reviewer" }],
      x: 380, y: 400,
    },
  ],
  edges: [
    {
      id: "e1",
      source_node_id: "start",   source_port_id: "out",
      target_node_id: "agent_1", target_port_id: "in",
      kind: "flow",
    },
    {
      id: "e2",
      source_node_id: "agent_1", source_port_id: "out",
      target_node_id: "end",     target_port_id: "in",
      kind: "flow",
    },
    {
      id: "e3",
      source_node_id: "agent_1", source_port_id: "attach_top",
      target_node_id: "tp_1",    target_port_id: "attach_bot",
      kind: "attach",
    },
  ],
}
```

### 4.2 Migration (old recipe → new recipe)

On load, if `recipe.nodes` / `recipe.edges` missing, treat as legacy and rebuild:

1. Create `start` at `(80, 260)` with default system outputs.
2. Create `agent_main` at `(380, 260)` with `type: "agent"`, `template_ref: null`, `override` populated from the legacy `recipe.agent` (model, prompt, memory config). Auto-prepend the prompt with `{{#start.text#}}\n{{#start.images#}}\n{{#start.files#}}\n\n` if the legacy prompt doesn't already reference them.
3. Create `end` at `(700, 260)`.
4. If `recipe.toolkits.length > 0`, create `tp_1` at `(380, 80)` with those toolkits; add attach edge `agent_main.attach_top → tp_1.attach_bot`.
5. If `recipe.subagent_pool.length > 0`, create `sp_1` at `(380, 440)` with those subagents; add attach edge `agent_main.attach_bot → sp_1.attach_top`.
6. Wire flow edges: `start → agent_main → end`.
7. First save writes the new schema; legacy fields (`agent`, `toolkits`, `subagent_pool`) get stripped.

Migration is idempotent: if `nodes` already exist, no-op.

## 5. Node Types and Ports

### 5.1 Node type table

| `type`          | `kind`     | Ports                                    | Count       | Deletable | Movable |
|-----------------|------------|------------------------------------------|-------------|-----------|---------|
| `start`         | `workflow` | `out` (right, single)                    | exactly 1   | ❌        | ✅      |
| `end`           | `workflow` | `in` (left, single)                      | exactly 1   | ❌        | ✅      |
| `agent`         | `workflow` | `in` (left) + `out` (right) + `attach_top` + `attach_bot` | ≥ 0 | ✅ | ✅ |
| `toolpool`      | `plugin`   | `attach_top` + `attach_bot` (each single) | ≥ 0        | ✅        | ✅      |
| `subagent_pool` | `plugin`   | `attach_top` + `attach_bot` (each single) | ≥ 0        | ✅        | ✅      |

### 5.2 Port kinds

Each port carries a `kind` attribute:
- `in` — accepts flow edges.
- `out` — emits flow edges.
- `attach` — used for attach edges between agent and plugin.

Ports stored as an array on the node, with `port_id` as a stable key:

```js
ports: [
  { id: "in",          side: "left",   kind: "in"     },
  { id: "out",         side: "right",  kind: "out"    },
  { id: "attach_top",  side: "top",    kind: "attach" },
  { id: "attach_bot",  side: "bottom", kind: "attach" },
]
```

Port id arrays are future-proofed with numeric suffixes (`out_0`, `out_1`, …) — Phase 1 uses single ports, Phase 2+ can unlock multi.

### 5.3 Port visual

Use `port_puzzle.html` approach — SVG goo filter merges puzzle tabs into the node body, a small dot sits at each port's anchor point.

Dot color by port kind:
- `in`     → `#8a5cf6`
- `out`    → `#f6a341`
- `attach` → `#5a5dd6`

Hover expands dot / subtle glow. Connected ports stay slightly dimmed. Non-connected / non-interactive ports fade out like today.

### 5.4 Connection validation

New `validate_connection({source, target})` callback on FlowEditor, returning `true | false | string` (string = rejection reason for tooltip).

Rules:
- `out → in` allowed for flow edges.
- `attach ↔ attach` allowed *only* between `workflow.agent` and `plugin.*`.
- Single-connection ports (`start.out`, `end.in`, `agent.in`, `agent.out`, `plugin.attach_*`) reject if already connected — unless the existing edge is the one being dragged (reconnect case).
- Self-loops rejected.
- `in → in` / `out → out` / cross-category attach rejected.
- Reconnect: dragging an existing edge endpoint ignores the occupied-by-self check but still validates the new endpoint.

## 6. Variable Reference System

### 6.1 Syntax

```
{{#<node_id>.<field_name>#}}
```

Examples: `{{#start.text#}}`, `{{#agent_1.output#}}`, `{{#agent_2.metadata#}}`.

### 6.2 Editor UX

Prompt fields are `contentEditable` elements with inline variable chips.

- **Chip DOM:** `<span data-var="<node_id>.<field>" contenteditable="false" class="var-chip">...<span>`. Styled as a small pill with a scope-dot (color matches the source node's type).
- **Insertion trigger:** typing `{{` at caret opens the variable picker dropdown at the caret position.
- **Picker:**
  - Top search input, auto-focus.
  - Body grouped by source node (e.g. "From Start", "From Analyst"), each row = one variable with a type tag.
  - Arrow keys navigate, Enter inserts, Escape closes.
- **Deleting a chip:** Backspace/Delete removes the whole chip as a single atomic unit.
- **Manual insert button:** "+ Insert variable" in section header opens the same picker (for users who don't know the `{{` shortcut).
- **Serialize:** When persisting to schema, replace each chip with `{{#<data-var>#}}`. When loading, parse the string and rebuild chips.

### 6.3 Scope (which variables show up)

Scope = upstream-reachable flow nodes + their declared `outputs`.

Computation:
1. From the current node, walk `edges` backwards following `in ← out` links (flow edges only; attach edges never carry data upstream).
2. Collect all reachable nodes (transitive).
3. For each node, list its `outputs[]` (for `start` / `agent`) or `outputs_schema[]` (for `end` — but end doesn't have a prompt editor anyway).

`start` is always in scope (reachable from any downstream node along a valid linear chain).

Plugin nodes have no outputs; they never appear in variable scope.

## 7. Detail Panel

Right-side panel (existing location). Swap content based on selected node type.

### 7.1 Start node panel

- **Header:** icon + "Start" + subtitle "Workflow entry".
- **Section — Output Variables:**
  - Table-like list of `{ name, type }` rows.
  - Default rows: `text: string`, `images: image[]`, `files: file[]`.
  - "+ Add output" at the bottom — opens a row with a type dropdown and name input.
  - Each row has a delete × (default rows also deletable — they're just defaults, not locked).
- **Section — Output preview:** Readonly card showing the last-run values (Phase 2; Phase 1 shows placeholder "Run not yet available").

### 7.2 End node panel

- **Header:** icon + "End" + subtitle "Workflow exit".
- **Section — Input Variables (read-only, informational):** lists upstream-reachable variables so the user knows what's available to reference. Clicking a row copies the `{{#...#}}` literal to clipboard.
- **Section — Output Schema:** user-declared final outputs; same editor as Start's Output Variables.
- **Section — Output preview:** same as Start (Phase 2).

### 7.3 Agent node panel

- **Header:** icon + agent name + small chip showing `ref: <template>` or `local`. Header has an unlink button if `template_ref` is set (turns it local, keeps current overrides).
- **Section — Input Variables:** upstream-reachable variables list, grouped by source node. Each row is clickable — click inserts the variable chip into the focused prompt editor. Hover shows a `+` affordance.
- **Section — Config:**
  - Template dropdown (list of Explorer agent templates + "local only").
  - Model dropdown (options from model catalog; showing "use template default" if template ref exists and model not overridden).
  - Memory config (reuse current agent config controls, modeled on existing `recipe.agent`).
- **Section — Prompt:** `contentEditable` editor (see §6.2). "+ Insert variable" in the section header.
- **Section — Output Schema:** declared output fields; default one row `output: string`.
- **Section — Output preview:** Phase 2.

### 7.4 ToolPool node panel

- **Header:** icon + "ToolPool" + template ref chip.
- **Section — Template:** dropdown (list of Explorer ToolPool templates + "local only").
- **Section — Tools:** scrollable list, each row = `{ toggle, tool_name, config button }`. Reuse the existing toolkit catalog loader. Clicking config opens the current toolkit config modal.
- No variable / prompt sections.

### 7.5 SubagentPool node panel

- **Header:** icon + "Subagents" + template ref chip.
- **Section — Template:** dropdown.
- **Section — Subagents:** list of `{ ref, name, model chip, edit button }`. Reuse existing subagent list UI.
- No variable / prompt sections.

## 8. Edge Interactions

Three deletion/edit affordances, all in FlowEditor.

### 8.1 Keyboard Delete

- Select edge by clicking on its bezier path (existing hit area).
- Press Delete/Backspace → `on_edges_change` with edge removed.
- Already works — verify path hit area is generous enough.

### 8.2 Hover × button

- When an edge is hovered or selected, render an 18px circular button at the bezier midpoint (compute using existing `get_bezier_midpoint`).
- Button contains an ×. Click → delete edge.
- Button fades in on hover (CSS transition 150 ms).
- Pointer events: only active when hover/selected.

### 8.3 Edge endpoint drag (overwrite / delete)

- Each edge has two invisible 12px hit dots at its source and target positions (rendered only when edge is hovered/selected).
- On `mousedown` a hit dot → enter *reconnect* mode:
  - Hide the original edge endpoint; render a floating bezier from the other endpoint to mouse position.
  - On `mouseup`:
    - Over a valid port (passes `validate_connection`, with the current edge exempted from single-connection check) → reconnect (update edge endpoint).
    - Anywhere else (blank canvas, invalid port) → delete edge.
- Implementation lives inside FlowEditor, not the consumer.

## 9. Phase 1 Implementation Plan (high-level)

Detailed TDD task decomposition happens in the implementation plan (next step). High-level task list:

1. **Schema upgrade + migration** — write migration function, tests for legacy → new conversion.
2. **FlowEditor port kinds** — port kind metadata, `validate_connection` prop.
3. **Puzzle port visual** — integrate `port_puzzle.html` approach into FlowEditor Port component; kind → dot color.
4. **Node type renderers** — 5 node components (Start, End, Agent, ToolPool, SubagentPool) with correct port configs.
5. **Undeletable Start/End** — honor `node.deletable` in delete handler.
6. **Edge × button** — midpoint hit button with fade-in.
7. **Edge endpoint drag reconnect/delete** — hit dots + reconnect state machine.
8. **Detail panel scaffold** — node-type switch + section primitives.
9. **Variable picker + chip editor** — `{{` trigger, picker dropdown, chip serialize/parse.
10. **Detail panel — Start/End/Plugin panels** — simpler ones first.
11. **Detail panel — Agent panel** — depends on variable editor.
12. **Context-menu fallback for add node** — Blank Agent / ToolPool / SubagentPool (until #1 Explorer drag lands).
13. **Persist ports in edges (fix current port-snap-back bug)** — ensure `source_port_id` / `target_port_id` are stored on the edge and round-trip through save/load.

## 10. Risks and Open Questions

- **`contentEditable` fragility:** caret handling + chip atomicity is notoriously tricky in browsers. Mitigation: thorough test coverage; consider wrapping in a small hook (`use_chip_editor`) if complexity grows.
- **Migration data loss:** if the legacy recipe has exotic fields, the migration might drop them. Mitigation: keep a snapshot in `recipe.legacy_snapshot` on first migration, accessible for manual recovery.
- **Variable scope recomputation cost:** BFS on every keystroke for the picker filter is fine at 1–20 nodes, but if graphs grow large we'll need memoization. Memoize by `(edges, nodes)` tuple.
- **Phase 2 coupling:** the UI lets users declare output schemas that Phase 1 runtime can't enforce (because Phase 2 is deferred). Acceptable — Phase 1 is an editor, not a runner.

---

*This design should be reviewed by the user before the implementation plan is written.*
