import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import ShaderBlobBackground from "../../../BUILTIN_COMPONENTs/background/shader_blob_background/shader_blob_background";
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
/* Ink-toned 3D donut hero (CEO 2026-07-18l): ShaderBlobBackground (the
   "Yours to theme" Sand panel's 3D-object renderer, PuPu's copy carries a
   local AO fast-path) with shape "torus" — blurred glossy donuts drifting
   over the Ink blue-black. Parameter shape follows the Sand panel's blob
   config; palette follows the Ink panel. Dark in BOTH app themes (panel
   carries its own palette), copy stays white. Static conic gradient is the
   no-WebGL fallback. */
const INK_DONUTS = {
  /* Brighter IG-style pink-violet (CEO 2026-07-18o) — luminous gradient family. */
  colors: ["#ff9ee0", "#c77dff", "#ff70a6", "#9d6bff"],
  shape: "torus",
  /* Perf trims (CEO 2026-07-18q): under blur 28 these are visually free —
     3 donuts instead of 5, AO/SSS off (PuPu's shader carries an ao==0
     fast-path that skips the 5-sample march), and 0.66 pixelRatio (~72%
     fewer shaded pixels). Off-screen pause is built into the component. */
  count: 3,
  smooth: 0.6,
  speed: 0.25,
  rotation: 0.3,
  space: 1,
  glossy: 0.68,
  ao: 0,
  sss: 0,
  blur: 28,
  lightAzimuth: 30,
  lightElevation: 55,
  skyTint: "#241432",
  groundTint: "#452a5e",
  bgTop: "#221230",
  bgBottom: "#2b1638",
  bgDepth: 4,
  bgFuse: false,
  pixelRatio: 0.66,
};
const INK_STATIC_FALLBACK =
  "conic-gradient(from 210deg at 60% 40%, #221230, #452a5e 30%, #ff9ee0 52%, #452a5e 68%, #c77dff 84%, #221230)";

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

  /* WebGL init isn't instant — the canvas pops in a beat after mount, which
     reads as a flash over the static fallback (CEO 2026-07-18p). Fade the
     blob layer in over the fallback instead: opacity 0 on first paint,
     eased to 1 on the next frame. */
  const [bgVisible, setBgVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBgVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
          backgroundColor: "#221230",
          border: "none",
          cursor: onClick ? "pointer" : "default",
          /* NO overflow:hidden here — any overflow value other than visible
             forces transform-style back to flat and kills the Card.Layer
             parallax (regression the CEO caught in-app). The backgrounds
             clip themselves in their own absolute wrapper below instead. */
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
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            borderRadius: 13,
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, background: INK_STATIC_FALLBACK }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: bgVisible ? 1 : 0,
              transition: "opacity 1100ms ease",
            }}
          >
            <ShaderBlobBackground {...INK_DONUTS} style={{ zIndex: 0 }} />
          </div>
        </div>
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
