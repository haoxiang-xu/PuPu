import React from "react";
import PuzzleShape from "./puzzle_shape";

/* Workflow agent node — left in, right out, top + bottom attach. */

export default function AgentNode({ node, isDark }) {
  const label = node.label || node.id;
  const model = node.model || node.override?.model || "—";

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
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              A
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
