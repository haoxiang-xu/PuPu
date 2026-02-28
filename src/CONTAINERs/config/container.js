import { useCallback, useEffect, useState } from "react";
import {
  useSystemTheme,
  useWindowSize,
  useWebBrowser,
  useDeviceType,
} from "../../BUILTIN_COMPONENTs/mini_react/mini_use";

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Scrollable from "../../BUILTIN_COMPONENTs/class/scrollable";
import TitleBar from "../../BUILTIN_COMPONENTs/electron/title_bar";
import SideMenu from "../../COMPONENTs/side-menu/side_menu";
import InitSetupModal from "../../COMPONENTs/init-setup/init_setup_modal";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "./context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Init Setup } ------------------------------------------------------------------------------------------------------------ */
import { isSetupComplete } from "../../COMPONENTs/init-setup/init_setup_storage";
/* { Init Setup } ------------------------------------------------------------------------------------------------------------ */

/* { Data } ------------------------------------------------------------------------------------------------------------------ */
import available_themes from "../../BUILTIN_COMPONENTs/theme/theme_manifest";
/* { Data } ------------------------------------------------------------------------------------------------------------------ */

/* { Helpers } ----------------------------------------------------------------------------------------------------------- */
const SETTINGS_STORAGE_KEY = "settings";

const loadSettingsStorage = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const saveSettingsStorage = (path, data) => {
  try {
    const root = loadSettingsStorage() || {};
    const section = root[path] || {};
    root[path] = { ...section, ...data };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
  } catch {}
};

/* remove legacy top-level keys that were migrated into "settings" */
const migrateSettingsStorage = () => {
  try {
    localStorage.removeItem("appearance");
  } catch {}
};
migrateSettingsStorage();
/* { Helpers } ----------------------------------------------------------------------------------------------------------- */

const ConfigContainer = ({ children }) => {
  /* { STYLE } =========================================================================================================== */
  /* { global theme } ---------------------------------------------------------------------------------------------------- */
  const system_theme = useSystemTheme();

  /* load persisted appearance on first render */
  const _persisted = loadSettingsStorage();
  const _persistedThemeMode = _persisted?.appearance?.theme_mode;

  const [syncWithSystemTheme, setSyncWithSystemTheme] = useState(
    _persistedThemeMode === "sync_with_browser" || _persistedThemeMode == null,
  );
  const [theme, setTheme] = useState(null);
  const [onThemeMode, setOnThemeMode] = useState(
    _persistedThemeMode && _persistedThemeMode !== "sync_with_browser"
      ? _persistedThemeMode
      : system_theme === "dark_mode"
        ? "dark_mode"
        : "light_mode",
  );
  const [availableThemes, setAvailableThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const initialize_theme = useCallback(() => {
    /* only reset to system theme if no persisted preference */
    if (!_persistedThemeMode) {
      setOnThemeMode(system_theme);
    }
    setAvailableThemes(Object.keys(available_themes));
    setSelectedTheme(Object.keys(available_themes)[0]);
  }, [system_theme, _persistedThemeMode]);
  useEffect(() => {
    initialize_theme();
  }, [initialize_theme]);
  useEffect(() => {
    if (
      available_themes &&
      available_themes[selectedTheme] &&
      available_themes[selectedTheme][onThemeMode]
    ) {
      setTheme(available_themes[selectedTheme][onThemeMode]);
    }
  }, [onThemeMode, selectedTheme]);
  useEffect(() => {
    if (theme?.backgroundColor && window.themeAPI?.setBackgroundColor) {
      window.themeAPI.setBackgroundColor(theme.backgroundColor);
    }
  }, [theme]);
  useEffect(() => {
    if (!window.themeAPI?.setThemeMode) {
      return;
    }

    const themeModeForNativePicker = syncWithSystemTheme
      ? "sync_with_browser"
      : onThemeMode;
    window.themeAPI.setThemeMode(themeModeForNativePicker);
  }, [onThemeMode, syncWithSystemTheme]);
  useEffect(() => {
    if (syncWithSystemTheme && system_theme) {
      setOnThemeMode(system_theme);
    }
  }, [syncWithSystemTheme, system_theme]);
  /* persist appearance preference to localStorage */
  useEffect(() => {
    saveSettingsStorage("appearance", {
      theme_mode: syncWithSystemTheme ? "sync_with_browser" : onThemeMode,
    });
  }, [onThemeMode, syncWithSystemTheme]);
  /* { global theme } ---------------------------------------------------------------------------------------------------- */
  /* { STYLE } =========================================================================================================== */

  /* { ENVIRONMENT } ===================================================================================================== */
  const window_size = useWindowSize();
  const env_browser = useWebBrowser();
  const device_type = useDeviceType();
  /* { ENVIRONMENT } ===================================================================================================== */

  const [onFragment, setOnFragment] = useState("main");

  /* { Init Setup } ============================================ */
  const [showInitSetup, setShowInitSetup] = useState(() => !isSetupComplete());
  /* { Init Setup } ============================================ */

  return (
    <ConfigContext.Provider
      value={{
        /* { STYLE } ========================================== */
        syncWithSystemTheme,
        setSyncWithSystemTheme,
        availableThemes,
        theme,
        setTheme,
        onThemeMode,
        setOnThemeMode,
        /* { ENVIRONMENT } ==================================== */
        window_size,
        env_browser,
        device_type,
        /* { OTHERS } =========================================== */
        onFragment,
        setOnFragment,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme?.backgroundColor || "#00000000",
        }}
      >
        <TitleBar />
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 4,
            right: 4,
            bottom: 0,
          }}
        >
          {children}
        </div>
        <SideMenu />
        <InitSetupModal
          open={showInitSetup}
          onClose={() => setShowInitSetup(false)}
        />
      </div>
      <Scrollable />
    </ConfigContext.Provider>
  );
};

export default ConfigContainer;
