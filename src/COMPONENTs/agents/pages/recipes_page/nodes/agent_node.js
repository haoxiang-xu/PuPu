import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function AgentNode({ node, isDark, selected }) {
  const accent = "#4a5bd8";
  const borderColor = selected
    ? accent
    : isDark
      ? "rgba(255,255,255,0.14)"
      : "rgba(0,0,0,0.1)";
  const textColor = isDark ? "#ddd" : "#222";
  const iconColor = selected ? accent : isDark ? "#bbb" : "#666";

  return (
    <div
      style={{
        minWidth: 180,
        padding: "10px 12px",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        background: isDark ? "#1e1e22" : "#fff",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon
          src="bot"
          style={{ width: 14, height: 14 }}
          color={iconColor}
        />
        <div
          style={{
            fontWeight: 500,
            fontSize: 13,
            color: textColor,
          }}
        >
          {node.label || "(unnamed)"}
        </div>
      </div>
      {node.model && (
        <div
          style={{
            color: isDark ? "#888" : "#888",
            marginTop: 4,
            marginLeft: 22,
            fontSize: 11,
          }}
        >
          {node.model}
        </div>
      )}
    </div>
  );
}
