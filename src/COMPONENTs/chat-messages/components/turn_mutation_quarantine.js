const TurnMutationQuarantine = ({
  hold,
  isDark = false,
  onRetry,
  onDiscard,
}) => {
  if (!hold?.operationId) return null;

  const buttonBase = {
    appearance: "none",
    border: isDark
      ? "1px solid rgba(255,255,255,0.16)"
      : "1px solid rgba(0,0,0,0.14)",
    borderRadius: 8,
    background: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(255,255,255,0.9)",
    color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.78)",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: "18px",
    padding: "5px 10px",
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      data-testid="turn-mutation-quarantine"
      style={{
        boxSizing: "border-box",
        width: "min(760px, calc(100% - 32px))",
        margin: "0 auto 8px",
        padding: "10px 12px",
        borderRadius: 12,
        border: isDark
          ? "1px solid rgba(255,184,107,0.25)"
          : "1px solid rgba(175,91,0,0.2)",
        background: isDark
          ? "rgba(83,48,13,0.9)"
          : "rgba(255,246,232,0.96)",
        boxShadow: isDark
          ? "0 8px 24px rgba(0,0,0,0.28)"
          : "0 8px 24px rgba(69,38,0,0.1)",
        color: isDark ? "rgba(255,255,255,0.88)" : "rgba(72,43,9,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        pointerEvents: "auto",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650, lineHeight: "18px" }}>
          Message change paused
        </div>
        <div style={{ fontSize: 12, lineHeight: "17px", opacity: 0.78 }}>
          {hold.message}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          aria-label="Retry message change"
          onClick={() => onRetry?.(hold.operationId)}
          style={buttonBase}
        >
          Retry
        </button>
        {hold.canDiscard && (
          <button
            type="button"
            aria-label="Discard message change and restore text"
            onClick={() => onDiscard?.(hold.operationId)}
            style={{
              ...buttonBase,
              background: "transparent",
              opacity: 0.8,
            }}
          >
            Discard
          </button>
        )}
      </div>
    </div>
  );
};

export default TurnMutationQuarantine;
