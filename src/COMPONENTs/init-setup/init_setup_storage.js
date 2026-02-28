const SETTINGS_KEY = "settings";

const readSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
};

export const isSetupComplete = () => {
  try {
    return !!readSettings()?.app?.setup_completed;
  } catch {
    return false;
  }
};

export const markSetupComplete = () => {
  try {
    const root = readSettings();
    root.app = { ...(root.app || {}), setup_completed: true };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
};
