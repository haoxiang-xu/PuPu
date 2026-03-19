import { useState } from "react";
import interactRegistry from "./interact_registry";

/**
 * InteractWrapper – looks up the interact registry by type and renders the
 * matching component.  Falls back to null for unknown types so TraceChain
 * can silently skip unsupported interactions.
 *
 * When config is an array of question objects, renders left / right navigation
 * arrows so the user can step through each question individually.
 * Each element in the array may carry its own `interact_type`; otherwise the
 * parent `type` prop is used.
 *
 * Standardised props passed to every interact component:
 *   config           – the interact_config object from the payload
 *   onSubmit(data)   – call with the user's response; data format is
 *                       component-specific but always goes into
 *                       modified_arguments.user_response
 *   uiState          – { status, error, resolved, decision } from the parent
 *   isDark           – dark-mode flag
 *   disabled         – true when the interaction has already been submitted
 */

const NAV_BTN = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "Menlo, Monaco, Consolas, monospace",
  padding: 0,
  lineHeight: 1,
  flexShrink: 0,
  transition: "background 0.12s",
};

const InteractWrapper = ({
  type,
  config,
  onSubmit,
  uiState,
  isDark,
  disabled,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);

  /* ── multi-question mode ── */
  const isMulti = Array.isArray(config) && config.length > 1;
  const questions = isMulti ? config : null;
  const total = questions ? questions.length : 1;
  const safeIdx = Math.min(currentIdx, total - 1);

  const resolvedType = isMulti
    ? typeof questions[safeIdx]?.interact_type === "string"
      ? questions[safeIdx].interact_type
      : type
    : type;
  const resolvedConfig = isMulti ? questions[safeIdx] : config || {};

  const Component = interactRegistry[resolvedType];
  if (!Component) return null;

  const navBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const navColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)";
  const navDisabledColor = isDark
    ? "rgba(255,255,255,0.18)"
    : "rgba(0,0,0,0.15)";
  const counterColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* ── question navigation ── */}
      {isMulti && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={safeIdx === 0}
            style={{
              ...NAV_BTN,
              background: navBg,
              color: safeIdx === 0 ? navDisabledColor : navColor,
              cursor: safeIdx === 0 ? "default" : "pointer",
            }}
            aria-label="Previous question"
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 10.5,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
              color: counterColor,
              userSelect: "none",
            }}
          >
            {safeIdx + 1} / {total}
          </span>
          <button
            onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
            disabled={safeIdx === total - 1}
            style={{
              ...NAV_BTN,
              background: navBg,
              color: safeIdx === total - 1 ? navDisabledColor : navColor,
              cursor: safeIdx === total - 1 ? "default" : "pointer",
            }}
            aria-label="Next question"
          >
            ›
          </button>
        </div>
      )}

      <Component
        config={resolvedConfig}
        onSubmit={onSubmit}
        uiState={uiState || {}}
        isDark={isDark}
        disabled={disabled}
      />
    </div>
  );
};

export default InteractWrapper;
