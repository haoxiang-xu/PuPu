import {
  assertBridgeMethod,
  hasBridgeMethod,
  normalizeUpdateState,
  toFrontendApiError,
  withTimeout,
} from "./api.shared";
import { runtimeBridge } from "./bridges/miso_bridge";
import { themeBridge } from "./bridges/theme_bridge";
import { windowStateBridge } from "./bridges/window_state_bridge";

export const createSystemApi = () => ({
  appInfo: {
    getVersion: async () => {
      if (!hasBridgeMethod("appInfoAPI", "getVersion")) {
        return "";
      }

      try {
        const method = assertBridgeMethod("appInfoAPI", "getVersion");
        const version = await withTimeout(
          () => method(),
          3000,
          "app_version_timeout",
          "App version request timed out",
        );
        return typeof version === "string" ? version : "";
      } catch (error) {
        throw toFrontendApiError(
          error,
          "app_version_failed",
          "Failed to query app version",
        );
      }
    },
  },

  appUpdate: {
    isBridgeAvailable: () =>
      hasBridgeMethod("appUpdateAPI", "getState") &&
      hasBridgeMethod("appUpdateAPI", "checkAndDownload") &&
      hasBridgeMethod("appUpdateAPI", "installNow") &&
      hasBridgeMethod("appUpdateAPI", "onStateChange"),

    getState: async () => {
      if (!hasBridgeMethod("appUpdateAPI", "getState")) {
        return normalizeUpdateState({
          stage: "idle",
          message: "In-app update bridge unavailable.",
        });
      }

      try {
        const method = assertBridgeMethod("appUpdateAPI", "getState");
        const state = await withTimeout(
          () => method(),
          4000,
          "update_state_timeout",
          "Update state request timed out",
        );
        return normalizeUpdateState(state);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "update_state_failed",
          "Failed to query update state",
        );
      }
    },

    checkAndDownload: async () => {
      try {
        const method = assertBridgeMethod("appUpdateAPI", "checkAndDownload");
        const payload = await withTimeout(
          () => method(),
          15000,
          "update_check_timeout",
          "Update check request timed out",
        );
        return { started: Boolean(payload?.started) };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "update_check_failed",
          "Failed to check for updates",
        );
      }
    },

    installNow: async () => {
      try {
        const method = assertBridgeMethod("appUpdateAPI", "installNow");
        const payload = await withTimeout(
          () => method(),
          6000,
          "update_install_timeout",
          "Update install request timed out",
        );
        return { started: Boolean(payload?.started) };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "update_install_failed",
          "Failed to install update",
        );
      }
    },

    onStateChange: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }

      if (!hasBridgeMethod("appUpdateAPI", "onStateChange")) {
        return () => {};
      }

      try {
        const method = assertBridgeMethod("appUpdateAPI", "onStateChange");
        const unsubscribe = method((state) => callback(normalizeUpdateState(state)));
        return typeof unsubscribe === "function" ? unsubscribe : () => {};
      } catch (_error) {
        return () => {};
      }
    },
  },

  runtime: runtimeBridge,
  theme: themeBridge,
  windowState: windowStateBridge,
});

export default createSystemApi;
