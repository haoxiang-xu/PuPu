import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { is_skeleton_node } from "../skeleton_document";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import { safe_text } from "../document_values";
import AgentAvatar from "../../../agent_avatar";
import { normalize_presentation } from "../../../../../SERVICEs/agent_resource_icons";
import NodeHeader, { NodeBody } from "./node_header";
import { NODE_ICON_GLYPH, NODE_ICON_RADIUS, NODE_ICON_SIZE, NODE_PORT_ANCHOR } from "./node_metrics";

/* Workflow agent node — left in, right out, top + bottom attach. */

/* `presentation` is the Agent document's own icon and colour, handed in by a
   canvas that is drawing an Agent resource: the Agent node there IS that
   Agent. Without one it is drawn as every Agent node always was. */
export default function AgentNode({ node, isDark, presentation }) {
  const { t } = useTranslation();
  /* Native display metadata uses the common validator. Legacy labels and
     model hints keep their existing guarded text readers. */
  /* A native Agent without a name of its own reads as its type, "Agent" —
     never as its internal id. */
  const label = is_skeleton_node(node) ? node_display_title(node, t("agents.nodes.agent")) : safe_text(node.label || node.id);
  const model = safe_text(node.model || node.override?.model || "—");

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
            glyph={normalize_presentation(presentation) ? (
              <AgentAvatar presentation={presentation} size={NODE_ICON_SIZE} radius={NODE_ICON_RADIUS} glyphScale={NODE_ICON_GLYPH / NODE_ICON_SIZE} testid="agent-node-avatar" />
            ) : null}
            title={label}
            subtitle={model}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
