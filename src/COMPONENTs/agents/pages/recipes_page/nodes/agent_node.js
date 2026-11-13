import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { is_skeleton_node } from "../skeleton_document";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import { safe_text } from "../document_values";
import { node_caption } from "./node_caption";
import NodeHeader, { NodeBody } from "./node_header";
import { NODE_PORT_ANCHOR } from "./node_metrics";

/* Workflow agent node — left in, right out, top + bottom attach. */

/* An Agent node is a node type with a fixed identity: the bot on the Agent
   blue, always. An Agent resource's own icon (its document's `presentation`)
   belongs to the resource in the Explorer and never changes this node. */
export default function AgentNode({ node, isDark, rename }) {
  const { t } = useTranslation();
  /* Native display metadata uses the common validator. Legacy labels and
     model hints keep their existing guarded text readers. */
  /* A native Agent without a name of its own reads as its type, "Agent" —
     never as its internal id. */
  const label = is_skeleton_node(node) ? node_display_title(node, t("agents.nodes.agent")) : safe_text(node.label || node.id);
  /* The model, when one is named; nothing otherwise (the line then says
     only what the node is). */
  const model = safe_text(node.model || node.override?.model || "");

  return (
    <div style={{ width: 180 }}>
      <PuzzleShape
        tabs={["right", "top", "bottom"]}
        cutouts={["left", "top", "bottom"]}
        anchor={NODE_PORT_ANCHOR}
        isDark={isDark}
      >
        <NodeBody>
          <NodeHeader
            src="bot"
            tile={{ background: "#4a5bd8" }}
            title={label}
            subtitle={node_caption({ type: "agent", title: label, summary: model }, t)}
            rename={rename}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
