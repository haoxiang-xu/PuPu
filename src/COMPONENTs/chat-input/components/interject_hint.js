/**
 * InterjectHint — compact single-line hint shown above the chat input while a
 * turn is streaming. Explains the interject channels (/btw /fyi /steer) and
 * surfaces a small pill once an /fyi has been queued for injection.
 *
 * Does NOT render steer items — that is SteerPile's job. Renders nothing
 * when not streaming.
 */
const InterjectHint = ({ interjectState, isStreaming, isDark }) => {
  if (!isStreaming) return null;

  const pendingFyiCount = interjectState?.pendingFyiCount || 0;

  const mutedColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)";
  const pillBg = isDark ? "rgba(110,200,140,0.16)" : "rgba(40,150,80,0.10)";
  const pillColor = isDark ? "rgba(150,225,170,0.95)" : "rgba(30,130,70,0.92)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 4px 6px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          lineHeight: 1.4,
          color: mutedColor,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        运行中 · 直接发送会智能路由,或用 /btw /fyi /steer 指定
      </span>
      {pendingFyiCount > 0 && (
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
      )}
    </div>
  );
};

export default InterjectHint;
