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

const rgbaVar = (rgbVarName, a) => `rgba(var(${rgbVarName}),${a})`;

const ACTION_BUTTON_WIDTH = 96;

const buildActionStyle = (accent, accentRgbVarName) => ({
  width: ACTION_BUTTON_WIDTH,
  color: accent,
  backgroundColor: rgbaVar(accentRgbVarName, 0.14),
  fontSize: 11.5,
  fontFamily: FONT,
  borderRadius: 6,
  paddingVertical: 6,
  paddingHorizontal: 10,
  hoverBackgroundColor: rgbaVar(accentRgbVarName, 0.18),
  activeBackgroundColor: rgbaVar(accentRgbVarName, 0.28),
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

  const successAccent = "var(--pupu-success)";
  const errorAccent = "var(--pupu-danger)";

  return (
    <div
      style={{
        borderRadius: 12,
        padding: 10,
        backgroundColor: "var(--pupu-surface)",
        color: "var(--pupu-text)",
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
            backgroundColor: isDark
              ? "rgba(var(--pupu-text-rgb),0.10)"
              : "rgba(var(--pupu-text-rgb),0.08)",
            color: "var(--pupu-text-muted)",
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
          color: "var(--pupu-text-muted)",
        }}
      >
        <span style={{ overflowWrap: "anywhere" }}>{path}</span>
        <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--pupu-success)" }}>+{plus}</span>{" "}
          <span style={{ color: "var(--pupu-danger)" }}>-{minus}</span>
        </span>
      </div>
      <DiffBody unifiedDiff={unifiedDiff} isDark={isDark} />
      {truncated && (
        <div
          style={{
            fontSize: 11,
            color: "var(--pupu-text-muted)",
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
            style={buildActionStyle(successAccent, "--pupu-success-rgb")}
          />
          <Button
            label="Reject"
            onClick={() => onSubmit && onSubmit({ approved: false, scope: "once" })}
            style={buildActionStyle(errorAccent, "--pupu-danger-rgb")}
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
            backgroundColor: "rgba(var(--pupu-success-rgb),0.15)",
            color: "var(--pupu-success)",
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
            backgroundColor: "rgba(var(--pupu-danger-rgb),0.15)",
            color: "var(--pupu-danger)",
          }}
        >
          ✗ Rejected
        </div>
      )}
    </div>
  );
};

export default CodeDiffInteract;
