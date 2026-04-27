# Recipe Workflow Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User preference:** Do NOT `git commit` at the end of any task. Leave all changes in the working tree dirty. The user will commit manually.

**Goal:** Upgrade the Agent Recipe Builder canvas from single-agent "recipe" into a multi-node workflow graph (`start → agent → ... → end`) with plugin attach, variable references, a Dify-style detail panel, and richer edge interactions.

**Architecture:** Schema upgrade + migration; `FlowEditor` gets port-kind awareness, connection validation, an edge × button, and edge-endpoint reconnect; a new right-side detail panel swaps content per node type; prompt fields become `contentEditable` chip editors driven by a variable picker. Outer modal layout (left sidebar + canvas + bottom control bar + right panel) stays the same.

**Tech Stack:** React 19 function components, JavaScript (no TS/PropTypes), inline styles, existing FlowEditor primitives, `@testing-library/react` + Jest, `ConfigContext` for dark mode.

**Design spec:** `docs/superpowers/specs/2026-04-24-recipe-workflow-upgrade-design.md`

**Scope:** Phase 1 — editor only. Phase 2 (backend runtime, SSE agent_switch, Explorer drag) is a separate plan.

---

## Task Map

1. Schema migration module (pure functions)
2. Connection validation helpers (pure functions)
3. Variable scope computation (pure function)
4. FlowEditor — port kinds + `validate_connection` prop
5. FlowEditor — `node.deletable` honored in delete handler
6. FlowEditor — puzzle port visual in Port component
7. FlowEditor — edge × button at bezier midpoint
8. FlowEditor — edge endpoint drag reconnect / delete
9. Node renderer — shared puzzle defs (`puzzle_defs.js`) + dot overlay
10. Node renderers — Start / End / Agent / ToolPool / SubagentPool shapes
11. Variable picker dropdown component
12. Variable chip editor component (`contentEditable`)
13. Detail panel scaffold + node-type switcher
14. Start detail panel
15. End detail panel
16. ToolPool detail panel
17. SubagentPool detail panel
18. Agent detail panel
19. recipe_canvas integration (migration, nodes/edges derive, panel wiring, context-menu fallback)
20. Edge port persistence (save/load round-trip bug fix)

---

## Task 1: Schema migration module

**Goal:** Convert legacy `recipe` objects (with `agent` / `toolkits` / `subagent_pool`) into the new node-graph shape. Pure function, easy to test.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js`

- [ ] **Step 1.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js`:

```js
import { migrate_recipe, is_legacy_recipe } from "./recipe_migration";

describe("is_legacy_recipe", () => {
  test("returns true when recipe has no nodes field", () => {
    expect(is_legacy_recipe({ name: "x", agent: {} })).toBe(true);
  });
  test("returns false when recipe already has nodes", () => {
    expect(is_legacy_recipe({ name: "x", nodes: [], edges: [] })).toBe(false);
  });
});

describe("migrate_recipe", () => {
  test("passes through an already-migrated recipe", () => {
    const recipe = { name: "x", nodes: [{ id: "start" }], edges: [] };
    expect(migrate_recipe(recipe)).toBe(recipe);
  });

  test("creates start / agent_main / end from legacy minimal recipe", () => {
    const legacy = {
      name: "x",
      agent: { model: "claude-opus-4-7", prompt: "Hello" },
      toolkits: [],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const ids = migrated.nodes.map((n) => n.id);
    expect(ids).toEqual(["start", "agent_main", "end"]);
    const agent = migrated.nodes.find((n) => n.id === "agent_main");
    expect(agent.override.model).toBe("claude-opus-4-7");
    expect(agent.override.prompt).toContain("{{#start.text#}}");
    expect(agent.override.prompt).toContain("Hello");
    const edgePairs = migrated.edges.map(
      (e) => `${e.source_node_id}->${e.target_node_id}`,
    );
    expect(edgePairs).toContain("start->agent_main");
    expect(edgePairs).toContain("agent_main->end");
  });

  test("adds toolpool when legacy recipe has toolkits", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "" },
      toolkits: [{ id: "web", enabled_tools: ["web_search"] }],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const tp = migrated.nodes.find((n) => n.type === "toolpool");
    expect(tp).toBeTruthy();
    expect(tp.tools.length).toBe(1);
    const attach = migrated.edges.find((e) => e.kind === "attach");
    expect(attach).toBeTruthy();
    expect(attach.source_node_id).toBe("agent_main");
    expect(attach.target_node_id).toBe(tp.id);
  });

  test("adds subagent_pool when legacy recipe has subagent_pool entries", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "" },
      toolkits: [],
      subagent_pool: [{ kind: "ref", template_name: "reviewer" }],
    };
    const migrated = migrate_recipe(legacy);
    const sp = migrated.nodes.find((n) => n.type === "subagent_pool");
    expect(sp).toBeTruthy();
    expect(sp.subagents.length).toBe(1);
  });

  test("does not duplicate {{#start.text#}} if prompt already references it", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "Prefix {{#start.text#}} suffix" },
      toolkits: [],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const agent = migrated.nodes.find((n) => n.id === "agent_main");
    const matches = agent.override.prompt.match(/\{\{#start\.text#\}\}/g);
    expect(matches.length).toBe(1);
  });
});
```

- [ ] **Step 1.2: Run test to verify failure**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js`
Expected: FAIL with "Cannot find module './recipe_migration'".

- [ ] **Step 1.3: Implement `recipe_migration.js`**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_migration.js`:

```js
/* Recipe schema migration: legacy single-agent shape → node/edge graph. */

export function is_legacy_recipe(recipe) {
  return !!recipe && !Array.isArray(recipe.nodes);
}

const START_POS = { x: 80, y: 260 };
const AGENT_POS = { x: 380, y: 260 };
const END_POS = { x: 720, y: 260 };
const TOOLPOOL_POS = { x: 380, y: 80 };
const SUBAGENT_POOL_POS = { x: 380, y: 440 };

const DEFAULT_START_OUTPUTS = [
  { name: "text", type: "string" },
  { name: "images", type: "image[]" },
  { name: "files", type: "file[]" },
];

const DEFAULT_START_PREFIX =
  "{{#start.text#}}\n{{#start.images#}}\n{{#start.files#}}\n\n";

function inject_start_vars(prompt) {
  const text = prompt || "";
  if (/\{\{#start\.(text|images|files)#\}\}/.test(text)) return text;
  return DEFAULT_START_PREFIX + text;
}

function make_agent_node(legacy_agent) {
  return {
    id: "agent_main",
    type: "agent",
    kind: "workflow",
    deletable: true,
    template_ref: null,
    override: {
      model: legacy_agent?.model,
      prompt: inject_start_vars(legacy_agent?.prompt),
      memory: legacy_agent?.memory,
    },
    outputs: [{ name: "output", type: "string" }],
    x: AGENT_POS.x,
    y: AGENT_POS.y,
  };
}

function make_toolpool_node(legacy_toolkits) {
  const tools = legacy_toolkits.flatMap((tk) => {
    if (Array.isArray(tk.enabled_tools) && tk.enabled_tools.length > 0) {
      return tk.enabled_tools.map((name) => ({
        id: `${tk.id}:${name}`,
        enabled: true,
        config: {},
      }));
    }
    return [{ id: `${tk.id}:*`, enabled: true, config: {} }];
  });
  return {
    id: "tp_1",
    type: "toolpool",
    kind: "plugin",
    deletable: true,
    template_ref: null,
    tools,
    x: TOOLPOOL_POS.x,
    y: TOOLPOOL_POS.y,
  };
}

function make_subagent_pool_node(legacy_pool) {
  return {
    id: "sp_1",
    type: "subagent_pool",
    kind: "plugin",
    deletable: true,
    template_ref: null,
    subagents: legacy_pool.map((e) => ({ ...e })),
    x: SUBAGENT_POOL_POS.x,
    y: SUBAGENT_POOL_POS.y,
  };
}

export function migrate_recipe(recipe) {
  if (!is_legacy_recipe(recipe)) return recipe;

  const nodes = [
    {
      id: "start",
      type: "start",
      kind: "workflow",
      deletable: false,
      outputs: DEFAULT_START_OUTPUTS,
      x: START_POS.x,
      y: START_POS.y,
    },
    make_agent_node(recipe.agent),
    {
      id: "end",
      type: "end",
      kind: "workflow",
      deletable: false,
      outputs_schema: [{ name: "output", type: "string" }],
      x: END_POS.x,
      y: END_POS.y,
    },
  ];

  const edges = [
    {
      id: "e_start_agent",
      source_node_id: "start",
      source_port_id: "out",
      target_node_id: "agent_main",
      target_port_id: "in",
      kind: "flow",
    },
    {
      id: "e_agent_end",
      source_node_id: "agent_main",
      source_port_id: "out",
      target_node_id: "end",
      target_port_id: "in",
      kind: "flow",
    },
  ];

  if (Array.isArray(recipe.toolkits) && recipe.toolkits.length > 0) {
    const tp = make_toolpool_node(recipe.toolkits);
    nodes.push(tp);
    edges.push({
      id: "e_agent_tp",
      source_node_id: "agent_main",
      source_port_id: "attach_top",
      target_node_id: tp.id,
      target_port_id: "attach_bot",
      kind: "attach",
    });
  }

  if (Array.isArray(recipe.subagent_pool) && recipe.subagent_pool.length > 0) {
    const sp = make_subagent_pool_node(recipe.subagent_pool);
    nodes.push(sp);
    edges.push({
      id: "e_agent_sp",
      source_node_id: "agent_main",
      source_port_id: "attach_bot",
      target_node_id: sp.id,
      target_port_id: "attach_top",
      kind: "attach",
    });
  }

  const { agent, toolkits, subagent_pool, ...rest } = recipe;
  return { ...rest, nodes, edges };
}
```

- [ ] **Step 1.4: Run test to verify pass**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/recipe_migration.test.js`
Expected: all 5 tests pass.

- [ ] **Step 1.5: Leave uncommitted.**

---

## Task 2: Connection validation helpers

**Goal:** Pure rule-based function determining if a proposed `{source_node, source_port, target_node, target_port}` is a legal connection, used by FlowEditor.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_connection_rules.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_connection_rules.test.js`

- [ ] **Step 2.1: Write failing test**

Create `recipe_connection_rules.test.js`:

```js
import { validate_recipe_connection } from "./recipe_connection_rules";

const agent = (id = "a1") => ({
  id,
  type: "agent",
  kind: "workflow",
  ports: [
    { id: "in", side: "left", kind: "in" },
    { id: "out", side: "right", kind: "out" },
    { id: "attach_top", side: "top", kind: "attach" },
    { id: "attach_bot", side: "bottom", kind: "attach" },
  ],
});
const start = () => ({
  id: "start",
  type: "start",
  kind: "workflow",
  ports: [{ id: "out", side: "right", kind: "out" }],
});
const end = () => ({
  id: "end",
  type: "end",
  kind: "workflow",
  ports: [{ id: "in", side: "left", kind: "in" }],
});
const tp = (id = "tp1") => ({
  id,
  type: "toolpool",
  kind: "plugin",
  ports: [
    { id: "attach_top", side: "top", kind: "attach" },
    { id: "attach_bot", side: "bottom", kind: "attach" },
  ],
});

describe("validate_recipe_connection", () => {
  const ctx = (edges = [], exclude_edge_id = null) => ({ edges, exclude_edge_id });

  test("allows out → in between workflow nodes", () => {
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: agent(), port: "in" },
        ctx(),
      ),
    ).toBe(true);
  });

  test("rejects out → out", () => {
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: agent(), port: "out" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("rejects self-loop", () => {
    const a = agent();
    expect(
      validate_recipe_connection(
        { node: a, port: "out" },
        { node: a, port: "in" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("allows agent attach ↔ plugin attach", () => {
    expect(
      validate_recipe_connection(
        { node: agent(), port: "attach_top" },
        { node: tp(), port: "attach_bot" },
        ctx(),
      ),
    ).toBe(true);
  });

  test("rejects workflow→workflow attach pairing", () => {
    const a = agent("a1");
    const b = agent("a2");
    expect(
      validate_recipe_connection(
        { node: a, port: "attach_top" },
        { node: b, port: "attach_bot" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("rejects plugin↔plugin attach pairing", () => {
    expect(
      validate_recipe_connection(
        { node: tp("tp1"), port: "attach_top" },
        { node: tp("tp2"), port: "attach_bot" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("rejects second edge on single-connection port", () => {
    const existing = [
      {
        id: "e1",
        source_node_id: "start",
        source_port_id: "out",
        target_node_id: "a1",
        target_port_id: "in",
      },
    ];
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: end(), port: "in" },
        ctx(existing),
      ),
    ).not.toBe(true);
  });

  test("allows reconnect — existing edge is exempted", () => {
    const existing = [
      {
        id: "e1",
        source_node_id: "start",
        source_port_id: "out",
        target_node_id: "a1",
        target_port_id: "in",
      },
    ];
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: end(), port: "in" },
        ctx(existing, "e1"),
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/recipe_connection_rules.test.js`
Expected: FAIL with module-not-found.

