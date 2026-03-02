import {
  FrontendApiError,
  assertBridgeMethod,
  hasBridgeMethod,
  toFrontendApiError,
  withTimeout,
} from "../api.shared";

const invokeOllama = async (
  methodName,
  args,
  {
    timeoutMs = 5000,
    timeoutCode = "ollama_bridge_timeout",
    timeoutMessage = "Ollama bridge request timed out",
    failureCode = "ollama_bridge_failed",
    failureMessage = "Ollama bridge request failed",
  } = {},
) => {
  try {
    const method = assertBridgeMethod("ollamaAPI", methodName);
    return await withTimeout(
      () => method(...args),
      timeoutMs,
      timeoutCode,
      timeoutMessage,
    );
  } catch (error) {
    throw toFrontendApiError(error, failureCode, failureMessage);
  }
};

export const ollamaBridge = {
  isStatusAvailable: () => hasBridgeMethod("ollamaAPI", "getStatus"),
  isInstallAvailable: () => hasBridgeMethod("ollamaAPI", "install"),
  isRestartAvailable: () => hasBridgeMethod("ollamaAPI", "restart"),
  isInstallProgressAvailable: () =>
    hasBridgeMethod("ollamaAPI", "onInstallProgress"),

  isBridgeAvailable: () =>
    ollamaBridge.isStatusAvailable() && ollamaBridge.isRestartAvailable(),

  getStatus: async () => {
    if (!ollamaBridge.isStatusAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "ollamaAPI.getStatus is unavailable",
      );
    }

    const status = await invokeOllama("getStatus", [], {
      timeoutMs: 5000,
      timeoutCode: "ollama_status_timeout",
      timeoutMessage: "Ollama status request timed out",
      failureCode: "ollama_status_failed",
      failureMessage: "Failed to query Ollama status",
    });

    return typeof status === "string" ? status : "unknown";
  },

  install: async () => {
    if (!ollamaBridge.isInstallAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "ollamaAPI.install is unavailable",
      );
    }

    return invokeOllama("install", [], {
      timeoutMs: 120000,
      timeoutCode: "ollama_install_timeout",
      timeoutMessage: "Ollama download timed out",
      failureCode: "ollama_install_failed",
      failureMessage: "Ollama download failed",
    });
  },

  restart: async () => {
    if (!ollamaBridge.isRestartAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "ollamaAPI.restart is unavailable",
      );
    }

    const result = await invokeOllama("restart", [], {
      timeoutMs: 10000,
      timeoutCode: "ollama_restart_timeout",
      timeoutMessage: "Ollama restart request timed out",
      failureCode: "ollama_restart_failed",
      failureMessage: "Failed to restart Ollama",
    });

    return typeof result === "string" ? result : "error";
  },

  onInstallProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    if (!ollamaBridge.isInstallProgressAvailable()) {
      return () => {};
    }

    try {
      const method = assertBridgeMethod("ollamaAPI", "onInstallProgress");
      const unsubscribe = method(callback);
      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    } catch (_error) {
      return () => {};
    }
  },
};

export default ollamaBridge;
