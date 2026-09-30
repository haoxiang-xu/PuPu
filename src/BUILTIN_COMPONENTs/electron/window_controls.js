/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  window_controls                                                               */
/*                                                                                */
/*  The minimize / maximize / close cluster that Windows and Linux draw in the    */
/*  DOM (macOS uses native traffic lights instead, so nothing here renders for    */
/*  it). Extracted from title_bar so a fullscreen modal, which covers the title   */
/*  bar entirely, can put the same cluster on its own top strip rather than       */
/*  leaving the window impossible to minimize or close (#339).                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import { useContext, useEffect, useState } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../input/button";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
import usePresentationPlatform from "../mini_react/use_presentation_platform";

/**
 * Distance from the right edge the cluster is pinned at. Exported so a surface
 * that redraws the cluster (a fullscreen modal covering the title bar) lands it
 * in exactly the same place instead of a near-miss.
 */
export const windowControlsInset = (isLinux) => (isLinux ? 12 : 10);

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

/* Adwaita: a 24px circle on alpha(currentColor, .1), .15 on hover, .25
   when pressed; close gets no special colour; 8px between buttons */
const linuxControlButtonStyle = (theme, themeForeground) => ({
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

const buildControlButtonStyle = ({ action, isLinux, theme, onThemeMode }) => {
  const themeForeground = theme?.color || "rgba(255, 255, 255, 0.92)";
  if (isLinux) return linuxControlButtonStyle(theme, themeForeground);
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
      icon: { width: 14, height: 14 },
    },
    state: {
      hover: { root: onCloseButton ? { color: "rgba(255,255,255,0.98)" } : {} },
      active: {
        root: onCloseButton ? { color: "rgba(255,255,255,0.98)" } : {},
      },
    },
  };
};

/**
 * The cluster's button styling, so a control that shares its row (the Agents
 * modal's exit-fullscreen button) can be drawn as part of the same group
 * instead of a bare glyph floating beside it.
 */
export const useWindowControlButtonStyle = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isLinux = usePresentationPlatform() === "linux";
  return (action) =>
    buildControlButtonStyle({ action, isLinux, theme, onThemeMode });
};

const WindowControls = ({ style }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);

  /* the PRESENTED platform (#256): a dev override can make a darwin host
     draw the Windows cluster, or a win32 host leave room for traffic lights */
  const platform = usePresentationPlatform();
  const isLinux = platform === "linux";
  const controlIcons = isLinux ? LINUX_CONTROL_ICONS : WINDOWS_CONTROL_ICONS;

  useEffect(() => {
    if (!windowStateBridge.isListenerAvailable()) return undefined;
    const cleanup = windowStateBridge.onWindowStateChange(({ isMaximized }) => {
      setWindowIsMaximized(Boolean(isMaximized));
    });
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const runWindowAction = (action) => {
    windowStateBridge.sendWindowAction(action);
  };

  const controlButtonStyle = (action) =>
    buildControlButtonStyle({ action, isLinux, theme, onThemeMode });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isLinux ? 8 : 1,
        WebkitAppRegion: "no-drag",
        ...style,
      }}
    >
      <Button
        prefix_icon={controlIcons.minimize}
        ariaLabel="Minimize"
        style={{
          ...controlButtonStyle("minimize"),
          ...(isLinux ? {} : { borderRadius: "0px" }),
        }}
        onClick={() => runWindowAction("minimize")}
      />
      <Button
        prefix_icon={
          windowIsMaximized ? controlIcons.restore : controlIcons.maximize
        }
        ariaLabel={windowIsMaximized ? "Restore" : "Maximize"}
        style={{
          ...controlButtonStyle("maximize"),
          ...(isLinux ? {} : { borderRadius: "1px" }),
        }}
        onClick={() => runWindowAction("maximize")}
      />
      <Button
        prefix_icon={controlIcons.close}
        ariaLabel="Close"
        style={{
          ...controlButtonStyle("close"),
          ...(isLinux ? {} : { borderRadius: "1px" }),
        }}
        onClick={() => runWindowAction("close")}
      />
    </div>
  );
};

export default WindowControls;
