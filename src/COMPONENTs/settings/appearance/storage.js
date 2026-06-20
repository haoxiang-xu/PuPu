import {
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
} from "../../../BUILTIN_COMPONENTs/theme/semantic_tokens";

const SETTINGS_STORAGE_KEY = "settings";

const DERIVED_TIERS = ["sidebar", "surface"];

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const presetTierDefault = (preset, mode, tier) => {
  const p = (SEMANTIC_PRESETS[preset] && SEMANTIC_PRESETS[preset][mode]) || {};
  const d = SEMANTIC_DEFAULTS[mode] || {};
  return p[tier] || d[tier];
};

const stripAutoTiers = (theme) => {
  for (const mode of ["light_mode", "dark_mode"]) {
    const bag = theme.custom[mode];
    for (const tier of DERIVED_TIERS) {
      if (bag[tier] && bag[tier] === presetTierDefault(theme.preset, mode, tier)) {
        delete bag[tier];
      }
    }
  }
  return theme;
};

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
  return stripAutoTiers({
    preset: typeof theme.preset === "string" ? theme.preset : "default",
    custom: {
      light_mode: isObject(custom.light_mode) ? { ...custom.light_mode } : {},
      dark_mode: isObject(custom.dark_mode) ? { ...custom.dark_mode } : {},
    },
  });
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

export const clearThemeCustomColor = (mode, key) => {
  const theme = readThemeSettings();
  const bag = { ...theme.custom[mode] };
  delete bag[key];
  theme.custom[mode] = bag;
  persist(theme);
  return theme;
};
