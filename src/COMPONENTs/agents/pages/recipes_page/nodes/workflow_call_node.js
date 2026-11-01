import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { safe_text } from "../document_values";
import { node_bindings } from "../skeleton_document";
import { callee_interface, pinned_reference } from "../workflow_call_config";
import { useWorkflowVersions, workflow_version_state } from "../workflow_versions";

/* A Workflow Call on the canvas (#357): which Workflow, which pinned revision,
 * the values it passes and what comes back. The revision is read through the
 * shared revision table, so the node, the panel and the Output Variables
 * describe the same immutable revision. One way in, one way out; nothing here
 * edits. */

const MAX_ROWS = 4;

export default function WorkflowCallNode({ node, isDark }) {
  const pin = pinned_reference(node);
  useWorkflowVersions(pin ? [pin] : []);
  const state = pin ? workflow_version_state(pin.workflow_id, pin.revision_id) : null;
  const version = state && state.status === "ready" ? state.version : null;
  const shape = version ? callee_interface(version.document) : null;
  const name = (version && typeof version.document.name === "string" && version.document.name) || (pin && pin.workflow_id) || null;
  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const subtitle = !pin
    ? "Workflow call · pin a revision"
    : version
      ? `Workflow call · revision ${version.ordinal}`
      : state && (state.status === "refused" || state.status === "unavailable")
        ? "Workflow call · revision unreadable"
        : "Workflow call · reading the revision…";
  const bindings = node_bindings(node);
  const rows = shape && shape.readable
    ? shape.inputs.map(({ key }) => ({ key, bound: bindings.some((binding) => binding && binding.name === key) }))
    : [];
  const shown = rows.slice(0, MAX_ROWS);
  const overflow = rows.length - shown.length;

  return (
    <div data-testid={`workflow-call-node-${node.id}`} style={{ width: 220 }}>
      <PuzzleShape tabs={["right"]} cutouts={["left"]} isDark={isDark}>
        <div style={{ padding: "13px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #7c8cf5, #4f5fd6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="flow_chart" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name ? safe_text(name) : "Workflow call"}
              </div>
              <div data-testid={`workflow-call-node-${node.id}-revision`} style={{ fontSize: 10.5, color: muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {subtitle}
              </div>
            </div>
          </div>
          {(shown.length > 0 || (shape && shape.readable)) && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", flexDirection: "column", gap: 2 }}>
              {shown.map((row) => (
                <div
                  key={row.key}
                  data-testid={`workflow-call-node-${node.id}-input-${row.key}`}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "ui-monospace, Menlo, monospace", color: text }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe_text(row.key)}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: row.bound ? muted : "#d23f37" }}>{row.bound ? "set" : "missing"}</span>
                </div>
              ))}
              {overflow > 0 && <div style={{ fontSize: 10.5, color: muted }}>+{overflow} more</div>}
              {shape && shape.readable && (
                <div data-testid={`workflow-call-node-${node.id}-exports`} style={{ fontSize: 10.5, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shape.outputs.length ? `→ ${shape.outputs.map((output) => safe_text(output)).join(", ")}` : "→ nothing exported"}
                </div>
              )}
            </div>
          )}
        </div>
      </PuzzleShape>
    </div>
  );
}
