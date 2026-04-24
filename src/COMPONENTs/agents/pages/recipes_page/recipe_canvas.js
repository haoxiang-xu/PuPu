import { useContext, useMemo, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
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
  const { theme } = useContext(ConfigContext);
  const [allToolkits, setAllToolkits] = useState([]);

  const { nodes, edges } = useMemo(() => {
    if (!recipe) return { nodes: [], edges: [] };
    const nodeArr = [];
    const edgeArr = [];

    nodeArr.push({
      id: "agent",
      type: "agent",
      x: AGENT_POS.x,
      y: AGENT_POS.y,
      label: recipe.name,
      model: recipe.model,
    });

    recipe.toolkits.forEach((tk, idx) => {
      const id = `tk:${tk.id}`;
      const y = 100 + idx * 140;
      nodeArr.push({
        id,
        type: "toolkit",
        x: TOOLKIT_COL_X,
        y,
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
      nodeArr.push({
        id: "pool",
        type: "pool",
        x: POOL_POS.x,
        y: POOL_POS.y,
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
  }, [recipe]);

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
    background: isDark ? "#1e1e22" : "#fff",
    color: isDark ? "#ddd" : "#333",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          style={toolbarBtn}
          onClick={() => {
            const id = window.prompt("Toolkit id (core/workspace/terminal):");
            if (id) handleAddToolkit(id);
          }}
        >
          + Toolkit
        </button>
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

      <div style={{ flex: 1, minHeight: 480, position: "relative" }}>
        <FlowEditor
          style={{
            width: "100%",
            height: "100%",
            minHeight: 480,
            background: isDark ? "#16161a" : "#fafafb",
            borderRadius: 6,
          }}
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          render_node={renderNode}
        />
      </div>
    </div>
  );
}
