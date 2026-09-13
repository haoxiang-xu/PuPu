import { assertBridgeMethod, hasBridgeMethod } from "../api.shared";

export const windowStateBridge = {
  isActionAvailable: () =>
    hasBridgeMethod("windowStateAPI", "windowStateEventHandler"),
  isListenerAvailable: () =>
    hasBridgeMethod("windowStateAPI", "windowStateEventListener"),

  isAvailable: () =>
    windowStateBridge.isActionAvailable() &&
    windowStateBridge.isListenerAvailable(),

  sendWindowAction: (action) => {
    if (!windowStateBridge.isActionAvailable()) {
      return false;
    }

    try {
      const method = assertBridgeMethod(
        "windowStateAPI",
        "windowStateEventHandler",
      );
      method(action);
      return true;
    } catch (_error) {
      return false;
    }
  },

  /* #256 dev only: tell main which platform the UI presents as, so the
     native chrome (darwin traffic lights, maximize semantics) follows.
     Returns false when preload does not offer the method (older preload, web). */
  setPlatformPresentation: (platform) => {
    if (!hasBridgeMethod("windowStateAPI", "setPlatformPresentation")) {
      return false;
    }
    try {
      const method = assertBridgeMethod("windowStateAPI", "setPlatformPresentation");
      method(platform);
      return true;
    } catch (_error) {
      return false;
    }
  },

  onWindowStateChange: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    if (!windowStateBridge.isListenerAvailable()) {
      return () => {};
    }

    try {
      const method = assertBridgeMethod(
        "windowStateAPI",
        "windowStateEventListener",
      );
      const unsubscribe = method((payload) => {
        callback(payload || { isMaximized: false });
      });
      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    } catch (_error) {
      return () => {};
    }
  },
};

export default windowStateBridge;
