import { useEffect, useState, useContext } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import CellSplitSpinner from "../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import bootProgress from "../../SERVICEs/boot_progress";

/* Semantic default accent — only hit if ConfigContext hasn't resolved yet. */
const FALLBACK_ACCENT = "#65c466";
const FALLBACK_BG = { light_mode: "#ffffff", dark_mode: "#121212" };

const EXIT_MS = 240;

/* Hold the big-split loading animation for at least a few full cycles even
   if the app boots faster — the cell animation is 1800ms/cycle at speed 1. */
const MIN_LOADING_MS = 1800 * 3;

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
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    bootProgress.takeOver();
    const unsub = bootProgress.subscribe(setState);
    const timer = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  /* Only calm the cells + surface Enter once the app is ready AND the
     loading animation has run its minimum few cycles. */
  const ready = state.ready && minElapsed;

  const accent = theme?.semantic?.accent || FALLBACK_ACCENT;
  const background =
    theme?.semantic?.background ||
    (isDark ? FALLBACK_BG.dark_mode : FALLBACK_BG.light_mode);

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
      {/* blurred cell-split spinner IS the loading indicator; when ready the
          cells pull in to a small gentle breath (still alive, just calm). */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "blur(28px)",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      >
        <CellSplitSpinner
          size={280}
          color={accent}
          cells={5}
          stagger={80}
          spread={ready ? 0.22 : 0.9}
          speed={ready ? 0.7 : 1}
          spin={!ready}
        />
      </div>

      {/* single solid Enter button, appears when ready */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(8px)",
          pointerEvents: ready ? "auto" : "none",
          transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`,
        }}
      >
        {ready ? (
          <Button
            label="Enter"
            onClick={handleEnter}
            style={{
              root: {
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: 1,
                color: background,
                borderRadius: 999,
                paddingVertical: 9,
                paddingHorizontal: 30,
                background: accent,
              },
              background: {
                hoverBackgroundColor: accent,
                activeBackgroundColor: accent,
              },
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default BootOverlay;
