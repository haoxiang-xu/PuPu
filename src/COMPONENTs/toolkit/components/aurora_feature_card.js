import { useContext, useMemo } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import DisplacementWarp from "../../../BUILTIN_COMPONENTs/background/displacement_warp/displacement_warp";
import {
  ToolkitIconFrame,
  isFileToolkitIcon,
  isBuiltinToolkitIcon,
} from "./toolkit_icon";

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
/* Ink hero background (CEO 2026-07-18k): mini_ui "Yours to theme" panel
   Nº03's DisplacementWarp, verbatim parameters — deep blue-black conic warp
   with cyan/violet drift, 3px blur, grain. The card carries its own dark
   palette in BOTH app themes (like the themes-page panels do), so the copy
   stays white regardless of isDark. Static gradient underneath is the
   no-WebGL fallback. */
const INK_WARP = {
  colors: ["#0c0f15", "#1c2240", "#5fb8d9", "#a78bfa"],
  gradient: "conic",
  gradientAngle: 0,
  warpStrength: 0.1,
  warpScale: 2.2,
  speed: 0.32,
  grain: 0.03,
  interactive: false,
  ambient: true,
  pixelRatio: 1.25,
};
const INK_BLUR = 3;
const INK_STATIC_FALLBACK =
  "conic-gradient(from 210deg at 60% 40%, #0c0f15, #1c2240 30%, #5fb8d9 52%, #1c2240 68%, #a78bfa 84%, #0c0f15)";

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

  /* An icon with its own complete look (an SVG/image file, or a builtin
     glyph that ships its own backgroundColor) needs no white backing plate;
     the plate stays only for emoji/missing icons where the raw glyph would
     get lost on the solid seed surface. */
  const iconHasOwnArtwork =
    isFileToolkitIcon(icon) || (isBuiltinToolkitIcon(icon) && Boolean(icon?.backgroundColor));

  /* The Ink surface is dark in both themes — copy stays white. */
  const kickerColor = "rgba(255,255,255,0.72)";
  const titleColor = "#ffffff";
  const blurbColor = "rgba(255,255,255,0.66)";

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
        style={{
          backgroundColor: "#0c0f15",
          cursor: onClick ? "pointer" : "default",
          overflow: "hidden",
        }}
        body_style={{
          padding: "68px 22px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: INK_STATIC_FALLBACK, borderRadius: 13 }}
        />
        <DisplacementWarp
          {...INK_WARP}
          style={{ zIndex: 0, filter: `blur(${INK_BLUR}px)`, inset: -(INK_BLUR * 2) }}
        />
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
