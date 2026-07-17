import { useEffect, useState, useContext } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import StringSpinner from "../../BUILTIN_COMPONENTs/spinner/string_spinner";
import ShaderBlobBackground from "../../BUILTIN_COMPONENTs/background/shader_blob_background/shader_blob_background";
import { deriveBlobScene } from "./derive_blob_palette";
import bootProgress from "../../SERVICEs/boot_progress";

/* Semantic default accent — only hit if ConfigContext hasn't resolved yet. */
const FALLBACK_ACCENT = "#65c466";
const FALLBACK_BG = { light_mode: "#ffffff", dark_mode: "#121212" };

const EXIT_MS = 240;

/**
 * BootOverlay
 *
 * Full-screen boot gate. Takes over the static #boot-overlay shell on mount,
 * then owns rendering from bootProgress.subscribe(). Solid theme-colored
 * ground with a blurred cell-split spinner as the sole loading indicator.
 * Once `ready` (chat reached its first screen, or the 8s failsafe fired) the
 * cells stop splitting and gather into one still blob, and a single Enter
 * button fades in — clicking it fades the overlay out and unmounts. The
 * screen is never auto-dismissed; the user always drives the final step.
 */
const BootOverlay = () => {
  const { theme, onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";

  const [state, setState] = useState(() => bootProgress.getState());
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    bootProgress.takeOver();
    return bootProgress.subscribe(setState);
  }, []);

  const ready = state.ready;

  const accent = theme?.semantic?.accent || FALLBACK_ACCENT;
  const background =
    theme?.semantic?.background ||
    (isDark ? FALLBACK_BG.dark_mode : FALLBACK_BG.light_mode);
  const blobScene = deriveBlobScene(accent, background, isDark);

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => setDismissed(true), EXIT_MS);
  };

  if (dismissed) return null;

  const rootStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 2147483647,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 26,
    background,
    opacity: exiting ? 0 : 1,
    transition: `opacity ${EXIT_MS}ms ease`,
    pointerEvents: exiting ? "none" : "auto",
  };

  return (
    <div role="presentation" style={rootStyle}>
      {/* faint blurred 3D torus field, theme-derived, ambient only */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          filter: "blur(44px)",
          opacity: 0.22,
          pointerEvents: "none",
        }}
      >
        <ShaderBlobBackground
          colors={blobScene.colors}
          shape="torus"
          count={3}
          edge="smooth"
          smooth={0.6}
          speed={0.22}
          rotation={0.4}
          space={1}
          glossy={isDark ? 0.7 : 0.55}
          ao={0}
          sss={isDark ? 0.2 : 0.45}
          blur={0}
          lightAzimuth={30}
          lightElevation={55}
          skyTint={blobScene.skyTint}
          groundTint={blobScene.groundTint}
          bgTop={blobScene.bg}
          bgBottom={blobScene.bg}
          bgDepth={4}
          bgFuse={false}
          /* rendered tiny then blurred to a faint smudge — the CSS blur(44)
             hides the low resolution, so this cuts fragment work ~14x with
             zero visible change. AO off (invisible under the blur). */
          pixelRatio={0.4}
        />
      </div>

      {/* string spinner IS the loading indicator */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.7,
          pointerEvents: "none",
        }}
      >
        <StringSpinner size={90} n={5} amplitude={7} color={accent} />
      </div>

      {/* bottom "click to enter" text prompt, appears when ready */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 40,
          display: "flex",
          justifyContent: "center",
          zIndex: 1,
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(8px)",
          pointerEvents: ready ? "auto" : "none",
          transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`,
        }}
      >
        {ready ? (
          <Button
            label="Click to enter"
            onClick={handleEnter}
            style={{
              root: {
                fontSize: 12,
                fontWeight: 400,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: accent,
                background: "transparent",
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 8,
              },
              background: {
                hoverBackgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
                activeBackgroundColor: isDark
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(0,0,0,0.07)",
              },
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default BootOverlay;
