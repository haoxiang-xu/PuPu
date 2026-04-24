export default function SubagentPoolNode({ node, isDark, selected }) {
  const accent = "#4a5bd8";
  return (
    <div
      style={{
        minWidth: 170,
        padding: "10px 12px",
        border: `${selected ? "1.5" : "1"}px solid ${
          selected ? accent : isDark ? "rgba(255,255,255,0.2)" : "#d6d6db"
        }`,
        borderRadius: 10,
        background: isDark ? "#242428" : "#fff",
        boxShadow: selected
          ? "0 0 0 3px rgba(74,91,216,0.15)"
          : "0 2px 6px rgba(0,0,0,0.06)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: isDark ? "#888" : "#888",
          marginBottom: 4,
        }}
      >
        Subagent Pool
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: isDark ? "#fff" : "#222",
        }}
      >
        {node.count} subagents
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {(node.chips || []).slice(0, 3).map((c) => (
          <span
            key={c}
            style={{
              display: "inline-block",
              background: isDark ? "rgba(74,91,216,0.25)" : "#eef1ff",
              color: accent,
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 10,
            }}
          >
            {c}
          </span>
        ))}
        {(node.chips || []).length > 3 && (
          <span
            style={{
              fontSize: 10,
              color: isDark ? "#888" : "#888",
            }}
          >
            +{node.chips.length - 3}
          </span>
        )}
      </div>
    </div>
  );
}
