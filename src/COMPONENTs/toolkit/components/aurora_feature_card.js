import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import AuroraBackground from "../../../BUILTIN_COMPONENTs/background/aurora_background/aurora_background";
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
const AURORA_COLORS = ["#4a5bd8", "#8a5dd6", "#0ea5b7"];
const AURORA_BLUR = 40;
const AURORA_SPEED = 0.5;

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

  /* Light theme flips the aurora veil to a bright wash and the copy to dark
     ink — the aurora orbs themselves stay identical in both themes (they're
     the one deliberately "always-on" surface, per the mockup's screen note:
     "全页唯一‘活’的表面"). */
  const veilColor = isDark ? "rgba(16,16,20,0.44)" : "rgba(255,255,255,0.5)";
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
      <AuroraBackground colors={AURORA_COLORS} blur={AURORA_BLUR} speed={AURORA_SPEED} />
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
