import React, { useState } from "react";
import SeamlessMarkdown from "../components/seamless_markdown";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const PlanCard = ({ artifact, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  if (!isObject(artifact)) return null;
  const snapshot = isObject(artifact.snapshot) ? artifact.snapshot : {};
  const title =
    (typeof artifact.title === "string" && artifact.title) ||
    (typeof snapshot.title === "string" && snapshot.title) ||
    "Untitled plan";
  const status =
    typeof snapshot.status === "string" && snapshot.status
      ? snapshot.status
      : "draft";
  const markdown =
    typeof snapshot.markdown === "string" ? snapshot.markdown : "";
  const truncated = Boolean(snapshot.truncated);
  const totalLines = Number.isFinite(Number(snapshot.total_lines))
    ? Number(snapshot.total_lines)
    : null;
  const displayedLines = Number.isFinite(Number(snapshot.displayed_lines))
    ? Number(snapshot.displayed_lines)
    : null;
  const source = isObject(artifact.source) ? artifact.source : {};
  const sourceLabel =
    (typeof source.relative_path === "string" && source.relative_path) ||
    (typeof source.path === "string" && source.path) ||
    "";

  const border = isDark ? "#6e7681" : "#8c959f";
  const secondary = isDark ? "#8c959f" : "#656d76";

  return (
    <div
      data-testid="plan-card"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 8,
        backgroundColor: "transparent",
      }}
    >
      <div
        data-testid="plan-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span>Plan · {title}</span>
        <span
          style={{
            textTransform: "lowercase",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 3,
            backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            color: secondary,
            marginLeft: 8,
          }}
        >
          {status}
        </span>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${border}`, padding: "8px 12px" }}>
          <SeamlessMarkdown
            content={markdown}
            status="done"
            fontSize={13}
            lineHeight={1.55}
            priority="normal"
          />
          {truncated && totalLines !== null && displayedLines !== null && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px solid ${border}`,
                fontSize: 11.5,
                color: secondary,
              }}
            >
              Truncated · {displayedLines} / {totalLines} lines
              {sourceLabel && (
                <div style={{ marginTop: 2 }}>Source: {sourceLabel}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlanCard;
