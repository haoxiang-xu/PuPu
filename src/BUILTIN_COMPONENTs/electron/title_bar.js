import { useContext, useEffect, useState } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../input/button";
import { Z } from "../layer/z_layers";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
import usePresentationPlatform from "../mini_react/use_presentation_platform";

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
const WINDOWS_CONTROL_ICONS = {
  close: "windows_close_button",
  maximize: "windows_maximize_button",
  minimize: "windows_minimize_button",
  restore: "windows_restore_button",
};
/* GNOME's glyphs; the buttons themselves are Adwaita's round headerbar
   buttons (24px circles on a faint wash, brighter on hover, no red close) */
const LINUX_CONTROL_ICONS = {
  close: "linux_close_button",
  maximize: "linux_maximize_button",
  minimize: "linux_minimize_button",
  restore: "linux_restore_button",
};
const TitleBar = () => {
  const { theme, onFragment, setOnFragment, onThemeMode } = useContext(ConfigContext);
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);

  const isElectron = hasElectronWindowControls();
  /* the PRESENTED platform (#256): a dev override can make a darwin host
     draw the Windows cluster, or a win32 host leave room for traffic lights */
  const platform = usePresentationPlatform();
  const isDarwin = platform === "darwin";
  const isLinux = platform === "linux";
  const controlIcons = isLinux ? LINUX_CONTROL_ICONS : WINDOWS_CONTROL_ICONS;

  useEffect(() => {
    if (!isElectron) {
      return undefined;
    }

    const cleanup = windowStateBridge.onWindowStateChange(({ isMaximized }) => {
      setWindowIsMaximized(Boolean(isMaximized));
    });

    return () => {
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [isElectron]);

  if (!isElectron) {
    return null;
  }

  const runWindowAction = (action) => {
    windowStateBridge.sendWindowAction(action);
  };

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

  /* Adwaita: a 24px circle on alpha(currentColor, .1), .15 on hover, .25
     when pressed; close gets no special colour; 8px between buttons */
  const linuxControlButtonStyle = () => ({
    root: {
      width: 24,
      height: 24,
      borderRadius: 999,
      color: `var(--pupu-text, ${theme?.icon?.color || themeForeground})`,
      backgroundColor: "rgba(var(--pupu-text-rgb),0.10)",
      iconSize: 14,
      paddingVertical: 0,
      paddingHorizontal: 0,
      iconOnlyPaddingVertical: 0,
      iconOnlyPaddingHorizontal: 0,
      WebkitAppRegion: "no-drag",
    },
    background: {
      hoverBackgroundColor: "rgba(var(--pupu-text-rgb),0.16)",
      activeBackgroundColor: "rgba(var(--pupu-text-rgb),0.26)",
    },
    content: {
      root: {
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
      icon: { width: 14, height: 14 },
    },
  });
  const controlButtonStyle = (action) => {
    if (isLinux) return linuxControlButtonStyle();
    const onCloseButton = action === "close";
    const isDark = onThemeMode === "dark_mode";
    const defaultBackgroundColor = isDark
      ? "transparent"
      : onCloseButton
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(255, 255, 255, 0.14)";
    return {
      root: {
        width: 40,
        height: 30,
        borderRadius: 3,
        color: `var(--pupu-text, ${theme?.icon?.color || themeForeground})`,
        backgroundColor: defaultBackgroundColor,
        iconSize: 13,
        paddingVertical: 0,
        paddingHorizontal: 0,
        iconOnlyPaddingVertical: 0,
        iconOnlyPaddingHorizontal: 0,
        WebkitAppRegion: "no-drag",
      },
      background: {
        hoverBackgroundColor: onCloseButton
          ? "rgba(229, 57, 53, 0.92)"
          : "rgba(255, 255, 255, 0.18)",
        activeBackgroundColor: onCloseButton
          ? "rgba(210, 48, 43, 0.95)"
          : "rgba(255, 255, 255, 0.24)",
      },
      content: {
        root: {
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        icon: {
          width: 14,
          height: 14,
        },
      },
      state: {
        hover: {
          root: onCloseButton ? { color: "rgba(255,255,255,0.98)" } : {},
        },
        active: {
          root: onCloseButton ? { color: "rgba(255,255,255,0.98)" } : {},
        },
      },
    };
  };

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
        <div
          style={{
            position: "absolute",
            top: "50%",
            right: isLinux ? 12 : 10,
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: isLinux ? 8 : 1,
            WebkitAppRegion: "no-drag",
          }}
        >
          <Button
            prefix_icon={controlIcons.minimize}
            ariaLabel="Minimize"
            style={{ ...controlButtonStyle("minimize"), ...(isLinux ? {} : { borderRadius: "0px" }) }}
            onClick={() => runWindowAction("minimize")}
          />
          <Button
            prefix_icon={windowIsMaximized ? controlIcons.restore : controlIcons.maximize}
            ariaLabel={windowIsMaximized ? "Restore" : "Maximize"}
            style={{ ...controlButtonStyle("maximize"), ...(isLinux ? {} : { borderRadius: "1px" }) }}
            onClick={() => runWindowAction("maximize")}
          />
          <Button
            prefix_icon={controlIcons.close}
            ariaLabel="Close"
            style={{ ...controlButtonStyle("close"), ...(isLinux ? {} : { borderRadius: "1px" }) }}
            onClick={() => runWindowAction("close")}
          />
        </div>
      ) : null}
    </div>
  );
};

export { TOP_BAR_HEIGHT };
export default TitleBar;
