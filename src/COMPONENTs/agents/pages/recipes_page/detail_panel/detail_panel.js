import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import StartPanel from "./start_panel";
import EndPanel from "./end_panel";
import AgentPanel from "./agent_panel";
import ToolPoolPanel from "./toolpool_panel";
import SubagentPoolPanel from "./subagent_pool_panel";
import { node_identity } from "./node_identity";
import InputVariablesSection from "./input_variables_section";
import SkeletonDiagnosticsNotice from "./skeleton_diagnostics_notice";
import { find_node, is_skeleton_node } from "../skeleton_document";
import { is_toolkit_pool_type } from "../recipe_graph";

/* The shell: a fixed identity header above a hairline, and a body that is the
 * only thing that scrolls. Every node type sits inside it, so the header no
 * longer scrolls away with whatever the panel happens to be showing. */

export default function DetailPanel({
  recipe,
  selectedNodeId,
  onChange,
  onChangeSilent,
  recipes,
  onDrillIn,
  document,
  diagnostics,
  onDocumentChange,
}) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const node = recipe?.nodes?.find((n) => n.id === selectedNodeId);
  const identity = node_identity(node);

  const shell_style = {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  };

  const body_style = {
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
      <div style={shell_style} data-testid="recipe-detail-panel">
        <div
          className="scrollable"
          data-sb-wall="4"
          data-sb-edge="2"
          data-sb-edge-top="36"
          data-sb-edge-bottom="12"
          data-testid="recipe-detail-panel-body"
          style={{
            ...body_style,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 12, color: "#86868b" }}>
            Select a node to edit.
          </div>
        </div>
      </div>
    );
  }

  /* The same node as seen in the Skeleton document, when one is being edited.
     `onDocumentChange` is what writes it back, so the legacy `onChange` path is
     left exactly as it was. */
  const skeleton_node =
    document && typeof onDocumentChange === "function"
      ? (() => {
          const candidate = find_node(document, selectedNodeId);
          return is_skeleton_node(candidate) ? candidate : null;
        })()
      : null;

  const props = {
    recipe,
    node,
    onChange,
    onChangeSilent,
    isDark,
    recipes,
    onDrillIn,
  };

  return (
    <div style={shell_style} data-testid="recipe-detail-panel">
      {identity && (
        <div
          data-testid="recipe-detail-panel-header"
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px 12px",
            borderBottom: `1px solid ${
              isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
            }`,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: identity.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon
              src={identity.icon}
              color="#fff"
              style={{ width: 14, height: 14 }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: isDark ? "#e6e6e6" : "#222",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {identity.title}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#86868b",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {identity.subtitle}
            </div>
          </div>
        </div>
      )}

      <div
        className="scrollable"
        data-sb-wall="4"
        data-sb-edge="2"
        data-sb-edge-top="36"
        data-sb-edge-bottom="12"
        data-testid="recipe-detail-panel-body"
        style={body_style}
      >
        {/* A Skeleton document carries its IO in each node's own config, so the
            shared sections render from it. Without one — a legacy recipe, which
            has no such config — nothing below changes. */}
        {skeleton_node && (
          <>
            <SkeletonDiagnosticsNotice
              document={document}
              diagnostics={diagnostics}
              nodeId={node.id}
              isDark={isDark}
            />
            <InputVariablesSection
              document={document}
              node={skeleton_node}
              diagnostics={diagnostics}
              isDark={isDark}
              onChange={onDocumentChange}
            />
          </>
        )}
        {node.type === "start" && <StartPanel {...props} />}
        {node.type === "end" && <EndPanel {...props} />}
        {node.type === "agent" && <AgentPanel {...props} />}
        {is_toolkit_pool_type(node.type) && <ToolPoolPanel {...props} />}
        {node.type === "subagent_pool" && <SubagentPoolPanel {...props} />}
      </div>
    </div>
  );
}
