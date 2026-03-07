import {
  EMPTY_MODEL_CATALOG,
  FrontendApiError,
  assertBridgeMethod,
  hasBridgeMethod,
  isObject,
  normalizeMisoStatus,
  normalizeModelCatalog,
  toFrontendApiError,
  withTimeout,
} from "./api.shared";

const SUPPORTED_REMOTE_PROVIDERS = new Set(["openai", "anthropic"]);
const SYSTEM_PROMPT_V2_SECTION_LIMIT = 2000;
const SYSTEM_PROMPT_V2_SECTION_KEYS = [
  "personality",
  "rules",
  "style",
  "output_format",
  "context",
  "constraints",
];
const normalizeSystemPromptV2SectionKey = (rawKey) => {
  if (typeof rawKey !== "string") {
    return "";
  }
  const normalized = rawKey.trim().toLowerCase();
  const aliased = normalized === "personally" ? "personality" : normalized;
  return SYSTEM_PROMPT_V2_SECTION_KEYS.includes(aliased) ? aliased : "";
};

const normalizeSystemPromptV2SectionValue = (rawValue) => {
  if (typeof rawValue !== "string") {
    return "";
  }
  const trimmed = rawValue.trim();
  return trimmed.slice(0, SYSTEM_PROMPT_V2_SECTION_LIMIT);
};

const sanitizeSystemPromptV2Sections = (
  rawSections,
  { allowNull = false, keepEmptyStrings = false } = {},
) => {
  if (!isObject(rawSections)) {
    return {};
  }

  const sanitized = {};
  Object.entries(rawSections).forEach(([rawKey, rawValue]) => {
    const key = normalizeSystemPromptV2SectionKey(rawKey);
    if (!key) {
      return;
    }

    if (rawValue == null) {
      if (allowNull) {
        sanitized[key] = null;
      }
      return;
    }

    if (typeof rawValue !== "string") {
      return;
    }

    const value = normalizeSystemPromptV2SectionValue(rawValue);
    if (value || keepEmptyStrings) {
      sanitized[key] = value;
    }
  });

  return sanitized;
};

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

const readRuntimeSettings = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    return isObject(root?.runtime) ? root.runtime : {};
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
    currentOptions[providerSpecificCamelKey],
    currentOptions[providerSpecificSnakeKey],
    ...(provider === "openai"
      ? [currentOptions.apiKey, currentOptions.api_key]
      : []),
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  if (hasAnyApiKey) {
    return payload;
  }

  const nextOptions = {
    ...currentOptions,
    [providerSpecificCamelKey]: apiKey,
    [providerSpecificSnakeKey]: apiKey,
  };
  if (provider === "openai") {
    nextOptions.apiKey = apiKey;
    nextOptions.api_key = apiKey;
  }

  return {
    ...payload,
    options: nextOptions,
  };
};

const getStoredWorkspaceRoot = () => {
  const runtimeSettings = readRuntimeSettings();
  const workspaceRoot = runtimeSettings?.workspace_root;
  return typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
};

const readMemorySettingsFromStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    return isObject(root?.memory) ? root.memory : {};
  } catch (_error) {
    return {};
  }
};

const injectMemoryIntoPayload = (payload) => {
  if (!isObject(payload)) {
    return payload;
  }
  const currentOptions = isObject(payload.options) ? payload.options : {};
  if (typeof currentOptions.memory_enabled === "boolean") {
    return payload;
  }

  const memory = readMemorySettingsFromStorage();
  if (!memory.enabled) {
    return payload;
  }

  return {
    ...payload,
    options: {
      ...currentOptions,
      memory_enabled: true,
      memory_embedding_provider: memory.embedding_provider || "auto",
      memory_embedding_model:
        memory.embedding_provider === "ollama"
          ? memory.ollama_embedding_model || "nomic-embed-text"
          : memory.openai_embedding_model || "text-embedding-3-small",
      memory_last_n_turns: memory.last_n_turns ?? 8,
      memory_vector_top_k: memory.vector_top_k ?? 4,
    },
  };
};

const getStoredSystemPromptV2Config = () => {
  return {
    enabled: true,
    sections: {},
  };
};

const injectWorkspaceRootIntoPayload = (payload) => {
  if (!isObject(payload)) {
    return payload;
  }

  const configuredWorkspaceRoot = getStoredWorkspaceRoot();
  if (!configuredWorkspaceRoot) {
    return payload;
  }

  const currentOptions = isObject(payload.options) ? payload.options : {};
  const hasExplicitWorkspaceRoot =
    (typeof currentOptions.workspaceRoot === "string" &&
      currentOptions.workspaceRoot.trim().length > 0) ||
    (typeof currentOptions.workspace_root === "string" &&
      currentOptions.workspace_root.trim().length > 0);
  if (hasExplicitWorkspaceRoot) {
    return payload;
  }

  return {
    ...payload,
    options: {
      ...currentOptions,
      workspaceRoot: configuredWorkspaceRoot,
      workspace_root: configuredWorkspaceRoot,
    },
  };
};

