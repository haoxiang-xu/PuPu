import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Select from "../../BUILTIN_COMPONENTs/select/select";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SettingsRow — label + description + children                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const SettingsRow = ({ label, description, children }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0",
        gap: 24,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontFamily: theme?.font?.fontFamily || "inherit",
            color: isDark ? "#fff" : "#222",
            marginBottom: description ? 2 : 0,
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: isDark ? "#fff" : "#222",
              opacity: 0.45,
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SettingsSection — title + grouped rows                                                                                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const SettingsSection = ({ title, icon, children }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div style={{ marginBottom: 8 }}>
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "12px 0 4px",
          }}
        >
          {icon && (
            <Icon
              src={icon}
              style={{
                width: 20,
                height: 20,
                opacity: 0.75,
              }}
            />
          )}
          <span
            style={{
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "inherit",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: isDark ? "#fff" : "#222",
              opacity: 0.35,
            }}
          >
            {title}
          </span>
        </div>
      )}
      <div
        style={{
          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Appearance settings page                                                                                                   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const AppearanceSettings = () => {
  const {
    onThemeMode,
    setOnThemeMode,
    syncWithSystemTheme,
    setSyncWithSystemTheme,
    locale,
    setLocale,
  } = useContext(ConfigContext);

  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";

  const themeValue = syncWithSystemTheme ? "sync_with_browser" : onThemeMode;

  const selectStyle = {
    minWidth: 140,
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.05)",
  };
  const selectOptionStyle = { height: 28, padding: "4px 8px", fontSize: 13 };
  const selectDropdownStyle = { padding: 4, maxHeight: 220, minWidth: 180 };

  return (
    <div>
      <SettingsSection title={t("appearance.title")}>
        <SettingsRow
          label={t("appearance.theme_mode")}
          description={t("appearance.theme_mode_desc")}
        >
          <Select
            options={[
              { value: "light_mode", label: t("appearance.theme_light") },
              { value: "dark_mode", label: t("appearance.theme_dark") },
              { value: "sync_with_browser", label: t("appearance.theme_system") },
            ]}
            value={themeValue}
            set_value={(val) => {
              if (val === "sync_with_browser") {
                setSyncWithSystemTheme(true);
              } else {
                setSyncWithSystemTheme(false);
                setOnThemeMode(val);
              }
            }}
            filterable={false}
            style={selectStyle}
            option_style={selectOptionStyle}
            dropdown_style={selectDropdownStyle}
          />
        </SettingsRow>

        <SettingsRow
          label={t("appearance.language")}
          description={t("appearance.language_desc")}
        >
          <Select
            options={[
              { value: "en", label: "English" },
              { value: "zh-CN", label: "简体中文" },
              { value: "zh-TW", label: "繁體中文" },
              { value: "ja", label: "日本語" },
              { value: "ko", label: "한국어" },
              { value: "es", label: "Español" },
              { value: "fr", label: "Français" },
              { value: "de", label: "Deutsch" },
              { value: "it", label: "Italiano" },
              { value: "pt-BR", label: "Português (BR)" },
              { value: "ru", label: "Русский" },
            ]}
            value={locale}
            set_value={setLocale}
            filterable={true}
            style={selectStyle}
            option_style={selectOptionStyle}
            dropdown_style={selectDropdownStyle}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};
