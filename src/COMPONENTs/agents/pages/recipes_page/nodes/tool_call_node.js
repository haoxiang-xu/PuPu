import { agentEnglishText } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import { node_caption } from "./node_caption";
import NodeHeader, { NodeBody } from "./node_header";
import { NODE_PORT_ANCHOR } from "./node_metrics";
import { safe_text } from "../document_values";
import { tool_settings } from "../tool_call_config";

/* A Tool Call on the canvas lists what it is about to do (#352): the tool, and
 * each argument with where its value comes from — a source dot and the
 * upstream field for a bound value, the value itself for a fixed one. The same
 * row language the pool nodes use. One way in on the left, one way out on the
 * right. Nothing here edits; the panel does. */

const MAX_ROWS = 5;

function value_label(binding, t = agentEnglishText) {
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
    if (!readable) return { bound: true, text: t("agents.nodes.unreadable_source") };
    return { bound: true, text: parts.length ? `${value.node_id}.${parts.join(".")}` : value.node_id };
  }
  if (value.kind === "first_present") {
    const count = Array.isArray(value.values) ? value.values.length : 0;
    return { bound: true, text: t("agents.nodes.first_of", { count }) };
  }
  return { bound: false, text: "?" };
}

export default function ToolCallNode({ node, isDark, rename }) {
  const { t } = useTranslation();
  const tool = tool_settings(node);
  const name = tool && typeof tool.name === "string" && tool.name ? tool.name : null;
  const execution = node && node.config && node.config.execution;
  const rows = execution && Array.isArray(execution.inputs) ? execution.inputs : [];
  const shown = rows.slice(0, MAX_ROWS);
  const overflow = rows.length - shown.length;
  const muted = "var(--pupu-text-muted)";
  const text = "var(--pupu-text)";
  /* Unnamed, the node is titled by its tool in the code typeface; once the
     author names it, the tool moves to the line below. */
  const named = node_display_title(node, "") !== "";
  const title = node_display_title(node, name ? safe_text(name) : t("agents.nodes.tool_call"));

  return (
    <div data-testid={`tool-call-node-${node.id}`} style={{ width: 210 }}>
      <PuzzleShape tabs={["right"]} cutouts={["left"]} anchor={NODE_PORT_ANCHOR} isDark={isDark}>
        <NodeBody>
          <NodeHeader
            src="tool"
            tile={{ background: "#ea7547" }}
            title={title}
            titleStyle={name && !named ? { fontFamily: "ui-monospace, Menlo, monospace" } : undefined}
            subtitle={node_caption({ type: "tool_call", title, summary: name ? safe_text(name) : t("agents.nodes.pick_tool") }, t)}
            rename={rename}
          />
          {shown.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--pupu-border-subtle)", display: "flex", flexDirection: "column", gap: 2 }}>
              {shown.map((binding, index) => {
                const label = value_label(binding, t);
                return (
                  <div
                    key={index}
                    data-testid={`tool-call-node-${node.id}-row-${index}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "ui-monospace, Menlo, monospace", color: text }}
                  >
                    <span style={{ flexShrink: 0 }}>{safe_text(binding && binding.name)}</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, fontSize: 10.5, color: muted }}>
                      {label.bound && <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--pupu-text-muted)", flexShrink: 0 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe_text(label.text)}</span>
                    </span>
                  </div>
                );
              })}
              {overflow > 0 && <div style={{ fontSize: 10.5, color: muted }}>{t("agents.nodes.more", { count: overflow })}</div>}
            </div>
          )}
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
