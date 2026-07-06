/**
 * InterjectHint — transient feedback shown above the chat input while a turn
 * is streaming. Renders ONLY the "fyi queued" pill once an /fyi has been
 * queued for injection; there is no persistent explanatory line (command
 * discovery lives in the slash-command menu). Renders nothing when not
 * streaming or when nothing is queued.
 *
 * Does NOT render steer items — that is SteerPile's job.
 */
const InterjectHint = ({ interjectState, isStreaming, isDark }) => {
  if (!isStreaming) return null;

  const pendingFyiCount = interjectState?.pendingFyiCount || 0;
  if (pendingFyiCount <= 0) return null;

  const pillBg = isDark ? "rgba(110,200,140,0.16)" : "rgba(40,150,80,0.10)";
  const pillColor = isDark ? "rgba(150,225,170,0.95)" : "rgba(30,130,70,0.92)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 4px 6px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "1px 8px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1.6,
          flexShrink: 0,
          whiteSpace: "nowrap",
          backgroundColor: pillBg,
          color: pillColor,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        ✓ 已排队,下一步注入
      </span>
    </div>
  );
};

export default InterjectHint;