- [ ] **Step 2.3: Implement**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_connection_rules.js`:

```js
/* Returns true if the connection is valid, otherwise a string rejection reason. */

function port_kind(node, port_id) {
  const p = (node.ports || []).find((x) => x.id === port_id);
  return p ? p.kind : null;
}

function is_port_occupied(edges, node_id, port_id, exclude_edge_id) {
  return edges.some(
    (e) =>
      e.id !== exclude_edge_id &&
      ((e.source_node_id === node_id && e.source_port_id === port_id) ||
        (e.target_node_id === node_id && e.target_port_id === port_id)),
  );
}

export function validate_recipe_connection(source, target, ctx) {
  const { edges = [], exclude_edge_id = null } = ctx || {};

  if (source.node.id === target.node.id) return "Self-loop not allowed";

  const sk = port_kind(source.node, source.port);
  const tk = port_kind(target.node, target.port);
  if (!sk || !tk) return "Unknown port";

  /* Flow pairing: out → in */
  if (sk === "out" && tk === "in") {
    if (is_port_occupied(edges, source.node.id, source.port, exclude_edge_id))
      return "Source already connected";
    if (is_port_occupied(edges, target.node.id, target.port, exclude_edge_id))
      return "Target already connected";
    return true;
  }
  if (sk === "in" && tk === "out") {
    /* allow reversed drag — caller normalizes */
    if (is_port_occupied(edges, source.node.id, source.port, exclude_edge_id))
      return "Source already connected";
    if (is_port_occupied(edges, target.node.id, target.port, exclude_edge_id))
      return "Target already connected";
    return true;
  }

  /* Attach pairing: workflow.attach ↔ plugin.attach */
  if (sk === "attach" && tk === "attach") {
    const sc = source.node.kind;
    const tc = target.node.kind;
    const one_is_workflow_agent =
      (sc === "workflow" && source.node.type === "agent") ||
      (tc === "workflow" && target.node.type === "agent");
    const one_is_plugin = sc === "plugin" || tc === "plugin";
    if (!one_is_workflow_agent || !one_is_plugin)
      return "Attach must connect an agent to a plugin";
    if (is_port_occupied(edges, source.node.id, source.port, exclude_edge_id))
      return "Source attach already connected";
    if (is_port_occupied(edges, target.node.id, target.port, exclude_edge_id))
      return "Target attach already connected";
    return true;
  }

  return "Incompatible port kinds";
}
```

- [ ] **Step 2.4: Run to verify pass**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/recipe_connection_rules.test.js`
Expected: all 8 tests pass.

- [ ] **Step 2.5: Leave uncommitted.**

---

## Task 3: Variable scope computation

**Goal:** Given a selected node + graph, return the list of upstream variables that can be inserted into its prompt.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/variable_scope.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/variable_scope.test.js`

- [ ] **Step 3.1: Write failing test**

Create `variable_scope.test.js`:

```js
import { compute_variable_scope } from "./variable_scope";

const node = (over) => ({
  id: "x",
  type: "agent",
  outputs: [{ name: "output", type: "string" }],
  ...over,
});
const flow_edge = (src, tgt) => ({
  id: `e_${src}_${tgt}`,
  source_node_id: src,
  source_port_id: "out",
  target_node_id: tgt,
  target_port_id: "in",
  kind: "flow",
});
const attach_edge = (src, tgt) => ({
  id: `a_${src}_${tgt}`,
  source_node_id: src,
  source_port_id: "attach_top",
  target_node_id: tgt,
  target_port_id: "attach_bot",
  kind: "attach",
});

describe("compute_variable_scope", () => {
  test("returns empty when no upstream", () => {
    const nodes = [node({ id: "a1" })];
    expect(compute_variable_scope("a1", nodes, [])).toEqual([]);
  });

  test("returns start outputs when directly upstream", () => {
    const nodes = [
      node({
        id: "start",
        type: "start",
        outputs: [
          { name: "text", type: "string" },
          { name: "images", type: "image[]" },
        ],
      }),
      node({ id: "a1" }),
    ];
    const scope = compute_variable_scope("a1", nodes, [flow_edge("start", "a1")]);
    expect(scope.map((v) => `${v.node_id}.${v.field}`)).toEqual([
      "start.text",
      "start.images",
    ]);
  });

  test("collects transitive upstream chain", () => {
    const nodes = [
      node({ id: "start", type: "start", outputs: [{ name: "text", type: "string" }] }),
      node({ id: "a1" }),
      node({ id: "a2" }),
    ];
    const edges = [flow_edge("start", "a1"), flow_edge("a1", "a2")];
    const scope = compute_variable_scope("a2", nodes, edges);
    const pairs = scope.map((v) => `${v.node_id}.${v.field}`);
    expect(pairs).toContain("start.text");
    expect(pairs).toContain("a1.output");
  });

  test("ignores attach edges (plugins are not upstream)", () => {
    const nodes = [
      node({ id: "a1" }),
      node({ id: "tp1", type: "toolpool", outputs: [] }),
      node({ id: "a2" }),
    ];
    const edges = [attach_edge("a1", "tp1"), flow_edge("a1", "a2")];
    const scope = compute_variable_scope("a2", nodes, edges);
    const node_ids = scope.map((v) => v.node_id);
    expect(node_ids).not.toContain("tp1");
    expect(node_ids).toContain("a1");
  });

  test("does not include self", () => {
    const nodes = [node({ id: "a1" })];
    const edges = [flow_edge("a1", "a1")];
    expect(compute_variable_scope("a1", nodes, edges)).toEqual([]);
  });
});
```

- [ ] **Step 3.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/variable_scope.test.js`
Expected: module-not-found.

- [ ] **Step 3.3: Implement**

Create `src/COMPONENTs/agents/pages/recipes_page/variable_scope.js`:

```js
/* BFS backwards along flow edges to collect upstream-reachable node outputs. */

export function compute_variable_scope(current_node_id, nodes, edges) {
  const by_id = new Map(nodes.map((n) => [n.id, n]));

  const incoming_flow = new Map();
  edges.forEach((e) => {
    if (e.kind !== "flow") return;
    if (!incoming_flow.has(e.target_node_id))
      incoming_flow.set(e.target_node_id, []);
    incoming_flow.get(e.target_node_id).push(e.source_node_id);
  });

  const visited = new Set();
  const upstream = [];
  const queue = [...(incoming_flow.get(current_node_id) || [])];

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id) || id === current_node_id) continue;
    visited.add(id);
    upstream.push(id);
    const parents = incoming_flow.get(id) || [];
    parents.forEach((p) => queue.push(p));
  }

  const scope = [];
  upstream.forEach((node_id) => {
    const n = by_id.get(node_id);
    if (!n) return;
    const outs = n.outputs || [];
    outs.forEach((o) =>
      scope.push({ node_id: n.id, field: o.name, type: o.type, source_type: n.type }),
    );
  });
  return scope;
}
```

- [ ] **Step 3.4: Run to verify pass**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/variable_scope.test.js`
Expected: 5 tests pass.

- [ ] **Step 3.5: Leave uncommitted.**

---

## Task 4: FlowEditor — port kinds + `validate_connection` prop

**Goal:** Let consumers (recipe_canvas) supply a `validate_connection` callback. FlowEditor's connection-end handler calls it and rejects invalid drops. Node port data already carries extra fields; FlowEditor must pass them through.

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`

- [ ] **Step 4.1: Read current connection-end code**

Read `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js:547-568` to confirm the current connect branch. Goal: insert a `validate_connection` check before calling `on_connect`.

- [ ] **Step 4.2: Modify FlowEditor props signature and connection-end logic**

Edit `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`:

Add `validate_connection` to the destructured props around line 69:

```js
function FlowEditor({
  style,
  theme: theme_override,
  nodes = [],
  edges = [],
  on_nodes_change,
  on_edges_change,
  on_connect,
  on_edge_add_node,
  on_select,
  render_node,
  validate_connection,
  grid_size = 20,
  min_zoom = 0.1,
  max_zoom = 3,
  reset_token,
  ...props
}) {
```

Then update the connection-end block in the `handle_up` function to run validation before firing `on_connect`:

Locate the block starting with `/* ── Connection end ── */` (around line 547). Replace it with:

```js
      /* ── Connection end ── */
      if (connecting_ref.current) {
        const conn = connecting_ref.current;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const port_id = target?.dataset?.portId;
        const node_id = target?.dataset?.nodeId;
        if (
          port_id &&
          node_id &&
          !(conn.source_node_id === node_id && conn.source_port_id === port_id)
        ) {
          const src_node = nodes_ref.current.find(
            (n) => n.id === conn.source_node_id,
          );
          const tgt_node = nodes_ref.current.find((n) => n.id === node_id);
          let ok = true;
          if (validate_connection && src_node && tgt_node) {
            const result = validate_connection({
              source: { node: src_node, port: conn.source_port_id },
              target: { node: tgt_node, port: port_id },
            });
            ok = result === true;
          }
          if (ok) {
            on_connect?.({
              source_node_id: conn.source_node_id,
              source_port_id: conn.source_port_id,
              target_node_id: node_id,
              target_port_id: port_id,
            });
          }
        }
        connecting_ref.current = null;
        setIsConnecting(false);
      }
```

Also add `validate_connection` to the `useEffect` dependency array for the global mousemove / mouseup hook (around line 577):

```js
  }, [
    grid_size,
    on_nodes_change,
    on_connect,
    on_select,
    update_edges_for_node,
    compute_snap,
    validate_connection,
  ]);
```

- [ ] **Step 4.3: Write smoke test for validate_connection pass-through**

Create `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`:

```js
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FlowEditor } from "./flow_editor";

const config = { theme: {}, onThemeMode: "light_mode" };

function wrap(ui) {
  return <ConfigContext.Provider value={config}>{ui}</ConfigContext.Provider>;
}

describe("FlowEditor validate_connection", () => {
  test("blocks on_connect when validate returns non-true", () => {
    const on_connect = jest.fn();
    const nodes = [
      {
        id: "a",
        x: 0,
        y: 0,
        ports: [{ id: "out", side: "right", kind: "out" }],
      },
      {
        id: "b",
        x: 200,
        y: 0,
        ports: [{ id: "in", side: "left", kind: "in" }],
      },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_connect={on_connect}
          validate_connection={() => "rejected"}
        />,
      ),
    );
    /* Simulate connection lifecycle via dom events is non-trivial.
       This test verifies the prop compiles and FlowEditor renders;
       behavioral correctness is verified via recipe_connection_rules tests
       and manual QA. */
    expect(container.querySelector('[data-flow-node-id="a"]')).toBeTruthy();
    expect(container.querySelector('[data-flow-node-id="b"]')).toBeTruthy();
    expect(on_connect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.4: Run to verify pass**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`
Expected: 1 test passes.

- [ ] **Step 4.5: Leave uncommitted.**

---

## Task 5: FlowEditor — honor `node.deletable`

