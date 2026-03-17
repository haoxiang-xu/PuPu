import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { kindConfig, toDisplayName } from "../utils/toolkit_helpers";

const ToolkitCard = ({ toolkit, isDark }) => {
  const kc = kindConfig(toolkit.kind);
  const displayName = toDisplayName(toolkit);
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor: cardBg,
        padding: "11px 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Header: icon + name + kind tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon src="tool" style={{ width: 18, height: 18 }} color={kc.color} />
        </div>

        <span
          style={{
            fontSize: 16,
            fontFamily: "Jost",
            color: textColor,
            letterSpacing: "0.1px",
          }}
        >
          {displayName}
        </span>

        <span
          style={{
            fontSize: 10,
            fontFamily: "Jost",
            fontWeight: 500,
            letterSpacing: "0.4px",
            textTransform: "lowercase",
            padding: "1px 6px",
            borderRadius: 999,
            backgroundColor: isDark ? kc.bg : kc.bg,
            color: kc.color,
            lineHeight: 1.8,
            flexShrink: 0,
          }}
        >
          {kc.label}
        </span>

        {tools.length > 0 && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "Jost",
              color: mutedColor,
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {tools.length} tool{tools.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tool tags */}
      {tools.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
          }}
        >
          {tools.map((tool, idx) => (
            <span
              key={idx}
              title={tool.description || tool.name}
              style={{
                fontSize: 11,
                fontFamily: "Jost",
                fontWeight: 500,
                padding: "1px 8px",
                borderRadius: 999,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.07)"
                  : "rgba(0,0,0,0.05)",
                color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)",
                lineHeight: 1.8,
                cursor: "default",
                whiteSpace: "nowrap",
              }}
            >
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolkitCard;
