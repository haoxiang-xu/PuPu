/**
 * ConfirmInteract – Allow / Deny buttons extracted from TraceChain.
 *
 * Props (standardised by InteractWrapper):
 *   config   – unused for confirmation type
 *   onSubmit – called with { approved: boolean }
 *   uiState  – { status, error, resolved, decision }
 *   isDark   – theme flag
 *   disabled – true when actions should be blocked
 */

const ACTION_BUTTON_BASE = {
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 11.5,
  lineHeight: 1.4,
  fontFamily: "Menlo, Monaco, Consolas, monospace",
};

const ConfirmInteract = ({ onSubmit, isDark, disabled }) => {
  if (disabled) return null;

  return (
    <>
      <button
        onClick={() => onSubmit({ approved: true })}
        style={{
          ...ACTION_BUTTON_BASE,
          color: isDark ? "rgba(209,250,229,0.95)" : "#065f46",
          backgroundColor: isDark
            ? "rgba(16,185,129,0.22)"
            : "rgba(16,185,129,0.16)",
        }}
      >
        Allow
      </button>
      <button
        onClick={() => onSubmit({ approved: false })}
        style={{
          ...ACTION_BUTTON_BASE,
          color: isDark ? "rgba(254,202,202,0.98)" : "#991b1b",
          backgroundColor: isDark
            ? "rgba(239,68,68,0.2)"
            : "rgba(239,68,68,0.14)",
        }}
      >
        Deny
      </button>
    </>
  );
};

export default ConfirmInteract;
