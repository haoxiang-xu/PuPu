import React from "react";

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function SubagentPoolPanel({ node, recipe, onChange, isDark }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          S
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Subagent Pool</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Subagents</span>
        {(node.subagents || []).map((s, i) => {
          const label = s.kind === "ref" ? s.template_name : s.name;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.025)",
                fontSize: 11.5,
              }}
            >
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                {label}
              </span>
              <span
                style={{ fontSize: 10, color: "#86868b", marginLeft: "auto" }}
              >
                {s.kind}
              </span>
            </div>
          );
        })}
        {(node.subagents || []).length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>
            No subagents configured.
          </span>
        )}
      </div>
    </>
  );
}
