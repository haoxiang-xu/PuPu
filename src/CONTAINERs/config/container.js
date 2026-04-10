import { useEffect, useMemo, useState } from "react";
import {
  useSystemTheme,
  useWindowSize,
  useWebBrowser,
  useDeviceType,
} from "../../BUILTIN_COMPONENTs/mini_react/mini_use";

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Scrollable from "../../BUILTIN_COMPONENTs/class/scrollable";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import TitleBar from "../../BUILTIN_COMPONENTs/electron/title_bar";
import SideMenu from "../../COMPONENTs/side-menu/side_menu";
import InitSetupModal from "../../COMPONENTs/init-setup/init_setup_modal";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import {
  ConfigContext,
  ThemeContext,
  EnvironmentContext,
  NavigationContext,
  LocaleContext,
} from "./context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Init Setup } ------------------------------------------------------------------------------------------------------------ */
import { isSetupComplete } from "../../COMPONENTs/init-setup/init_setup_storage";
/* { Init Setup } ------------------------------------------------------------------------------------------------------------ */

/* { Data } ------------------------------------------------------------------------------------------------------------------ */
import available_themes from "../../BUILTIN_COMPONENTs/theme/theme_manifest";
/* { Data } ------------------------------------------------------------------------------------------------------------------ */
import { themeBridge } from "../../SERVICEs/bridges/theme_bridge";
import {
  isDevSettingsAvailable,
  readDevSettings,
} from "../../COMPONENTs/settings/dev/storage";
import { runtimeBridge } from "../../SERVICEs/bridges/unchain_bridge";

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

const loadInitialFragment = () => {
  try {
    const persisted = loadSettingsStorage();
    return persisted?.ui?.side_menu_open === true ? "side_menu" : "main";
  } catch {}
  return "main";
};

const resolveInitialThemeMode = (persistedThemeMode, systemTheme) => {
  if (persistedThemeMode && persistedThemeMode !== "sync_with_browser") {
    return persistedThemeMode;
  }

  return systemTheme === "dark_mode" ? "dark_mode" : "light_mode";
};

const THEME_NAMES = Object.keys(available_themes);
const DEFAULT_THEME_NAME = THEME_NAMES[0] || null;

const LOCALE_FONT = {
  en: { body: "Jost", title: "NunitoSans", paragraph: "NunitoSans" },
  "zh-CN": {
    body: "LXGWWenKai",
    title: "LXGWWenKai",
    paragraph: "LXGWWenKai",
  },
  "zh-TW": {
    body: "LXGWWenKaiTC",
    title: "LXGWWenKaiTC",
    paragraph: "LXGWWenKaiTC",
  },
  ja: { body: "KleeOne", title: "KleeOne", paragraph: "KleeOne" },
  ko: {
    body: "LXGWWenKaiKR",
    title: "LXGWWenKaiKR",
    paragraph: "LXGWWenKaiKR",
  },
  es: { body: "Jost", title: "NunitoSans", paragraph: "NunitoSans" },
  fr: { body: "Jost", title: "NunitoSans", paragraph: "NunitoSans" },
  de: { body: "Jost", title: "NunitoSans", paragraph: "NunitoSans" },
  it: { body: "Jost", title: "NunitoSans", paragraph: "NunitoSans" },
  "pt-BR": { body: "Jost", title: "NunitoSans", paragraph: "NunitoSans" },
};

const resolveThemeDefinition = (themeName, themeMode) => {
  if (!themeName || !themeMode) {
    return null;
  }

  return available_themes?.[themeName]?.[themeMode] || null;
};

const ThemeBootScreen = ({ isDark }) => {
  const backgroundColor = isDark ? "#121212" : "#FFFFFF";
  const foregroundColor = isDark
    ? "rgba(255,255,255,0.75)"
    : "rgba(0,0,0,0.65)";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        backgroundColor,
      }}
    >
      <div
        style={{
          fontFamily: "Jost, Segoe UI, system-ui, sans-serif",
          fontSize: 24,
          fontWeight: 300,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: foregroundColor,
        }}
      >
        PuPu
      </div>
      <ArcSpinner
        size={22}
        stroke_width={2}
        color={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"}
        track_opacity={isDark ? 0.18 : 0.1}
      />
    </div>
  );
};

/* remove legacy top-level keys that were migrated into "settings" */
const migrateSettingsStorage = () => {
  try {
    localStorage.removeItem("appearance");
  } catch {}
};
migrateSettingsStorage();

/* apply persisted locale font as CSS vars synchronously to avoid initial font flash */
const applyInitialLocaleFont = () => {
  if (typeof document === "undefined") return;
  try {
    const persisted = loadSettingsStorage();
    const locale = persisted?.appearance?.locale || "en";
    const localeFont = LOCALE_FONT[locale] || LOCALE_FONT.en;
    document.documentElement.style.setProperty(
      "--pupu-font-family",
      `"${localeFont.body}", sans-serif`,
    );
    document.documentElement.style.setProperty(
      "--pupu-title-font-family",
      `"${localeFont.title}", sans-serif`,
    );
    document.documentElement.style.setProperty(
      "--pupu-paragraph-font-family",
      `"${localeFont.paragraph}", sans-serif`,
    );
  } catch {}
};
applyInitialLocaleFont();
/* { Helpers } ----------------------------------------------------------------------------------------------------------- */

