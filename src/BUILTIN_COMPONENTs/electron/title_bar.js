import { useContext, useEffect, useState } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../input/button";

const TOP_BAR_HEIGHT = 50;

const getRuntimePlatform = () => {
  if (typeof window === "undefined") {
    return "web";
  }
  if (window.osInfo && typeof window.osInfo.platform === "string") {
    return window.osInfo.platform;
  }
  if (window.runtime && typeof window.runtime.platform === "string") {
    return window.runtime.platform;
  }
  return "web";
};
const hasElectronWindowControls = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(
    window.runtime?.isElectron === true &&
    window.windowStateAPI &&
    typeof window.windowStateAPI.windowStateEventHandler === "function",
  );
};
const WINDOWS_CONTROL_ICONS = {
  close: "windows_close_button",
  maximize: "windows_maximize_button",
  minimize: "windows_minimize_button",
  restore: "windows_restore_button",
};
const TitleBar = () => {
  const { theme, onFragment, setOnFragment } = useContext(ConfigContext);
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);

  const isElectron = hasElectronWindowControls();
  const platform = getRuntimePlatform();
  const isDarwin = platform === "darwin";

  useEffect(() => {
    if (!isElectron || !window.windowStateAPI) {
      return undefined;
    }

    const cleanup = window.windowStateAPI.windowStateEventListener(
      ({ isMaximized }) => {
        setWindowIsMaximized(Boolean(isMaximized));
      },
    );

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
    if (
      !window.windowStateAPI ||
      typeof window.windowStateAPI.windowStateEventHandler !== "function"
    ) {
      return;
    }
    window.windowStateAPI.windowStateEventHandler(action);
  };

  const topBarBackground = theme?.backgroundColor || "rgba(22, 22, 24, 0.86)";
  const topBarForeground = theme?.color || "rgba(255, 255, 255, 0.92)";

  const controlButtonStyle = (action) => {
    const onCloseButton = action === "close";
    const defaultBackgroundColor = onCloseButton
      ? "rgba(255, 255, 255, 0.06)"
      : "rgba(255, 255, 255, 0.14)";
    return {
      root: {
        width: 30,
        height: 30,
        borderRadius: 8,
        color: theme?.icon?.color || topBarForeground,
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
          width: 13,
          height: 13,
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
        zIndex: 2048,
        borderBottom: `1px solid ${theme?.foregroundColor || "rgba(255, 255, 255, 0.08)"}`,
        backgroundColor: topBarBackground,
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
          left: isDarwin ? 125 : 14,
          transform: "translateY(-50%)",
          opacity: 0.84,
          fontFamily: "Jost, sans-serif",
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
            right: 10,
            transform: "translateY(-50%)",
            display: "flex",
            gap: 6,
            WebkitAppRegion: "no-drag",
          }}
        >
          <Button
            prefix_icon={WINDOWS_CONTROL_ICONS.minimize}
            style={controlButtonStyle("minimize")}
            onClick={() => runWindowAction("minimize")}
          />
          <Button
            prefix_icon={
              windowIsMaximized
                ? WINDOWS_CONTROL_ICONS.restore
                : WINDOWS_CONTROL_ICONS.maximize
            }
            style={controlButtonStyle("maximize")}
            onClick={() => runWindowAction("maximize")}
          />
          <Button
            prefix_icon={WINDOWS_CONTROL_ICONS.close}
            style={controlButtonStyle("close")}
            onClick={() => runWindowAction("close")}
          />
        </div>
      ) : null}
    </div>
  );
};

export { TOP_BAR_HEIGHT };
export default TitleBar;
