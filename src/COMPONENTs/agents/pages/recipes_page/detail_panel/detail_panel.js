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
import SkeletonDiagnostics from "./skeleton_diagnostics_notice";
import OutputSchemaSection from "./output_schema_section";
import SubagentPoolSection from "./subagent_pool_section";
import OutputVariablesSection from "./output_variables_section";
import {
  find_node,
  is_skeleton_node,
  node_bindings,
  node_output_mappings,
} from "../skeleton_document";
import { route_diagnostics } from "../skeleton_diagnostics";
import { is_toolkit_pool_type } from "../recipe_graph";

/* The shell: a fixed identity header above a hairline, and a body that is the
 * only thing that scrolls. Every node type sits inside it, so the header no
 * longer scrolls away with whatever the panel happens to be showing. */

export default function DetailPanel({
  recipe,
  selectedNodeId,
  onChange,
  onChangeSilent,
  /* Converting a legacy Subagent Pool writes the stored resource rather than
     the document on screen, so the page that owns the session performs it. */
  onConvertLegacy,
  canConvertLegacy,
  convertingLegacy,
  recipes,
  onDrillIn,
  document,
  diagnostics,
  onDocumentChange,
}) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
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

  /* A Skeleton page has no legacy recipe at all, so the panel takes its node
     from whichever model it was handed. Deriving it only from the recipe left
     that page on the empty state with a document sitting right there. */
  const legacy_node = recipe?.nodes?.find((n) => n.id === selectedNodeId);
  const node = legacy_node || skeleton_node;
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

  /* Routed once, here, because this is the only place that knows both which
     node is open and which rows it actually renders.

     The counts are rows with a renderer, NOT entries in the document. Both
     sections now draw a row per entry, so both counts are the real lengths —
     but the distinction still holds and still has to be kept: a count passed
     for a section nobody renders hands its diagnostics to rows that are never
     drawn, and they are then reported nowhere at all. The legacy Start and End
     panels read the old `node.outputs` / `outputs_schema` rather than Skeleton
     mappings, and they are not what these counts describe. */
  const routed = skeleton_node
    ? route_diagnostics(diagnostics, document, {
        node_id: skeleton_node.id,
        row_counts: {
          inputs: node_bindings(skeleton_node).length,
          outputs: node_output_mappings(skeleton_node).length,
        },
      })
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
            <SkeletonDiagnostics
              document={document}
              diagnostics={diagnostics}
              nodeId={skeleton_node.id}
              rowCounts={routed.row_counts}
              isDark={isDark}
            />
            {/* A pool attaches to a Kernel rather than running in the flow,
                so it carries no execution IO at all — the sections around
                this one render nothing for it — and what it does carry is
                invisible to every boundary before Run. */}
            {skeleton_node.type === "subagent_pool" && (
              <SubagentPoolSection
                document={document}
                node={skeleton_node}
                isDark={isDark}
                onChange={onDocumentChange}
                onConvertLegacy={onConvertLegacy}
                canConvertLegacy={canConvertLegacy}
                convertingLegacy={convertingLegacy}
              />
            )}
            <InputVariablesSection
              document={document}
              node={skeleton_node}
              rowDiagnostics={routed.rows.inputs}
              isDark={isDark}
              onChange={onDocumentChange}
            />
            {/* Between them, and only for an Agent: a schema declares what
                this node's own result holds, which is what the output rows
                below then offer as sources. Read downwards it is what the node
                is given, what it produces, what it passes on. */}
            {skeleton_node.type === "agent" && (
              <OutputSchemaSection
                document={document}
                node={skeleton_node}
                isDark={isDark}
                onChange={onDocumentChange}
              />
            )}
            {/* Inputs at the top, outputs at the bottom: a node is read
                downwards, and the order is the same in every panel so the two
                halves of a wire are always found in the same place. */}
            <OutputVariablesSection
              document={document}
              node={skeleton_node}
              rowDiagnostics={routed.rows.outputs}
              isDark={isDark}
              onChange={onDocumentChange}
            />
          </>
        )}
        {legacy_node && node.type === "start" && <StartPanel {...props} />}
        {legacy_node && node.type === "end" && <EndPanel {...props} />}
        {legacy_node && node.type === "agent" && <AgentPanel {...props} />}
        {legacy_node && is_toolkit_pool_type(node.type) && <ToolPoolPanel {...props} />}
        {legacy_node && node.type === "subagent_pool" && <SubagentPoolPanel {...props} />}
      </div>
    </div>
  );
}
