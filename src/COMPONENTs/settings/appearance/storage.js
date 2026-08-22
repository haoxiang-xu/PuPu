import {
  readNamespace,
  updateNamespace,
} from "../../../SERVICEs/settings_repository";

const APPEARANCE_NAMESPACE = "appearance";

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/* ── Why there is no longer a "redundant key" normaliser ────────────────
   readThemeSettings used to delete any child key whose value equalled the
   preset default, on the theory that such a key carried no information.

   Under the storage law this whole feature rests on — ABSENCE MEANS
   LINKED, PRESENCE MEANS PINNED — that theory is false. The key carries
   the entire distinction between "track the parent" and "stay here even
   when the parent moves". Those two states are observationally identical
   right up until the parent changes, which is exactly when the user finds
   out their pin was thrown away.

   And no value comparison can fix it, because the pin action freezes the
   value currently on screen, which IS the resolved value by construction.
   Measured on the default preset:

     parent untouched   pin writes #151515, preset #151515, derived #151515
     parent customised  pin writes #0e0e0e, preset #151515, derived #0e0e0e

   Comparing against the preset value loses the pin in the first row.
   Comparing against the derived value loses it in BOTH — it would make the
   toggle a universal no-op. The information simply is not recoverable from
   the value, so the only fix that keeps the storage shape is to stop
   discarding keys.

   Keys are now removed only by an explicit user action:
   clearThemeCustomColor, clearThemeDetailValue, resetThemeSettings.

   Cost: an exported theme may list a child whose value equals the default.
   That is not noise — it is the user having said "hold this one". */

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
  const result = {
    preset: typeof theme.preset === "string" ? theme.preset : "default",
    custom: {
      light_mode: isObject(custom.light_mode) ? { ...custom.light_mode } : {},
      dark_mode: isObject(custom.dark_mode) ? { ...custom.dark_mode } : {},
    },
  };
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

/* Pin one strength step's alpha. Presence of the key IS the pinned state —
   the same "missing key means linked" law the hex tiers already follow, so
   no new storage shape and the exported JSON stays byte-legal. */
export const writeThemeDetailValue = (mode, key, value) => {
  const theme = readThemeSettings();
  const details = isObject(theme.details)
    ? theme.details
    : { light_mode: {}, dark_mode: {} };
  theme.details = {
    light_mode: { ...(details.light_mode || {}) },
    dark_mode: { ...(details.dark_mode || {}) },
  };
  theme.details[mode] = { ...theme.details[mode], [key]: value };
  persist(theme);
  return theme;
};

export const clearThemeDetailValue = (mode, key) => {
  const theme = readThemeSettings();
  if (!isObject(theme.details)) return theme;
  const bag = { ...(theme.details[mode] || {}) };
  delete bag[key];
  theme.details = { ...theme.details, [mode]: bag };
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
