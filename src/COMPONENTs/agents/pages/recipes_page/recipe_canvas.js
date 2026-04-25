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
import { migrate_recipe, is_legacy_recipe } from "./recipe_migration";
import { validate_recipe_connection } from "./recipe_connection_rules";
import { TOOLKIT_POOL_TYPE, is_toolkit_pool_type } from "./recipe_graph";

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
  if (is_toolkit_pool_type(node_type)) return PLUGIN_PORTS;
  switch (node_type) {
    case "start":
      return START_PORTS;
    case "end":
      return END_PORTS;
    case "agent":
      return WORKFLOW_PORTS;
    case "subagent_pool":
      return PLUGIN_PORTS;
    default:
      return [];
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
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (recipe && is_legacy_recipe(recipe)) {
      onRecipeChange(migrate_recipe(recipe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.name]);

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

  function add_node(type) {
    if (!recipe) return;
    const existing_ids = new Set(recipe.nodes.map((n) => n.id));
    const prefix =
      type === "agent" ? "agent" : is_toolkit_pool_type(type) ? "tp" : "sp";
    const id = new_id(prefix, existing_ids);
    const base_defaults = {
      agent: {
        id,
        type: "agent",
        kind: "workflow",
        deletable: true,
        override: { model: "", prompt: "" },
        outputs: [{ name: "output", type: "string" }],
        x: 400,
        y: 300,
      },
      [TOOLKIT_POOL_TYPE]: {
        id,
        type: TOOLKIT_POOL_TYPE,
        kind: "plugin",
        deletable: true,
        toolkits: [],
        merge_with_user_selected: false,
        x: 400,
        y: 100,
      },
      subagent_pool: {
        id,
        type: "subagent_pool",
        kind: "plugin",
        deletable: true,
        subagents: [],
        x: 400,
        y: 500,
      },
    };
    onRecipeChange({
      ...recipe,
      nodes: [...recipe.nodes, base_defaults[type]],
    });
  }

  const contextMenuItems = useMemo(
    () =>
      buildRecipeCanvasContextMenuItems({
        onAddAgent: () => add_node("agent"),
        onAddToolPool: () => add_node(TOOLKIT_POOL_TYPE),
        onAddSubagentPool: () => add_node("subagent_pool"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe],
  );

  const renderNode = (node) => {
    if (node.type === "agent") return <AgentNode node={node} isDark={isDark} />;
    if (is_toolkit_pool_type(node.type))
      return <ToolPoolNode node={node} isDark={isDark} />;
    if (node.type === "subagent_pool")
      return <SubagentPoolNode node={node} isDark={isDark} />;
    if (node.type === "start") return <StartNode isDark={isDark} />;
    if (node.type === "end") return <EndNode isDark={isDark} />;
    return null;
  };

  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
        }}
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      >
        <FlowEditor
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 0,
          }}
          theme={{
            canvasBackground: isDark ? "#1a1a1a" : "#fafafb",
            gridColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
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
            backdropFilter: overlayBackdrop,
            WebkitBackdropFilter: overlayBackdrop,
            boxShadow: isDark
              ? "0 4px 24px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
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
          <Button
            label="Save"
            onClick={onSave}
            disabled={!dirty}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 14,
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

    </div>
  );
}
