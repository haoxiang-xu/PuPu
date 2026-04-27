import React from "react";
import PuzzleShape from "./puzzle_shape";

export default function SubagentPoolNode({ node, isDark }) {
  const count = (node.subagents || []).length;
  return (
    <div style={{ width: 180 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              S
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                }}
              >
                Subagent Pool
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#a8a8b0" : "#6b6b73",
                  marginTop: 2,
                }}
              >
                {count} subagents
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
