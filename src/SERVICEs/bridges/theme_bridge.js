import { assertBridgeMethod, hasBridgeMethod } from "../api.shared";

export const themeBridge = {
  isBackgroundColorAvailable: () =>
    hasBridgeMethod("themeAPI", "setBackgroundColor"),
  isThemeModeAvailable: () => hasBridgeMethod("themeAPI", "setThemeMode"),

  setBackgroundColor: (color) => {
    if (!themeBridge.isBackgroundColorAvailable()) {
      return false;
    }

    try {
      const method = assertBridgeMethod("themeAPI", "setBackgroundColor");
      method(color);
      return true;
    } catch (_error) {
      return false;
    }
  },

  setThemeMode: (mode) => {
    if (!themeBridge.isThemeModeAvailable()) {
      return false;
    }

    try {
      const method = assertBridgeMethod("themeAPI", "setThemeMode");
      method(mode);
      return true;
    } catch (_error) {
      return false;
    }
  },
};

export default themeBridge;
