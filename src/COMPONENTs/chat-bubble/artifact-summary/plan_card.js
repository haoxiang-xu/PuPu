import React, { useContext, useState } from "react";
import SeamlessMarkdown from "../components/seamless_markdown";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import ArtifactKindIcon from "./artifact_kind_icon";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const EXPAND_TRANSITION = "transform 0.22s cubic-bezier(0.32,1,0.32,1)";

const PlanCard = ({ artifact, isDark, kindMeta }) => {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);
  const ctx = useContext(ConfigContext);
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
  const displayName =
    (typeof kindMeta?.displayName === "string" && kindMeta.displayName) ||
    "Plan";

  const theme = isObject(ctx) ? ctx.theme : null;
  const primary =
    (theme && typeof theme.color === "string" && theme.color) ||
    (isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)");
  const secondary = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const chipBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const hoverBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  return (
    <div
      data-testid="plan-card"
      style={{
        backgroundColor: cardBg,
        borderRadius: 10,
        color: primary,
        overflow: "hidden",
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
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: "12px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 13,
          backgroundColor: hover ? hoverBg : "transparent",
          transition: "background-color 0.15s ease",
        }}
      >
        <ArtifactKindIcon
          icon={kindMeta?.icon || { type: "builtin", name: "check_list" }}
          color={primary}
        />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 500, lineHeight: 1.2 }}>{displayName}</span>
          <span
            style={{
              fontSize: 11.5,
              color: secondary,
              lineHeight: 1.3,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
        </div>
        <span
          style={{
            textTransform: "lowercase",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 3,
            backgroundColor: chipBg,
            color: secondary,
            marginLeft: "auto",
          }}
        >
          {status}
        </span>
        <Icon
          src="arrow_right"
          color={primary}
          style={{
            width: 14,
            height: 14,
            opacity: 0.4,
            flexShrink: 0,
            transition: EXPAND_TRANSITION,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </div>
      {expanded && (
        <div style={{ padding: "4px 16px 12px 16px" }}>
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
                marginTop: 10,
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
