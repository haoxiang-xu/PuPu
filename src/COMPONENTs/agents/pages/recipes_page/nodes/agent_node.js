import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { safe_text } from "../document_values";

/* Workflow agent node — left in, right out, top + bottom attach. */

export default function AgentNode({ node, isDark }) {
  /* Both through `safe_text`: what is stored here is whatever was stored, and
     a value that refuses to become text threw "Objects are not valid as a
     React child" out of these two lines, taking the whole page with it. A
     Skeleton node arrives with neither — they are not part of a node, and the
     canvas hands this the node the store defines — so it draws by its id.
     `model` and `override.model` are the same read and are guarded together,
     because fixing one of them is how this came back. */
  const label = safe_text(node.label || node.id);
  const model = safe_text(node.model || node.override?.model || "—");

  return (
    <div style={{ width: 180 }}>
      <PuzzleShape
        tabs={["right", "top", "bottom"]}
        cutouts={["left", "top", "bottom"]}
        isDark={isDark}
      >
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #6478f6, #4a5bd8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="bot" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.15,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#a8a8b0" : "#6b6b73",
                  marginTop: 2,
                }}
              >
                {model}
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
