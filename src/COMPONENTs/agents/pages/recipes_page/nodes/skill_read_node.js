import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import NodeHeader, { NodeBody } from "./node_header";
import { NODE_PORT_ANCHOR } from "./node_metrics";
import { safe_text } from "../document_values";
import { skill_identity, source_label } from "../skill_read_config";

/* A Skill Read on the canvas (#352): the skill it reads and where that skill
 * lives. Its content is not shown here — it is read when the run gets here,
 * and the panel's preview is the place to look at it. One way in on the left,
 * one way out on the right. Nothing here edits; the panel does. */

export default function SkillReadNode({ node, isDark }) {
  const { t } = useTranslation();
  const identity = skill_identity(node);
  const name = identity && typeof identity.name === "string" && identity.name ? identity.name : null;

  return (
    <div data-testid={`skill-read-node-${node.id}`} style={{ width: 210 }}>
      <PuzzleShape tabs={["right"]} cutouts={["left"]} anchor={NODE_PORT_ANCHOR} isDark={isDark}>
        <NodeBody>
          <NodeHeader
            src="book_open"
            tile={{ background: "#2e9a63" }}
            title={node_display_title(node, name ? safe_text(name) : t("agents.nodes.skill_read"))}
            titleStyle={name ? { fontFamily: "ui-monospace, Menlo, monospace" } : undefined}
            subtitle={name ? t("agents.nodes.skill_read_source", { source: source_label(identity.source, t) }) : t("agents.nodes.skill_read_pick")}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
