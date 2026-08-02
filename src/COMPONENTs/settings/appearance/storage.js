import {
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
  SEMANTIC_FAMILIES,
} from "../../../BUILTIN_COMPONENTs/theme/semantic_tokens";
import {
  readNamespace,
  updateNamespace,
} from "../../../SERVICEs/settings_repository";

const APPEARANCE_NAMESPACE = "appearance";

const DERIVED_TIERS = Object.values(SEMANTIC_FAMILIES).flatMap(
  (f) => f.children,
);

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

const readAppearance = () => {
  const appearance = readNamespace(APPEARANCE_NAMESPACE, {});
  return isObject(appearance) ? appearance : {};
};

const defaultTheme = () => ({
  preset: "default",
  custom: { light_mode: {}, dark_mode: {} },
});

export const readThemeSettings = () => {
  const appearance = readAppearance();
  const theme = isObject(appearance.theme) ? appearance.theme : {};
  const custom = isObject(theme.custom) ? theme.custom : {};
  const result = stripAutoTiers({
    preset: typeof theme.preset === "string" ? theme.preset : "default",
    custom: {
      light_mode: isObject(custom.light_mode) ? { ...custom.light_mode } : {},
      dark_mode: isObject(custom.dark_mode) ? { ...custom.dark_mode } : {},
    },
  });
  if (isObject(theme.details)) {
    result.details = {
      light_mode: isObject(theme.details.light_mode)
        ? { ...theme.details.light_mode }
        : {},
      dark_mode: isObject(theme.details.dark_mode)
        ? { ...theme.details.dark_mode }
        : {},
    };
  }
  return result;
};

const persist = (theme) => {
  /* Merge into the namespace so sibling appearance keys (theme_mode, locale)
     survive. Legacy parity: the pre-repository writeRoot called
     localStorage.setItem bare, so a synchronous write failure (quota) must
     keep throwing to the caller — throwSyncWriteErrors restores that in
     fallback mode. Everything else (SQL-mode async persistence, missing
     localStorage) stays silent via the noop catch, mirroring the legacy
     early-return/fire-and-forget behavior. */
  updateNamespace(
    APPEARANCE_NAMESPACE,
    (current) => {
      const appearance = isObject(current) ? current : {};
      return { ...appearance, theme };
    },
    { throwSyncWriteErrors: true },
  ).catch(() => {});
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

export const writeThemeDetails = (details) => {
  const theme = readThemeSettings();
  theme.details = {
    light_mode: isObject(details?.light_mode) ? details.light_mode : {},
    dark_mode: isObject(details?.dark_mode) ? details.dark_mode : {},
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
