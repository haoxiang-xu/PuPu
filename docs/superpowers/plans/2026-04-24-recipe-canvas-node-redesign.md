# Recipe Canvas Node Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework recipe canvas nodes (agent + tool pool + subagent pool) to be borderless cards that lift on selection, with bar-style 4-side ports; classify nodes as workflow vs plugin; switch to vertical default layout (tool pool above agent, subagent pool below).

**Architecture:** Three layers of changes. (1) FlowEditor gains a `portShape: "bar" | "dot"` theme field and reads `edge.style: "solid" | "dashed"` per edge. (2) The three node renderer files in `recipes_page/nodes/` are rewritten using a shared visual token set (borderless, neutral shadow, lift-on-select, internal grid for pool nodes). (3) `recipe_canvas.js` wires it all together: 4-port nodes, vertical edge endpoints, plugin/workflow `kind` tag, dashed plugin edges.

**Tech Stack:** React 19, JavaScript only, inline styles, no new dependencies. No backend changes. No new files — all six tasks modify existing files.

**Project policy:** The executor MUST NOT run `git commit`. Each task ends at a checkpoint; the user commits manually. Skip any commit step in this plan.

**Spec:** `docs/superpowers/specs/2026-04-24-recipe-canvas-node-redesign.md`

---

## Task 1: FlowEditor — port system upgrade (connected awareness + bar shape)

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/node.js` (port rendering, lines 11-12 constants, lines 57-140 hover handlers + render_port)

This task makes ports stay visible at low opacity when they are connected (have an edge), and adds a `theme.portShape === "bar"` variant that renders flush horizontal/vertical bars instead of dots. Active (connected) bars extend slightly along their long axis for emphasis.

- [ ] **Step 1: Replace the port hover handlers and render_port function**

Open `src/BUILTIN_COMPONENTs/flow_editor/node.js`. Replace the block from line 57 (`/* ── Port hover handlers ─── */`) through the end of `render_port` (line 140, the closing `};`) with:

```js
  /* ── Port hover handlers ─────────────────────────────────── */
  const handle_port_enter = useCallback(
    (e, base_transform, is_bar) => {
      const el = e.currentTarget;
      el.style.backgroundColor = theme.portHoverColor;
      if (!is_bar) {
        el.style.boxShadow = `0 0 8px ${theme.portHoverColor}`;
        el.style.transform = (base_transform || "") + " scale(1.6)";
      } else {
        el.style.boxShadow = "none";
        el.style.transform = base_transform || "";
      }
    },
    [theme.portHoverColor],
  );

  const handle_port_leave = useCallback(
    (e, base_transform) => {
      const el = e.currentTarget;
      el.style.backgroundColor = "";
      el.style.boxShadow = "none";
      el.style.transform = base_transform || "";
    },
    [],
  );

  /* ── Render a single port ────────────────────────────────── */
  const render_port = (port, side, index, total) => {
    const fraction = (index + 1) / (total + 1);
    const is_bar = theme.portShape === "bar";
    const is_connected = !!(connected_port_ids && connected_port_ids.has(port.id));

    const pos_style = { position: "absolute" };
    let base_transform = "";

    /* Dimensions per shape */
    let port_w;
    let port_h;
    let offset;
    if (is_bar) {
      const long = is_connected ? 22 : 16;
      const short = 3;
      if (side === "top" || side === "bottom") {
        port_w = long;
        port_h = short;
      } else {
        port_w = short;
        port_h = long;
      }
      offset = -1.5;
    } else {
      port_w = PORT_SIZE;
      port_h = PORT_SIZE;
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

    const interactive = hovered || is_connecting || selected;
    const show_port = interactive || is_connected;
    const bg = is_connected
      ? theme.portHoverColor
      : theme.portColor;
    const opacity = is_connected && !interactive ? 0.65 : show_port ? 1 : 0;

    return (
      <div
        key={port.id}
        data-port-id={port.id}
        data-port-side={side}
        data-node-id={node.id}
        style={{
          ...pos_style,
          width: port_w,
          height: port_h,
          borderRadius: is_bar ? 999 : "50%",
          backgroundColor: bg,
          transform: base_transform,
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
          on_port_mouse_down(node.id, port.id, side, e);
        }}
        onMouseEnter={(e) => handle_port_enter(e, base_transform, is_bar)}
        onMouseLeave={(e) => handle_port_leave(e, base_transform)}
      />
    );
  };
```

Notes:
- `connected_port_ids` is already passed in as a prop (line 23) and already computed in `flow_editor.js` (line 706).
- `theme.portShape` defaults to `undefined` for back-compat; only `"bar"` triggers the new shape.
- Connected-but-not-hovered ports use the hover color at 65% opacity to stand out.

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/BUILTIN_COMPONENTs/flow_editor/node.js`
Expected: no errors, no warnings.

- [ ] **Step 3: Manual smoke check**

Run `npm start`. Open any view that uses FlowEditor (the Agents modal). Confirm: dot ports still render (theme defaults unchanged), nothing visually regressed. Bar shape isn't activated yet (will be in Task 6).

- [ ] **Step 4: Checkpoint** — pause for user review/commit.

---

## Task 2: FlowEditor — dashed edge style support

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js` (visible edge `<path>` element near line 762-783)

Allow each edge to opt into a dashed stroke by setting `edge.style = "dashed"`. Default remains solid.

- [ ] **Step 1: Add strokeDasharray to the visible edge path**

Open `src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`. Find the visible edge `<path>` block (the second `<path>` inside the edges loop, currently around line 762-783). Add a `strokeDasharray` prop. The block becomes:

```jsx
              {/* Visible edge */}
              <path
                ref={(el) => {
                  if (el) edge_elements_ref.current[ep.id] = el;
                }}
                d={ep.d}
                fill="none"
                stroke={
                  selected_edge_id === ep.id
                    ? theme.edgeActiveColor
                    : theme.edgeColor
                }
                strokeWidth={
                  selected_edge_id === ep.id
                    ? theme.edgeWidth + 1
                    : theme.edgeWidth
                }
                strokeDasharray={ep.style === "dashed" ? "5 4" : undefined}
                strokeLinecap="round"
                style={{
                  pointerEvents: "none",
                  transition: "stroke 0.15s ease, stroke-width 0.15s ease",
                }}
              />
```

`ep` is the spread-result of `edge` (see line 701: `return { ...edge, d, midpoint };`), so `ep.style` reads through to whatever `edge.style` was passed in via props.

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/BUILTIN_COMPONENTs/flow_editor/flow_editor.js`
Expected: no errors, no warnings.

- [ ] **Step 3: Checkpoint** — pause for user review/commit.

---

## Task 3: AgentNode redesign

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js` (full rewrite)

Rewrite the agent node to be borderless with a 32×32 accent avatar and lift-on-select shadow.

- [ ] **Step 1: Replace the entire file contents with**

```js
export default function AgentNode({ node, isDark, selected }) {
  const surface = isDark ? "#1f2027" : "#ffffff";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const text_soft = isDark ? "#a8a8b0" : "#6b6b73";
  const shadow_rest = isDark
    ? "0 1px 2px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.4)"
    : "0 1px 2px rgba(15,18,38,0.05), 0 4px 14px rgba(15,18,38,0.07)";
  const shadow_lift = isDark
    ? "0 2px 4px rgba(0,0,0,0.6), 0 14px 36px rgba(0,0,0,0.6)"
    : "0 2px 4px rgba(15,18,38,0.07), 0 14px 36px rgba(15,18,38,0.14)";

  const initial = (node.label || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      style={{
        width: 200,
        padding: 14,
        background: surface,
        borderRadius: 12,
        boxShadow: selected ? shadow_lift : shadow_rest,
        transform: selected ? "translateY(-3px)" : "translateY(0)",
        transition:
          "transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            flexShrink: 0,
            background: "#4a5bd8",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.15,
              color: text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.label || "(unnamed)"}
          </div>
          {node.model && (
            <div
              style={{
                fontSize: 11,
                color: text_soft,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.model}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

The previous file imported `Icon`; the new design uses the avatar letter, no Icon import needed.

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/COMPONENTs/agents/pages/recipes_page/nodes/agent_node.js`
Expected: no errors, no warnings (no unused imports).

- [ ] **Step 3: Checkpoint** — pause for user review/commit.

---

## Task 4: ToolPoolNode redesign

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js` (full rewrite)

Rewrite tool pool with gradient avatar, count chip, and 4-column icon grid showing 2-letter tool abbreviations.

- [ ] **Step 1: Replace the entire file contents with**

```js
const cellLabel = (name) => {
  if (!name) return "?";
  const cleaned = String(name).replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length === 0) return "?";
  if (cleaned.length === 1) return cleaned[0].toUpperCase();
  return cleaned[0].toUpperCase() + cleaned[1].toLowerCase();
};

export default function ToolPoolNode({ node, isDark, selected }) {
  const surface = isDark ? "#1f2027" : "#ffffff";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const text_soft = isDark ? "#a8a8b0" : "#6b6b73";
  const text_muted = isDark ? "#5d5d65" : "#a0a0a8";
  const chip_bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const shadow_rest = isDark
    ? "0 1px 2px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.4)"
    : "0 1px 2px rgba(15,18,38,0.05), 0 4px 14px rgba(15,18,38,0.07)";
  const shadow_lift = isDark
    ? "0 2px 4px rgba(0,0,0,0.6), 0 14px 36px rgba(0,0,0,0.6)"
    : "0 2px 4px rgba(15,18,38,0.07), 0 14px 36px rgba(15,18,38,0.14)";

  const chips = node.chips || [];
  const count = node.count != null ? node.count : chips.length;
  const MAX_CELLS = 11;
  const visible = chips.slice(0, MAX_CELLS);
  const overflow = Math.max(0, chips.length - MAX_CELLS);

  return (
    <div
      style={{
        width: 192,
        padding: "12px 14px",
        background: surface,
        borderRadius: 12,
        boxShadow: selected ? shadow_lift : shadow_rest,
        transform: selected ? "translateY(-3px)" : "translateY(0)",
        transition:
          "transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: chips.length > 0 ? 10 : 0,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            flexShrink: 0,
            background: "linear-gradient(135deg, #f6a341, #ea7547)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          T
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.15,
              color: text,
            }}
          >
            Tool Pool
          </div>
          <div style={{ fontSize: 10.5, color: text_soft, marginTop: 1 }}>
            {count} tools
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: text_soft,
            background: chip_bg,
            padding: "2px 7px",
            borderRadius: 999,
          }}
        >
          {count}
        </div>
      </div>

      {chips.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 5,
          }}
        >
          {visible.map((c, i) => (
            <div
              key={`${c}-${i}`}
              title={c}
              style={{
                aspectRatio: "1",
                background: chip_bg,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                fontWeight: 700,
                color: text_soft,
              }}
            >
              {cellLabel(c)}
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                aspectRatio: "1",
                background: "transparent",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                fontWeight: 500,
                color: text_muted,
              }}
            >
              {`+${overflow}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

The previous file imported `Icon`; the new design uses the gradient avatar letter "T", no Icon import needed. `selected` is consumed via the shadow/transform.

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/COMPONENTs/agents/pages/recipes_page/nodes/tool_pool_node.js`
Expected: no errors, no warnings.

- [ ] **Step 3: Checkpoint** — pause for user review/commit.

---

## Task 5: SubagentPoolNode redesign

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js` (full rewrite)

Same skeleton as Task 4 with a different gradient ("S" avatar in purple-ish gradient) and "subagents" label.

- [ ] **Step 1: Replace the entire file contents with**

```js
const cellLabel = (name) => {
  if (!name) return "?";
  const cleaned = String(name).replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length === 0) return "?";
  if (cleaned.length === 1) return cleaned[0].toUpperCase();
  return cleaned[0].toUpperCase() + cleaned[1].toLowerCase();
};

export default function SubagentPoolNode({ node, isDark, selected }) {
  const surface = isDark ? "#1f2027" : "#ffffff";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const text_soft = isDark ? "#a8a8b0" : "#6b6b73";
  const text_muted = isDark ? "#5d5d65" : "#a0a0a8";
  const chip_bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const shadow_rest = isDark
    ? "0 1px 2px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.4)"
    : "0 1px 2px rgba(15,18,38,0.05), 0 4px 14px rgba(15,18,38,0.07)";
  const shadow_lift = isDark
    ? "0 2px 4px rgba(0,0,0,0.6), 0 14px 36px rgba(0,0,0,0.6)"
    : "0 2px 4px rgba(15,18,38,0.07), 0 14px 36px rgba(15,18,38,0.14)";

  const chips = node.chips || [];
  const count = node.count != null ? node.count : chips.length;
  const MAX_CELLS = 11;
  const visible = chips.slice(0, MAX_CELLS);
  const overflow = Math.max(0, chips.length - MAX_CELLS);

  return (
    <div
      style={{
        width: 192,
        padding: "12px 14px",
        background: surface,
        borderRadius: 12,
        boxShadow: selected ? shadow_lift : shadow_rest,
        transform: selected ? "translateY(-3px)" : "translateY(0)",
        transition:
          "transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: chips.length > 0 ? 10 : 0,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            flexShrink: 0,
            background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          S
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.15,
              color: text,
            }}
          >
            Subagent Pool
          </div>
          <div style={{ fontSize: 10.5, color: text_soft, marginTop: 1 }}>
            {count} agents
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: text_soft,
            background: chip_bg,
            padding: "2px 7px",
            borderRadius: 999,
          }}
        >
          {count}
        </div>
      </div>

      {chips.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 5,
          }}
        >
          {visible.map((c, i) => (
            <div
              key={`${c}-${i}`}
              title={c}
              style={{
                aspectRatio: "1",
                background: chip_bg,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                fontWeight: 700,
                color: text_soft,
              }}
            >
              {cellLabel(c)}
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                aspectRatio: "1",
                background: "transparent",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                fontWeight: 500,
                color: text_muted,
              }}
            >
              {`+${overflow}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/COMPONENTs/agents/pages/recipes_page/nodes/subagent_pool_node.js`
Expected: no errors, no warnings.

- [ ] **Step 3: Checkpoint** — pause for user review/commit.

---

## Task 6: RecipeCanvas wiring (FOUR_PORTS, vertical layout, kind, plugin edge style, theme)

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js` (constants near top, useMemo body, FlowEditor `theme` prop)

Switch all nodes to 4-side ports, set vertical default positions (tool pool above, subagent below), wire plugin edges through the agent's top/bottom ports with `style: "dashed"`, and tag each node with a `kind`. Pass the new `portShape: "bar"` plus refined edge colors via the FlowEditor `theme` prop.

- [ ] **Step 1: Update top-level constants**

Replace lines 11-18 (the three position constants and `LR_PORTS`) with:

```js
const AGENT_POS = { x: 380, y: 260 };
const TOOLPOOL_POS = { x: 384, y: 60 };
const POOL_POS = { x: 384, y: 460 };

const FOUR_PORTS = [
  { id: "top", side: "top" },
  { id: "right", side: "right" },
  { id: "bottom", side: "bottom" },
  { id: "left", side: "left" },
];
```

- [ ] **Step 2: Update node + edge derivation in the `useMemo` block**

Find the `useMemo` block that returns `{ nodes, edges }` (currently lines 80-144). Replace its body with:

```js
  const { nodes, edges } = useMemo(() => {
    if (!recipe) return { nodes: [], edges: [] };
    const nodeArr = [];
    const edgeArr = [];

    const pos = (id, dx, dy) => {
      const p = positions[id];
      return p ? { x: p.x, y: p.y } : { x: dx, y: dy };
    };

    const agentXY = pos("agent", AGENT_POS.x, AGENT_POS.y);
    nodeArr.push({
      id: "agent",
      type: "agent",
      kind: "workflow",
      ports: FOUR_PORTS,
      x: agentXY.x,
      y: agentXY.y,
      label: recipe.name,
      model: recipe.model,
    });

    if (toolPoolVisible) {
      const tpXY = pos("toolpool", TOOLPOOL_POS.x, TOOLPOOL_POS.y);
      nodeArr.push({
        id: "toolpool",
        type: "toolpool",
        kind: "plugin",
        ports: FOUR_PORTS,
        x: tpXY.x,
        y: tpXY.y,
        count: toolChips.length,
        chips: toolChips,
      });
      edgeArr.push({
        id: "e:agent:toolpool",
        source_node_id: "toolpool",
        source_port_id: "bottom",
        target_node_id: "agent",
        target_port_id: "top",
        style: "dashed",
      });
    }

    if (poolVisible) {
      const poolXY = pos("pool", POOL_POS.x, POOL_POS.y);
      nodeArr.push({
        id: "pool",
        type: "pool",
        kind: "plugin",
        ports: FOUR_PORTS,
        x: poolXY.x,
        y: poolXY.y,
        count: recipe.subagent_pool.length,
        chips: recipe.subagent_pool.map((e) =>
          e.kind === "ref" ? e.template_name : e.name,
        ),
      });
      edgeArr.push({
        id: "e:agent:pool",
        source_node_id: "agent",
        source_port_id: "bottom",
        target_node_id: "pool",
        target_port_id: "top",
        style: "dashed",
      });
    }

    return { nodes: nodeArr, edges: edgeArr };
  }, [recipe, positions, toolPoolVisible, poolVisible, toolChips]);
```

The changes vs current code: each node gets `kind`, `ports: FOUR_PORTS` instead of `LR_PORTS`; the toolpool edge now uses `bottom → top` ports; the pool edge now uses `bottom → top`; both edges get `style: "dashed"`.

- [ ] **Step 3: Update FlowEditor `theme` prop to enable bar ports**

Find the `<FlowEditor ... theme={...}>` props block (currently lines 229-250). Replace the `theme` object with:

```jsx
          theme={{
            nodeBackground: "transparent",
            nodeShadow: "none",
            nodeShadowHover: "none",
            nodeSelectedBorder: "transparent",
            portShape: "bar",
            portColor: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.22)",
            portHoverColor: "#4a5bd8",
            edgeColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)",
            edgeActiveColor: "#4a5bd8",
            edgeWidth: 1.6,
          }}
```

This activates the bar shape from Task 1 and sets neutral edge/port colors that match the spec.

- [ ] **Step 4: Verify lint passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx eslint src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`
Expected: no errors, no warnings.

- [ ] **Step 5: End-to-end manual verification**

Run `npm start`. Open the Agents modal → pick `Default`.

Check each:
1. Three nodes render in the new style (borderless cards, gradient avatars on pools, "D" avatar on agent).
2. Tool pool sits *above* the agent; subagent pool sits *below* the agent. Edges curve between bottom↔top ports.
3. Both pool edges are dashed (not solid).
4. Selecting any node → it lifts 3px with a deeper shadow; deselect → returns smoothly.
5. Hover any node → 4 bar ports (上下左右) become visible at full opacity.
6. Connected ports (top of agent, bottom of agent, top of pools, bottom of toolpool) stay visible at ~65% opacity even without hover.
7. Click an edge → it turns purple → press Backspace → edge deletes → corresponding plugin (toolkits / subagent_pool) clears in the recipe → Save button activates.
8. Drag any node → position persists; Save activates.
9. Toggle dark mode in PuPu settings → all surfaces, ports, chips, shadows render correctly inverted.
10. Tool pool with `enabled_tools: null` (default agent) shows all catalog tools' abbreviations in the grid.

- [ ] **Step 6: Checkpoint** — pause for user final review/commit.

---

## Self-Review (executor: skip; this is the plan author's note)

- **Spec coverage:** Tokens (Task 3-5), kind classification (Task 6), 4-side ports (Task 1, Task 6), bar port shape (Task 1, Task 6), dashed plugin edges (Task 2, Task 6), vertical default layout (Task 6), agent avatar (Task 3), pool grids (Task 4-5), connect validation note (deferred per spec).
- **Placeholder scan:** None. All code blocks complete.
- **Type consistency:** `connected_port_ids` is a `Set`; `cellLabel` returns `string`; `edge.style` is `"dashed" | undefined`; `kind` is `"workflow" | "plugin"`; `node.chips` is `string[]`. Used consistently.
