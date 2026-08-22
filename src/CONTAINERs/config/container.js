import { useEffect, useMemo, useRef, useState } from "react";
import {
  useSystemTheme,
  useWindowSize,
  useWebBrowser,
  useDeviceType,
  detectWebBrowser,
  detectDeviceType,
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
import {
  resolveSemanticPalette,
  applySemanticCssVars,
  applySemanticPaletteToTheme,
  resolveThemeDetails,
  persistBootPalette,
} from "./theme_semantic";
import { readThemeSettings } from "../../COMPONENTs/settings/appearance/storage";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../SERVICEs/feature_flags";
import {
  readSettingsRoot,
  readNamespace,
  updateNamespace,
} from "../../SERVICEs/settings_repository";
import * as bootProgress from "../../SERVICEs/boot_progress";

/* { Helpers } ----------------------------------------------------------------------------------------------------------- */
const loadSettingsStorage = () => {
  try {
    return readSettingsRoot();
  } catch {}
  return null;
};

const saveSettingsStorage = (updatesByPath) => {
  try {
    /* Per-namespace writes (settings-sqlite-migration-plan §4.4): each changed
       top-level key is committed through its own updateNamespace — never a
       whole-root overwrite. Unchanged sections are skipped entirely so idle
       re-renders don't cause redundant persistence. */
    Object.entries(updatesByPath).forEach(([namespace, data]) => {
      const section = readNamespace(namespace, undefined) || {};
      const sectionChanged = Object.entries(data).some(
        ([key, value]) => section[key] !== value,
      );
      if (!sectionChanged) return;
      updateNamespace(namespace, (current) => ({
        ...(current || {}),
        ...data,
      })).catch(() => {});
    });
  } catch {}
};

const loadInitialFragment = (persistedSettings) => {
  try {
    return persistedSettings?.ui?.side_menu_open === true
      ? "side_menu"
      : "main";
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
  ru: { body: "Onest", title: "Onest", paragraph: "Onest" },
};

const resolveThemeDefinition = (themeName, themeMode) => {
  if (!themeName || !themeMode) {
    return null;
  }

  return available_themes?.[themeName]?.[themeMode] || null;
};

const defaultThemeColorSettings = () => ({
  preset: "default",
  custom: { light_mode: {}, dark_mode: {} },
});

const applyContainerThemeConfig = (
  base,
  locale,
  themeMode,
  themeColorCustomizationEnabled = false,
) => {
  if (!base) return base;

  const localeFont = LOCALE_FONT[locale] || LOCALE_FONT.en;
  const themeSettings = themeColorCustomizationEnabled
    ? readThemeSettings()
    : defaultThemeColorSettings();
  const semantic = resolveSemanticPalette(themeMode, {
    preset: themeSettings.preset,
    custom: themeSettings.custom,
  });

  const themedBase = applySemanticPaletteToTheme(base, semantic, themeMode);

  return {
    ...themedBase,
    font: {
      ...themedBase.font,
      fontFamily: localeFont.body,
      titleFontFamily: localeFont.title,
      paragraphFontFamily: localeFont.paragraph,
    },
  };
};

const ThemeBootScreen = ({ isDark }) => {
  /* This screen sits under the static #boot-overlay (public/index.html) —
     the overlay owns the visible loading UI for S0-S2. By the time this
     component can render at all, applyInitialSemanticVars() has already
     set --pupu-background/--pupu-text synchronously, so preferring the
     CSS var keeps this in visual lockstep with the overlay above it; the
     literal fallback only matters if that var somehow never got set. */
  const backgroundColor = `var(--pupu-background, ${isDark ? "#121212" : "#FFFFFF"})`;
  const foregroundColor = `var(--pupu-text, ${
    isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)"
  })`;

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
const initialSettingsStorage = loadSettingsStorage();

/* apply persisted locale font as CSS vars synchronously to avoid initial font flash */
const applyInitialLocaleFont = () => {
  if (typeof document === "undefined") return;
  try {
    const persisted = initialSettingsStorage;
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

const applyInitialSemanticVars = () => {
  if (typeof document === "undefined") return;
  try {
    const persisted = initialSettingsStorage;
    const mode = resolveInitialThemeMode(
      persisted?.appearance?.theme_mode,
      "light_mode",
    );
    const themeColorCustomizationEnabled =
      readFeatureFlags().enable_theme_color_customization === true;
    const themeSettings = themeColorCustomizationEnabled
      ? persisted?.appearance?.theme || {}
      : defaultThemeColorSettings();
    const bootPalette = resolveSemanticPalette(mode, {
      preset: themeSettings.preset,
      custom: themeSettings.custom,
    });
    applySemanticCssVars(
      bootPalette,
      undefined,
      resolveThemeDetails(mode, {
        preset: themeSettings.preset,
        details: themeSettings.details,
      }),
    );
    persistBootPalette(bootPalette);
  } catch {}
};
applyInitialSemanticVars();
/* { Helpers } ----------------------------------------------------------------------------------------------------------- */

const readLegacyEnvironmentSnapshot = () => {
  return Object.freeze({
    window_size: Object.freeze({
      width: typeof window !== "undefined" ? window.innerWidth || 0 : 0,
      height: typeof window !== "undefined" ? window.innerHeight || 0 : 0,
    }),
    env_browser: detectWebBrowser(),
    device_type: detectDeviceType(),
  });
};

const EnvironmentProvider = ({ children }) => {
  const window_size = useWindowSize();
  const env_browser = useWebBrowser();
  const device_type = useDeviceType();
  const environmentValue = useMemo(
    () => ({ window_size, env_browser, device_type }),
    [window_size, env_browser, device_type],
  );

  return (
    <EnvironmentContext.Provider value={environmentValue}>
      {children}
    </EnvironmentContext.Provider>
  );
};

const ConfigContainer = ({ children }) => {
  /* { STYLE } =========================================================================================================== */
  /* { global theme } ---------------------------------------------------------------------------------------------------- */
  const system_theme = useSystemTheme();

  /* load persisted appearance on first render */
  const [_persisted] = useState(() => loadSettingsStorage());
  const _persistedThemeMode = _persisted?.appearance?.theme_mode;
  const _persistedLocale = _persisted?.appearance?.locale;
  const [_initialFeatureFlags] = useState(() => readFeatureFlags());
  const [legacyEnvironmentSnapshot] = useState(readLegacyEnvironmentSnapshot);
  const initialThemeMode = resolveInitialThemeMode(
    _persistedThemeMode,
    system_theme,
  );

  const [syncWithSystemTheme, setSyncWithSystemTheme] = useState(
    _persistedThemeMode === "sync_with_browser" || _persistedThemeMode == null,
  );
  const [theme, setTheme] = useState(() =>
    applyContainerThemeConfig(
      resolveThemeDefinition(DEFAULT_THEME_NAME, initialThemeMode),
      _persistedLocale || "en",
      initialThemeMode,
      _initialFeatureFlags.enable_theme_color_customization === true,
    ),
  );
  const [onThemeMode, setOnThemeMode] = useState(initialThemeMode);
  const [locale, setLocale] = useState(_persistedLocale || "en");
  const [featureFlags, setFeatureFlags] = useState(_initialFeatureFlags);
  const [isThemeBooting, setIsThemeBooting] = useState(true);
  const availableThemes = THEME_NAMES;
  const selectedTheme = DEFAULT_THEME_NAME;
  const themeColorCustomizationEnabled =
    featureFlags.enable_theme_color_customization === true;

  useEffect(() => {
    /* Theme settings writes still live in Appearance/ThemeEditor. Direct color
       commits call setTheme there; this effect handles mode, locale, and flag
       changes that require re-resolving the base theme. */
    const base = resolveThemeDefinition(selectedTheme, onThemeMode);
    if (base) {
      const nextTheme = applyContainerThemeConfig(
        base,
        locale,
        onThemeMode,
        themeColorCustomizationEnabled,
      );
      const localeFont = LOCALE_FONT[locale] || LOCALE_FONT.en;
      setTheme(nextTheme);
      const themeSettings = themeColorCustomizationEnabled
        ? readThemeSettings()
        : defaultThemeColorSettings();
      applySemanticCssVars(
        nextTheme.semantic,
        undefined,
        resolveThemeDetails(onThemeMode, {
          preset: themeSettings.preset,
          details: themeSettings.details,
        }),
      );
      persistBootPalette(nextTheme.semantic);
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
  }, [onThemeMode, selectedTheme, locale, themeColorCustomizationEnabled]);
  useEffect(() => {
    setFeatureFlags(readFeatureFlags());
    return subscribeFeatureFlags(setFeatureFlags);
  }, []);
  useEffect(() => {
    if (theme?.backgroundColor) {
      themeBridge.setBackgroundColor({
        backgroundColor: theme.backgroundColor,
        accent: theme.semantic?.accent,
      });
    }
  }, [theme]);
  useEffect(() => {
    if (!theme || !selectedTheme) {
      return;
    }

    setIsThemeBooting(false);
    bootProgress.set(55);
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

  const [onFragment, setOnFragment] = useState(() =>
    loadInitialFragment(_persisted),
  );
  const settingsPersistenceReadyRef = useRef(false);

  useEffect(() => {
    if (!settingsPersistenceReadyRef.current) {
      settingsPersistenceReadyRef.current = true;
      return;
    }
    saveSettingsStorage({
      appearance: {
        theme_mode: syncWithSystemTheme ? "sync_with_browser" : onThemeMode,
        locale,
      },
      ui: {
        side_menu_open: onFragment === "side_menu",
      },
    });
  }, [locale, onFragment, onThemeMode, syncWithSystemTheme]);

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

  const navigationValue = useMemo(
    () => ({ onFragment, setOnFragment }),
    [onFragment],
  );

  /* Legacy combined value — kept for backward compatibility.
     Environment fields are an immutable startup snapshot so resize does not
     invalidate every ConfigContext consumer. Reactive environment users must
     subscribe to EnvironmentContext. */
  const configValue = useMemo(
    () => ({
      ...themeValue,
      ...localeValue,
      ...legacyEnvironmentSnapshot,
      ...navigationValue,
    }),
    [themeValue, localeValue, legacyEnvironmentSnapshot, navigationValue],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
    <LocaleContext.Provider value={localeValue}>
    <EnvironmentProvider>
    <NavigationContext.Provider value={navigationValue}>
    <ConfigContext.Provider value={configValue}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          /* ONE declaration, fallback inside the var — same shape as
             ThemeBootScreen above. A separate literal `backgroundColor`
             alongside a `background: var(...)` shorthand does not degrade
             gracefully: the two write the same CSSOM slot, the literal wins,
             and the shell then paints the JS theme instead of the variable.
             That is invisible at rest (both carry the same value) and shows
             up only while the theme editor is previewing — CSS vars update
             live on every drag, `theme` only on commit, so the shell behind
             the message list used to lag until the picker closed. */
          background: `var(--pupu-background, ${
            theme?.backgroundColor ||
            (onThemeMode === "dark_mode" ? "#121212" : "#FFFFFF")
          })`,
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
    </EnvironmentProvider>
    </LocaleContext.Provider>
    </ThemeContext.Provider>
  );
};

export default ConfigContainer;
