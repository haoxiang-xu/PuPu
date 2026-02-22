import { useContext, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { AppearanceSettings } from "./appearance";
import { LocalStorageSettings } from "./local_storage";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Settings pages configuration                                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SETTINGS_PAGES = [
  {
    key: "appearance",
    icon: "color",
    label: "Appearance",
    component: AppearanceSettings,
  },
  {
    key: "local_storage",
    icon: "data",
    label: "Local Storage",
    component: LocalStorageSettings,
  },
  // Future pages can be added here:
  // { key: "general", icon: "settings", label: "General", component: GeneralSettings },
  // { key: "account", icon: "user", label: "Account", component: AccountSettings },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SettingsModal — modal wrapper for settings pages                                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const SettingsModal = ({ open, onClose }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [selectedPage, setSelectedPage] = useState("appearance");

  const ActivePageComponent =
    SETTINGS_PAGES.find((p) => p.key === selectedPage)?.component ||
    AppearanceSettings;

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        minWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: isDark ? "#141414" : "#ffffff",
        color: isDark ? "#fff" : "#222",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Left sidebar menu */}
      <div
        style={{
          position: "relative",
          width: 140,
          flexShrink: 0,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.03)"
            : "rgba(0,0,0,0.04)",
          padding: "16px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          borderRight: isDark
            ? "1px solid rgba(255,255,255,0.06)"
            : "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {/* Settings title */}
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: isDark ? "#fff" : "#222",
            opacity: 0.3,
            padding: "8px 12px 12px",
          }}
        >
          Settings
        </div>

        {/* Menu items */}
        {SETTINGS_PAGES.map((page) => (
          <Button
            key={page.key}
            prefix_icon={page.icon}
            label={page.label}
            onClick={() => setSelectedPage(page.key)}
            style={{
              width: "100%",
              justifyContent: "flex-start",
              fontSize: 13,
              opacity: selectedPage === page.key ? 1 : 0.65,
              padding: "8px 12px",
              borderRadius: 7,
              iconSize: 16,
            }}
          />
        ))}
      </div>

      {/* Right content area */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Close button */}
        <Button
          prefix_icon="close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            paddingVertical: 6,
            paddingHorizontal: 6,
            borderRadius: 6,
            opacity: 0.45,
            zIndex: 2,
            content: {
              prefixIconWrap: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
              },
              icon: {
                width: 14,
                height: 14,
              },
            },
          }}
        />

        {/* Page title */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: "NunitoSans, sans-serif",
            color: isDark ? "#fff" : "#222",
            padding: "24px 32px 8px",
          }}
        >
          {SETTINGS_PAGES.find((p) => p.key === selectedPage)?.label ||
            "Settings"}
        </div>

        {/* Page content */}
        <div
          className="scrollable"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 32px 24px",
          }}
        >
          <ActivePageComponent />
        </div>
      </div>
    </Modal>
  );
};
