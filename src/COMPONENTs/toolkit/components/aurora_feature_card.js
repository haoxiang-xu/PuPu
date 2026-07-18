import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import DisplacementWarp from "../../../BUILTIN_COMPONENTs/background/displacement_warp/displacement_warp";
import { ToolkitIconFrame } from "./toolkit_icon";

/* AuroraFeatureCard — the Discover page's featured/hero card (C2 design
   authority: 2026-07-18 discover-c2 mockup, screen "C2"). Lives outside
   shell_background_guard's SHELL_FILES scan (CategoryChip precedent —
   category_chip.js) because it owns literal aurora/orb/pill color values
   that the page itself keeps var()-based.

   AuroraBackground (ported verbatim from mini_ui) supplies the drifting
   color-orb layer; a flat veil div sits above it for text contrast (44%
   dark / 50% white — see AURORA_VEIL below), and the icon/kicker/title/
   blurb/pill content sits in a third, z-indexed layer on top of that. The
   pill itself is a two-state affair the mockup pins exact colors for:
   installed ("OPEN") gets a translucent-white pill on white text, and
   not-installed gets the same white-chip "GET" look every other App-Store
   surface's install pill converges on (rgba(255,255,255,.92) bg, indigo
   text) — kept bespoke here rather than reusing PluginInstallPill because
   PluginInstallPill's own "installed" look (muted gray) doesn't read on an
   aurora background; the underlying install-state MACHINE is still fully
   owned by the caller (usePluginInstallState) — this component is presentation
   only, driven by pillLabel/pillOpen/pillDisabled/pillInstalling. */
/* CEO direction 2026-07-18: aurora orbs OUT — mini_ui's "Yours to theme"
   DisplacementWarp look IN (Embered-panel parameters, PuPu-indigo palette,
   "W2" of the warp round). The warp is a slow-flowing WebGL gradient;
   STATIC_FALLBACK renders the same palette as a plain 135° gradient
   underneath, so no-WebGL environments (and jsdom) show a sane card
   instead of a hole (DisplacementWarp returns null on context failure). */
const WARP_COLORS_DARK = ["#141428", "#232649", "#4a5bd8", "#8a5dd6"];
const WARP_COLORS_LIGHT = ["#e4e7f8", "#cdd3f4", "#8a97e8", "#b9a5ef"];
const STATIC_FALLBACK_DARK =
  "linear-gradient(135deg, #141428, #232649 30%, #4a5bd8 55%, #8a5dd6 72%, #1c1c3a 95%)";
const STATIC_FALLBACK_LIGHT =
  "linear-gradient(135deg, #e4e7f8, #cdd3f4 30%, #8a97e8 55%, #b9a5ef 72%, #dfe2f6 95%)";
const WARP_PROPS = {
  gradient: "linear",
  gradientAngle: 135,
  warpStrength: 0.08,
  warpScale: 2.6,
  speed: 0.3,
  grain: 0.03,
  interactive: false,
  ambient: true,
  pixelRatio: 1.25,
};

const AuroraFeatureCard = ({
  isDark = false,
  testId,
  onClick,
  icon,
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

  /* Warp palettes are theme-split (dark indigo vs pale indigo) and the veil
     is lighter than the aurora era needed — the warp's own dark end already
     carries the text contrast. */
  const veilColor = isDark ? "rgba(16,16,20,0.30)" : "rgba(255,255,255,0.42)";
  const kickerColor = isDark ? "rgba(255,255,255,0.75)" : "rgba(28,28,33,0.75)";
  const titleColor = isDark ? "#ffffff" : "#1c1c21";
  const blurbColor = isDark ? "rgba(255,255,255,0.68)" : "rgba(28,28,33,0.68)";

  const pillBg = pillOpen ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.92)";
  const pillColor = pillOpen ? "#ffffff" : "#3446c8";

  const handlePillClick = (event) => {
    event.stopPropagation();
    onPillClick?.();
  };

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 13,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: isDark ? STATIC_FALLBACK_DARK : STATIC_FALLBACK_LIGHT,
        }}
      />
      <DisplacementWarp
        colors={isDark ? WARP_COLORS_DARK : WARP_COLORS_LIGHT}
        {...WARP_PROPS}
        style={{ zIndex: 0 }}
      />
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: veilColor, pointerEvents: "none" }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: "rgba(255,255,255,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ToolkitIconFrame
            icon={icon}
            isDark={isDark}
            size={44}
            iconSize={20}
            borderRadius={13}
            style={{ background: "transparent" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
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
              fontSize: 14,
              fontWeight: 650,
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
              fontSize: 11,
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
        </div>

        {pillLabel && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {pillInstalling && <ArcSpinner size={11} stroke_width={2} color={pillColor} />}
            <Button
              label={pillLabel}
              disabled={pillDisabled}
              onClick={handlePillClick}
              style={{
                fontSize: 11,
                fontWeight: 700,
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
        )}
      </div>
    </div>
  );
};

export default AuroraFeatureCard;
