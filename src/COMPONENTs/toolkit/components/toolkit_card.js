import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { kindConfig, toDisplayName } from "../utils/toolkit_helpers";

const ToolkitCard = ({ toolkit, isDark }) => {
  const kc = kindConfig(toolkit.kind);
  const displayName = toDisplayName(toolkit);
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];

  return (
    <div
      style={{
        padding: "13px 16px",
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.025)",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: kc.bg,
            border: `1px solid ${kc.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon src="tool" style={{ width: 17, height: 17 }} color={kc.color} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "NunitoSans, sans-serif",
              color: isDark ? "#f0f0f0" : "#1a1a1a",
              marginBottom: 3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
              color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.35)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {toolkit.module || toolkit.name}
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.6px",
            fontFamily: "Jost, sans-serif",
            color: kc.color,
            background: kc.bg,
            border: `1px solid ${kc.border}`,
            padding: "3px 9px",
            borderRadius: 5,
            flexShrink: 0,
          }}
        >
          {kc.label}
        </div>
      </div>

      {tools.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
          }}
        >
          {tools.map((tool, idx) => (
            <div
              key={idx}
              title={tool.description || tool.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 5,
                background: isDark
                  ? "rgba(255,255,255,0.055)"
                  : "rgba(0,0,0,0.045)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`,
                cursor: "default",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: kc.color,
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                  color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
                  whiteSpace: "nowrap",
                }}
              >
                {tool.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolkitCard;
