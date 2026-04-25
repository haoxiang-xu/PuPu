const cellLabel = (name) => {
  if (!name) return "?";
  const cleaned = String(name).replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length === 0) return "?";
  if (cleaned.length === 1) return cleaned[0].toUpperCase();
  return cleaned[0].toUpperCase() + cleaned[1].toLowerCase();
};

export default function ToolPoolNode({ node, isDark, selected }) {
  const surface = isDark ? "#1f2027" : "#ffffff";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const text_soft = isDark ? "#a8a8b0" : "#6b6b73";
  const text_muted = isDark ? "#5d5d65" : "#a0a0a8";
  const chip_bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const shadow_rest = isDark
    ? "0 1px 2px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.4)"
    : "0 1px 2px rgba(15,18,38,0.05), 0 4px 14px rgba(15,18,38,0.07)";
  const shadow_lift = isDark
    ? "0 2px 4px rgba(0,0,0,0.6), 0 14px 36px rgba(0,0,0,0.6)"
    : "0 2px 4px rgba(15,18,38,0.07), 0 14px 36px rgba(15,18,38,0.14)";

  const chips = node.chips || [];
  const count = node.count != null ? node.count : chips.length;
  const MAX_CELLS = 11;
  const visible = chips.slice(0, MAX_CELLS);
  const overflow = Math.max(0, chips.length - MAX_CELLS);

  return (
    <div
      style={{
        width: 192,
        padding: "12px 14px",
        background: surface,
        borderRadius: 12,
        boxShadow: selected ? shadow_lift : shadow_rest,
        transform: selected ? "translateY(-3px)" : "translateY(0)",
        transition:
          "transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: chips.length > 0 ? 10 : 0,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            flexShrink: 0,
            background: "linear-gradient(135deg, #f6a341, #ea7547)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          T
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.15,
              color: text,
            }}
          >
            Tool Pool
          </div>
          <div style={{ fontSize: 10.5, color: text_soft, marginTop: 1 }}>
            {count} tools
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: text_soft,
            background: chip_bg,
            padding: "2px 7px",
            borderRadius: 999,
          }}
        >
          {count}
        </div>
      </div>

      {chips.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 5,
          }}
        >
          {visible.map((c, i) => (
            <div
              key={`${c}-${i}`}
              title={c}
              style={{
                aspectRatio: "1",
                background: chip_bg,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                fontWeight: 700,
                color: text_soft,
              }}
            >
              {cellLabel(c)}
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                aspectRatio: "1",
                background: "transparent",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                fontWeight: 500,
                color: text_muted,
              }}
            >
              {`+${overflow}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
