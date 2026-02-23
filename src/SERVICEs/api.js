const OLLAMA_BASE = "http://localhost:11434";

const DEFAULT_TIMEOUT_MS = 5000;

const EMPTY_MODEL_CATALOG = {
  activeModel: null,
  providers: {
    ollama: [],
    openai: [],
    anthropic: [],
  },
};

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

export class FrontendApiError extends Error {
  constructor(code, message, cause = null, details = null) {
    super(message || "Frontend API error");
    this.name = "FrontendApiError";
    this.code = typeof code === "string" && code.trim() ? code : "api_error";
    if (cause) {
      this.cause = cause;
    }
    if (details != null) {
      this.details = details;
    }
  }
}

const toFrontendApiError = (
  error,
  fallbackCode = "api_error",
  fallbackMessage = "Frontend API request failed",
  details = null,
) => {
  if (error instanceof FrontendApiError) {
    return error;
  }

  if (error?.name === "AbortError") {
    return new FrontendApiError("request_timeout", "Request timed out", error, details);
  }

  const message =
    (typeof error?.message === "string" && error.message.trim()) || fallbackMessage;
  return new FrontendApiError(fallbackCode, message, error, details);
};

const withTimeout = async (
  task,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  timeoutCode = "request_timeout",
  timeoutMessage = `Request timed out after ${timeoutMs}ms`,
) => {
  let timeoutHandle = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new FrontendApiError(timeoutCode, timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve().then(task), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    throw new FrontendApiError(
      "invalid_json",
      "Response body is not valid JSON",
      error,
      { status: response?.status },
    );
  }
};

const getWindowBridge = (bridgeName) => {
  if (typeof window === "undefined" || !bridgeName) {
    return null;
  }
  const bridge = window[bridgeName];
  return bridge && typeof bridge === "object" ? bridge : null;
};

const hasBridgeMethod = (bridgeName, methodName) => {
  const bridge = getWindowBridge(bridgeName);
  return Boolean(bridge && typeof bridge[methodName] === "function");
};

const assertBridgeMethod = (bridgeName, methodName) => {
  const bridge = getWindowBridge(bridgeName);
  if (!bridge || typeof bridge[methodName] !== "function") {
    throw new FrontendApiError(
      "bridge_unavailable",
      `${bridgeName}.${methodName} is unavailable`,
      null,
      { bridge: bridgeName, method: methodName },
    );
  }
  return bridge[methodName].bind(bridge);
};

const normalizeStringList = (list) =>
  [...new Set(
    (Array.isArray(list) ? list : [])
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));

export const normalizeModelCatalog = (payload) => {
  const providers =
    payload?.providers && typeof payload.providers === "object"
      ? payload.providers
      : {};

  const activeModelFromFlat =
    typeof payload?.activeModel === "string" && payload.activeModel.trim()
      ? payload.activeModel.trim()
      : null;
  const activeModelFromActiveId =
    typeof payload?.active?.model_id === "string" &&
    payload.active.model_id.trim()
      ? payload.active.model_id.trim()
      : null;
  const activeProvider =
    typeof payload?.active?.provider === "string" &&
    payload.active.provider.trim()
      ? payload.active.provider.trim().toLowerCase()
      : "";
  const activeModelName =
    typeof payload?.active?.model === "string" && payload.active.model.trim()
      ? payload.active.model.trim()
      : "";
  const activeModelFromParts =
    activeProvider && activeModelName
      ? `${activeProvider}:${activeModelName}`
      : activeModelName || null;

  const activeModel =
    activeModelFromFlat || activeModelFromActiveId || activeModelFromParts || null;

  return {
    activeModel,
    providers: {
      ollama: normalizeStringList(providers.ollama),
      openai: normalizeStringList(providers.openai),
      anthropic: normalizeStringList(providers.anthropic),
    },
  };
};

const normalizeMisoStatus = (status) => ({
  status: typeof status?.status === "string" ? status.status : "unknown",
  ready: Boolean(status?.ready),
  url: status?.url || null,
  reason: status?.reason || "",
  pid:
    Number.isFinite(Number(status?.pid)) || status?.pid === null
      ? status.pid
      : null,
  port:
    Number.isFinite(Number(status?.port)) || status?.port === null
      ? status.port
      : null,
});

const retrieveMisoModelList = async (provider = null) => {
  const catalog = await api.miso.getModelCatalog();
  if (typeof provider !== "string" || !provider.trim()) {
    return catalog.providers;
  }
  const providerKey = provider.trim().toLowerCase();
  return Array.isArray(catalog.providers?.[providerKey])
    ? catalog.providers[providerKey]
    : [];
};

