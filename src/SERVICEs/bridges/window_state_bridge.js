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
