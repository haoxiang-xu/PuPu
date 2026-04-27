/**
 * CodeDiffInteract – Approve / Reject with an inline unified diff preview.
 *
 * Props (standardised by InteractWrapper):
 *   config   – interact_config payload
 *     { title, operation, path, unified_diff, truncated,
 *       total_lines, displayed_lines, fallback_description }
 *   onSubmit – called with { approved: boolean, scope: "once" }
 *   uiState  – { status, error, resolved, decision }
 *   isDark   – theme flag
 *   disabled – true when the interaction has already been submitted
 *
 * Does NOT support the "Always allow" (scope: "session") fast-lane.
 * See docs/superpowers/specs/2026-04-13-unchain-code-diff-ui-design.md §3.5.
 */

import { useMemo } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

const FONT = "Menlo, Monaco, Consolas, monospace";

const hexToRgba = (hex, a) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const ACTION_BUTTON_WIDTH = 96;

const buildActionStyle = (accent) => ({
  width: ACTION_BUTTON_WIDTH,
  color: accent,
  backgroundColor: hexToRgba(accent, 0.14),
  fontSize: 11.5,
  fontFamily: FONT,
  borderRadius: 6,
  paddingVertical: 6,
  paddingHorizontal: 10,
  hoverBackgroundColor: hexToRgba(accent, 0.18),
  activeBackgroundColor: hexToRgba(accent, 0.28),
});

function parseDiffLines(unifiedDiff) {
  if (!unifiedDiff || typeof unifiedDiff !== "string") return [];
  const rows = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  const lines = unifiedDiff.split("\n");
  let sawHunk = false;
  for (const raw of lines) {
    if (raw.length === 0) continue;
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      rows.push({ kind: "file-header", text: raw });
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLineNo = parseInt(m[1], 10);
        newLineNo = parseInt(m[2], 10);
      }
      sawHunk = true;
      rows.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      rows.push({ kind: "added", text: raw, oldNo: "", newNo: newLineNo });
      newLineNo += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      rows.push({ kind: "removed", text: raw, oldNo: oldLineNo, newNo: "" });
      oldLineNo += 1;
      continue;
    }
    if (raw.startsWith(" ")) {
      rows.push({
        kind: "context",
        text: raw,
        oldNo: oldLineNo,
        newNo: newLineNo,
      });
      oldLineNo += 1;
      newLineNo += 1;
      continue;
    }
  }
  if (!sawHunk) return null;
  return rows;
}

function countPlusMinus(unifiedDiff) {
  if (!unifiedDiff) return { plus: 0, minus: 0 };
  let plus = 0;
  let minus = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
  }
  return { plus, minus };
}

const DiffBody = ({ unifiedDiff, isDark }) => {
  const rows = useMemo(() => parseDiffLines(unifiedDiff), [unifiedDiff]);
  if (rows === null || rows === undefined) {
    return (
      <pre
        data-testid="code-diff-fallback-pre"
        className="scrollable"
        style={{
          fontFamily: FONT,
          fontSize: 12,
          whiteSpace: "pre",
          padding: 8,
          margin: 0,
          backgroundColor: isDark ? "#0d1117" : "#f6f8fa",
          color: isDark ? "#e8e8e8" : "#1f2328",
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: 480,
          borderRadius: 12,
        }}
      >
        {unifiedDiff || "(no changes)"}
      </pre>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        style={{
          fontSize: 11.5,
          fontStyle: "italic",
          color: isDark ? "#8c959f" : "#656d76",
          padding: 8,
          fontFamily: FONT,
        }}
      >
        (no changes)
      </div>
    );
  }
  return (
    <div
      className="scrollable"
      style={{
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.55,
        backgroundColor: isDark ? "#0d1117" : "#f6f8fa",
        borderRadius: 12,
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: 480,
      }}
    >
      {rows.map((row, idx) => {
        let bg = "transparent";
        let fg = isDark ? "#e8e8e8" : "#1f2328";
        if (row.kind === "added") {
          bg = isDark ? "#0d331a" : "#e6ffec";
        } else if (row.kind === "removed") {
          bg = isDark ? "#3a0d13" : "#ffebe9";
        } else if (row.kind === "hunk") {
          bg = isDark ? "#0c2a4d" : "#ddf4ff";
          fg = isDark ? "#79c0ff" : "#0969da";
        } else if (row.kind === "file-header") {
          fg = isDark ? "#8c959f" : "#8c959f";
        }
        return (
          <div
            key={idx}
            data-diff-kind={row.kind}
            style={{
              display: "flex",
              padding: "0 8px",
              whiteSpace: "pre",
              backgroundColor: bg,
              color: fg,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: isDark ? "#6e7681" : "#8c959f",
                userSelect: "none",
              }}
            >
              {row.oldNo ?? ""}
            </span>
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: isDark ? "#6e7681" : "#8c959f",
                userSelect: "none",
              }}
            >
              {row.newNo ?? ""}
            </span>
            <span style={{ flex: 1 }}>{row.text}</span>
          </div>
        );
      })}
    </div>
  );
};

