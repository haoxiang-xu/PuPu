import {
  readNamespace,
  replaceNamespace,
} from "../../../SERVICEs/settings_repository";

const DEV_NAMESPACE = "dev";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readDevSection = () => {
  const dev = readNamespace(DEV_NAMESPACE, {});
  return isObject(dev) ? dev : {};
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
  const dev = readDevSection();

  return {
    chrome_terminal_enabled: dev.chrome_terminal_enabled === true,
  };
};

export const writeDevSettings = (patch = {}) => {
  const current = readDevSection();
  const next = { ...current };

  if (Object.prototype.hasOwnProperty.call(patch, "chrome_terminal_enabled")) {
    next.chrome_terminal_enabled = patch.chrome_terminal_enabled === true;
  }

  // Persist failures stay silent; the returned value reflects the applied
  // patch either way (mirrors the previous synchronous localStorage write).
  replaceNamespace(DEV_NAMESPACE, next).catch(() => {});

  return {
    chrome_terminal_enabled: next.chrome_terminal_enabled === true,
  };
};
