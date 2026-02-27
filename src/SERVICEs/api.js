const OLLAMA_BASE = "http://localhost:11434";

const DEFAULT_TIMEOUT_MS = 5000;
const ALLOWED_INPUT_MODALITIES = ["text", "image", "pdf"];
const ALLOWED_INPUT_MODALITY_SET = new Set(ALLOWED_INPUT_MODALITIES);
const INPUT_MODALITY_ALIAS_MAP = {
  file: "pdf",
};
const ALLOWED_INPUT_SOURCE_TYPES = ["url", "base64"];
const ALLOWED_INPUT_SOURCE_TYPE_SET = new Set(ALLOWED_INPUT_SOURCE_TYPES);

const defaultModelInputCapabilities = () => ({
  input_modalities: ["text"],
  input_source_types: {},
});

const EMPTY_MODEL_CATALOG = {
  activeModel: null,
  activeCapabilities: defaultModelInputCapabilities(),
  modelCapabilities: {},
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
    return new FrontendApiError(
      "request_timeout",
      "Request timed out",
      error,
      details,
    );
  }

  const message =
    (typeof error?.message === "string" && error.message.trim()) ||
    fallbackMessage;
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
  [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

const normalizeInputModalities = (inputModalities) => {
  const normalized = new Set(
    (Array.isArray(inputModalities) ? inputModalities : [])
      .map((item) => {
        if (typeof item !== "string") {
          return "";
        }
        const normalizedItem = item.trim().toLowerCase();
        return INPUT_MODALITY_ALIAS_MAP[normalizedItem] || normalizedItem;
      })
      .filter((item) => ALLOWED_INPUT_MODALITY_SET.has(item)),
  );

  const ordered = ALLOWED_INPUT_MODALITIES.filter((item) =>
    normalized.has(item),
  );
  return ordered.length > 0 ? ordered : ["text"];
};

const normalizeInputSourceTypeList = (sourceTypeList) => {
  const normalized = new Set(
    (Array.isArray(sourceTypeList) ? sourceTypeList : [])
      .map((item) =>
        typeof item === "string" ? item.trim().toLowerCase() : "",
      )
      .filter((item) => ALLOWED_INPUT_SOURCE_TYPE_SET.has(item)),
  );
  return ALLOWED_INPUT_SOURCE_TYPES.filter((item) => normalized.has(item));
};

const normalizeInputSourceTypes = (sourceTypes, inputModalities) => {
  if (!isObject(sourceTypes)) {
    return {};
  }

  const activeModalities = new Set(inputModalities);
  const normalized = {};

  Object.entries(sourceTypes).forEach(([modalityKey, sourceTypeList]) => {
    const modalityRaw =
      typeof modalityKey === "string" ? modalityKey.trim().toLowerCase() : "";
    const modality = INPUT_MODALITY_ALIAS_MAP[modalityRaw] || modalityRaw;
    if (!activeModalities.has(modality) || modality === "text") {
      return;
    }

    const sourceTypesForModality = normalizeInputSourceTypeList(sourceTypeList);
    if (sourceTypesForModality.length > 0) {
      const existingSourceTypes = Array.isArray(normalized[modality])
        ? normalized[modality]
        : [];
      normalized[modality] = normalizeInputSourceTypeList([
        ...existingSourceTypes,
        ...sourceTypesForModality,
      ]);
    }
  });

  return normalized;
};

const normalizeModelInputCapabilities = (capabilities) => {
  const capabilityPayload = isObject(capabilities) ? capabilities : {};
  const inputModalities = normalizeInputModalities(
    capabilityPayload.input_modalities,
  );
  const inputSourceTypes = normalizeInputSourceTypes(
    capabilityPayload.input_source_types,
    inputModalities,
  );
  return {
    input_modalities: inputModalities,
    input_source_types: inputSourceTypes,
  };
};

export const normalizeModelCatalog = (payload) => {
  const providers =
    payload?.providers && typeof payload.providers === "object"
      ? payload.providers
      : {};
  const rawModelCapabilities =
    payload?.model_capabilities &&
    typeof payload.model_capabilities === "object"
      ? payload.model_capabilities
      : {};
  const modelCapabilities = Object.entries(rawModelCapabilities).reduce(
    (accumulator, [rawModelId, rawCapabilities]) => {
      if (typeof rawModelId !== "string" || !rawModelId.trim()) {
        return accumulator;
      }

      const modelId = rawModelId.trim();
      accumulator[modelId] = normalizeModelInputCapabilities(rawCapabilities);
      return accumulator;
    },
    {},
  );

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
    activeModelFromFlat ||
    activeModelFromActiveId ||
    activeModelFromParts ||
    null;
  const hasActiveCapabilitiesPayload = isObject(payload?.active?.capabilities);
  const activeCapabilities =
    (hasActiveCapabilitiesPayload
      ? normalizeModelInputCapabilities(payload.active.capabilities)
      : null) ||
    (activeModel && isObject(modelCapabilities[activeModel])
      ? modelCapabilities[activeModel]
      : null) ||
    defaultModelInputCapabilities();

  return {
    activeModel,
    activeCapabilities,
    modelCapabilities,
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

const SUPPORTED_REMOTE_PROVIDERS = new Set(["openai", "anthropic"]);

const readModelProvidersSettings = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    return isObject(root?.model_providers) ? root.model_providers : {};
  } catch (_error) {
    return {};
  }
};

const parseProviderFromModelValue = (modelValue) => {
  if (
    typeof modelValue !== "string" ||
    !modelValue.trim() ||
    !modelValue.includes(":")
  ) {
    return "";
  }

  const providerCandidate = modelValue.split(":", 1)[0].trim().toLowerCase();
  return SUPPORTED_REMOTE_PROVIDERS.has(providerCandidate)
    ? providerCandidate
    : "";
};

const detectProviderFromStreamPayload = (payload) => {
  if (!isObject(payload)) {
    return "";
  }

  const options = isObject(payload.options) ? payload.options : {};

  const providerFromModelId =
    parseProviderFromModelValue(options.modelId) ||
    parseProviderFromModelValue(options.model_id) ||
    parseProviderFromModelValue(options.model) ||
    parseProviderFromModelValue(payload.modelId) ||
    parseProviderFromModelValue(payload.model_id) ||
    parseProviderFromModelValue(payload.model);
  if (providerFromModelId) {
    return providerFromModelId;
  }

  const providerCandidates = [
    options.provider,
    options.providerName,
    payload.provider,
    payload.providerName,
  ];
  for (const candidate of providerCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.trim().toLowerCase();
    if (SUPPORTED_REMOTE_PROVIDERS.has(normalized)) {
      return normalized;
    }
  }

  return "";
};

const getStoredProviderApiKey = (provider) => {
  const settings = readModelProvidersSettings();
  if (!settings || typeof settings !== "object") {
    return "";
  }

  if (provider === "openai") {
    return typeof settings.openai_api_key === "string"
      ? settings.openai_api_key.trim()
      : "";
  }

  if (provider === "anthropic") {
    return typeof settings.anthropic_api_key === "string"
      ? settings.anthropic_api_key.trim()
      : "";
  }

  return "";
};

const injectProviderApiKeyIntoPayload = (payload) => {
  if (!isObject(payload)) {
    return payload;
  }

  const provider = detectProviderFromStreamPayload(payload);
  if (!provider || !SUPPORTED_REMOTE_PROVIDERS.has(provider)) {
    return payload;
  }

  const apiKey = getStoredProviderApiKey(provider);
  if (!apiKey) {
    return payload;
  }

  const currentOptions = isObject(payload.options) ? payload.options : {};
  const providerSpecificCamelKey =
    provider === "openai" ? "openaiApiKey" : "anthropicApiKey";
  const providerSpecificSnakeKey = `${provider}_api_key`;
  const hasAnyApiKey = [
    currentOptions.apiKey,
    currentOptions.api_key,
    currentOptions[providerSpecificCamelKey],
    currentOptions[providerSpecificSnakeKey],
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  if (hasAnyApiKey) {
    return payload;
  }

  return {
    ...payload,
    options: {
      ...currentOptions,
      apiKey,
      [providerSpecificCamelKey]: apiKey,
      [providerSpecificSnakeKey]: apiKey,
    },
  };
};

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

    getToolkitCatalog: async () => {
      if (!hasBridgeMethod("misoAPI", "getToolkitCatalog")) {
        return { toolkits: [], count: 0, source: "" };
      }

      try {
        const method = assertBridgeMethod("misoAPI", "getToolkitCatalog");
        const payload = await withTimeout(
          () => method(),
          6000,
          "miso_toolkit_catalog_timeout",
          "Miso toolkit catalog request timed out",
        );
        return payload || { toolkits: [], count: 0, source: "" };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_toolkit_catalog_failed",
          "Failed to query Miso toolkit catalog",
        );
      }
    },

    retrieveModelList: retrieveMisoModelList,
    listModels: retrieveMisoModelList,

    startStream: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "startStream");
        const normalizedPayload = injectProviderApiKeyIntoPayload(payload);
        const streamHandle = method(normalizedPayload, handlers);
        if (
          !isObject(streamHandle) ||
          typeof streamHandle.cancel !== "function"
        ) {
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
        const models = (json?.models || [])
          .map((item) => ({
            name: item?.name,
            size: item?.size || 0,
          }))
          .filter((item) => typeof item.name === "string" && item.name.trim());

        return models.sort((a, b) => b.size - a.size);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "ollama_list_failed",
          "Failed to load Ollama models",
        );
      }
    },

    searchLibrary: async ({ query = "", category = "" } = {}) => {
      if (
        typeof window === "undefined" ||
        typeof window.ollamaLibraryAPI?.search !== "function"
      ) {
        throw new FrontendApiError(
          "bridge_unavailable",
          "Ollama library bridge not available",
        );
      }
      const rawHtml = await window.ollamaLibraryAPI.search(query, category);
      if (typeof rawHtml !== "string") {
        throw new FrontendApiError(
          "parse_error",
          "Unexpected response from library search",
        );
      }

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, "text/html");
        const CATEGORY_KEYWORDS = new Set([
          "embedding",
          "vision",
          "tools",
          "thinking",
          "code",
          "cloud",
        ]);
        const SIZE_RE = /^\d+(\.\d+)?[kKmMbBxX]$/;

        const models = [];
        const anchors = doc.querySelectorAll("a[href^='/library/']");

        anchors.forEach((a) => {
          const href = a.getAttribute("href") || "";
          // strip community models — official library links are /library/<slug> with one segment
          const slug = href.replace(/^\/library\//, "");
          if (!slug || slug.includes("/")) return;

          // description — first <p> inside the card
          const descEl = a.querySelector("p");
          const description = descEl ? descEl.textContent.trim() : "";

          // gather all leaf text nodes for tags / sizes
          const textNodes = Array.from(a.querySelectorAll("span, p"))
            .map((el) => el.textContent.trim().toLowerCase())
            .filter(Boolean);

          const tags = [];
          const sizes = [];

          textNodes.forEach((t) => {
            if (CATEGORY_KEYWORDS.has(t)) {
              if (!tags.includes(t)) tags.push(t);
            } else if (SIZE_RE.test(t)) {
              if (!sizes.includes(t)) sizes.push(t);
            }
          });

          // pulls text — look for text like "1.2M  Pulls" or "54.5M  Pulls"
          const fullText = a.textContent || "";
          const pullsMatch = fullText.match(/([\d.]+[kKmMbB])\s+Pulls/i);
          const pulls = pullsMatch ? pullsMatch[1] : "";

          models.push({ name: slug, description, tags, sizes, pulls });
        });

        return models;
      } catch (parseErr) {
        throw new FrontendApiError(
          "parse_error",
          "Failed to parse Ollama library response",
          parseErr,
        );
      }
    },

    pullModel: async ({ name, onProgress, signal } = {}) => {
      const modelName = typeof name === "string" ? name.trim() : "";
      if (!modelName) {
        throw new FrontendApiError(
          "invalid_argument",
          "Model name is required",
        );
      }

      const response = await withTimeout(
        () =>
          fetch(`${OLLAMA_BASE}/api/pull`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: modelName, stream: true }),
            signal: signal || undefined,
          }),
        60000,
        "ollama_pull_timeout",
        "Ollama pull request timed out",
      );

      if (!response.ok) {
        throw new FrontendApiError(
          "ollama_http_error",
          `Failed to pull model (${response.status})`,
          null,
          { status: response.status, model: modelName },
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new FrontendApiError("stream_error", "No response body stream");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed);
            const status = typeof obj.status === "string" ? obj.status : "";
            const completed =
              typeof obj.completed === "number" ? obj.completed : null;
            const total = typeof obj.total === "number" ? obj.total : null;
            const percent =
              completed !== null && total !== null && total > 0
                ? Math.round((completed / total) * 100)
                : null;
            if (typeof onProgress === "function") {
              onProgress({ status, percent, completed, total });
            }
            if (status === "success") return;
          } catch (_) {
            // ignore non-JSON lines
          }
        }
      }
    },

    deleteModel: async (name) => {
      const modelName = typeof name === "string" ? name.trim() : "";
      if (!modelName) {
        throw new FrontendApiError(
          "invalid_argument",
          "Model name is required",
        );
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

export {
  EMPTY_MODEL_CATALOG,
  OLLAMA_BASE,
  withTimeout,
  safeJson,
  assertBridgeMethod,
};

export default api;