const CodeDiffInteract = ({ config, onSubmit, uiState, isDark, disabled }) => {
  const title = config?.title || "Code changes";
  const operation = config?.operation || "edit";
  const path = config?.path || "";
  const unifiedDiff = config?.unified_diff || "";
  const truncated = Boolean(config?.truncated);
  const totalLines = config?.total_lines || 0;
  const displayedLines = config?.displayed_lines || 0;
  const hiddenLines = Math.max(0, totalLines - displayedLines);

  const { plus, minus } = countPlusMinus(unifiedDiff);

  const resolved = Boolean(uiState?.resolved);
  const decision = uiState?.decision;

  const successAccent = isDark ? "#4ADE80" : "#22C55E";
  const errorAccent = isDark ? "#F87171" : "#DC3545";

  return (
    <div
      style={{
        borderRadius: 12,
        padding: 10,
        backgroundColor: isDark ? "#161616" : "#ffffff",
        color: isDark ? "#e8e8e8" : "#1f2328",
        opacity: resolved ? 0.75 : 1,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            color: isDark ? "#cfcfcf" : "#57606a",
          }}
        >
          {operation}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          fontSize: 11,
          marginBottom: 6,
          alignItems: "center",
          color: isDark ? "#8c959f" : "#656d76",
        }}
      >
        <span style={{ overflowWrap: "anywhere" }}>{path}</span>
        <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
          +{plus} -{minus}
        </span>
      </div>
      <DiffBody unifiedDiff={unifiedDiff} isDark={isDark} />
      {truncated && (
        <div
          style={{
            fontSize: 11,
            color: isDark ? "#8c959f" : "#656d76",
            fontStyle: "italic",
            padding: "4px 0 0 0",
          }}
        >
          truncated — {hiddenLines} more lines hidden
        </div>
      )}
      {!disabled && !resolved && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Button
            label="Approve"
            onClick={() => onSubmit && onSubmit({ approved: true, scope: "once" })}
            style={buildActionStyle(successAccent)}
          />
          <Button
            label="Reject"
            onClick={() => onSubmit && onSubmit({ approved: false, scope: "once" })}
            style={buildActionStyle(errorAccent)}
          />
        </div>
      )}
      {resolved && decision === "approved" && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 4,
            display: "inline-block",
            backgroundColor: isDark ? "#0f2b14" : "#dafbe1",
            color: isDark ? "#4ADE80" : "#1a7f37",
          }}
        >
          ✓ Approved
        </div>
      )}
      {resolved && decision === "rejected" && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 4,
            display: "inline-block",
            backgroundColor: isDark ? "#2b0f13" : "#ffebe9",
            color: isDark ? "#F87171" : "#82061e",
          }}
        >
          ✗ Rejected
        </div>
      )}
    </div>
  );
};

export default CodeDiffInteract;
