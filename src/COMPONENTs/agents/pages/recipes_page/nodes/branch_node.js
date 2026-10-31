import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { safe_text } from "../document_values";

/* If / Else and Switch / Case on the canvas (#351).
 *
 * One row per outlet, each aligned with its port, the outlet's label sitting
 * where its edge starts. FlowEditor spaces a side's ports evenly — port i of n
 * sits at (i + 1) / (n + 1) of the node's height — and no renderer change is
 * needed for that: the right column is n rows of one height with half a row
 * above and below, which puts every row's centre exactly on its port. The
 * header lives in the left column, centred on the single inlet.
 *
 * A row for an outlet the node no longer declares (a case removed while an
 * edge still leaves through it) is drawn and marked, never hidden: a hidden
 * edge reads as an edge that does not exist, and this one stops the run. */

export const BRANCH_ROW_HEIGHT = 26;

const IDENTITY = {
  if_else: { icon: "branch", title: "If / Else" },
  switch_case: { icon: "switch_case", title: "Switch / Case" },
};

export default function BranchNode({ node, rows, summary, isDark }) {
  const identity = IDENTITY[node.type] || IDENTITY.if_else;
  const list = Array.isArray(rows) ? rows : [];
  const height = (Math.max(list.length, 1) + 1) * BRANCH_ROW_HEIGHT;
  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  return (
    <div data-testid={`branch-node-${node.id}`} style={{ width: 236, height }}>
      <PuzzleShape tabs={[]} cutouts={["left"]} isDark={isDark}>
        <div style={{ display: "flex", height, boxSizing: "border-box" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 8px 0 18px" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 9, flexShrink: 0,
              background: "linear-gradient(135deg, #2fb2c4, #1d8798)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon src={identity.icon} color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.15, color: isDark ? "#f0f0f3" : "#1d1d22", whiteSpace: "nowrap" }}>
                {identity.title}
              </div>
              <div data-testid={`branch-node-${node.id}-summary`} style={{
                fontSize: 10.5, color: muted, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {safe_text(summary || "")}
              </div>
            </div>
          </div>
          <div style={{
            display: "flex", flexDirection: "column", flexShrink: 0, maxWidth: 104,
            paddingTop: BRANCH_ROW_HEIGHT / 2, paddingBottom: BRANCH_ROW_HEIGHT / 2, boxSizing: "border-box", height,
          }}>
            {list.map((row, index) => (
              <div key={`${index}:${row.port_id}`} data-testid={`branch-row-${node.id}-${index}`}
                data-port-row={row.port_id}
                title={row.declared ? undefined : "This outlet is not declared any more. Its connection stops the run; delete it or add the case back."}
                style={{ height: BRANCH_ROW_HEIGHT, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 10, minWidth: 0 }}>
                <span style={{
                  fontSize: 10.5, lineHeight: "16px", padding: "0 7px", borderRadius: 8, maxWidth: 94,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: row.declared ? (isDark ? "#d8d8de" : "#3a3a42") : (isDark ? "#ff9b9b" : "#b02020"),
                  background: row.declared ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "transparent",
                  border: row.declared ? "1px solid transparent" : `1px dashed ${isDark ? "rgba(255,155,155,0.6)" : "rgba(176,32,32,0.5)"}`,
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
