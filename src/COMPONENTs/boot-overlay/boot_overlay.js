import { useContext, useEffect, useMemo, useState } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import { hexToRgbTriplet } from "../../CONTAINERs/config/theme_semantic";
import ShaderBlobBackground from "../../BUILTIN_COMPONENTs/background/shader_blob_background/shader_blob_background";
import DotMatrix from "../../BUILTIN_COMPONENTs/background/dot_matrix/dot_matrix";
import useReducedMotion from "../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import bootProgress from "../../SERVICEs/boot_progress";
import { deriveBlobScene } from "./derive_blob_palette";

/* Same green used as the semantic default accent (SEMANTIC_DEFAULTS) —
   only ever hit if ConfigContext hasn't resolved a theme yet. */
const FALLBACK_ACCENT = "#65c466";
const FALLBACK_TEXT_RGB = { light_mode: "34,34,34", dark_mode: "255,255,255" };

const EXIT_MS = 240;

/**
 * BootOverlay
 *
 * Full-screen, top-z-index React boot gate. Takes over the static
 * #boot-overlay DOM shell (public/index.html) on mount via
 * bootProgress.takeOver(), then owns rendering itself by reading
 * { pct, ready } off bootProgress.subscribe().
 *
 * Renders a themed WebGL shader-blob background + interactive dot-matrix
 * (skipped entirely under prefers-reduced-motion) with a centered wordmark
 * and progress bar. Once `ready` (chat reached its first screen, or the 8s
 * failsafe fired), the bar gives way to an "Enter" button — clicking it
 * fades the whole overlay out and unmounts it. The brand screen is never
 * auto-dismissed; the user always drives the final transition in.
 */
const BootOverlay = () => {
  const { theme, onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  const reducedMotion = useReducedMotion();

  const [state, setState] = useState(() => bootProgress.getState());
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    bootProgress.takeOver();
    return bootProgress.subscribe(setState);
  }, []);

  const accent = theme?.semantic?.accent || FALLBACK_ACCENT;
  const textRgb =
    hexToRgbTriplet(theme?.semantic?.text) ||
    (isDark ? FALLBACK_TEXT_RGB.dark_mode : FALLBACK_TEXT_RGB.light_mode);

  const background = theme?.semantic?.background || (isDark ? "#121212" : "#ffffff");
  const blobScene = useMemo(
    () => deriveBlobScene(accent, background, isDark),
    [accent, background, isDark],
  );
  const particleColor = `rgba(${textRgb}, ${isDark ? 0.14 : 0.10})`;

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => setDismissed(true), EXIT_MS);
  };

  if (dismissed) return null;

  const trackStyle = {
    width: 160,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    background: `rgba(${textRgb}, 0.08)`,
  };
  const barStyle = {
    height: "100%",
    width: `${state.pct}%`,
    borderRadius: 2,
    background: accent,
    transition: "width 300ms ease",
  };
  const enterButton = (
    <Button
      label="Enter"
      onClick={handleEnter}
      style={{
        root: {
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: 1,
          color: accent,
          border: `1px solid ${accent}`,
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 24,
          background: "transparent",
        },
        background: {
          hoverBackgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.05)",
          activeBackgroundColor: isDark
            ? "rgba(255,255,255,0.14)"
            : "rgba(0,0,0,0.08)",
        },
      }}
    />
  );

  const rootStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 2147483647,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    background: "var(--pupu-background, #121212)",
    opacity: exiting ? 0 : 1,
    transition: `opacity ${EXIT_MS}ms ease`,
    pointerEvents: exiting ? "none" : "auto",
  };

  if (reducedMotion) {
    /* Degrades to the same minimal bar + Enter as the static shell — no
       shader/dot-matrix motion, no wordmark/caption embellishment. */
    return (
      <div role="presentation" style={rootStyle}>
        <div style={{ position: "relative", width: 160, height: 40 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: state.ready ? 0 : 1,
              pointerEvents: state.ready ? "none" : "auto",
              transition: `opacity ${EXIT_MS}ms ease`,
            }}
          >
            <div style={trackStyle}>
              <div style={barStyle} />
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: state.ready ? 1 : 0,
              pointerEvents: state.ready ? "auto" : "none",
              transition: `opacity ${EXIT_MS}ms ease`,
            }}
          >
            {state.ready ? enterButton : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="presentation" style={rootStyle}>
      <ShaderBlobBackground
        colors={blobScene.colors}
        shape="mix"
        count={7}
        edge="smooth"
        smooth={0.6}
        speed={0.32}
        rotation={0.3}
        space={1}
        glossy={isDark ? 0.7 : 0.55}
        ao={0.8}
        sss={isDark ? 0.2 : 0.45}
        blur={38}
        lightAzimuth={30}
        lightElevation={55}
        skyTint={blobScene.skyTint}
        groundTint={blobScene.groundTint}
        bgTop={blobScene.bg}
        bgBottom={blobScene.bg}
        bgDepth={4}
        bgFuse={false}
        pixelRatio={1.5}
      />
      <DotMatrix particleColor={particleColor} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          style={{
            fontFamily: "Jost, Segoe UI, system-ui, sans-serif",
            fontSize: 24,
            fontWeight: 300,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "var(--pupu-text)",
          }}
        >
          PuPu
        </div>

        <div style={{ position: "relative", width: 160, height: 40 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: state.ready ? 0 : 1,
              pointerEvents: state.ready ? "none" : "auto",
              transition: `opacity ${EXIT_MS}ms ease`,
            }}
          >
            <div style={trackStyle}>
              <div style={barStyle} />
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: state.ready ? 1 : 0,
              transform: state.ready ? "translateY(0)" : "translateY(8px)",
              pointerEvents: state.ready ? "auto" : "none",
              transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`,
            }}
          >
            {state.ready ? enterButton : null}
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            letterSpacing: 0.5,
            color: `rgba(${textRgb}, 0.5)`,
          }}
        >
          {state.ready ? "Ready when you are" : "Loading…"}
        </div>
      </div>
    </div>
  );
};

export default BootOverlay;
