export default function ToolkitNode({ node, isDark, selected }) {
  return (
    <div
      style={{
        minWidth: 140,
        padding: "10px 12px",
        border: `${selected ? "1.5" : "1"}px solid ${
          selected ? "#4a5bd8" : isDark ? "rgba(255,255,255,0.2)" : "#d6d6db"
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
        Toolkit
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: isDark ? "#fff" : "#222",
        }}
      >
        {node.label}
      </div>
      <div
        style={{
          color: isDark ? "#aaa" : "#666",
          marginTop: 4,
          fontSize: 11,
        }}
      >
        {node.enabledCount}/{node.totalCount} tools
      </div>
    </div>
  );
}
