import { useCallback, useEffect, useMemo, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import AgentNode from "./nodes/agent_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { buildRecipeCanvasContextMenuItems } from "./recipe_canvas_context_menu_items";

const AGENT_POS = { x: 420, y: 240 };
const TOOLPOOL_POS = { x: 80, y: 240 };
const POOL_POS = { x: 760, y: 240 };

const LR_PORTS = [
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
  const [positions, setPositions] = useState({});
  const [toolPoolVisible, setToolPoolVisible] = useState(false);
  const [poolVisible, setPoolVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    setPositions({});
    setToolPoolVisible(!!recipe && recipe.toolkits.length > 0);
    setPoolVisible(!!recipe && recipe.subagent_pool.length > 0);
  }, [recipe?.name]);

  const toolChips = useMemo(() => {
    if (!recipe) return [];
    const chips = [];
    recipe.toolkits.forEach((tk) => {
      if (Array.isArray(tk.enabled_tools)) {
        tk.enabled_tools.forEach((name) => chips.push(name));
      } else {
        chips.push(`${tk.id}:*`);
      }
    });
    return chips;
  }, [recipe]);

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
      ports: LR_PORTS,
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
        ports: LR_PORTS,
        x: tpXY.x,
        y: tpXY.y,
        count: toolChips.length,
        chips: toolChips,
      });
      edgeArr.push({
        id: "e:agent:toolpool",
        source_node_id: "toolpool",
        source_port_id: "right",
        target_node_id: "agent",
        target_port_id: "left",
      });
    }

    if (poolVisible) {
      const poolXY = pos("pool", POOL_POS.x, POOL_POS.y);
      nodeArr.push({
        id: "pool",
        type: "pool",
        ports: LR_PORTS,
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
        source_port_id: "right",
        target_node_id: "pool",
        target_port_id: "left",
      });
    }

    return { nodes: nodeArr, edges: edgeArr };
  }, [recipe, positions, toolPoolVisible, poolVisible, toolChips]);

  const handleNodesChange = (nextNodes) => {
    setPositions((prev) => {
      const next = { ...prev };
      nextNodes.forEach((n) => {
        next[n.id] = { x: n.x, y: n.y };
      });
      return next;
    });
  };

  const handleEdgesChange = useCallback(
    (nextEdges) => {
      if (!recipe) return;
      const kept = new Set(nextEdges.map((e) => e.id));
      if (!kept.has("e:agent:toolpool") && toolPoolVisible) {
        setToolPoolVisible(false);
        onRecipeChange({ ...recipe, toolkits: [] });
      }
      if (!kept.has("e:agent:pool") && poolVisible) {
        setPoolVisible(false);
        onRecipeChange({ ...recipe, subagent_pool: [] });
      }
    },
    [recipe, toolPoolVisible, poolVisible, onRecipeChange],
  );

  const handleConnect = () => {
    /* Edges are derived; reject manual connect. */
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

  const handleCanvasContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = useCallback(
    () => setContextMenu((c) => ({ ...c, visible: false })),
    [],
  );

  const contextMenuItems = useMemo(
    () =>
      buildRecipeCanvasContextMenuItems({
        recipe,
        hasToolPool: toolPoolVisible,
        hasSubagentPool: poolVisible,
        onAddToolPool: () => setToolPoolVisible(true),
        onAddSubagentPool: () => setPoolVisible(true),
      }),
    [recipe, toolPoolVisible, poolVisible],
  );

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
        onContextMenu={handleCanvasContextMenu}
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
          render_node={renderNode}
        />
      </div>

      {/* Floating Save button — bottom-center */}
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
        onClose={closeContextMenu}
        isDark={isDark}
      />
    </div>
  );
}
