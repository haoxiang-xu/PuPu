import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
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
  const muted = "var(--pupu-text-muted)";
  const text = "var(--pupu-text)";

  return (
    <div data-testid={`skill-read-node-${node.id}`} style={{ width: 210 }}>
      <PuzzleShape tabs={["right"]} cutouts={["left"]} isDark={isDark}>
        <div style={{ padding: "13px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #4fbf87, #2e9a63)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="book_open" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: name ? "ui-monospace, Menlo, monospace" : undefined }}>
                {node_display_title(node, name ? safe_text(name) : t("agents.nodes.skill_read"))}
              </div>
              <div style={{ fontSize: 10.5, color: muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name ? t("agents.nodes.skill_read_source", { source: source_label(identity.source, t) }) : t("agents.nodes.skill_read_pick")}
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