export const api = {
  miso: {
    isBridgeAvailable: () =>
      hasBridgeMethod("misoAPI", "getStatus") &&
      hasBridgeMethod("misoAPI", "startStream"),

    getStatus: async () => {
      try {
        const method = assertBridgeMethod("misoAPI", "getStatus");
        const status = await withTimeout(
          () => method(),
          4000,
          "miso_status_timeout",
          "Miso status request timed out",
        );
        return normalizeMisoStatus(status);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_status_failed",
          "Failed to query Miso status",
        );
      }
    },

    getModelCatalog: async () => {
      if (!hasBridgeMethod("misoAPI", "getModelCatalog")) {
        return normalizeModelCatalog(EMPTY_MODEL_CATALOG);
      }

      try {
        const method = assertBridgeMethod("misoAPI", "getModelCatalog");
        const payload = await withTimeout(
          () => method(),
          6000,
          "miso_model_catalog_timeout",
          "Miso model catalog request timed out",
        );
        return normalizeModelCatalog(payload);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_model_catalog_failed",
          "Failed to query Miso model catalog",
        );
      }
    },

    retrieveModelList: retrieveMisoModelList,
    listModels: retrieveMisoModelList,

    startStream: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "startStream");
        const streamHandle = method(payload, handlers);
        if (!isObject(streamHandle) || typeof streamHandle.cancel !== "function") {
          throw new FrontendApiError(
            "invalid_stream_handle",
            "Miso bridge returned an invalid stream handle",
          );
        }
        return streamHandle;
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_stream_start_failed",
          "Failed to start Miso stream",
        );
      }
    },

    cancelStream: (requestId) => {
      if (typeof requestId !== "string" || !requestId.trim()) {
        return;
      }

      if (!hasBridgeMethod("misoAPI", "cancelStream")) {
        return;
      }

      try {
        const method = assertBridgeMethod("misoAPI", "cancelStream");
        method(requestId);
      } catch (_error) {
        // cancellation is best-effort
      }
    },
  },

  ollama: {
    isBridgeAvailable: () =>
      hasBridgeMethod("ollamaAPI", "getStatus") &&
      hasBridgeMethod("ollamaAPI", "restart"),

    getStatus: async () => {
      try {
        const method = assertBridgeMethod("ollamaAPI", "getStatus");
        const status = await withTimeout(
          () => method(),
          5000,
          "ollama_status_timeout",
          "Ollama status request timed out",
        );
        return typeof status === "string" ? status : "unknown";
      } catch (error) {
        throw toFrontendApiError(
          error,
          "ollama_status_failed",
          "Failed to query Ollama status",
        );
      }
    },

    restart: async () => {
      try {
        const method = assertBridgeMethod("ollamaAPI", "restart");
        const result = await withTimeout(
          () => method(),
          10000,
          "ollama_restart_timeout",
          "Ollama restart request timed out",
        );
        return typeof result === "string" ? result : "error";
      } catch (error) {
        throw toFrontendApiError(
          error,
          "ollama_restart_failed",
          "Failed to restart Ollama",
        );
      }
    },

    listModels: async () => {
      try {
        const response = await withTimeout(
          () =>
            fetch(`${OLLAMA_BASE}/api/tags`, {
              method: "GET",
            }),
          3000,
          "ollama_list_timeout",
          "Ollama model list request timed out",
        );

        if (!response.ok) {
          throw new FrontendApiError(
            "ollama_http_error",
            `Failed to list Ollama models (${response.status})`,
            null,
            { status: response.status },
          );
        }

        const json = await safeJson(response);
        const models = (json?.models || []).map((item) => ({
          name: item?.name,
          size: item?.size || 0,
        })).filter((item) => typeof item.name === "string" && item.name.trim());

        return models.sort((a, b) => b.size - a.size);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "ollama_list_failed",
          "Failed to load Ollama models",
        );
      }
    },

    deleteModel: async (name) => {
      const modelName = typeof name === "string" ? name.trim() : "";
      if (!modelName) {
        throw new FrontendApiError("invalid_argument", "Model name is required");
      }

      try {
        const response = await withTimeout(
          () =>
            fetch(`${OLLAMA_BASE}/api/delete`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: modelName }),
            }),
          5000,
          "ollama_delete_timeout",
          "Ollama delete request timed out",
        );

        if (!response.ok) {
          throw new FrontendApiError(
            "ollama_http_error",
            `Failed to delete Ollama model (${response.status})`,
            null,
            { status: response.status, model: modelName },
          );
        }
      } catch (error) {
        throw toFrontendApiError(
          error,
          "ollama_delete_failed",
          "Failed to delete Ollama model",
          { model: modelName },
        );
      }
    },
  },
};

export { EMPTY_MODEL_CATALOG, OLLAMA_BASE, withTimeout, safeJson, assertBridgeMethod };

export default api;
