import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import NodeHeader from "./node_header";
import { BRANCH_ROW_HEIGHT, NODE_PADDING_X, NODE_PADDING_Y, NODE_PORT_ANCHOR, branch_layout } from "./node_metrics";
import { safe_text } from "../document_values";

/* If / Else and Switch / Case on the canvas (#351).
 *
 * One row per outlet, each aligned with its port, the outlet's label sitting
 * where its edge starts. The node draws the shared header at the shared place
 * — its inlet on the header's centre line, level with Start's and Agent's
 * ports — and `branch_layout` places the rows: centred on the inlet while they
 * fit in the minimum height (one outlet runs straight through, two sit evenly
 * above and below it), from the top once they do not, the node growing by a
 * row each. Each outlet port is anchored on its row's centre by
 * `branch_ports`, from the same layout, so a row and its port cannot drift.
 *
 * A row for an outlet the node no longer declares (a case removed while an
 * edge still leaves through it) is drawn and marked, never hidden: a hidden
 * edge reads as an edge that does not exist, and this one stops the run. */

const IDENTITY = {
  if_else: { icon: "branch", title: "If / Else" },
  switch_case: { icon: "switch_node", title: "Switch / Case" },
};

export default function BranchNode({ node, rows, summary, isDark }) {
  const { t } = useTranslation();
  const identity = IDENTITY[node.type] || IDENTITY.if_else;
  const list = Array.isArray(rows) ? rows : [];
  const layout = branch_layout(list.length);
  const height = layout.height;
  /* No height on the outer box: the rows give the node its height, and
     PuzzleShape springs it when a case is added or removed. */
  return (
    <div data-testid={`branch-node-${node.id}`} style={{ width: 236 }}>
      {/* One bump per outlet on the right, each on its own row's line, so the
          port dot sits on a tab exactly as on the other nodes. */}
      <PuzzleShape tabs={layout.anchors.map((y) => ({ side: "right", y }))} cutouts={["left"]} anchor={NODE_PORT_ANCHOR} isDark={isDark}>
        <div data-branch-body="" style={{ display: "flex", height, boxSizing: "border-box" }}>
          <div style={{ flex: 1, minWidth: 0, padding: `${NODE_PADDING_Y}px 8px 0 ${NODE_PADDING_X}px` }}>
            <NodeHeader
              src={identity.icon}
              tile={{ background: "#1d8798" }}
              title={node_display_title(node, node.type === "switch_case" ? t("agents.nodes.switch_case") : t("agents.nodes.if_else"))}
              subtitle={safe_text(summary || "")}
              subtitleProps={{ "data-testid": `branch-node-${node.id}-summary` }}
            />
          </div>
          <div style={{
            display: "flex", flexDirection: "column", flexShrink: 0, maxWidth: 104,
            paddingTop: layout.top, boxSizing: "border-box", height,
          }}>
            {list.map((row, index) => (
              <div key={`${index}:${row.port_id}`} data-testid={`branch-row-${node.id}-${index}`}
                data-port-row={row.port_id}
                title={row.declared ? undefined : t("agents.nodes.outlet_undeclared")}
                style={{ height: BRANCH_ROW_HEIGHT, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 10, minWidth: 0 }}>
                <span style={{
                  fontSize: 10.5, lineHeight: "16px", padding: "0 7px", borderRadius: 8, maxWidth: 94,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: row.declared ? "var(--pupu-text)" : "var(--pupu-danger)",
                  background: row.declared ? "var(--pupu-overlay-hover)" : "transparent",
                  border: row.declared ? "1px solid transparent" : "1px dashed var(--pupu-danger-tint-border)",
                }}>
                  {safe_text(row.label)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