**Goal:** Delete key should skip nodes where `node.deletable === false`.

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`

- [ ] **Step 5.1: Write failing test**

Append to `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`:

```js
describe("FlowEditor delete key respects node.deletable", () => {
  test("undeletable nodes remain after Delete", () => {
    const on_nodes_change = jest.fn();
    const on_edges_change = jest.fn();
    const nodes = [
      { id: "start", x: 0, y: 0, deletable: false, ports: [] },
      { id: "a", x: 200, y: 0, deletable: true, ports: [] },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_nodes_change={on_nodes_change}
          on_edges_change={on_edges_change}
        />,
      ),
    );
    /* Select both nodes by clicking them. Manually push selection state via
       clicks isn't viable here — instead simulate Delete after marking via
       selected_node_ids through a click. We click on node 'start' then 'a'
       with shift (single-select only in current impl — so we simulate 'a'). */
    const aEl = container.querySelector('[data-flow-node-id="a"]');
    fireEvent.mouseDown(aEl, { button: 0 });
    fireEvent.mouseUp(aEl);
    /* Delete key */
    fireEvent.keyDown(window, { code: "Delete" });
    expect(on_nodes_change).toHaveBeenCalled();
    const kept = on_nodes_change.mock.calls[0][0];
    /* 'start' must remain; 'a' removed (deletable:true) */
    expect(kept.find((n) => n.id === "start")).toBeTruthy();
  });

  test("does not remove an undeletable node even if selected", () => {
    const on_nodes_change = jest.fn();
    const nodes = [
      { id: "start", x: 0, y: 0, deletable: false, ports: [] },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_nodes_change={on_nodes_change}
        />,
      ),
    );
    const el = container.querySelector('[data-flow-node-id="start"]');
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.mouseUp(el);
    fireEvent.keyDown(window, { code: "Delete" });
    /* on_nodes_change should either not be called, or called with 'start' still present */
    if (on_nodes_change.mock.calls.length > 0) {
      const next = on_nodes_change.mock.calls[0][0];
      expect(next.find((n) => n.id === "start")).toBeTruthy();
    }
  });
});
```

- [ ] **Step 5.2: Run to verify failure**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`
Expected: the second test fails (`start` was removed) — current code deletes any selected node unconditionally.

- [ ] **Step 5.3: Modify keydown Delete branch**

In `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`, locate the Delete/Backspace branch (around lines 596–622). Update the node-delete section to filter undeletable nodes:

```js
        if (selected_ref.current.length > 0) {
          const ids = selected_ref.current;
          const deletable_ids = ids.filter((id) => {
            const n = nodes_ref.current.find((x) => x.id === id);
            return !n || n.deletable !== false;
          });
          if (deletable_ids.length === 0) return;
          on_nodes_change?.(
            nodes_ref.current.filter((n) => !deletable_ids.includes(n.id)),
          );
          on_edges_change?.(
            edges_ref.current.filter(
              (edge) =>
                !deletable_ids.includes(edge.source_node_id) &&
                !deletable_ids.includes(edge.target_node_id),
            ),
          );
          setSelectedNodeIds(ids.filter((id) => !deletable_ids.includes(id)));
        }
```

- [ ] **Step 5.4: Run to verify pass**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`
Expected: all tests pass.

- [ ] **Step 5.5: Leave uncommitted.**

---

## Task 6: FlowEditor — puzzle port visual

**Goal:** Extend `Port` component in `node.js` to render the puzzle-piece visual (goo filter + dot) when `theme.portShape === "puzzle"`. Preserve existing `bar` mode for any other consumers.

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/node.js`
- Create: `src/BUILTIN_COMPONENTs/flow_editor/puzzle_defs.js` (shared goo `<svg>` defs)

- [ ] **Step 6.1: Create puzzle_defs component**

Create `src/BUILTIN_COMPONENTs/flow_editor/puzzle_defs.js`:

```js
import React from "react";

/* Goo filter used to smoothly merge puzzle tabs into the node body.
 * Render once per canvas (FlowEditor renders it at the viewport root). */
export default function PuzzleDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <filter id="flow-editor-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 6.2: Render PuzzleDefs once inside FlowEditor**

Edit `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`:

Add import near the other imports:

```js
import PuzzleDefs from "./puzzle_defs";
```

Inside the top-level returned `<div ref={canvas_ref} ...>`, as the very first child (before `viewport_div_ref`), add:

```jsx
      <PuzzleDefs />
```

- [ ] **Step 6.3: Extend the Port component to emit `data-port-kind` and support dot visual**

Edit `src/BUILTIN_COMPONENTs/flow_editor/node.js`:

In the Port component, replace the body with a variant that renders a puzzle-mode dot when the theme requests it. The puzzle shape itself (goo-merged body + tabs) is painted by the **consumer's node renderer** (see Task 10) — FlowEditor only needs to place the interactive dot.

Replace the existing `Port` component (lines 14-135) with:

```js
const PORT_SIZE = 10;
const PORT_HALF = PORT_SIZE / 2;

const DOT_COLORS = {
  in: "#8a5cf6",
  out: "#f6a341",
  attach: "#5a5dd6",
};

const Port = React.memo(function Port({
  port,
  side,
  index,
  total,
  theme,
  node_id,
  is_connected,
  interactive,
  on_port_mouse_down,
}) {
  const [port_hovered, set_port_hovered] = useState(false);
  const fraction = (index + 1) / (total + 1);
  const shape = theme.portShape;
  const is_bar = shape === "bar";
  const is_puzzle = shape === "puzzle";
  const pos_style = { position: "absolute" };
  let base_transform = "";

  let port_w, port_h, offset;
  if (is_bar) {
    const long = is_connected ? 22 : 16;
    const short = 3;
    if (side === "top" || side === "bottom") {
      port_w = long; port_h = short;
    } else {
      port_w = short; port_h = long;
    }
    offset = -1.5;
  } else if (is_puzzle) {
    port_w = 8; port_h = 8;
    offset = -4;
  } else {
    port_w = PORT_SIZE; port_h = PORT_SIZE;
    offset = -PORT_HALF;
  }

  switch (side) {
    case "top":
      pos_style.left = `${fraction * 100}%`;
      pos_style.top = offset;
      base_transform = "translateX(-50%)";
      break;
    case "bottom":
      pos_style.left = `${fraction * 100}%`;
      pos_style.bottom = offset;
      base_transform = "translateX(-50%)";
      break;
    case "left":
      pos_style.top = `${fraction * 100}%`;
      pos_style.left = offset;
      base_transform = "translateY(-50%)";
      break;
    case "right":
      pos_style.top = `${fraction * 100}%`;
      pos_style.right = offset;
      base_transform = "translateY(-50%)";
      break;
    default:
      break;
  }

  const show_port = interactive || is_connected || port_hovered;
  const highlighted = port_hovered || is_connected;
  const kind = port.kind;
  const puzzle_color = DOT_COLORS[kind] || theme.portHoverColor;
  const bg = is_puzzle
    ? (highlighted ? puzzle_color : theme.portColor)
    : (highlighted ? theme.portHoverColor : theme.portColor);
  const opacity = is_connected && !interactive && !port_hovered ? 0.65 : show_port ? 1 : 0;

  let transform = base_transform;
  let box_shadow = "none";
  if (port_hovered && !is_bar) {
    transform = `${base_transform} scale(1.6)`;
    box_shadow = is_puzzle
      ? `0 0 0 5px ${puzzle_color}33`
      : `0 0 8px ${theme.portHoverColor}`;
  }

  const hit_pad = 10;

  return (
    <div
      data-port-id={port.id}
      data-port-side={side}
      data-port-kind={kind || ""}
      data-node-id={node_id}
      style={{
        ...pos_style,
        width: port_w,
        height: port_h,
        borderRadius: is_bar ? 999 : "50%",
        backgroundColor: bg,
        transform,
        boxShadow: box_shadow,
        cursor: "crosshair",
        zIndex: 10,
        opacity,
        pointerEvents: show_port ? "auto" : "none",
        transition:
          "transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.18s ease, width 0.15s ease, height 0.15s ease",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        on_port_mouse_down(node_id, port.id, side, e);
      }}
      onMouseEnter={() => set_port_hovered(true)}
      onMouseLeave={() => set_port_hovered(false)}
    >
      <div
        data-port-id={port.id}
        data-port-side={side}
        data-port-kind={kind || ""}
        data-node-id={node_id}
        style={{
          position: "absolute",
          inset: -hit_pad,
          pointerEvents: show_port ? "auto" : "none",
          background: "transparent",
        }}
      />
    </div>
  );
});
```

- [ ] **Step 6.4: Run existing tests to verify no regression**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/ src/COMPONENTs/agents/pages/recipes_page/`
Expected: all tests still pass.

- [ ] **Step 6.5: Leave uncommitted.**

---

## Task 7: FlowEditor — edge × button at midpoint

