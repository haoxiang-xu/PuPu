import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Select from "../../BUILTIN_COMPONENTs/select/select";

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

export const SettingsSection = ({ title, children }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div style={{ marginBottom: 8 }}>
      {title && (
        <div
          style={{
            fontSize: 11,
            fontFamily: theme?.font?.fontFamily || "inherit",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: isDark ? "#fff" : "#222",
            opacity: 0.35,
            padding: "12px 0 4px",
          }}
        >
          {title}
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
  } = useContext(ConfigContext);

  const themeValue = syncWithSystemTheme ? "sync_with_browser" : onThemeMode;

  return (
    <div>
      <SettingsSection title="Appearance">
        <SettingsRow
          label="Theme Mode"
          description="Choose between light and dark mode"
        >
          <Select
            options={[
              { value: "light_mode", label: "Light" },
              { value: "dark_mode", label: "Dark" },
              { value: "sync_with_browser", label: "System" },
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
            style={{
              minWidth: 140,
              fontSize: 13,
              paddingVertical: 4,
              paddingHorizontal: 10,
            }}
            option_style={{ height: 28, padding: "4px 8px", fontSize: 13 }}
            dropdown_style={{ padding: 4 }}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};
