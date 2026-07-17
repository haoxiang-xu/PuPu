import { useEffect, useState, useContext } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import { hexToRgbTriplet } from "../../CONTAINERs/config/theme_semantic";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import bootProgress from "../../SERVICEs/boot_progress";

/* Semantic default accent — only hit if ConfigContext hasn't resolved yet. */
const FALLBACK_ACCENT = "#65c466";
const FALLBACK_BG = { light_mode: "#ffffff", dark_mode: "#121212" };
const FALLBACK_TEXT_RGB = { light_mode: "34,34,34", dark_mode: "255,255,255" };

const EXIT_MS = 240;

/**
 * BootOverlay
 *
 * Full-screen boot gate. Takes over the static #boot-overlay shell on mount,
 * then owns rendering from bootProgress.subscribe(). Solid theme-colored
 * ground, a wordmark, a thin progress bar while loading; once `ready` (chat
 * reached its first screen, or the 8s failsafe fired) a single Enter button
 * replaces the bar — clicking it fades the overlay out and unmounts. The
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

  const accent = theme?.semantic?.accent || FALLBACK_ACCENT;
  const background =
    theme?.semantic?.background ||
    (isDark ? FALLBACK_BG.dark_mode : FALLBACK_BG.light_mode);
  const textRgb =
    hexToRgbTriplet(theme?.semantic?.text) ||
    (isDark ? FALLBACK_TEXT_RGB.dark_mode : FALLBACK_TEXT_RGB.light_mode);

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
      <div style={{ position: "relative", width: 200, height: 40 }}>
        {/* loading bar */}
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
          <div
            style={{
              width: 160,
              height: 3,
              borderRadius: 2,
              overflow: "hidden",
              background: `rgba(${textRgb}, 0.08)`,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${state.pct}%`,
                borderRadius: 2,
                background: accent,
                transition: "width 300ms ease",
              }}
            />
          </div>
        </div>

        {/* single solid Enter button, appears when ready */}
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
          {state.ready ? (
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
    </div>
  );
};

export default BootOverlay;
