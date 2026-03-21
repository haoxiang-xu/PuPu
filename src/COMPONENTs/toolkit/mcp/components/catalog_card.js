import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import Card from "../../../../BUILTIN_COMPONENTs/card/card";
import { VerificationBadge, RuntimeBadge } from "./shared";

const CatalogCard = ({ entry, isDark, onClick }) => {
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const iconBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";

  const runtimes = [
    ...new Set((entry.install_profiles || []).map((p) => p.runtime)),
  ];

  const toolCount = entry.tool_preview?.length || 0;

  return (
    <div onClick={() => onClick?.(entry)} style={{ cursor: "pointer" }}>
      <Card
        width="100%"
        height="100%"
        disabled
        border_radius={12}
        style={{ cursor: "pointer" }}
        body_style={{
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* ── Icon + verification ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: iconBg,
            }}
          >
            <Icon
              src="mcp"
              style={{ width: 22, height: 22 }}
              color={isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"}
            />
          </div>
          <VerificationBadge
            verification={entry.verification}
            isDark={isDark}
          />
        </div>

        {/* ── Name ── */}
        <span
          style={{
            fontSize: 12,
            fontFamily: "Jost",
            fontWeight: 500,
            color: textColor,
            letterSpacing: "0.15px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            marginBottom: 2,
          }}
        >
          {entry.name}
        </span>

        {/* ── Publisher ── */}
        <span
          style={{
            fontSize: 11,
            fontFamily: "Jost",
            fontWeight: 400,
            color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)",
            marginBottom: 4,
          }}
        >
          {entry.publisher}
        </span>

        {/* ── Description ── */}
        <span
          style={{
            fontSize: 11.5,
            fontFamily: "Jost",
            fontWeight: 400,
            color: mutedColor,
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 10,
          }}
        >
          {entry.description}
        </span>

        {/* ── Footer: runtime badges + tool count ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginTop: "auto",
            flexWrap: "wrap",
          }}
        >
          {runtimes.map((r) => (
            <RuntimeBadge key={r} runtime={r} />
          ))}
          {toolCount > 0 && (
            <span
              style={{
                fontSize: 11,
                fontFamily: "Jost",
                color: mutedColor,
              }}
            >
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};

export default CatalogCard;
