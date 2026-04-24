import { useEffect, useMemo, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import { api } from "../../../../SERVICEs/api";
import AgentNode from "./nodes/agent_node";
import ToolkitNode from "./nodes/toolkit_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";

const AGENT_POS = { x: 420, y: 240 };
const TOOLKIT_COL_X = 80;
const POOL_POS = { x: 760, y: 240 };

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
  const [toolkitMenuOpen, setToolkitMenuOpen] = useState(false);
  const [positions, setPositions] = useState({});

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

  // Reset positions when switching recipes.
  useEffect(() => {
    setPositions({});
  }, [recipe?.name]);

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
      label: recipe.name,
      model: recipe.model,
    });

    recipe.toolkits.forEach((tk, idx) => {
      const id = `tk:${tk.id}`;
      const tkXY = pos(id, TOOLKIT_COL_X, 100 + idx * 140);
      nodeArr.push({
        id,
        type: "toolkit",
        x: tkXY.x,
        y: tkXY.y,
        label: tk.id,
        enabledCount:
          tk.enabled_tools === null ? "all" : tk.enabled_tools.length,
        totalCount: "?",
      });
      edgeArr.push({
        id: `e:agent:${id}`,
        source_node_id: "agent",
        source_port_id: "left",
        target_node_id: id,
        target_port_id: "right",
      });
    });

    if (recipe.subagent_pool.length > 0) {
      const poolXY = pos("pool", POOL_POS.x, POOL_POS.y);
      nodeArr.push({
        id: "pool",
        type: "pool",
        x: poolXY.x,
        y: poolXY.y,
        count: recipe.subagent_pool.length,
        chips: recipe.subagent_pool.map((e) =>
          e.kind === "ref" ? e.template_name : e.name,
        ),
      });
      edgeArr.push({
        id: `e:agent:pool`,
        source_node_id: "agent",
        source_port_id: "right",
        target_node_id: "pool",
        target_port_id: "left",
      });
    }
    return { nodes: nodeArr, edges: edgeArr };
  }, [recipe, positions]);

  const handleNodesChange = (nextNodes) => {
    setPositions((prev) => {
      const next = { ...prev };
      nextNodes.forEach((n) => {
        next[n.id] = { x: n.x, y: n.y };
      });
      return next;
    });
  };

  const renderNode = (node) => {
    const selected = node.id === selectedNodeId;
    if (node.type === "agent")
      return <AgentNode node={node} isDark={isDark} selected={selected} />;
    if (node.type === "toolkit")
      return <ToolkitNode node={node} isDark={isDark} selected={selected} />;
    if (node.type === "pool")
      return (
        <SubagentPoolNode node={node} isDark={isDark} selected={selected} />
      );
    return null;
  };

  const handleAddToolkit = (toolkitId) => {
    if (!recipe) return;
    if (recipe.toolkits.some((t) => t.id === toolkitId)) return;
    onRecipeChange({
      ...recipe,
      toolkits: [...recipe.toolkits, { id: toolkitId, enabled_tools: null }],
    });
  };

  const handleAddPool = () => {
    if (!recipe) return;
    if (recipe.subagent_pool.length > 0) return;
    onRecipeChange({
      ...recipe,
      subagent_pool: [],
    });
  };

  const handleConnect = () => {
    // Edges are derived from recipe arrays; reject manual connects.
  };

  const toolbarBtn = {
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
    background: "transparent",
    color: isDark ? "#ddd" : "#333",
    padding: "4px 10px",
    borderRadius: 7,
    fontSize: 12,
    cursor: "pointer",
  };

  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
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
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          on_nodes_change={handleNodesChange}
          render_node={renderNode}
        />
      </div>

      {/* Floating toolbar — bottom-center */}
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
        <div style={{ position: "relative" }}>
          <button
            style={toolbarBtn}
            onClick={() => setToolkitMenuOpen((o) => !o)}
          >
            + Toolkit
          </button>
          {toolkitMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                minWidth: 180,
                border: `1px solid ${
                  isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"
                }`,
                background: isDark ? "#1e1e22" : "#fff",
                borderRadius: 6,
                fontSize: 12,
                zIndex: 20,
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {toolkitCatalog.length === 0 ? (
                <div style={{ padding: "6px 10px", color: "#888" }}>
                  No toolkits available
                </div>
              ) : (
                toolkitCatalog.map((tk) => {
                  const already = recipe?.toolkits.some((t) => t.id === tk.id);
                  return (
                    <div
                      key={tk.id}
                      onClick={() => {
                        if (already) return;
                        handleAddToolkit(tk.id);
                        setToolkitMenuOpen(false);
                      }}
                      style={{
                        padding: "6px 10px",
                        cursor: already ? "not-allowed" : "pointer",
                        color: already
                          ? "#888"
                          : isDark
                            ? "#ddd"
                            : "#333",
                      }}
                    >
                      {tk.id}
                      {already && " (added)"}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        <button
          style={{
            ...toolbarBtn,
            opacity:
              recipe && recipe.subagent_pool.length === 0 ? 1 : 0.4,
          }}
          onClick={handleAddPool}
          disabled={!recipe || recipe.subagent_pool.length > 0}
        >
          + Subagent Pool
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={{
            ...toolbarBtn,
            background: dirty ? "#4a5bd8" : toolbarBtn.background,
            color: dirty ? "#fff" : toolbarBtn.color,
            borderColor: dirty ? "#4a5bd8" : toolbarBtn.border,
          }}
          onClick={onSave}
          disabled={!dirty}
        >
          Save
        </button>
      </div>
    </div>
  );
}
