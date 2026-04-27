import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartPanel from "./start_panel";
import EndPanel from "./end_panel";
import AgentPanel from "./agent_panel";
import ToolPoolPanel from "./toolpool_panel";
import SubagentPoolPanel from "./subagent_pool_panel";
import { is_toolkit_pool_type } from "../recipe_graph";

export default function DetailPanel({
  recipe,
  selectedNodeId,
  onChange,
  onChangeSilent,
}) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const node = recipe?.nodes?.find((n) => n.id === selectedNodeId);

  const wrapper_style = {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  if (!node) {
    return (
      <div
        style={{
          ...wrapper_style,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#86868b" }}>
          Select a node to edit.
        </div>
      </div>
    );
  }

  const props = { recipe, node, onChange, onChangeSilent, isDark };

  return (
    <div style={wrapper_style}>
      {node.type === "start" && <StartPanel {...props} />}
      {node.type === "end" && <EndPanel {...props} />}
      {node.type === "agent" && <AgentPanel {...props} />}
      {is_toolkit_pool_type(node.type) && <ToolPoolPanel {...props} />}
      {node.type === "subagent_pool" && <SubagentPoolPanel {...props} />}
    </div>
  );
}
