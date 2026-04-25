import { useCallback, useEffect, useMemo, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import AgentNode from "./nodes/agent_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { buildRecipeCanvasContextMenuItems } from "./recipe_canvas_context_menu_items";
import { api } from "../../../../SERVICEs/api";

const AGENT_POS = { x: 380, y: 260 };
const TOOLPOOL_POS = { x: 384, y: 60 };
const POOL_POS = { x: 384, y: 460 };

const FOUR_PORTS = [
  { id: "top", side: "top" },
  { id: "right", side: "right" },
  { id: "bottom", side: "bottom" },
  { id: "left", side: "left" },
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
  const [toolPoolVisible, setToolPoolVisible] = useState(false);
  const [poolVisible, setPoolVisible] = useState(false);
  const [toolPoolEdge, setToolPoolEdge] = useState(true);
  const [poolEdge, setPoolEdge] = useState(true);
  // Track which ports the user actually connected to, so re-rendering
  // the derived edge doesn't snap back to hardcoded bottom/top.
  const [toolPoolPorts, setToolPoolPorts] = useState({
    source: "bottom",
    target: "top",
  });
  const [poolPorts, setPoolPorts] = useState({
    source: "bottom",
    target: "top",
  });
  const [catalog, setCatalog] = useState([]);
  const [resetToken, setResetToken] = useState(0);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  const positions = useMemo(
    () => recipe?.layout?.nodes || {},
    [recipe?.layout?.nodes],
  );

  useEffect(() => {
    setToolPoolVisible(!!recipe && recipe.toolkits.length > 0);
    setPoolVisible(!!recipe && recipe.subagent_pool.length > 0);
    setToolPoolEdge(true);
    setPoolEdge(true);
    setToolPoolPorts({ source: "bottom", target: "top" });
    setPoolPorts({ source: "bottom", target: "top" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.name]);

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

  const toolChips = useMemo(() => {
    if (!recipe) return [];
    const catalogById = {};
    catalog.forEach((tk) => {
      catalogById[tk.id] = tk;
    });
    const chips = [];
    recipe.toolkits.forEach((tk) => {
      if (Array.isArray(tk.enabled_tools)) {
        tk.enabled_tools.forEach((name) => chips.push(name));
      } else {
        const catTk = catalogById[tk.id];
        if (catTk && Array.isArray(catTk.tools) && catTk.tools.length > 0) {
          catTk.tools.forEach((t) => chips.push(t.name));
        } else {
          chips.push(`${tk.id}:*`);
        }
      }
    });
    return chips;
  }, [recipe, catalog]);

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
      if (toolPoolEdge) {
        edgeArr.push({
          id: "e:agent:toolpool",
          source_node_id: "toolpool",
          source_port_id: toolPoolPorts.source,
          target_node_id: "agent",
          target_port_id: toolPoolPorts.target,
          style: "dashed",
        });
      }
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
      if (poolEdge) {
        edgeArr.push({
          id: "e:agent:pool",
          source_node_id: "agent",
          source_port_id: poolPorts.source,
          target_node_id: "pool",
          target_port_id: poolPorts.target,
          style: "dashed",
        });
      }
    }

    return { nodes: nodeArr, edges: edgeArr };
  }, [
    recipe,
    positions,
    toolPoolVisible,
    poolVisible,
    toolPoolEdge,
    poolEdge,
    toolPoolPorts,
    poolPorts,
    toolChips,
  ]);

  const handleNodesChange = useCallback(
    (nextNodes) => {
      if (!recipe) return;
      const nextIds = new Set(nextNodes.map((n) => n.id));
      if (toolPoolVisible && !nextIds.has("toolpool")) setToolPoolVisible(false);
      if (poolVisible && !nextIds.has("pool")) setPoolVisible(false);
      const nextPositions = { ...positions };
      nextNodes.forEach((n) => {
        nextPositions[n.id] = { x: n.x, y: n.y };
      });
      onRecipeChange({
        ...recipe,
        layout: { ...(recipe.layout || {}), nodes: nextPositions },
      });
    },
    [recipe, positions, toolPoolVisible, poolVisible, onRecipeChange],
  );

  const handleEdgesChange = useCallback((nextEdges) => {
    const kept = new Set(nextEdges.map((e) => e.id));
    if (!kept.has("e:agent:toolpool")) setToolPoolEdge(false);
    if (!kept.has("e:agent:pool")) setPoolEdge(false);
  }, []);

  // Manual reconnect: drag from agent ↔ toolpool / agent ↔ pool restores the edge.
  // Capture the user's chosen ports, normalised to the canonical direction
  // used when deriving the edge in useMemo (toolpool→agent, agent→pool).
  const handleConnect = useCallback((edge) => {
    const {
      source_node_id: sn,
      source_port_id: sp,
      target_node_id: tn,
      target_port_id: tp,
    } = edge;
    const pair = new Set([sn, tn]);

    if (pair.has("agent") && pair.has("toolpool")) {
      // canonical: source=toolpool, target=agent
      if (sn === "toolpool") {
        setToolPoolPorts({ source: sp, target: tp });
      } else {
        setToolPoolPorts({ source: tp, target: sp });
      }
      setToolPoolEdge(true);
    }
    if (pair.has("agent") && pair.has("pool")) {
      // canonical: source=agent, target=pool
      if (sn === "agent") {
        setPoolPorts({ source: sp, target: tp });
      } else {
        setPoolPorts({ source: tp, target: sp });
      }
      setPoolEdge(true);
    }
  }, []);

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
        onAddToolPool: () => {
          setToolPoolVisible(true);
          setToolPoolEdge(true);
        },
        onAddSubagentPool: () => {
          setPoolVisible(true);
          setPoolEdge(true);
        },
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
          inset: 0,
          overflow: "hidden",
        }}
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
            portShape: "bar",
            portColor: isDark
              ? "rgba(255,255,255,0.32)"
              : "rgba(0,0,0,0.22)",
            portHoverColor: "#4a5bd8",
            edgeColor: isDark
              ? "rgba(255,255,255,0.18)"
              : "rgba(0,0,0,0.14)",
            edgeActiveColor: "#4a5bd8",
            edgeWidth: 1.6,
          }}
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          on_nodes_change={handleNodesChange}
          on_edges_change={handleEdgesChange}
          render_node={renderNode}
          reset_token={resetToken}
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
          label="Center"
          onClick={() => {
            setResetToken((t) => t + 1);
            if (recipe) {
              onRecipeChange({
                ...recipe,
                layout: { ...(recipe.layout || {}), nodes: {} },
              });
            }
          }}
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
        onClose={closeContextMenu}
        isDark={isDark}
      />
    </div>
  );
}