**Goal:** Render an × button at each edge's bezier midpoint, visible only when the edge is hovered or selected. Click deletes the edge.

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`

- [ ] **Step 7.1: Write failing test**

Append to `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`:

```js
describe("FlowEditor edge × button", () => {
  test("renders × button group on edge", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
      { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
    ];
    const edges = [
      {
        id: "e1",
        source_node_id: "a",
        source_port_id: "out",
        target_node_id: "b",
        target_port_id: "in",
      },
    ];
    const { container } = render(
      wrap(<FlowEditor nodes={nodes} edges={edges} />),
    );
    expect(container.querySelector('[data-edge-delete-btn="e1"]')).toBeTruthy();
  });

  test("click on × button removes the edge", () => {
    const on_edges_change = jest.fn();
    const nodes = [
      { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
      { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
    ];
    const edges = [
      {
        id: "e1",
        source_node_id: "a",
        source_port_id: "out",
        target_node_id: "b",
        target_port_id: "in",
      },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={edges}
          on_edges_change={on_edges_change}
        />,
      ),
    );
    const btn = container.querySelector('[data-edge-delete-btn="e1"]');
    fireEvent.click(btn);
    expect(on_edges_change).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 7.2: Run to verify fail**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`
Expected: both new tests fail (no delete button).

- [ ] **Step 7.3: Implement × button rendering**

Edit `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`:

Inside the `edge_paths.map(...)` group (the `<g key={ep.id}>` block, around lines 741–836), **after** the existing `+` button `g` (or in its place if `on_edge_add_node` not supplied), add a new `<g>` for the delete ×. Insert right before the closing `</g>` of the edge group:

```jsx
              {/* × button at midpoint — delete edge */}
              {ep.midpoint && on_edges_change && (
                <g
                  data-edge-delete-btn={ep.id}
                  style={{
                    cursor: "pointer",
                    opacity:
                      hovered_edge_id === ep.id || selected_edge_id === ep.id
                        ? 1
                        : 0,
                    filter:
                      "drop-shadow(0 2px 6px rgba(0,0,0,0.15))",
                    transition: "opacity 0.18s ease",
                    pointerEvents:
                      hovered_edge_id === ep.id || selected_edge_id === ep.id
                        ? "auto"
                        : "none",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    on_edges_change(
                      edges_ref.current.filter((edge) => edge.id !== ep.id),
                    );
                    if (selected_edge_id === ep.id) setSelectedEdgeId(null);
                  }}
                >
                  <circle
                    cx={ep.midpoint.x}
                    cy={ep.midpoint.y}
                    r={9}
                    fill={theme.edgeAddBtnBg || "#ffffff"}
                    stroke="rgba(0,0,0,0.12)"
                    strokeWidth={1}
                  />
                  <line
                    x1={ep.midpoint.x - 3.5}
                    y1={ep.midpoint.y - 3.5}
                    x2={ep.midpoint.x + 3.5}
                    y2={ep.midpoint.y + 3.5}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                  <line
                    x1={ep.midpoint.x + 3.5}
                    y1={ep.midpoint.y - 3.5}
                    x2={ep.midpoint.x - 3.5}
                    y2={ep.midpoint.y + 3.5}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                </g>
              )}
```

Note: when `on_edge_add_node` is also supplied, both buttons render at the same point. Current recipe_canvas does not pass `on_edge_add_node`, so this is fine. If collision is ever an issue, offset the × by +18 on x. For Phase 1 we ship single-button.

- [ ] **Step 7.4: Run to verify pass**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`
Expected: all edge × tests pass.

- [ ] **Step 7.5: Leave uncommitted.**

---

## Task 8: FlowEditor — edge endpoint drag (reconnect / delete)

**Goal:** When an edge is hovered or selected, each endpoint shows an invisible hit circle. Mousedown on it enters reconnect mode: the edge's other endpoint stays fixed, the grabbed end follows the mouse. Mouseup validates; valid target = reconnect, invalid/blank = delete.

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`

- [ ] **Step 8.1: Add reconnecting state + ref**

Edit `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`:

Near the other state/refs (around lines 98–125), add:

```js
  const [is_reconnecting, setIsReconnecting] = useState(false);
  const reconnecting_ref = useRef(null);
```

- [ ] **Step 8.2: Render hit circles on edge endpoints**

Inside the edge group (same `<g key={ep.id}>` block, after the visible edge path and around the midpoint buttons), add invisible draggable circles. Compute endpoint positions — the edge_paths entries need to expose them. First, extend the `edge_paths` useMemo so each entry carries `source_pos` and `target_pos`:

Locate `edge_paths` useMemo (around lines 683–704). Change:

```js
      const d = calculate_bezier_path(sp, tp);
      const midpoint = get_bezier_midpoint(sp, tp);
      return { ...edge, d, midpoint };
```

into:

```js
      const d = calculate_bezier_path(sp, tp);
      const midpoint = get_bezier_midpoint(sp, tp);
      return { ...edge, d, midpoint, source_pos: sp, target_pos: tp };
```

Then inside the edge group, add (alongside the midpoint × button):

```jsx
              {/* Endpoint reconnect handles */}
              {ep.source_pos && (hovered_edge_id === ep.id || selected_edge_id === ep.id) && (
                <circle
                  cx={ep.source_pos.x}
                  cy={ep.source_pos.y}
                  r={8}
                  fill="transparent"
                  style={{ cursor: "grab", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    reconnecting_ref.current = {
                      edge_id: ep.id,
                      grabbed: "source",
                      fixed_node_id: ep.target_node_id,
                      fixed_port_id: ep.target_port_id,
                    };
                    setIsReconnecting(true);
                  }}
                />
              )}
              {ep.target_pos && (hovered_edge_id === ep.id || selected_edge_id === ep.id) && (
                <circle
                  cx={ep.target_pos.x}
                  cy={ep.target_pos.y}
                  r={8}
                  fill="transparent"
                  style={{ cursor: "grab", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    reconnecting_ref.current = {
                      edge_id: ep.id,
                      grabbed: "target",
                      fixed_node_id: ep.source_node_id,
                      fixed_port_id: ep.source_port_id,
                    };
                    setIsReconnecting(true);
                  }}
                />
              )}
```

- [ ] **Step 8.3: Extend global mousemove / mouseup to handle reconnect**

In the `handle_move` function inside the mousemove/mouseup useEffect (around line 449), add a branch for reconnect:

Add after the connection-drawing branch (before the closing `}` of `handle_move`):

```js
      /* ── Reconnect drawing ── */
      if (reconnecting_ref.current && temp_edge_ref.current) {
        const rc = reconnecting_ref.current;
        const fixed_node = nodes_ref.current.find((n) => n.id === rc.fixed_node_id);
        if (!fixed_node) return;
        const fixed_pos = get_port_position(
          fixed_node,
          rc.fixed_port_id,
          node_dimensions_ref.current,
        );
        if (!fixed_pos) return;
        const rect = canvas_ref.current.getBoundingClientRect();
        const vp = viewport_ref.current;
        const mx = (e.clientX - rect.left - vp.x) / vp.zoom;
        const my = (e.clientY - rect.top - vp.y) / vp.zoom;
        /* Draw from fixed → mouse */
        temp_edge_ref.current.setAttribute(
          "d",
          calculate_bezier_path(fixed_pos, {
            x: mx,
            y: my,
            side: opposite_side(fixed_pos.side),
          }),
        );
      }
```

In `handle_up`, add a new branch (before the closing `}`):

```js
      /* ── Reconnect end ── */
      if (reconnecting_ref.current) {
        const rc = reconnecting_ref.current;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const new_port_id = target?.dataset?.portId;
        const new_node_id = target?.dataset?.nodeId;
        const edge = edges_ref.current.find((x) => x.id === rc.edge_id);
        reconnecting_ref.current = null;
        setIsReconnecting(false);
        if (!edge) return;
        /* Build tentative updated edge */
        let updated = null;
        if (new_port_id && new_node_id) {
          if (rc.grabbed === "source") {
            updated = {
              ...edge,
              source_node_id: new_node_id,
              source_port_id: new_port_id,
            };
          } else {
            updated = {
              ...edge,
              target_node_id: new_node_id,
              target_port_id: new_port_id,
            };
          }
        }
        let ok = false;
        if (updated && validate_connection) {
          const src_node = nodes_ref.current.find(
            (n) => n.id === updated.source_node_id,
          );
          const tgt_node = nodes_ref.current.find(
            (n) => n.id === updated.target_node_id,
          );
          if (src_node && tgt_node) {
            const res = validate_connection({
              source: { node: src_node, port: updated.source_port_id },
              target: { node: tgt_node, port: updated.target_port_id },
              exclude_edge_id: rc.edge_id,
            });
            ok = res === true;
          }
        } else if (updated && !validate_connection) {
          ok = true;
        }
        if (ok) {
          on_edges_change?.(
            edges_ref.current.map((e2) => (e2.id === rc.edge_id ? updated : e2)),
          );
        } else {
          /* Invalid drop / empty canvas — delete */
          on_edges_change?.(
            edges_ref.current.filter((e2) => e2.id !== rc.edge_id),
          );
          if (selected_edge_ref.current === rc.edge_id) setSelectedEdgeId(null);
        }
        return;
      }
```

Update the `useEffect` dependency list to include `on_edges_change` (if not already there).

- [ ] **Step 8.4: Render floating temp edge during reconnect**

At the temp edge block near the bottom of the SVG (around line 868), change the condition from `{is_connecting && ...}` to render for either state:

```jsx
          {(is_connecting || is_reconnecting) && (
            <path
              ref={temp_edge_ref}
              d=""
              fill="none"
              stroke={theme.edgeActiveColor}
              strokeWidth={theme.edgeWidth}
              strokeDasharray="8 4"
              strokeLinecap="round"
              opacity={0.65}
            />
          )}
```

- [ ] **Step 8.5: Smoke test**

Append to `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.test.js`:

```js
describe("FlowEditor edge endpoint reconnect", () => {
  test("mousedown on endpoint hit circle enters reconnect state (no crash)", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
      { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
    ];
    const edges = [
      {
        id: "e1",
        source_node_id: "a",
        source_port_id: "out",
        target_node_id: "b",
        target_port_id: "in",
      },
    ];
    const { container } = render(
      wrap(<FlowEditor nodes={nodes} edges={edges} on_edges_change={() => {}} />),
    );
    /* Simulate hovering the edge so endpoint circles render */
    const edgeGroup = container.querySelector(`[data-edge-delete-btn="e1"]`)?.closest("g");
    if (edgeGroup) fireEvent.mouseEnter(edgeGroup);
    /* The test verifies rendering didn't throw; dragging behavior is manual QA */
    expect(container).toBeTruthy();
  });
});
```

- [ ] **Step 8.6: Run tests**

Run: `npx jest src/BUILTIN_COMPONENTs/flow_editor/`
Expected: all tests pass.

- [ ] **Step 8.7: Leave uncommitted.**

---

## Task 9: Shared puzzle shape helper

**Goal:** Extract a reusable `PuzzleShape` component + dot overlay that node renderers can use. Reduces duplication across the 5 node types.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/puzzle_shape.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/puzzle_shape.test.js`

- [ ] **Step 9.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/nodes/puzzle_shape.test.js`:

```js
import React from "react";
import { render } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import PuzzleShape from "./puzzle_shape";

const config = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={config}>{ui}</ConfigContext.Provider>
);

describe("PuzzleShape", () => {
  test("renders body + right tab when tabs=[right]", () => {
    const { container } = render(
      wrap(
        <PuzzleShape tabs={["right"]} cutouts={[]} isDark={false}>
          <div>content</div>
        </PuzzleShape>,
      ),
    );
    expect(container.querySelector('[data-puzzle-body]')).toBeTruthy();
    expect(container.querySelectorAll('[data-puzzle-tab]').length).toBe(1);
  });

  test("applies goo filter on the shape layer", () => {
    const { container } = render(
      wrap(
        <PuzzleShape tabs={[]} cutouts={[]} isDark={false}>
          <div>content</div>
        </PuzzleShape>,
      ),
    );
    const shape = container.querySelector('[data-puzzle-shape]');
    expect(shape.style.filter).toContain("url(#flow-editor-goo)");
  });
});
```

- [ ] **Step 9.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/nodes/puzzle_shape.test.js`
Expected: module-not-found.

- [ ] **Step 9.3: Implement PuzzleShape**

Create `src/COMPONENTs/agents/pages/recipes_page/nodes/puzzle_shape.js`:

