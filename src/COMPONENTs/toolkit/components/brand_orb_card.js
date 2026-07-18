import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import { ToolkitIconFrame } from "./toolkit_icon";
import { seedColorForIcon, solidFromSeed } from "../utils/warp_palette";

/* BrandOrbCard — the Discover page's Essentials grid card. (Name is a
   fossil of the orb era; export/import surface kept stable.)

   CEO direction 2026-07-18d: same treatment as the featured card — the
   blurred brand orb is out; the card surface itself is ONE SOLID
   icon-adjacent color (seedColorForIcon → solidFromSeed), rendered on the
   shared 3D tilt Card with the same three parallax layers, scaled down:
     front  (depth 26): icon + right-slot pill (children)
     middle (depth 12): name / description / command chip
     back   (depth 0):  the solid seed-toned surface
   Lives outside shell_background_guard's SHELL_FILES scan (CategoryChip
   precedent) because the surface color is a derived literal.

   "brand-orb" testid stays on the surface marker so existing tests keep a
   stable hook for "this card carries the plugin's brand color". */
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

  const seed = seedColorForIcon(icon, source);
  const surface = solidFromSeed(seed, { isDark });

  const nameColor = isDark ? "rgba(255,255,255,0.92)" : "rgba(28,28,33,0.88)";
  const descColor = isDark ? "rgba(255,255,255,0.60)" : "rgba(28,28,33,0.60)";
  const chipColor = isDark ? "#ffffff" : "#1c1c21";
  const chipBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(28,28,33,0.10)";

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <Card
        width="100%"
        height="100%"
        border_radius={12}
        max_tilt={8}
        scale={1.02}
        style={{ backgroundColor: surface, border: "none", cursor: onClick ? "pointer" : "default" }}
        body_style={{
          padding: "13px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span data-testid="brand-orb" aria-hidden="true" style={{ display: "none" }} />

        {/* preserve-3d on every intermediate wrapper — without it the
            Card.Layer translateZ inside gets flattened and the parallax
            silently dies (CEO caught it in-app 2026-07-18). */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, transformStyle: "preserve-3d" }}>
          <Card.Layer depth={26} style={{ flexShrink: 0 }}>
            <ToolkitIconFrame icon={icon} isDark={isDark} size={34} iconSize={17} borderRadius={9} />
          </Card.Layer>
          <Card.Layer depth={12} style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: "block",
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
          </Card.Layer>
        </div>

        {description && (
          <Card.Layer depth={12}>
            <div
              style={{
                fontSize: 10.5,
                lineHeight: 1.45,
                color: descColor,
                fontFamily,
                minHeight: 30,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {description}
            </div>
          </Card.Layer>
        )}

        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", transformStyle: "preserve-3d" }}>
          {command && (
            <Card.Layer depth={12}>
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
            </Card.Layer>
          )}
          {children && (
            <Card.Layer depth={26} style={{ marginLeft: "auto" }}>
              <div
                onClick={(event) => event.stopPropagation()}
                style={{ display: "flex", alignItems: "center" }}
              >
                {children}
              </div>
            </Card.Layer>
          )}
        </div>
      </Card>
    </div>
  );
};

export default BrandOrbCard;
