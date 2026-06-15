const SETTINGS_STORAGE_KEY = "settings";

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const readRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    );
    return isObject(parsed) ? parsed : {};
  } catch (_e) {
    return {};
  }
};

const writeRoot = (root) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
};

const defaultTheme = () => ({
  preset: "default",
  custom: { light_mode: {}, dark_mode: {} },
});

export const readThemeSettings = () => {
  const root = readRoot();
  const appearance = isObject(root.appearance) ? root.appearance : {};
  const theme = isObject(appearance.theme) ? appearance.theme : {};
  const custom = isObject(theme.custom) ? theme.custom : {};
  return {
    preset: typeof theme.preset === "string" ? theme.preset : "default",
    custom: {
      light_mode: isObject(custom.light_mode) ? custom.light_mode : {},
      dark_mode: isObject(custom.dark_mode) ? custom.dark_mode : {},
    },
  };
};

const persist = (theme) => {
  const root = readRoot();
  const appearance = isObject(root.appearance) ? root.appearance : {};
  root.appearance = { ...appearance, theme };
  writeRoot(root);
};

export const writeThemePreset = (preset) => {
  const theme = readThemeSettings();
  theme.preset = preset;
  persist(theme);
  return theme;
};

export const writeThemeCustomColor = (mode, key, value) => {
  const theme = readThemeSettings();
  theme.custom[mode] = { ...theme.custom[mode], [key]: value };
  persist(theme);
  return theme;
};

export const writeThemeCustom = (custom) => {
  const theme = readThemeSettings();
  theme.custom = {
    light_mode: isObject(custom?.light_mode) ? custom.light_mode : {},
    dark_mode: isObject(custom?.dark_mode) ? custom.dark_mode : {},
  };
  persist(theme);
  return theme;
};

export const resetThemeSettings = () => {
  const theme = defaultTheme();
  persist(theme);
  return theme;
};
