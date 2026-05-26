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

import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { DiffBody, countPlusMinus } from "../../diff/diff_body";

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