const injectSystemPromptV2IntoPayload = (payload) => {
  if (!isObject(payload)) {
    return payload;
  }

  const storedConfig = getStoredSystemPromptV2Config();
  if (!storedConfig) {
    return payload;
  }

  const currentOptions = isObject(payload.options) ? payload.options : {};
  const rawExistingPromptConfig = isObject(currentOptions.system_prompt_v2)
    ? currentOptions.system_prompt_v2
    : isObject(currentOptions.systemPromptV2)
      ? currentOptions.systemPromptV2
      : {};

  const explicitEnabled =
    typeof rawExistingPromptConfig.enabled === "boolean"
      ? rawExistingPromptConfig.enabled
      : storedConfig.enabled;
  const overrides = sanitizeSystemPromptV2Sections(
    rawExistingPromptConfig.overrides,
    {
      allowNull: true,
      keepEmptyStrings: true,
    },
  );

  const nextPromptConfig = {
    enabled: explicitEnabled,
    defaults: storedConfig.sections,
  };
  if (Object.keys(overrides).length > 0) {
    nextPromptConfig.overrides = overrides;
  }

  const restOptions = {
    ...currentOptions,
  };
  delete restOptions.system_prompt_v2;
  delete restOptions.systemPromptV2;

  return {
    ...payload,
    options: {
      ...restOptions,
      system_prompt_v2: nextPromptConfig,
    },
  };
};

export const createMisoApi = () => {
  const misoApi = {
    isBridgeAvailable: () =>
      hasBridgeMethod("misoAPI", "getStatus") &&
      hasBridgeMethod("misoAPI", "startStream") &&
      hasBridgeMethod("misoAPI", "startStreamV2"),

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

    respondToolConfirmation: async (payload = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "respondToolConfirmation");
        const confirmationIdRaw = payload?.confirmation_id;
        const confirmationId =
          typeof confirmationIdRaw === "string" ? confirmationIdRaw.trim() : "";
        if (!confirmationId) {
          throw new FrontendApiError(
            "invalid_confirmation_request",
            "confirmation_id is required",
          );
        }

        const reasonRaw = payload?.reason;
        const requestPayload = {
          confirmation_id: confirmationId,
          approved: Boolean(payload?.approved),
          reason:
            typeof reasonRaw === "string" ? reasonRaw : String(reasonRaw || ""),
        };

        const modifiedArguments = payload?.modified_arguments;
        if (modifiedArguments != null) {
          if (!isObject(modifiedArguments)) {
            throw new FrontendApiError(
              "invalid_confirmation_request",
              "modified_arguments must be an object when provided",
            );
          }
          requestPayload.modified_arguments = modifiedArguments;
        }

        const response = await method(requestPayload);

        return isObject(response) ? response : { status: "ok" };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_tool_confirmation_failed",
          "Failed to submit tool confirmation",
        );
      }
    },

    startStream: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "startStream");
        const payloadWithWorkspaceRoot =
          injectWorkspaceRootIntoPayload(payload);
        const normalizedPayload = injectProviderApiKeyIntoPayload(
          payloadWithWorkspaceRoot,
        );
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

    startStreamV2: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "startStreamV2");
        const payloadWithWorkspaceRoot =
          injectWorkspaceRootIntoPayload(payload);
        const payloadWithSystemPromptV2 = injectSystemPromptV2IntoPayload(
          payloadWithWorkspaceRoot,
        );
        const payloadWithMemory = injectMemoryIntoPayload(payloadWithSystemPromptV2);
        const normalizedPayload = injectProviderApiKeyIntoPayload(
          payloadWithMemory,
        );
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
          "miso_stream_v2_start_failed",
          "Failed to start Miso v2 stream",
        );
      }
    },
  };

  const retrieveMisoModelList = async (provider = null) => {
    const catalog = await misoApi.getModelCatalog();
    if (typeof provider !== "string" || !provider.trim()) {
      return catalog.providers;
    }
    const providerKey = provider.trim().toLowerCase();
    return Array.isArray(catalog.providers?.[providerKey])
      ? catalog.providers[providerKey]
      : [];
  };

  misoApi.retrieveModelList = retrieveMisoModelList;
  misoApi.listModels = retrieveMisoModelList;

  return misoApi;
};

export default createMisoApi;
