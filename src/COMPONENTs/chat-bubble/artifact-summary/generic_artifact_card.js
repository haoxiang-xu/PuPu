import React, { useContext, useState } from "react";
import SeamlessMarkdown from "../components/seamless_markdown";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import ArtifactKindIcon from "./artifact_kind_icon";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const EXPAND_TRANSITION = "transform 0.22s cubic-bezier(0.32,1,0.32,1)";

const usePalette = (isDark) => {
  const ctx = useContext(ConfigContext);
  const theme = isObject(ctx) ? ctx.theme : null;
  const primary =
    (theme && typeof theme.color === "string" && theme.color) ||
    (isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)");
  const secondary = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const rowBg = isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.035)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const hoverBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  return { primary, secondary, cardBg, rowBg, border, hoverBg };
};

const textValue = (value) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const safeJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
};

const inferRenderer = (snapshot, preferred) => {
  if (["markdown", "text", "table", "kv", "log", "link", "json"].includes(preferred)) {
    return preferred;
  }
  if (typeof snapshot?.markdown === "string") return "markdown";
  if (typeof snapshot?.text === "string") return "text";
  if (Array.isArray(snapshot?.columns) && Array.isArray(snapshot?.rows)) return "table";
  if (isObject(snapshot?.pairs) || Array.isArray(snapshot?.pairs)) return "kv";
  if (typeof snapshot?.url === "string" || typeof snapshot?.path === "string") return "link";
  return "json";
};

const columnLabel = (column) => {
  if (typeof column === "string") return column;
  if (isObject(column)) {
    return textValue(column.label || column.title || column.key || column.name);
  }
  return textValue(column);
};

const columnKey = (column, index) => {
  if (typeof column === "string") return column;
  if (isObject(column)) {
    return textValue(column.key || column.name || column.id || index);
  }
  return String(index);
};

const RenderTable = ({ snapshot, palette }) => {
  const columns = Array.isArray(snapshot?.columns) ? snapshot.columns : [];
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return <FallbackText text={safeJson(snapshot)} palette={palette} />;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12.5,
          color: palette.primary,
        }}
      >
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${columnKey(column, index)}:${index}`}
                style={{
                  textAlign: "left",
                  fontWeight: 500,
                  padding: "6px 8px",
                  borderBottom: `1px solid ${palette.border}`,
                  color: palette.secondary,
                  whiteSpace: "nowrap",
                }}
              >
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => {
                const key = columnKey(column, columnIndex);
                const value = isObject(row)
                  ? row[key]
                  : Array.isArray(row)
                    ? row[columnIndex]
                    : row;
                return (
                  <td
                    key={`${rowIndex}:${key}:${columnIndex}`}
                    style={{
                      padding: "6px 8px",
                      borderBottom: `1px solid ${palette.border}`,
                      verticalAlign: "top",
                    }}
                  >
                    {textValue(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const normalizePairs = (pairs) => {
  if (isObject(pairs)) return Object.entries(pairs);
  if (!Array.isArray(pairs)) return [];
  return pairs
    .map((item, index) => {
      if (Array.isArray(item) && item.length >= 2) return [item[0], item[1]];
      if (isObject(item)) {
        const key = item.key ?? item.name ?? item.label ?? index;
        const value = item.value ?? item.text ?? item;
        return [key, value];
      }
      return [index, item];
    })
    .filter(Boolean);
};

const RenderKv = ({ snapshot, palette }) => {
  const rows = normalizePairs(snapshot?.pairs);
  if (rows.length === 0) return <FallbackText text={safeJson(snapshot)} palette={palette} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(([key, value], index) => (
        <div
          key={`${textValue(key)}:${index}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(96px, 0.35fr) minmax(0, 1fr)",
            gap: 10,
            padding: "5px 8px",
            borderRadius: 6,
            backgroundColor: index % 2 === 0 ? palette.rowBg : "transparent",
            fontSize: 12.5,
          }}
        >
          <span style={{ color: palette.secondary, minWidth: 0 }}>
            {textValue(key)}
          </span>
          <span style={{ color: palette.primary, minWidth: 0, overflowWrap: "anywhere" }}>
            {isObject(value) || Array.isArray(value) ? safeJson(value) : textValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const RenderLink = ({ snapshot, palette }) => {
  const label = textValue(snapshot?.url || snapshot?.path || "");
  if (!label) return <FallbackText text={safeJson(snapshot)} palette={palette} />;
  return (
    <div
      style={{
        color: palette.primary,
        fontSize: 12.5,
        overflowWrap: "anywhere",
      }}
    >
      {label}
    </div>
  );
};

const FallbackText = ({ text, palette }) => (
  <pre
    style={{
      margin: 0,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.45,
      color: palette.primary,
    }}
  >
    {text}
  </pre>
);

const GenericBody = ({ artifact, kindMeta, palette }) => {
  const snapshot = isObject(artifact?.snapshot) ? artifact.snapshot : {};
  const renderer = inferRenderer(snapshot, kindMeta?.fallbackRenderer);

  if (renderer === "markdown") {
    return (
      <SeamlessMarkdown
        content={textValue(snapshot.markdown || snapshot.text)}
        status="done"
        fontSize={13}
        lineHeight={1.55}
        priority="normal"
      />
    );
  }
  if (renderer === "table") {
    return <RenderTable snapshot={snapshot} palette={palette} />;
  }
  if (renderer === "kv") {
    return <RenderKv snapshot={snapshot} palette={palette} />;
  }
  if (renderer === "link") {
    return <RenderLink snapshot={snapshot} palette={palette} />;
  }
  if (renderer === "text" || renderer === "log") {
    return <FallbackText text={textValue(snapshot.text || snapshot.log)} palette={palette} />;
  }
  return <FallbackText text={safeJson(snapshot)} palette={palette} />;
};

const GenericArtifactCard = ({ artifact, kindMeta, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);
  const palette = usePalette(isDark);
  if (!isObject(artifact)) return null;

  const label = kindMeta?.displayName || artifact.kind || "Artifact";
  const title =
    textValue(artifact.title) ||
    textValue(artifact.summary) ||
    textValue(artifact.kind) ||
    "Artifact";

  return (
    <div
      data-testid="generic-artifact-card"
      style={{
        backgroundColor: palette.cardBg,
        borderRadius: 10,
        color: palette.primary,
        overflow: "hidden",
      }}
    >
      <div
        data-testid="generic-artifact-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
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
          backgroundColor: hover ? palette.hoverBg : "transparent",
          transition: "background-color 0.15s ease",
        }}
      >
        <ArtifactKindIcon icon={kindMeta?.icon} color={palette.primary} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 500, lineHeight: 1.2 }}>{label}</span>
          <span
            style={{
              fontSize: 11.5,
              color: palette.secondary,
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
        <Icon
          src="arrow_right"
          color={palette.primary}
          style={{
            width: 14,
            height: 14,
            opacity: 0.4,
            flexShrink: 0,
            marginLeft: "auto",
            transition: EXPAND_TRANSITION,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </div>
      {expanded && (
        <div style={{ padding: "4px 16px 12px 16px" }}>
          <GenericBody artifact={artifact} kindMeta={kindMeta} palette={palette} />
        </div>
      )}
    </div>
  );
};

export default GenericArtifactCard;
