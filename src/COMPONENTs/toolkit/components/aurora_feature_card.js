import { useContext, useMemo } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import {
  ToolkitIconFrame,
  isFileToolkitIcon,
  isBuiltinToolkitIcon,
} from "./toolkit_icon";
import { seedColorForIcon, solidFromSeed } from "../utils/warp_palette";

/* AuroraFeatureCard — the Discover page's featured/hero card. (The name is
   a fossil of the aurora era; the export/import surface is kept stable.)

   CEO direction 2026-07-18c (final of the background saga): no aurora, no
   flowing warp — ONE SOLID icon-adjacent color per plugin (warp_palette's
   seedColorForIcon → solidFromSeed), rendered on the shared 3D tilt Card
   (BUILTIN_COMPONENTs/card — vanilla-tilt hover, mini_ui-derived) with
   THREE parallax layers via Card.Layer:
     front  (depth 34): plugin icon + the GET/OPEN pill
     middle (depth 16): kicker / title / blurb copy
     back   (depth 0):  the solid card surface itself
   Lives outside shell_background_guard's SHELL_FILES scan (CategoryChip
   precedent) because the solid surface color is a derived literal.

   The install-state MACHINE stays with the caller (usePluginInstallState) —
   this component is presentation only, driven by pillLabel/pillOpen/
   pillDisabled/pillInstalling. */
const AuroraFeatureCard = ({
  isDark = false,
  testId,
  onClick,
  icon,
  source,
  kicker,
  title,
  blurb,
  pillLabel,
  pillOpen = false,
  pillDisabled = false,
  pillInstalling = false,
  onPillClick,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const seed = useMemo(() => seedColorForIcon(icon, source), [icon, source]);
  const surface = useMemo(() => solidFromSeed(seed, { isDark, alpha: 0.32 }), [seed, isDark]);

  /* An icon with its own complete look (an SVG/image file, or a builtin
     glyph that ships its own backgroundColor) needs no white backing plate;
     the plate stays only for emoji/missing icons where the raw glyph would
     get lost on the solid seed surface. */
  const iconHasOwnArtwork =
    isFileToolkitIcon(icon) || (isBuiltinToolkitIcon(icon) && Boolean(icon?.backgroundColor));

  /* Dark: deep seed-toned surface carries white copy; light: pale wash
     carries dark ink. */
  const kickerColor = isDark ? "rgba(255,255,255,0.72)" : "rgba(28,28,33,0.66)";
  const titleColor = isDark ? "#ffffff" : "#1c1c21";
  const blurbColor = isDark ? "rgba(255,255,255,0.64)" : "rgba(28,28,33,0.62)";

  const pillBg = pillOpen
    ? isDark
      ? "rgba(255,255,255,0.16)"
      : "rgba(28,28,33,0.10)"
    : "rgba(255,255,255,0.92)";
  const pillColor = pillOpen ? (isDark ? "#ffffff" : "#1c1c21") : "#3446c8";

  const handlePillClick = (event) => {
    event.stopPropagation();
    onPillClick?.();
  };

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <Card
        width="100%"
        border_radius={13}
        max_tilt={7}
        scale={1.015}
        style={{ backgroundColor: surface, cursor: onClick ? "pointer" : "default" }}
        body_style={{
          padding: "68px 22px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Card.Layer depth={34} style={{ flexShrink: 0 }}>
          {iconHasOwnArtwork ? (
            /* Real artwork (SVG/image file, or a builtin glyph shipping its
               own backgroundColor) renders as-is — no white backing plate
               (CEO 2026-07-18e). */
            <ToolkitIconFrame
              icon={icon}
              isDark={isDark}
              size={50}
              iconSize={23}
              borderRadius={14}
            />
          ) : (
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                background: "rgba(255,255,255,0.92)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ToolkitIconFrame
                icon={icon}
                isDark={isDark}
                size={50}
                iconSize={23}
                borderRadius={14}
                style={{ background: "transparent" }}
              />
            </div>
          )}
        </Card.Layer>

        <Card.Layer depth={16} style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: kickerColor,
              fontFamily,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: titleColor,
              marginTop: 2,
              fontFamily,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: blurbColor,
              marginTop: 2,
              lineHeight: 1.5,
              fontFamily,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {blurb}
          </div>
        </Card.Layer>

        {pillLabel && (
          <Card.Layer depth={34} style={{ flexShrink: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {pillInstalling && <ArcSpinner size={11} stroke_width={2} color={pillColor} />}
              <Button
                label={pillLabel}
                disabled={pillDisabled}
                onClick={handlePillClick}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily,
                  paddingVertical: 4,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  color: pillColor,
                  root: { background: pillBg },
                  state: {
                    disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} },
                  },
                }}
              />
            </span>
          </Card.Layer>
        )}
      </Card>
    </div>
  );
};

export default AuroraFeatureCard;
