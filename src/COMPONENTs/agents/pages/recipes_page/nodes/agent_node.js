export default function AgentNode({ node, isDark, selected }) {
  const surface = isDark ? "#1f2027" : "#ffffff";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const text_soft = isDark ? "#a8a8b0" : "#6b6b73";
  const shadow_rest = isDark
    ? "0 1px 2px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.4)"
    : "0 1px 2px rgba(15,18,38,0.05), 0 4px 14px rgba(15,18,38,0.07)";
  const shadow_lift = isDark
    ? "0 2px 4px rgba(0,0,0,0.6), 0 14px 36px rgba(0,0,0,0.6)"
    : "0 2px 4px rgba(15,18,38,0.07), 0 14px 36px rgba(15,18,38,0.14)";

  const initial = (node.label || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      style={{
        width: 200,
        padding: 14,
        background: surface,
        borderRadius: 12,
        boxShadow: selected ? shadow_lift : shadow_rest,
        transform: selected ? "translateY(-3px)" : "translateY(0)",
        transition:
          "transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            flexShrink: 0,
            background: "#4a5bd8",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.15,
              color: text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.label || "(unnamed)"}
          </div>
          {node.model && (
            <div
              style={{
                fontSize: 11,
                color: text_soft,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.model}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
