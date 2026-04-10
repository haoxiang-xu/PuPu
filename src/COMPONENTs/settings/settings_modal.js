import { useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { AppearanceSettings } from "./appearance";
import { ModelProvidersSettings } from "./model_providers";
import { LocalStorageSettings } from "./local_storage";
import { MemorySettings } from "./memory";
import { RuntimeSettings } from "./runtime";
import { AppUpdateSettings } from "./app_update";
import { TokenUsageSettings } from "./token_usage";
import { DevSettings } from "./dev";
import { isDevSettingsAvailable } from "./dev/storage";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../SERVICEs/feature_flags";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Settings pages configuration                                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PAGE_COMPONENTS = {
  appearance: AppearanceSettings,
  model_providers: ModelProvidersSettings,
  runtime: RuntimeSettings,
  memory: MemorySettings,
  token_usage: TokenUsageSettings,
  app_update: AppUpdateSettings,
  local_storage: LocalStorageSettings,
  dev: DevSettings,
};

const BASE_SETTINGS_PAGES = [
  { key: "appearance",      icon: "color",          labelKey: "settings.appearance" },
  { key: "model_providers", icon: "pentagon",        labelKey: "settings.model_providers" },
  { key: "runtime",         icon: "folder_2",        labelKey: "settings.workspaces" },
  { key: "memory",          icon: "brain",           labelKey: "settings.memory" },
  { key: "token_usage",     icon: "bar_chart",       labelKey: "settings.token_usage" },
  { key: "app_update",      icon: "download_cloud",  labelKey: "settings.update" },
  { key: "local_storage",   icon: "data",            labelKey: "settings.local_storage" },
];

const DEV_SETTINGS_PAGE = {
  key: "dev",
  icon: "code",
  labelKey: "settings.dev",
  pinToBottom: true,
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SettingsModal — modal wrapper for settings pages                                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const SettingsModal = ({ open, onClose }) => {
  const { onThemeMode, theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const [selectedPage, setSelectedPage] = useState("appearance");
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());

  useEffect(() => {
    setFeatureFlags(readFeatureFlags());
    return subscribeFeatureFlags(setFeatureFlags);
  }, []);

  const settingsPages = useMemo(() => {
    const pages = BASE_SETTINGS_PAGES.filter((page) => {
      if (page.key === "app_update") {
        return featureFlags.enable_app_update_settings === true;
      }

      return true;
    });

    if (isDevSettingsAvailable()) {
      pages.push(DEV_SETTINGS_PAGE);
    }
    return pages;
  }, [featureFlags]);
  const activePage =
    settingsPages.find((p) => p.key === selectedPage) ||
    settingsPages[0] ||
    null;
  const ActivePageComponent = PAGE_COMPONENTS[activePage?.key] || AppearanceSettings;

  useEffect(() => {
    if (!activePage && settingsPages[0]) {
      setSelectedPage(settingsPages[0].key);
      return;
    }

    if (activePage && activePage.key !== selectedPage) {
      setSelectedPage(activePage.key);
    }
  }, [activePage, selectedPage, settingsPages]);

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
          padding: "16px 10px 10px",
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
          {t("settings.title")}
        </div>

        {/* Menu items */}
        {settingsPages.map((page) => (
          <Button
            key={page.key}
            prefix_icon={page.icon}
            label={t(page.labelKey)}
            onClick={() => setSelectedPage(page.key)}
            style={{
              width: "100%",
              justifyContent: "flex-start",
              fontSize: 13,
              opacity: selectedPage === page.key ? 1 : 0.65,
              padding: "8px 12px",
              borderRadius: 7,
              iconSize: 16,
              marginTop: page.pinToBottom ? "auto" : 0,
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
            fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
            color: isDark ? "#fff" : "#222",
            padding: "24px 32px 8px",
          }}
        >
          {activePage ? t(activePage.labelKey) : t("settings.title")}
        </div>

        {/* Page content */}
        <div
          className="scrollable"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 0 24px 32px",
          }}
        >
          <div style={{ paddingRight: 32 }}>
            <ActivePageComponent onNavigate={setSelectedPage} />
          </div>
        </div>
      </div>
    </Modal>
  );
};
