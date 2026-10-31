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
  const identity = skill_identity(node);
  const name = identity && typeof identity.name === "string" && identity.name ? identity.name : null;
  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  const text = isDark ? "#f0f0f3" : "#1d1d22";

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
                {name ? safe_text(name) : "Skill read"}
              </div>
              <div style={{ fontSize: 10.5, color: muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name ? `Skill read · ${source_label(identity.source)}` : "Skill read · pick a skill"}
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
