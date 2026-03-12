const SETTINGS_STORAGE_KEY = "settings";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readSettingsRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    );
    return isObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

export const isDevSettingsAvailable = () => {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return window.runtime?.isElectron === true;
};

export const readDevSettings = () => {
  const root = readSettingsRoot();
  const dev = isObject(root.dev) ? root.dev : {};

  return {
    chrome_terminal_enabled: dev.chrome_terminal_enabled === true,
  };
};

export const writeDevSettings = (patch = {}) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return readDevSettings();
  }

  const root = readSettingsRoot();
  const current = isObject(root.dev) ? root.dev : {};
  const next = { ...current };

  if (Object.prototype.hasOwnProperty.call(patch, "chrome_terminal_enabled")) {
    next.chrome_terminal_enabled = patch.chrome_terminal_enabled === true;
  }

  root.dev = next;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));

  return {
    chrome_terminal_enabled: next.chrome_terminal_enabled === true,
  };
};
