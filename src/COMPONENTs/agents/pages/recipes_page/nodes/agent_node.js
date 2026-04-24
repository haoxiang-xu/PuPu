export default function AgentNode({ node, isDark, selected }) {
  const accent = "#4a5bd8";
  return (
    <div
      style={{
        minWidth: 200,
        padding: "10px 12px",
        border: `${selected ? "1.5" : "1"}px solid ${
          selected ? accent : isDark ? "rgba(255,255,255,0.2)" : "#d6d6db"
        }`,
        borderRadius: 10,
        background: isDark ? "#242428" : "#fff",
        boxShadow: selected
          ? `0 0 0 3px rgba(74,91,216,0.15)`
          : "0 2px 6px rgba(0,0,0,0.06)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: accent,
          marginBottom: 4,
        }}
      >
        Agent
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: isDark ? "#fff" : "#222",
        }}
      >
        {node.label || "(unnamed)"}
      </div>
      {node.model && (
        <div
          style={{
            color: isDark ? "#aaa" : "#666",
            marginTop: 4,
            fontSize: 11,
          }}
        >
          {node.model}
        </div>
      )}
    </div>
  );
}