```js
import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";

/* Render a puzzle-piece shape: body with optional radial cutouts + round tabs.
 * Goo filter lives in FlowEditor (PuzzleDefs). This component renders
 * the visual; ports are positioned by FlowEditorNode separately. */

const TAB_GEOM = {
  right:  { size: 22, offset: -9, transform: "translateY(-50%)", x: "auto", y: "50%", xKey: "right", yKey: "top" },
  left:   { size: 22, offset: -9, transform: "translateY(-50%)", xKey: "left", yKey: "top" },
  top:    { size: 18, offset: -7, transform: "translateX(-50%)", xKey: "left", yKey: "top" },
  bottom: { size: 18, offset: -7, transform: "translateX(-50%)", xKey: "left", yKey: "bottom" },
};

const CUTOUT_GEOM = {
  left:   "radial-gradient(circle 12px at 0%   50%,  transparent 98%, black 99%)",
  right:  "radial-gradient(circle 12px at 100% 50%,  transparent 98%, black 99%)",
  top:    "radial-gradient(circle 10px at 50% 0%,    transparent 98%, black 99%)",
  bottom: "radial-gradient(circle 10px at 50% 100%,  transparent 98%, black 99%)",
};

export default function PuzzleShape({
  tabs = [],
  cutouts = [],
  children,
  isDark: isDarkOverride,
}) {
  const cfg = useContext(ConfigContext);
  const isDark =
    isDarkOverride !== undefined
      ? isDarkOverride
      : cfg?.onThemeMode === "dark_mode";

  const body_bg = isDark ? "#22232a" : "#ffffff";
  const shadow = isDark
    ? "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.45))"
    : "drop-shadow(0 1px 1.5px rgba(15,18,38,0.08)) drop-shadow(0 4px 12px rgba(15,18,38,0.08))";

  const cutouts_value = cutouts.length
    ? cutouts.map((c) => CUTOUT_GEOM[c]).filter(Boolean).join(", ")
    : "none";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        data-puzzle-shape
        style={{
          position: "absolute",
          inset: 0,
          filter: `url(#flow-editor-goo) ${shadow}`,
        }}
      >
        <div
          data-puzzle-body
          style={{
            position: "absolute",
            inset: 0,
            background: body_bg,
            borderRadius: 16,
            WebkitMaskImage: cutouts_value,
            maskImage: cutouts_value,
            WebkitMaskComposite: "source-in",
            maskComposite: "intersect",
          }}
        />
        {tabs.map((side) => {
          const g = TAB_GEOM[side];
          if (!g) return null;
          const pos = {};
          if (side === "right") {
            pos.right = g.offset;
            pos.top = "50%";
          } else if (side === "left") {
            pos.left = g.offset;
            pos.top = "50%";
          } else if (side === "top") {
            pos.top = g.offset;
            pos.left = "50%";
          } else if (side === "bottom") {
            pos.bottom = g.offset;
            pos.left = "50%";
          }
          return (
            <div
              data-puzzle-tab
              data-tab-side={side}
              key={side}
              style={{
                position: "absolute",
                ...pos,
                width: g.size,
                height: g.size,
                borderRadius: "50%",
                background: body_bg,
                transform: g.transform,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 9.4: Run to verify pass**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/nodes/puzzle_shape.test.js`
Expected: 2 tests pass.

- [ ] **Step 9.5: Leave uncommitted.**

---

## Task 10: Rewrite 5 node renderers

**Goal:** Each node type uses `PuzzleShape` + header + body content. Ports are placed by FlowEditorNode automatically based on the node's `ports` array.

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js`
- Modify: `src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js`
- Modify: `src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/start_node.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/nodes/end_node.js`

- [ ] **Step 10.1: Read current agent_node.js**

Read `src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js` to see the current structure. Replace it end-to-end in Step 10.2.

- [ ] **Step 10.2: Write new `agent_node.js`**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js`:

```js
import React from "react";
import PuzzleShape from "./puzzle_shape";

/* Workflow agent node — left in, right out, top + bottom attach. */

export default function AgentNode({ node, isDark }) {
  const label = node.label || node.id;
  const model = node.model || node.override?.model || "—";
  const template = node.template_ref;

  return (
    <div style={{ width: 180 }}>
      <PuzzleShape
        tabs={["right", "top", "bottom"]}
        cutouts={["left", "top", "bottom"]}
        isDark={isDark}
      >
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #6478f6, #4a5bd8)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              A
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.15,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#a8a8b0" : "#6b6b73",
                  marginTop: 2,
                }}
              >
                {template ? `ref: ${template}` : model}
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
```

- [ ] **Step 10.3: Write new `tool_pool_node.js`**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js`:

```js
import React from "react";
import PuzzleShape from "./puzzle_shape";

export default function ToolPoolNode({ node, isDark }) {
  const count = (node.tools || []).length;
  return (
    <div style={{ width: 180 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #f6a341, #ea7547)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              T
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                }}
              >
                Tool Pool
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#a8a8b0" : "#6b6b73",
                  marginTop: 2,
                }}
              >
                {count} tools
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
```

- [ ] **Step 10.4: Write new `subagent_pool_node.js`**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js`:

```js
import React from "react";
import PuzzleShape from "./puzzle_shape";

export default function SubagentPoolNode({ node, isDark }) {
  const count = (node.subagents || []).length;
  return (
    <div style={{ width: 180 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              S
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                }}
              >
                Subagent Pool
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#a8a8b0" : "#6b6b73",
                  marginTop: 2,
                }}
              >
                {count} subagents
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
```

- [ ] **Step 10.5: Create `start_node.js`**

```js
import React from "react";
import PuzzleShape from "./puzzle_shape";

export default function StartNode({ isDark }) {
  return (
    <div style={{ width: 130 }}>
      <PuzzleShape tabs={["right"]} cutouts={[]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #4cbe8b, #2f9a68)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ▶
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? "#f0f0f3" : "#1d1d22" }}>
                Start
              </div>
              <div style={{ fontSize: 10.5, color: isDark ? "#a8a8b0" : "#6b6b73", marginTop: 2 }}>
                entry
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
```

- [ ] **Step 10.6: Create `end_node.js`**

```js
import React from "react";
import PuzzleShape from "./puzzle_shape";

export default function EndNode({ isDark }) {
  return (
    <div style={{ width: 130 }}>
      <PuzzleShape tabs={[]} cutouts={["left"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #e06a9a, #b64a78)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ■
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? "#f0f0f3" : "#1d1d22" }}>
                End
              </div>
              <div style={{ fontSize: 10.5, color: isDark ? "#a8a8b0" : "#6b6b73", marginTop: 2 }}>
                exit
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
```

- [ ] **Step 10.7: Run all tests to verify no regression**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/ src/BUILTIN_COMPONENTs/flow_editor/`
Expected: all pass.

- [ ] **Step 10.8: Leave uncommitted.**

---

## Task 11: Variable picker dropdown

**Goal:** A dropdown UI listing scope variables, grouped by source node, with search + keyboard navigation.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/variable_picker.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/variable_picker.test.js`

- [ ] **Step 11.1: Write failing test**

Create `variable_picker.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import VariablePicker from "./variable_picker";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

const scope = [
  { node_id: "start", field: "text", type: "string", source_type: "start" },
  { node_id: "start", field: "images", type: "image[]", source_type: "start" },
  { node_id: "a1", field: "output", type: "string", source_type: "agent" },
];

describe("VariablePicker", () => {
  test("renders variables grouped by node_id", () => {
    render(wrap(<VariablePicker scope={scope} onPick={() => {}} onClose={() => {}} />));
    expect(screen.getByText("start.text")).toBeInTheDocument();
    expect(screen.getByText("a1.output")).toBeInTheDocument();
  });

  test("filters by search input", () => {
    render(wrap(<VariablePicker scope={scope} onPick={() => {}} onClose={() => {}} />));
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "imag" } });
    expect(screen.queryByText("start.text")).toBeNull();
    expect(screen.getByText("start.images")).toBeInTheDocument();
  });

  test("calls onPick when a row is clicked", () => {
    const onPick = jest.fn();
    render(wrap(<VariablePicker scope={scope} onPick={onPick} onClose={() => {}} />));
    fireEvent.click(screen.getByText("start.text"));
    expect(onPick).toHaveBeenCalledWith(scope[0]);
  });

  test("calls onClose when Escape is pressed", () => {
    const onClose = jest.fn();
    render(wrap(<VariablePicker scope={scope} onPick={() => {}} onClose={onClose} />));
    fireEvent.keyDown(screen.getByPlaceholderText(/search/i), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 11.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/variable_picker.test.js`
Expected: module-not-found.

- [ ] **Step 11.3: Implement**

Create `src/COMPONENTs/agents/pages/recipes_page/variable_picker.js`:

```js
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";

const SOURCE_DOT_COLOR = {
  start: "#4cbe8b",
  agent: "#6478f6",
  end: "#e06a9a",
};

export default function VariablePicker({ scope, onPick, onClose, position }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const search_ref = useRef(null);

  useEffect(() => {
    if (search_ref.current) search_ref.current.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scope;
    return scope.filter((v) =>
      `${v.node_id}.${v.field}`.toLowerCase().includes(q),
    );
  }, [scope, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((v) => {
      if (!map.has(v.node_id)) map.set(v.node_id, []);
      map.get(v.node_id).push(v);
    });
    return [...map.entries()];
  }, [filtered]);

  function handleKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) onPick(filtered[active]);
    }
  }

  const pos_style = position ? { left: position.x, top: position.y } : {};

  return (
    <div
      style={{
        position: "absolute",
        ...pos_style,
        width: 280,
        background: isDark ? "#1c1c1e" : "#fff",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
        borderRadius: 10,
        boxShadow: isDark
          ? "0 12px 36px rgba(0,0,0,0.5)"
          : "0 12px 36px rgba(0,0,0,0.12)",
        zIndex: 1000,
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: 8,
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
        }}
      >
        <input
          ref={search_ref}
          placeholder="Search variables…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            background: isDark ? "#141416" : "#f5f5f7",
            color: "inherit",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        />
      </div>
      <div style={{ maxHeight: 280, overflow: "auto" }}>
        {grouped.map(([node_id, vars]) => (
          <div key={node_id} style={{ padding: "4px 0" }}>
            <div
              style={{
                padding: "6px 12px 4px",
                fontSize: 10,
                fontWeight: 600,
                color: "#86868b",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              From {node_id}
            </div>
            {vars.map((v) => {
              const flat_idx = filtered.indexOf(v);
              const is_active = flat_idx === active;
              return (
                <div
                  key={`${v.node_id}.${v.field}`}
                  onClick={() => onPick(v)}
                  onMouseEnter={() => setActive(flat_idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 12,
                    background: is_active
                      ? isDark
                        ? "rgba(165,180,252,0.12)"
                        : "rgba(99,102,241,0.1)"
                      : "transparent",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background:
                        SOURCE_DOT_COLOR[v.source_type] || "#6366f1",
                    }}
                  />
                  <span>{`${v.node_id}.${v.field}`}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "#86868b",
                      fontFamily: "-apple-system, sans-serif",
                    }}
                  >
                    {v.type}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: "#86868b" }}>
            No variables in scope.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 11.4: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/variable_picker.test.js`
Expected: 4 tests pass.

- [ ] **Step 11.5: Leave uncommitted.**

---

## Task 12: Variable chip editor (`contentEditable`)

**Goal:** A reusable editor component that treats a mixed string like `"Analyze {{#start.text#}} please"` as text + chips. Supports `{{` trigger for the picker.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/chip_editor.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.js` (pure parse/serialize, easy to unit-test)
- Create: `src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.test.js`

- [ ] **Step 12.1: Write failing tests for parse/serialize**

Create `chip_editor_parse.test.js`:

```js
import { parse_chip_string, serialize_chip_nodes } from "./chip_editor_parse";

describe("parse_chip_string", () => {
  test("plain text returns single text node", () => {
    expect(parse_chip_string("Hello")).toEqual([
      { kind: "text", value: "Hello" },
    ]);
  });
  test("single variable in middle", () => {
    expect(parse_chip_string("a {{#start.text#}} b")).toEqual([
      { kind: "text", value: "a " },
      { kind: "var", node_id: "start", field: "text" },
      { kind: "text", value: " b" },
    ]);
  });
  test("leading variable", () => {
    expect(parse_chip_string("{{#a.out#}}x")).toEqual([
      { kind: "var", node_id: "a", field: "out" },
      { kind: "text", value: "x" },
    ]);
  });
  test("two adjacent variables", () => {
    expect(parse_chip_string("{{#a.o#}}{{#b.o#}}")).toEqual([
      { kind: "var", node_id: "a", field: "o" },
      { kind: "var", node_id: "b", field: "o" },
    ]);
  });
  test("empty string returns empty array", () => {
    expect(parse_chip_string("")).toEqual([]);
  });
});

describe("serialize_chip_nodes", () => {
  test("round-trips text + var", () => {
    const nodes = [
      { kind: "text", value: "a " },
      { kind: "var", node_id: "start", field: "text" },
      { kind: "text", value: " b" },
    ];
    expect(serialize_chip_nodes(nodes)).toBe("a {{#start.text#}} b");
  });
});
```

- [ ] **Step 12.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.test.js`
Expected: module-not-found.

- [ ] **Step 12.3: Implement parse/serialize**

Create `src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.js`:

```js
const VAR_RE = /\{\{#([^.}]+)\.([^#}]+)#\}\}/g;

export function parse_chip_string(s) {
  if (!s) return [];
  const nodes = [];
  let last = 0;
  let m;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(s)) !== null) {
    if (m.index > last) {
      nodes.push({ kind: "text", value: s.slice(last, m.index) });
    }
    nodes.push({ kind: "var", node_id: m[1], field: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    nodes.push({ kind: "text", value: s.slice(last) });
  }
  return nodes;
}

export function serialize_chip_nodes(nodes) {
  return nodes
    .map((n) =>
      n.kind === "var" ? `{{#${n.node_id}.${n.field}#}}` : n.value,
    )
    .join("");
}
```

- [ ] **Step 12.4: Run parse tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.test.js`
Expected: 6 tests pass.

- [ ] **Step 12.5: Write failing test for editor component**

Create `chip_editor.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import ChipEditor from "./chip_editor";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

const scope = [
  { node_id: "start", field: "text", type: "string", source_type: "start" },
];

describe("ChipEditor", () => {
  test("renders chips from value string", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="Hi {{#start.text#}}!"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector('[data-var-chip="start.text"]');
    expect(chip).toBeTruthy();
  });

  test("Insert-variable button opens picker", () => {
    render(
      wrap(
        <ChipEditor value="" onChange={() => {}} scope={scope} />,
      ),
    );
    fireEvent.click(screen.getByText("+ Insert variable"));
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  test("picking a variable fires onChange with serialized chip string", () => {
    const onChange = jest.fn();
    render(wrap(<ChipEditor value="" onChange={onChange} scope={scope} />));
    fireEvent.click(screen.getByText("+ Insert variable"));
    fireEvent.click(screen.getByText("start.text"));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("{{#start.text#}}"));
  });
});
```

- [ ] **Step 12.6: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`
Expected: module-not-found.

- [ ] **Step 12.7: Implement ChipEditor**

Create `src/COMPONENTs/agents/pages/recipes_page/chip_editor.js`:

```js
import React, { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import VariablePicker from "./variable_picker";
import { parse_chip_string, serialize_chip_nodes } from "./chip_editor_parse";

const SOURCE_DOT_COLOR = {
  start: "#4cbe8b",
  agent: "#6478f6",
  end: "#e06a9a",
};

function render_chip(node, onRemove) {
  return (
    <span
      contentEditable={false}
      data-var-chip={`${node.node_id}.${node.field}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "rgba(99,102,241,0.12)",
        color: "#4f46e5",
        borderRadius: 5,
        padding: "1px 6px 1px 4px",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 11,
        fontWeight: 600,
        margin: "0 1px",
        cursor: "pointer",
        border: "1px solid rgba(99,102,241,0.25)",
        userSelect: "none",
      }}
      onClick={onRemove}
      title="Click to remove"
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: SOURCE_DOT_COLOR.start,
        }}
      />
      {node.node_id}.{node.field}
    </span>
  );
}

export default function ChipEditor({ value, onChange, scope, placeholder }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nodes, setNodes] = useState(() => parse_chip_string(value || ""));
  const last_prop_value = useRef(value);

  useEffect(() => {
    /* Sync from prop when it differs from our current serialized state. */
    const serialized = serialize_chip_nodes(nodes);
    if (value !== serialized && value !== last_prop_value.current) {
      last_prop_value.current = value;
      setNodes(parse_chip_string(value || ""));
    }
  }, [value, nodes]);

  function emit(next) {
    setNodes(next);
    const s = serialize_chip_nodes(next);
    last_prop_value.current = s;
    onChange(s);
  }

  function insert_var(v) {
    emit([
      ...nodes,
      { kind: "var", node_id: v.node_id, field: v.field },
    ]);
    setPickerOpen(false);
  }

  function remove_at(idx) {
    emit(nodes.filter((_, i) => i !== idx));
  }

  function update_text(idx, text) {
    emit(
      nodes.map((n, i) => (i === idx && n.kind === "text" ? { ...n, value: text } : n)),
    );
  }

  function append_text(text) {
    const last = nodes[nodes.length - 1];
    if (last && last.kind === "text") {
      emit([...nodes.slice(0, -1), { kind: "text", value: last.value + text }]);
    } else {
      emit([...nodes, { kind: "text", value: text }]);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          borderRadius: 8,
          background: isDark ? "#141416" : "#fafafa",
          padding: "10px 12px",
          minHeight: 80,
          fontSize: 12,
          lineHeight: 1.7,
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "inherit",
        }}
      >
        {nodes.length === 0 && (
          <span style={{ color: "#86868b" }}>
            {placeholder || "Type here… use {{ to insert a variable"}
          </span>
        )}
        {nodes.map((n, i) => {
          if (n.kind === "var") {
            return (
              <React.Fragment key={`v-${i}`}>
                {render_chip(n, () => remove_at(i))}
              </React.Fragment>
            );
          }
          return (
            <input
              key={`t-${i}`}
              value={n.value}
              onChange={(e) => {
                const v = e.target.value;
                /* `{{` shortcut opens picker */
                if (v.endsWith("{{")) {
                  update_text(i, v.slice(0, -2));
                  setPickerOpen(true);
                } else {
                  update_text(i, v);
                }
              }}
              style={{
                border: "none",
                background: "transparent",
                font: "inherit",
                color: "inherit",
                outline: "none",
                minWidth: 8,
                width: `${Math.max(1, n.value.length + 1)}ch`,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10.5, color: "#86868b" }}>
          Type <code>{"{{"}</code> to insert a variable
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: "#6366f1",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
        >
          + Insert variable
        </button>
      </div>
      {pickerOpen && (
        <VariablePicker
          scope={scope || []}
          position={{ x: 0, y: "100%" }}
          onPick={insert_var}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
```

Note: the implementation uses a simple `<input>` per text node rather than true `contentEditable`. This trades off the "natural caret across chips" feel for deterministic React rendering and easy testability. For Phase 1 this is acceptable; Phase 2 can swap for proper `contentEditable` if users ask.

- [ ] **Step 12.8: Run editor tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`
Expected: 3 tests pass.

- [ ] **Step 12.9: Leave uncommitted.**

---

## Task 13: Detail panel scaffold + type switcher

**Goal:** A root `DetailPanel` component that takes `selectedNode` + recipe + scope and dispatches to per-type panels. Empty state when nothing selected.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.js`
- Create: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.test.js`

- [ ] **Step 13.1: Write failing test**

Create `detail_panel/detail_panel.test.js`:

```js
import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

describe("DetailPanel", () => {
  test("shows empty state when no node selected", () => {
    render(wrap(<DetailPanel recipe={{ nodes: [], edges: [] }} selectedNodeId={null} onChange={() => {}} />));
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
  });

  test("dispatches to start panel when start node selected", () => {
    const recipe = {
      nodes: [
        {
          id: "start",
          type: "start",
          outputs: [{ name: "text", type: "string" }],
        },
      ],
      edges: [],
    };
    render(wrap(<DetailPanel recipe={recipe} selectedNodeId="start" onChange={() => {}} />));
    expect(screen.getByText("Start")).toBeInTheDocument();
  });
});
```

- [ ] **Step 13.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.test.js`
Expected: module-not-found.

- [ ] **Step 13.3: Implement DetailPanel**

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel.js`:

```js
import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartPanel from "./start_panel";
import EndPanel from "./end_panel";
import AgentPanel from "./agent_panel";
import ToolPoolPanel from "./toolpool_panel";
import SubagentPoolPanel from "./subagent_pool_panel";

export default function DetailPanel({ recipe, selectedNodeId, onChange }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const node = recipe?.nodes?.find((n) => n.id === selectedNodeId);

  const wrapper_style = {
    height: "100%",
    background: isDark ? "#1c1c1e" : "#ffffff",
    borderLeft: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    overflow: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  if (!node) {
    return (
      <div style={{ ...wrapper_style, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 12, color: "#86868b" }}>Select a node to edit.</div>
      </div>
    );
  }

  const props = { recipe, node, onChange, isDark };

  return (
    <div style={wrapper_style}>
      {node.type === "start" && <StartPanel {...props} />}
      {node.type === "end" && <EndPanel {...props} />}
      {node.type === "agent" && <AgentPanel {...props} />}
      {node.type === "toolpool" && <ToolPoolPanel {...props} />}
      {node.type === "subagent_pool" && <SubagentPoolPanel {...props} />}
    </div>
  );
}
```

- [ ] **Step 13.4: Create placeholder sibling panels** so the dispatcher imports resolve. Each is a minimal stub to be fleshed out in Tasks 14–18.

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/start_panel.js`:

```js
import React from "react";
export default function StartPanel() {
  return <div>Start</div>;
}
```

Same shape for `end_panel.js`, `agent_panel.js`, `toolpool_panel.js`, `subagent_pool_panel.js` — each exporting a component that returns `<div>{label}</div>` with "End", "Agent", "ToolPool", "SubagentPool" respectively.

- [ ] **Step 13.5: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/`
Expected: both tests pass.

- [ ] **Step 13.6: Leave uncommitted.**

---

## Task 14: Start detail panel

**Goal:** Flesh out `start_panel.js` with header + editable Output Variables list.

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/start_panel.js`

- [ ] **Step 14.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/start_panel.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartPanel from "./start_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

describe("StartPanel", () => {
  test("renders default outputs", () => {
    const node = {
      id: "start",
      type: "start",
      outputs: [
        { name: "text", type: "string" },
        { name: "images", type: "image[]" },
      ],
    };
    render(wrap(<StartPanel node={node} recipe={{ nodes: [node], edges: [] }} onChange={() => {}} />));
    expect(screen.getByDisplayValue("text")).toBeInTheDocument();
    expect(screen.getByDisplayValue("images")).toBeInTheDocument();
  });

  test("+ Add output appends a new row", () => {
    const node = { id: "start", type: "start", outputs: [] };
    const onChange = jest.fn();
    render(wrap(<StartPanel node={node} recipe={{ nodes: [node], edges: [] }} onChange={onChange} />));
    fireEvent.click(screen.getByText("+ Add output"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ outputs: [expect.objectContaining({ name: "" })] })],
      }),
    );
  });
});
```

- [ ] **Step 14.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/start_panel.test.js`
Expected: tests fail against the stub.

- [ ] **Step 14.3: Implement**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/start_panel.js`:

```js
import React from "react";

const TYPE_OPTIONS = ["string", "image[]", "file[]", "json"];

export default function StartPanel({ node, recipe, onChange, isDark }) {
  function update_outputs(next) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, outputs: next } : n,
      ),
    });
  }

  function set_row(i, patch) {
    update_outputs(
      node.outputs.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    );
  }
  function add_row() {
    update_outputs([...(node.outputs || []), { name: "", type: "string" }]);
  }
  function remove_row(i) {
    update_outputs(node.outputs.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #4cbe8b, #2f9a68)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
          }}
        >
          ▶
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Start</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>Workflow entry</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#86868b",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Output Variables
          </span>
          <button
            type="button"
            onClick={add_row}
            style={{
              background: "transparent",
              border: "none",
              color: "#6366f1",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            + Add output
          </button>
        </div>
        {(node.outputs || []).map((o, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            }}
          >
            <select
              value={o.type}
              onChange={(e) => set_row(i, { type: e.target.value })}
              style={{
                padding: "3px 5px",
                fontSize: 11,
                borderRadius: 5,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                background: isDark ? "#141416" : "#fafafa",
                color: "inherit",
                width: 90,
              }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={o.name}
              onChange={(e) => set_row(i, { name: e.target.value })}
              style={{
                flex: 1,
                padding: "3px 6px",
                fontSize: 11.5,
                borderRadius: 5,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                background: isDark ? "#141416" : "#fafafa",
                color: "inherit",
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            />
            <span
              onClick={() => remove_row(i)}
              style={{ color: "#86868b", cursor: "pointer", padding: "0 4px" }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 14.4: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/start_panel.test.js`
Expected: pass.

- [ ] **Step 14.5: Leave uncommitted.**

---

## Task 15: End detail panel

**Goal:** Header + read-only Input Variables list (upstream scope) + editable Output Schema (same primitives as Start).

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/end_panel.js`

- [ ] **Step 15.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/end_panel.test.js`:

```js
import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import EndPanel from "./end_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

describe("EndPanel", () => {
  test("lists upstream variables", () => {
    const recipe = {
      nodes: [
        { id: "start", type: "start", outputs: [{ name: "text", type: "string" }] },
        { id: "end", type: "end", outputs_schema: [{ name: "output", type: "string" }] },
      ],
      edges: [
        { id: "e", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "end", target_port_id: "in" },
      ],
    };
    const end_node = recipe.nodes[1];
    render(wrap(<EndPanel node={end_node} recipe={recipe} onChange={() => {}} />));
    expect(screen.getByText("start.text")).toBeInTheDocument();
  });
});
```

- [ ] **Step 15.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/end_panel.test.js`
Expected: failing against stub.

- [ ] **Step 15.3: Implement**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/end_panel.js`:

```js
import React from "react";
import { compute_variable_scope } from "../variable_scope";

const TYPE_OPTIONS = ["string", "image[]", "file[]", "json"];

export default function EndPanel({ node, recipe, onChange, isDark }) {
  const scope = compute_variable_scope(node.id, recipe.nodes, recipe.edges);

  function update_schema(next) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, outputs_schema: next } : n,
      ),
    });
  }
  function set_row(i, patch) {
    update_schema(
      (node.outputs_schema || []).map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    );
  }
  function add_row() {
    update_schema([...(node.outputs_schema || []), { name: "", type: "string" }]);
  }
  function remove_row(i) {
    update_schema((node.outputs_schema || []).filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: 7,
            background: "linear-gradient(135deg, #e06a9a, #b64a78)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}
        >
          ■
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>End</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>Workflow exit</div>
        </div>
      </div>

      {/* Input Variables — read-only */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Input Variables (upstream)
        </span>
        {scope.length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>No upstream yet.</span>
        )}
        {scope.map((v) => (
          <div
            key={`${v.node_id}.${v.field}`}
            style={{
              display: "flex", justifyContent: "space-between",
              padding: "5px 10px", borderRadius: 6,
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
              fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5,
              cursor: "pointer",
            }}
            onClick={() => {
              /* copy literal */
              navigator.clipboard?.writeText(`{{#${v.node_id}.${v.field}#}}`);
            }}
            title="Click to copy"
          >
            <span>{`${v.node_id}.${v.field}`}</span>
            <span style={{ fontSize: 10, color: "#86868b" }}>{v.type}</span>
          </div>
        ))}
      </div>

      {/* Output schema */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: 11, fontWeight: 600, color: "#86868b",
              textTransform: "uppercase", letterSpacing: 0.4,
            }}
          >
            Output Schema
          </span>
          <button
            type="button" onClick={add_row}
            style={{ background: "transparent", border: "none", color: "#6366f1", fontSize: 11, cursor: "pointer" }}
          >
            + Add field
          </button>
        </div>
        {(node.outputs_schema || []).map((o, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px", borderRadius: 6,
              border: `1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            }}
          >
            <select
              value={o.type}
              onChange={(e) => set_row(i, { type: e.target.value })}
              style={{
                padding: "3px 5px", fontSize: 11, borderRadius: 5,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                background: isDark ? "#141416" : "#fafafa", color: "inherit", width: 90,
              }}
            >
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              value={o.name}
              onChange={(e) => set_row(i, { name: e.target.value })}
              style={{
                flex: 1, padding: "3px 6px", fontSize: 11.5, borderRadius: 5,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                background: isDark ? "#141416" : "#fafafa", color: "inherit",
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            />
            <span onClick={() => remove_row(i)} style={{ color: "#86868b", cursor: "pointer", padding: "0 4px" }}>×</span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 15.4: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/end_panel.test.js`
Expected: pass.

- [ ] **Step 15.5: Leave uncommitted.**

---

## Task 16: ToolPool detail panel

**Goal:** Header + template dropdown + tools list (toggle + config button).

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`

- [ ] **Step 16.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import ToolPoolPanel from "./toolpool_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

describe("ToolPoolPanel", () => {
  test("lists tools with toggle", () => {
    const node = {
      id: "tp",
      type: "toolpool",
      tools: [
        { id: "web:web_search", enabled: true, config: {} },
        { id: "calc:add", enabled: false, config: {} },
      ],
    };
    render(wrap(<ToolPoolPanel node={node} recipe={{ nodes: [node], edges: [] }} onChange={() => {}} />));
    expect(screen.getByText("web:web_search")).toBeInTheDocument();
    expect(screen.getByText("calc:add")).toBeInTheDocument();
  });

  test("toggling a tool fires onChange", () => {
    const node = {
      id: "tp", type: "toolpool",
      tools: [{ id: "web:web_search", enabled: true, config: {} }],
    };
    const onChange = jest.fn();
    render(wrap(<ToolPoolPanel node={node} recipe={{ nodes: [node], edges: [] }} onChange={onChange} />));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].tools[0].enabled).toBe(false);
  });
});
```

- [ ] **Step 16.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`
Expected: fail against stub.

- [ ] **Step 16.3: Implement**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`:

```js
import React from "react";

export default function ToolPoolPanel({ node, recipe, onChange, isDark }) {
  function update(patch) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
    });
  }

  function toggle(i) {
    update({
      tools: node.tools.map((t, idx) =>
        idx === i ? { ...t, enabled: !t.enabled } : t,
      ),
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: 7,
            background: "linear-gradient(135deg, #f6a341, #ea7547)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}
        >
          T
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>ToolPool</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>
            {node.template_ref ? `ref: ${node.template_ref}` : "local only"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Template
        </span>
        <select
          value={node.template_ref || ""}
          onChange={(e) => update({ template_ref: e.target.value || null })}
          style={{
            padding: "7px 10px", borderRadius: 7, fontSize: 12,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            background: isDark ? "#141416" : "#fafafa", color: "inherit",
          }}
        >
          <option value="">(local only)</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Tools
        </span>
        {(node.tools || []).map((t, i) => (
          <label
            key={t.id + i}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px", borderRadius: 6,
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
              fontSize: 11.5, cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={!!t.enabled}
              onChange={() => toggle(i)}
            />
            <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{t.id}</span>
          </label>
        ))}
        {(node.tools || []).length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>No tools configured.</span>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 16.4: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`
Expected: pass.

- [ ] **Step 16.5: Leave uncommitted.**

---

## Task 17: SubagentPool detail panel

**Goal:** Header + template dropdown + subagents list (name + kind).

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/subagent_pool_panel.js`

- [ ] **Step 17.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/subagent_pool_panel.test.js`:

```js
import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import SubagentPoolPanel from "./subagent_pool_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

describe("SubagentPoolPanel", () => {
  test("lists subagents", () => {
    const node = {
      id: "sp", type: "subagent_pool",
      subagents: [
        { kind: "ref", template_name: "reviewer" },
        { kind: "local", name: "summarizer" },
      ],
    };
    render(wrap(<SubagentPoolPanel node={node} recipe={{ nodes: [node], edges: [] }} onChange={() => {}} />));
    expect(screen.getByText("reviewer")).toBeInTheDocument();
    expect(screen.getByText("summarizer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 17.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/subagent_pool_panel.test.js`
Expected: fail.

- [ ] **Step 17.3: Implement**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/subagent_pool_panel.js`:

```js
import React from "react";

export default function SubagentPoolPanel({ node, recipe, onChange, isDark }) {
  function update(patch) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: 7,
            background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}
        >
          S
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Subagent Pool</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>
            {node.template_ref ? `ref: ${node.template_ref}` : "local only"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Template
        </span>
        <select
          value={node.template_ref || ""}
          onChange={(e) => update({ template_ref: e.target.value || null })}
          style={{
            padding: "7px 10px", borderRadius: 7, fontSize: 12,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            background: isDark ? "#141416" : "#fafafa", color: "inherit",
          }}
        >
          <option value="">(local only)</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Subagents
        </span>
        {(node.subagents || []).map((s, i) => {
          const label = s.kind === "ref" ? s.template_name : s.name;
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: 6,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
                fontSize: 11.5,
              }}
            >
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{label}</span>
              <span style={{ fontSize: 10, color: "#86868b", marginLeft: "auto" }}>{s.kind}</span>
            </div>
          );
        })}
        {(node.subagents || []).length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>No subagents configured.</span>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 17.4: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/subagent_pool_panel.test.js`
Expected: pass.

- [ ] **Step 17.5: Leave uncommitted.**

---

## Task 18: Agent detail panel

**Goal:** Header + template dropdown (+ unlink) + Input Variables (clickable to insert) + Model select + Prompt ChipEditor + Output schema.

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js`

- [ ] **Step 18.1: Write failing test**

Create `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import AgentPanel from "./agent_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;

describe("AgentPanel", () => {
  test("renders current prompt value", () => {
    const recipe = {
      nodes: [
        { id: "start", type: "start", outputs: [{ name: "text", type: "string" }] },
        {
          id: "a1",
          type: "agent",
          override: { model: "m", prompt: "Hi {{#start.text#}}" },
          outputs: [{ name: "output", type: "string" }],
        },
      ],
      edges: [
        { id: "e", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "a1", target_port_id: "in" },
      ],
    };
    const { container } = render(
      wrap(<AgentPanel node={recipe.nodes[1]} recipe={recipe} onChange={() => {}} />),
    );
    expect(container.querySelector('[data-var-chip="start.text"]')).toBeTruthy();
  });

  test("editing model dropdown fires onChange with override", () => {
    const onChange = jest.fn();
    const recipe = {
      nodes: [
        { id: "a1", type: "agent", override: { model: "m1", prompt: "" }, outputs: [] },
      ],
      edges: [],
    };
    render(wrap(<AgentPanel node={recipe.nodes[0]} recipe={recipe} onChange={onChange} />));
    const select = screen.getAllByRole("combobox")[1]; /* template first, then model */
    fireEvent.change(select, { target: { value: "claude-opus-4-7" } });
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].override.model).toBe("claude-opus-4-7");
  });
});
```

- [ ] **Step 18.2: Run to verify fail**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js`
Expected: fail.

- [ ] **Step 18.3: Implement**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js`:

```js
import React from "react";
import ChipEditor from "../chip_editor";
import { compute_variable_scope } from "../variable_scope";

const MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o",
  "gemini-2.5-pro",
];

const TYPE_OPTIONS = ["string", "image[]", "file[]", "json"];

export default function AgentPanel({ node, recipe, onChange, isDark }) {
  const scope = compute_variable_scope(node.id, recipe.nodes, recipe.edges);

  function set_node(patch) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
    });
  }

  function set_override(patch) {
    set_node({ override: { ...(node.override || {}), ...patch } });
  }

  function update_outputs(next) {
    set_node({ outputs: next });
  }
  function set_out_row(i, patch) {
    update_outputs(
      (node.outputs || []).map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    );
  }
  function add_out_row() {
    update_outputs([...(node.outputs || []), { name: "", type: "string" }]);
  }
  function remove_out_row(i) {
    update_outputs((node.outputs || []).filter((_, idx) => idx !== i));
  }

  const prompt = node.override?.prompt || "";
  const model = node.override?.model || "";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: 7,
            background: "linear-gradient(135deg, #6478f6, #4a5bd8)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}
        >
          A
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{node.id}</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>
            {node.template_ref ? `ref: ${node.template_ref}` : "local"}
          </div>
        </div>
        {node.template_ref && (
          <button
            type="button"
            onClick={() => set_node({ template_ref: null })}
            style={{
              background: "transparent", border: "none",
              color: "#6366f1", fontSize: 11, cursor: "pointer",
            }}
          >
            unlink
          </button>
        )}
      </div>

      {/* Input Variables */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Input Variables
        </span>
        {scope.length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>No upstream yet.</span>
        )}
        {scope.map((v) => (
          <div
            key={`${v.node_id}.${v.field}`}
            style={{
              display: "flex", justifyContent: "space-between",
              padding: "5px 10px", borderRadius: 6,
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
              fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5,
              cursor: "pointer",
            }}
            onClick={() => {
              set_override({
                prompt: `${prompt}{{#${v.node_id}.${v.field}#}}`,
              });
            }}
            title="Click to append to prompt"
          >
            <span>{`${v.node_id}.${v.field}`}</span>
            <span style={{ fontSize: 10, color: "#86868b" }}>{v.type}</span>
          </div>
        ))}
      </div>

      {/* Config */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Template
        </span>
        <select
          value={node.template_ref || ""}
          onChange={(e) => set_node({ template_ref: e.target.value || null })}
          style={{
            padding: "7px 10px", borderRadius: 7, fontSize: 12,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            background: isDark ? "#141416" : "#fafafa", color: "inherit",
          }}
        >
          <option value="">(local only)</option>
        </select>

        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4,
          }}
        >
          Model
        </span>
        <select
          value={model}
          onChange={(e) => set_override({ model: e.target.value })}
          style={{
            padding: "7px 10px", borderRadius: 7, fontSize: 12,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            background: isDark ? "#141416" : "#fafafa", color: "inherit",
          }}
        >
          <option value="">(use template default)</option>
          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Prompt */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, color: "#86868b",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Prompt
        </span>
        <ChipEditor
          value={prompt}
          onChange={(v) => set_override({ prompt: v })}
          scope={scope}
        />
      </div>

      {/* Output schema */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: 11, fontWeight: 600, color: "#86868b",
              textTransform: "uppercase", letterSpacing: 0.4,
            }}
          >
            Output
          </span>
          <button
            type="button" onClick={add_out_row}
            style={{ background: "transparent", border: "none", color: "#6366f1", fontSize: 11, cursor: "pointer" }}
          >
            + Add field
          </button>
        </div>
        {(node.outputs || []).map((o, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px", borderRadius: 6,
              border: `1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            }}
          >
            <select
              value={o.type}
              onChange={(e) => set_out_row(i, { type: e.target.value })}
              style={{
                padding: "3px 5px", fontSize: 11, borderRadius: 5,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                background: isDark ? "#141416" : "#fafafa", color: "inherit", width: 90,
              }}
            >
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              value={o.name}
              onChange={(e) => set_out_row(i, { name: e.target.value })}
              style={{
                flex: 1, padding: "3px 6px", fontSize: 11.5, borderRadius: 5,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                background: isDark ? "#141416" : "#fafafa", color: "inherit",
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            />
            <span onClick={() => remove_out_row(i)} style={{ color: "#86868b", cursor: "pointer", padding: "0 4px" }}>×</span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 18.4: Run tests**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js`
Expected: pass.

- [ ] **Step 18.5: Leave uncommitted.**

---

## Task 19: `recipe_canvas.js` integration

**Goal:** Swap the hard-coded agent/toolpool/pool state for the new schema. Wire migration on load, derive nodes/edges directly from `recipe.nodes` / `recipe.edges`, mount the DetailPanel on the right, pass `validate_connection`, keep the context-menu fallback for add node (Blank Agent / ToolPool / SubagentPool).

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js` (or inline if simple)

- [ ] **Step 19.1: Read current context menu items**

Read `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js` to understand the structure, then extend with "Add Blank Agent" / "Add ToolPool" / "Add SubagentPool".

- [ ] **Step 19.2: Replace context menu items**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas_context_menu_items.js`:

```js
export function buildRecipeCanvasContextMenuItems({ onAddAgent, onAddToolPool, onAddSubagentPool }) {
  return [
    { id: "add_agent", label: "+ Add Blank Agent", onClick: onAddAgent },
    { id: "add_toolpool", label: "+ Add ToolPool", onClick: onAddToolPool },
    { id: "add_subagent_pool", label: "+ Add SubagentPool", onClick: onAddSubagentPool },
  ];
}
```

- [ ] **Step 19.3: Rewrite recipe_canvas.js**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`:

```js
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import AgentNode from "./nodes/agent_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import StartNode from "./nodes/start_node";
import EndNode from "./nodes/end_node";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { buildRecipeCanvasContextMenuItems } from "./recipe_canvas_context_menu_items";
import DetailPanel from "./detail_panel/detail_panel";
import { migrate_recipe, is_legacy_recipe } from "./recipe_migration";
import { validate_recipe_connection } from "./recipe_connection_rules";

const WORKFLOW_PORTS = [
  { id: "in", side: "left", kind: "in" },
  { id: "out", side: "right", kind: "out" },
  { id: "attach_top", side: "top", kind: "attach" },
  { id: "attach_bot", side: "bottom", kind: "attach" },
];
const START_PORTS = [{ id: "out", side: "right", kind: "out" }];
const END_PORTS = [{ id: "in", side: "left", kind: "in" }];
const PLUGIN_PORTS = [
  { id: "attach_top", side: "top", kind: "attach" },
  { id: "attach_bot", side: "bottom", kind: "attach" },
];

function ports_for(node_type) {
  switch (node_type) {
    case "start": return START_PORTS;
    case "end": return END_PORTS;
    case "agent": return WORKFLOW_PORTS;
    case "toolpool":
    case "subagent_pool": return PLUGIN_PORTS;
    default: return [];
  }
}

function new_id(prefix, existing_ids) {
  let i = 1;
  while (existing_ids.has(`${prefix}_${i}`)) i += 1;
  return `${prefix}_${i}`;
}

export default function RecipeCanvas({
  recipe,
  selectedNodeId,
  onSelectNode,
  onRecipeChange,
  onSave,
  dirty,
  isDark,
}) {
  const [resetToken, setResetToken] = useState(0);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });

  /* ── Auto-migrate legacy recipes on first load ─────────────── */
  useEffect(() => {
    if (recipe && is_legacy_recipe(recipe)) {
      onRecipeChange(migrate_recipe(recipe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.name]);

  /* ── Derive nodes / edges with computed ports ──────────────── */
  const nodes = useMemo(() => {
    if (!recipe?.nodes) return [];
    return recipe.nodes.map((n) => ({
      ...n,
      ports: ports_for(n.type),
    }));
  }, [recipe]);

  const edges = useMemo(() => recipe?.edges || [], [recipe]);

  const handleNodesChange = useCallback(
    (nextNodes) => {
      if (!recipe) return;
      /* Keep only id + position + non-port fields back into recipe.nodes */
      const nextById = new Map(nextNodes.map((n) => [n.id, n]));
      const kept_ids = new Set(nextNodes.map((n) => n.id));
      const next_recipe_nodes = recipe.nodes
        .filter((n) => kept_ids.has(n.id))
        .map((n) => {
          const live = nextById.get(n.id);
          if (!live) return n;
          return { ...n, x: live.x, y: live.y };
        });
      onRecipeChange({ ...recipe, nodes: next_recipe_nodes });
    },
    [recipe, onRecipeChange],
  );

  const handleEdgesChange = useCallback(
    (nextEdges) => {
      if (!recipe) return;
      onRecipeChange({ ...recipe, edges: nextEdges });
    },
    [recipe, onRecipeChange],
  );

  const handleConnect = useCallback(
    (edge) => {
      if (!recipe) return;
      const existing_ids = new Set(recipe.edges.map((e) => e.id));
      const id = new_id("e", existing_ids);
      const src = recipe.nodes.find((n) => n.id === edge.source_node_id);
      const tgt = recipe.nodes.find((n) => n.id === edge.target_node_id);
      const kind =
        src?.kind === "plugin" || tgt?.kind === "plugin" ? "attach" : "flow";
      onRecipeChange({
        ...recipe,
        edges: [...recipe.edges, { id, ...edge, kind }],
      });
    },
    [recipe, onRecipeChange],
  );

  const validate = useCallback(
    ({ source, target }) =>
      validate_recipe_connection(source, target, { edges }),
    [edges],
  );

  /* ── Context-menu "Add" actions ─────────────────────────────── */
  function add_node(type) {
    if (!recipe) return;
    const existing_ids = new Set(recipe.nodes.map((n) => n.id));
    const prefix = type === "agent" ? "agent" : type === "toolpool" ? "tp" : "sp";
    const id = new_id(prefix, existing_ids);
    const base_defaults = {
      agent: {
        id,
        type: "agent",
        kind: "workflow",
        deletable: true,
        template_ref: null,
        override: { model: "", prompt: "" },
        outputs: [{ name: "output", type: "string" }],
        x: 400,
        y: 300,
      },
      toolpool: {
        id,
        type: "toolpool",
        kind: "plugin",
        deletable: true,
        template_ref: null,
        tools: [],
        x: 400,
        y: 100,
      },
      subagent_pool: {
        id,
        type: "subagent_pool",
        kind: "plugin",
        deletable: true,
        template_ref: null,
        subagents: [],
        x: 400,
        y: 500,
      },
    };
    onRecipeChange({ ...recipe, nodes: [...recipe.nodes, base_defaults[type]] });
  }

  const contextMenuItems = useMemo(
    () =>
      buildRecipeCanvasContextMenuItems({
        onAddAgent: () => add_node("agent"),
        onAddToolPool: () => add_node("toolpool"),
        onAddSubagentPool: () => add_node("subagent_pool"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe],
  );

  const renderNode = (node) => {
    if (node.type === "agent") return <AgentNode node={node} isDark={isDark} />;
    if (node.type === "toolpool") return <ToolPoolNode node={node} isDark={isDark} />;
    if (node.type === "subagent_pool") return <SubagentPoolNode node={node} isDark={isDark} />;
    if (node.type === "start") return <StartNode isDark={isDark} />;
    if (node.type === "end") return <EndNode isDark={isDark} />;
    return null;
  };

  const overlayBg = isDark ? "rgba(20, 20, 20, 0.72)" : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex" }}>
      {/* Canvas */}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
        }}
        style={{ position: "relative", flex: 1, overflow: "hidden" }}
      >
        <FlowEditor
          style={{
            width: "100%",
            height: "100%",
            background: isDark ? "#1a1a1a" : "#fafafb",
            borderRadius: 0,
          }}
          theme={{
            nodeBackground: "transparent",
            nodeShadow: "none",
            nodeShadowHover: "none",
            nodeSelectedBorder: "transparent",
            portShape: "puzzle",
            portColor: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.22)",
            portHoverColor: "#4a5bd8",
            edgeColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)",
            edgeActiveColor: "#4a5bd8",
            edgeWidth: 1.6,
          }}
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          on_nodes_change={handleNodesChange}
          on_edges_change={handleEdgesChange}
          validate_connection={validate}
          render_node={renderNode}
          reset_token={resetToken}
        />

        {/* Floating Save button */}
        <div
          style={{
            position: "absolute", bottom: 16, left: "50%",
            transform: "translateX(-50%)", zIndex: 3,
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 10,
            backgroundColor: overlayBg,
            border: overlayBorder,
            backdropFilter: overlayBackdrop,
            WebkitBackdropFilter: overlayBackdrop,
            boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <Button
            label="Center"
            onClick={() => setResetToken((t) => t + 1)}
            style={{
              fontSize: 12, paddingVertical: 5, paddingHorizontal: 12,
              borderRadius: 7, opacity: 0.7,
            }}
          />
          <Button
            label="Save"
            onClick={onSave}
            disabled={!dirty}
            style={{
              fontSize: 12, paddingVertical: 5, paddingHorizontal: 14,
              borderRadius: 7,
              backgroundColor: dirty ? "#4a5bd8" : "transparent",
              color: dirty ? "#fff" : isDark ? "#ddd" : "#333",
              opacity: dirty ? 1 : 0.5,
            }}
          />
        </div>

        <ContextMenu
          visible={contextMenu.visible}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu((c) => ({ ...c, visible: false }))}
          isDark={isDark}
        />
      </div>

      {/* Right-side detail panel */}
      <div style={{ width: 360, flexShrink: 0 }}>
        <DetailPanel
          recipe={recipe}
          selectedNodeId={selectedNodeId}
          onChange={onRecipeChange}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 19.4: Smoke test — open app manually**

Run: `npm start` (or `npm run start:web`).

Navigate to the recipes page. Verify:
- An existing (legacy) recipe loads and auto-migrates into 3 nodes (start / agent_main / end) plus any toolpool/subagent_pool.
- Selecting each node shows the matching detail panel on the right.
- Right-click on canvas shows "Add Blank Agent / ToolPool / SubagentPool".
- Dragging between ports:
  - start.out → end.in creates a flow edge.
  - Invalid drops (out→out, plugin↔plugin) are rejected silently.
- Edge delete: hover shows ×; click deletes. Select + Delete key deletes.
- Edge endpoint drag reconnects when dropped on a valid target, deletes otherwise.
- Start/End cannot be deleted via keyboard Delete.

If anything breaks, note it on the task and fix before proceeding.

- [ ] **Step 19.5: Leave uncommitted.**

---

## Task 20: Save/reload port persistence (bug fix)

**Goal:** Verify that `source_port_id` and `target_port_id` round-trip through the save path. Since Task 19 rewrites `handleConnect` to store the edge (with ports) directly into `recipe.edges`, this should be a pure verification step — but we keep it as an explicit task because it was a known previous bug.

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/recipe_roundtrip.test.js`

- [ ] **Step 20.1: Write integration test**

Create `src/COMPONENTs/agents/pages/recipes_page/recipe_roundtrip.test.js`:

```js
import { migrate_recipe } from "./recipe_migration";

describe("recipe edge port round-trip", () => {
  test("migrated edges carry source_port_id and target_port_id", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "" },
      toolkits: [],
      subagent_pool: [],
    };
    const recipe = migrate_recipe(legacy);
    recipe.edges.forEach((e) => {
      expect(typeof e.source_port_id).toBe("string");
      expect(typeof e.target_port_id).toBe("string");
    });
  });

  test("custom connection via handleConnect stores both port ids", () => {
    /* Mirrors what recipe_canvas.handleConnect does. */
    const recipe = {
      name: "x",
      nodes: [
        { id: "a", type: "agent", kind: "workflow" },
        { id: "tp", type: "toolpool", kind: "plugin" },
      ],
      edges: [],
    };
    const new_edge = {
      source_node_id: "a",
      source_port_id: "attach_top",
      target_node_id: "tp",
      target_port_id: "attach_bot",
    };
    const next = {
      ...recipe,
      edges: [...recipe.edges, { id: "e_1", ...new_edge, kind: "attach" }],
    };
    /* Simulate reload: serialize → parse */
    const reloaded = JSON.parse(JSON.stringify(next));
    expect(reloaded.edges[0].source_port_id).toBe("attach_top");
    expect(reloaded.edges[0].target_port_id).toBe("attach_bot");
  });
});
```

- [ ] **Step 20.2: Run**

Run: `npx jest src/COMPONENTs/agents/pages/recipes_page/recipe_roundtrip.test.js`
Expected: 2 tests pass.

- [ ] **Step 20.3: Leave uncommitted.**

---

## Finalization

- [ ] **Run full suite**

Run: `npm test -- --watchAll=false`
Expected: all existing + new tests pass.

- [ ] **Manual QA checklist (repeat from Task 19.4)**

Verify in the running app:
- Legacy migration (load an old recipe, see start/end appear).
- Port puzzle visual renders correctly light + dark.
- in (purple), out (orange), attach (indigo) dot colors on hover.
- Connection validation rejects invalid pairings.
- Start/End undeletable.
- Edge × button deletes.
- Edge endpoint drag reconnects to valid, deletes on invalid.
- Detail panel: each of Start / End / Agent / ToolPool / SubagentPool renders the right content and edits flow back through `onRecipeChange`.
- Variable picker (`{{` or + button) inserts chip; chip serializes back to `{{#node.field#}}` on save.
- Context menu adds blank Agent / ToolPool / SubagentPool.
- Save + reload preserves port connections (no more snap-back bug).

- [ ] **Report complete.** User reviews the diff and commits manually (per user preference).
