import { useEffect, useState, useContext } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
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
 * ground with a faint blurred 3D torus field as the loading indicator.
 * Once `ready` (chat reached its first screen, or the 8s failsafe fired) a
 * centered "Click anywhere to start" prompt fades in — the whole overlay
 * becomes clickable, and clicking (or
 * Enter/Space) fades it out and unmounts. Never auto-dismissed; the user
 * always drives the final step.
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
    background,
    opacity: exiting ? 0 : 1,
    transition: `opacity ${EXIT_MS}ms ease`,
    pointerEvents: exiting ? "none" : "auto",
    cursor: ready ? "pointer" : "default",
  };

  const onRootKeyDown = (e) => {
    if (ready && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      handleEnter();
    }
  };

  return (
    <div
      role={ready ? "button" : "presentation"}
      aria-label={ready ? "Click anywhere to start" : undefined}
      tabIndex={ready ? 0 : undefined}
      onClick={ready ? handleEnter : undefined}
      onKeyDown={ready ? onRootKeyDown : undefined}
      style={rootStyle}
    >
      {/* faint blurred 3D torus field, theme-derived, ambient only */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          filter: "blur(44px)",
          opacity: 0.32,
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

      {/* centered "click anywhere to start" prompt, fades in when ready.
          While loading, the faint torus field is the only indicator. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: ready ? 1 : 0,
          transition: `opacity ${EXIT_MS}ms ease`,
          pointerEvents: "none",
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: accent,
        }}
      >
        Click anywhere to start
      </div>
    </div>
  );
};

export default BootOverlay;