const ConfigContainer = ({ children }) => {
  /* { STYLE } =========================================================================================================== */
  /* { global theme } ---------------------------------------------------------------------------------------------------- */
  const system_theme = useSystemTheme();

  /* load persisted appearance on first render */
  const _persisted = loadSettingsStorage();
  const _persistedThemeMode = _persisted?.appearance?.theme_mode;
  const _persistedLocale = _persisted?.appearance?.locale;
  const initialThemeMode = resolveInitialThemeMode(
    _persistedThemeMode,
    system_theme,
  );

  const [syncWithSystemTheme, setSyncWithSystemTheme] = useState(
    _persistedThemeMode === "sync_with_browser" || _persistedThemeMode == null,
  );
  const [theme, setTheme] = useState(() =>
    resolveThemeDefinition(DEFAULT_THEME_NAME, initialThemeMode),
  );
  const [onThemeMode, setOnThemeMode] = useState(initialThemeMode);
  const [locale, setLocale] = useState(_persistedLocale || "en");
  const [isThemeBooting, setIsThemeBooting] = useState(true);
  const availableThemes = THEME_NAMES;
  const selectedTheme = DEFAULT_THEME_NAME;

  useEffect(() => {
    const base = resolveThemeDefinition(selectedTheme, onThemeMode);
    if (base) {
      const localeFont = LOCALE_FONT[locale] || LOCALE_FONT.en;
      setTheme({
        ...base,
        font: {
          ...base.font,
          fontFamily: localeFont.body,
          titleFontFamily: localeFont.title,
          paragraphFontFamily: localeFont.paragraph,
        },
      });
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty(
          "--pupu-font-family",
          `"${localeFont.body}", sans-serif`,
        );
        document.documentElement.style.setProperty(
          "--pupu-title-font-family",
          `"${localeFont.title}", sans-serif`,
        );
        document.documentElement.style.setProperty(
          "--pupu-paragraph-font-family",
          `"${localeFont.paragraph}", sans-serif`,
        );
      }
    } else {
      setTheme(base);
    }
  }, [onThemeMode, selectedTheme, locale]);
  useEffect(() => {
    if (theme?.backgroundColor) {
      themeBridge.setBackgroundColor(theme.backgroundColor);
    }
  }, [theme]);
  useEffect(() => {
    if (!theme || !selectedTheme) {
      return;
    }

    setIsThemeBooting(false);
  }, [theme, selectedTheme]);
  useEffect(() => {
    if (!themeBridge.isThemeModeAvailable()) {
      return;
    }

    const themeModeForNativePicker = syncWithSystemTheme
      ? "sync_with_browser"
      : onThemeMode;
    themeBridge.setThemeMode(themeModeForNativePicker);
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
  useEffect(() => {
    saveSettingsStorage("appearance", { locale });
  }, [locale]);

  useEffect(() => {
    if (!isDevSettingsAvailable()) {
      return;
    }

    if (!runtimeBridge.isChromeTerminalControlAvailable()) {
      return;
    }

    const devSettings = readDevSettings();
    if (!devSettings.chrome_terminal_enabled) {
      return;
    }

    runtimeBridge.setChromeTerminalOpen(true).catch(() => {});
  }, []);
  /* { global theme } ---------------------------------------------------------------------------------------------------- */
  /* { STYLE } =========================================================================================================== */

  /* { ENVIRONMENT } ===================================================================================================== */
  const window_size = useWindowSize();
  const env_browser = useWebBrowser();
  const device_type = useDeviceType();
  /* { ENVIRONMENT } ===================================================================================================== */

  const [onFragment, setOnFragment] = useState(() => loadInitialFragment());

  useEffect(() => {
    saveSettingsStorage("ui", {
      side_menu_open: onFragment === "side_menu",
    });
  }, [onFragment]);

  /* { Init Setup } ============================================ */
  const [showInitSetup, setShowInitSetup] = useState(() => !isSetupComplete());
  /* { Init Setup } ============================================ */

  /* Memoized sub-context values — components subscribing to a granular
     context only re-render when that specific slice changes. */
  const themeValue = useMemo(
    () => ({
      syncWithSystemTheme,
      setSyncWithSystemTheme,
      availableThemes,
      theme,
      setTheme,
      onThemeMode,
      setOnThemeMode,
    }),
    [syncWithSystemTheme, availableThemes, theme, onThemeMode],
  );

  const localeValue = useMemo(
    () => ({ locale, setLocale }),
    [locale],
  );

  const environmentValue = useMemo(
    () => ({ window_size, env_browser, device_type }),
    [window_size, env_browser, device_type],
  );

  const navigationValue = useMemo(
    () => ({ onFragment, setOnFragment }),
    [onFragment],
  );

  /* Legacy combined value — kept for backward compatibility.
     New code should prefer the granular contexts. */
  const configValue = useMemo(
    () => ({
      ...themeValue,
      ...localeValue,
      ...environmentValue,
      ...navigationValue,
    }),
    [themeValue, localeValue, environmentValue, navigationValue],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
    <LocaleContext.Provider value={localeValue}>
    <EnvironmentContext.Provider value={environmentValue}>
    <NavigationContext.Provider value={navigationValue}>
    <ConfigContext.Provider value={configValue}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor:
            theme?.backgroundColor ||
            (onThemeMode === "dark_mode" ? "#121212" : "#FFFFFF"),
        }}
      >
        {isThemeBooting ? (
          <ThemeBootScreen isDark={onThemeMode === "dark_mode"} />
        ) : (
          <>
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
          </>
        )}
      </div>
      {!isThemeBooting && <Scrollable />}
    </ConfigContext.Provider>
    </NavigationContext.Provider>
    </EnvironmentContext.Provider>
    </LocaleContext.Provider>
    </ThemeContext.Provider>
  );
};

export default ConfigContainer;
