import { useContext, useState, useEffect } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SettingsModal } from "../settings/settings_modal";

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
const SideMenu = () => {
  const { theme, onFragment, setOnFragment } = useContext(ConfigContext);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const platform = getRuntimePlatform();
  const isDarwin = platform === "darwin";

  /* ── track window width ───────────────────────────── */
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* ── auto-close side menu when window is too small ── */
  useEffect(() => {
    if (windowWidth < 1000 && onFragment === "side_menu") {
      // Don't auto-close, just let it overlay
      console.log("Window width < 1000, side menu in overlay mode");
    }
  }, [windowWidth, onFragment]);

  return (
    <div
      style={{
        transition: "width 0.3s ease",
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: onFragment === "side_menu" ? 320 : 0,
        backgroundColor: theme?.backgroundColor || "rgba(255,255,255,0.02)",
        borderRight: `1px solid ${theme?.foregroundColor || "rgba(255,255,255,0.06)"}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 2049,
      }}
    >
      <Button
        prefix_icon={
          onFragment === "main" ? "side_menu_left" : "side_menu_close"
        }
        style={{
          position: "absolute",
          top: 25,
          transform: "translate(-50%, -50%)",
          left: isDarwin ? 90 : 14,
          fontSize: 14,
          marginLeft: 12,
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => {
          if (onFragment === "main") {
            setOnFragment("side_menu");
          } else {
            setOnFragment("main");
          }
        }}
      />
      <Button
        prefix_icon="settings"
        label="Settings"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          fontSize: 14,
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => setSettingsOpen(true)}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default SideMenu;
