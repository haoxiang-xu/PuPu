import { useContext } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../input/button";
import { Z } from "../layer/z_layers";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
import usePresentationPlatform from "../mini_react/use_presentation_platform";
import WindowControls, { windowControlsInset } from "./window_controls";

const TOP_BAR_HEIGHT = 50;

const hasElectronWindowControls = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(
    window.runtime?.isElectron === true &&
    windowStateBridge.isActionAvailable(),
  );
};
const TitleBar = () => {
  const { theme, onFragment, setOnFragment } = useContext(ConfigContext);

  const isElectron = hasElectronWindowControls();
  /* the PRESENTED platform (#256): a dev override can make a darwin host
     draw the Windows cluster, or a win32 host leave room for traffic lights */
  const platform = usePresentationPlatform();
  const isDarwin = platform === "darwin";
  const isLinux = platform === "linux";

  if (!isElectron) {
    return null;
  }

  /* Read the live CSS variables, not the JS theme. The title bar's fade sits
     directly over the message list, so a stale value reads as the top of the
     list refusing to follow the rest of the shell: `theme` only moves when
     the theme editor commits, while --pupu-* move on every preview frame.
     The JS value stays as the var's fallback — same value, just demoted to
     the role it can actually fill. */
  const themeBackground = theme?.backgroundColor || "rgba(22, 22, 24, 0.86)";
  const themeForeground = theme?.color || "rgba(255, 255, 255, 0.92)";
  const topBarBackground = `var(--pupu-background, ${themeBackground})`;
  const topBarForeground = `var(--pupu-text, ${themeForeground})`;

  // Create gradient background (solid at top, transparent at bottom)
  const gradientBackground = `linear-gradient(180deg, ${topBarBackground} 32%, transparent 100%)`;


  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: TOP_BAR_HEIGHT,
        zIndex: Z.APP_CHROME,
        background: gradientBackground,

        WebkitBackdropFilter: "blur(20px)",
        color: topBarForeground,
        WebkitAppRegion: "drag",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <Button
        prefix_icon={
          onFragment === "main" ? "side_menu_left" : "side_menu_close"
        }
        style={{
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          left: isDarwin ? 90 : 14,
          color: topBarForeground,
          fontSize: 14,
          marginLeft: 12,
          WebkitAppRegion: "no-drag",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onFragment === "main") {
            setOnFragment("side_menu");
          } else {
            setOnFragment("main");
          }
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: isDarwin ? 125 : 54,
          transform: "translateY(-50%)",
          opacity: 0.84,
          fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        PuPu
      </div>

      {!isDarwin ? (
        <WindowControls
          style={{
            position: "absolute",
            top: "50%",
            right: windowControlsInset(isLinux),
            transform: "translateY(-50%)",
          }}
        />
      ) : null}
    </div>
  );
};

export { TOP_BAR_HEIGHT };
export default TitleBar;
