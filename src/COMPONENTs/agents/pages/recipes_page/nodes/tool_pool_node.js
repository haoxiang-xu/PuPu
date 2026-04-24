import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function ToolPoolNode({ node, isDark, selected }) {
  const accent = "#6b8f3a";
  const borderColor = selected
    ? accent
    : isDark
      ? "rgba(255,255,255,0.14)"
      : "rgba(0,0,0,0.1)";
  const textColor = isDark ? "#ddd" : "#222";
  const iconColor = selected ? accent : isDark ? "#bbb" : "#666";
  const mutedColor = "#888";

  const chips = node.chips || [];

  return (
    <div
      style={{
        minWidth: 170,
        padding: "10px 12px",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        background: isDark ? "#1e1e22" : "#fff",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon src="tool" style={{ width: 14, height: 14 }} color={iconColor} />
        <div style={{ fontWeight: 500, fontSize: 13, color: textColor }}>
          {node.count || 0} tools
        </div>
      </div>
      {chips.length > 0 && (
        <div
          style={{
            marginTop: 6,
            marginLeft: 22,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {chips.slice(0, 3).map((c) => (
            <span key={c} style={{ fontSize: 10, color: mutedColor }}>
              {c}
            </span>
          ))}
          {chips.length > 3 && (
            <span style={{ fontSize: 10, color: mutedColor }}>
              +{chips.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
