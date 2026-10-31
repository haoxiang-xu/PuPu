import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { safe_text } from "../document_values";
import { tool_settings } from "../tool_call_config";

/* A Tool Call on the canvas lists what it is about to do (#352): the tool, and
 * each argument with where its value comes from — a source dot and the
 * upstream field for a bound value, the value itself for a fixed one. The same
 * row language the pool nodes use. One way in on the left, one way out on the
 * right. Nothing here edits; the panel does. */

const MAX_ROWS = 5;

function value_label(binding) {
  const value = binding && binding.value;
  if (!value || typeof value !== "object") return { bound: false, text: "?" };
  if (value.kind === "literal") {
    const text = typeof value.value === "string" ? value.value : JSON.stringify(value.value);
    return { bound: false, text: text === undefined ? "?" : text };
  }
  if (value.kind === "ref") {
    /* The store keeps a draft whose ref names no node or field (its own
       diagnostic says where); that is drawn as unreadable rather than coerced
       into a name it does not have. */
    const parts = Array.isArray(value.path) ? value.path : [];
    const readable = typeof value.node_id === "string" && value.node_id !== ""
      && parts.every((part) => typeof part === "string" || Number.isSafeInteger(part));
    if (!readable) return { bound: true, text: "an unreadable source" };
    return { bound: true, text: parts.length ? `${value.node_id}.${parts.join(".")}` : value.node_id };
  }
  if (value.kind === "first_present") {
    const count = Array.isArray(value.values) ? value.values.length : 0;
    return { bound: true, text: `first of ${count}` };
  }
  return { bound: false, text: "?" };
}

export default function ToolCallNode({ node, isDark }) {
  const tool = tool_settings(node);
  const name = tool && typeof tool.name === "string" && tool.name ? tool.name : null;
  const execution = node && node.config && node.config.execution;
  const rows = execution && Array.isArray(execution.inputs) ? execution.inputs : [];
  const shown = rows.slice(0, MAX_ROWS);
  const overflow = rows.length - shown.length;
  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  const text = isDark ? "#f0f0f3" : "#1d1d22";

  return (
    <div data-testid={`tool-call-node-${node.id}`} style={{ width: 210 }}>
      <PuzzleShape tabs={["right"]} cutouts={["left"]} isDark={isDark}>
        <div style={{ padding: "13px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #f6a341, #ea7547)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="tool" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: name ? "ui-monospace, Menlo, monospace" : undefined }}>
                {name ? safe_text(name) : "Tool call"}
              </div>
              <div style={{ fontSize: 10.5, color: muted, marginTop: 2 }}>
                {name ? "Tool call" : "Tool call · pick a tool"}
              </div>
            </div>
          </div>
          {shown.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", flexDirection: "column", gap: 2 }}>
              {shown.map((binding, index) => {
                const label = value_label(binding);
                return (
                  <div
                    key={index}
                    data-testid={`tool-call-node-${node.id}-row-${index}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "ui-monospace, Menlo, monospace", color: text }}
                  >
                    <span style={{ flexShrink: 0 }}>{safe_text(binding && binding.name)}</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, fontSize: 10.5, color: muted }}>
                      {label.bound && <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: "#9a9aa3", flexShrink: 0 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe_text(label.text)}</span>
                    </span>
                  </div>
                );
              })}
              {overflow > 0 && <div style={{ fontSize: 10.5, color: muted }}>+{overflow} more</div>}
            </div>
          )}
        </div>
      </PuzzleShape>
    </div>
  );
}
