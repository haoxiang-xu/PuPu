import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { ToolkitIconFrame } from "./toolkit_icon";
import { SOURCE_CONFIG } from "../constants";

/* BrandOrbCard — the Discover page's Essentials grid card (C2 design
   authority: 2026-07-18 discover-c2 mockup, screen "C2"). Lives outside
   shell_background_guard's SHELL_FILES scan (CategoryChip precedent) since
   it owns the per-plugin brand-color orb — a literal opaque color the guard
   would otherwise flag; the page passing it icon/source data stays
   var()-based.

   The orb is a low-opacity, heavily blurred circle tucked in the card's top
   -right corner, tinted with the plugin's own brand color: resolved
   icon.backgroundColor -> icon.color -> the source's SOURCE_CONFIG color,
   in that order, so a builtin-colored icon (Notion's white square, GitHub's
   near-black) wins over the generic per-source fallback (e.g. the MCP
   family's #8b5cf6). Purely decorative (aria-hidden, pointer-events none) —
   never the only carrier of information. */
const resolveBrandColor = (icon, source) =>
  icon?.backgroundColor || icon?.color || SOURCE_CONFIG[source]?.color || "#8a8cee";

const BrandOrbCard = ({
  isDark = false,
  icon,
  source,
  name,
  description,
  command,
  onClick,
  testId,
  children,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const brandColor = resolveBrandColor(icon, source);
  const cardBg = isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.035)";
  const hairline = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const nameColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const descColor = isDark ? "rgba(var(--pupu-text-rgb),0.42)" : "rgba(var(--pupu-text-rgb),0.45)";
  const chipColor = isDark ? "#9aa8ff" : "#2563eb";
  const chipBg = "rgba(124,140,248,0.10)";
  const orbOpacity = isDark ? 0.34 : 0.22;

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        background: cardBg,
        boxShadow: `inset 0 0 0 1px ${hairline}`,
        padding: "13px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        data-testid="brand-orb"
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 130,
          height: 130,
          borderRadius: "50%",
          filter: "blur(38px)",
          opacity: orbOpacity,
          right: -40,
          top: -50,
          background: brandColor,
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 9, position: "relative", zIndex: 1 }}>
        <ToolkitIconFrame icon={icon} isDark={isDark} size={34} iconSize={17} borderRadius={9} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            fontFamily,
            color: nameColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </div>

      {description && (
        <div
          style={{
            fontSize: 10.5,
            lineHeight: 1.45,
            color: descColor,
            fontFamily,
            position: "relative",
            zIndex: 1,
            minHeight: 30,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {description}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", position: "relative", zIndex: 1 }}>
        {command && (
          <span
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 9.5,
              color: chipColor,
              background: chipBg,
              borderRadius: 5,
              padding: "1px 6px",
              flexShrink: 0,
            }}
          >
            {command}
          </span>
        )}
        {children && (
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandOrbCard;
