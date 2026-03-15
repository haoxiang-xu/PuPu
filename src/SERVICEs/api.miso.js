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
import { readWorkspaces } from "../COMPONENTs/settings/runtime";

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
const DEFAULT_MEMORY_SETTINGS = {
  enabled: true,
  long_term_enabled: true,
  long_term_extract_every_n_turns: 6,
  embedding_provider: "auto",
  ollama_embedding_model: "nomic-embed-text",
  openai_embedding_model: "text-embedding-3-small",
  last_n_turns: 8,
  vector_top_k: 4,
};
const DEFAULT_LONG_TERM_MEMORY_NAMESPACE = "pupu:default";
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
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
  try {
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    const storedMemory = isObject(root?.memory) ? root.memory : {};
    return {
      ...DEFAULT_MEMORY_SETTINGS,
      ...storedMemory,
    };
  } catch (_error) {
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
};

const injectOpenAIEmbeddingKeyIfNeeded = (options) => {
  const currentOptions = isObject(options) ? options : {};
  if (currentOptions.memory_enabled !== true) {
    return currentOptions;
  }

  const embeddingProvider =
    typeof currentOptions.memory_embedding_provider === "string"
      ? currentOptions.memory_embedding_provider.trim().toLowerCase()
      : "auto";
  if (embeddingProvider !== "auto" && embeddingProvider !== "openai") {
    return currentOptions;
  }

  const hasOpenAIEmbeddingKey = [
    currentOptions.openaiApiKey,
    currentOptions.openai_api_key,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  if (hasOpenAIEmbeddingKey) {
    return currentOptions;
  }

  const openaiApiKey = getStoredProviderApiKey("openai");
  if (!openaiApiKey) {
    return currentOptions;
  }

  return {
    ...currentOptions,
    openaiApiKey,
    openai_api_key: openaiApiKey,
  };
};

const injectMemoryIntoPayload = (payload) => {
  if (!isObject(payload)) {
    return payload;
  }
  const currentOptions = isObject(payload.options) ? payload.options : {};
  if (typeof currentOptions.memory_enabled === "boolean") {
    if (currentOptions.memory_enabled !== true) {
      return payload;
    }
    const memory = readMemorySettingsFromStorage();
    const optionsWithLongTerm = {
      ...currentOptions,
      memory_namespace:
        typeof currentOptions.memory_namespace === "string" &&
        currentOptions.memory_namespace.trim()
          ? currentOptions.memory_namespace.trim()
          : DEFAULT_LONG_TERM_MEMORY_NAMESPACE,
      memory_long_term_enabled:
        typeof currentOptions.memory_long_term_enabled === "boolean"
          ? currentOptions.memory_long_term_enabled
          : memory.long_term_enabled !== false,
      memory_long_term_extract_every_n_turns: Number.isFinite(
        Number(currentOptions.memory_long_term_extract_every_n_turns),
      )
        ? Math.max(
            1,
            Math.floor(
              Number(currentOptions.memory_long_term_extract_every_n_turns),
            ),
          )
        : Math.max(
            1,
            Math.floor(Number(memory.long_term_extract_every_n_turns) || 6),
          ),
    };
    return {
      ...payload,
      options: injectOpenAIEmbeddingKeyIfNeeded(optionsWithLongTerm),
    };
  }

  const memory = readMemorySettingsFromStorage();
  if (!memory.enabled) {
    return payload;
  }

  const optionsWithMemory = {
    ...currentOptions,
    memory_enabled: true,
    memory_namespace: DEFAULT_LONG_TERM_MEMORY_NAMESPACE,
    memory_long_term_enabled: memory.long_term_enabled !== false,
    memory_long_term_extract_every_n_turns: Math.max(
      1,
      Math.floor(Number(memory.long_term_extract_every_n_turns) || 6),
    ),
    memory_embedding_provider: memory.embedding_provider || "auto",
    memory_embedding_model:
      memory.embedding_provider === "ollama"
        ? memory.ollama_embedding_model || "nomic-embed-text"
        : memory.openai_embedding_model || "text-embedding-3-small",
    memory_last_n_turns: memory.last_n_turns ?? 8,
    memory_vector_top_k: memory.vector_top_k ?? 4,
  };

  return {
    ...payload,
    options: injectOpenAIEmbeddingKeyIfNeeded(optionsWithMemory),
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

  const currentOptions = isObject(payload.options) ? payload.options : {};

  // Resolve additional workspace paths from per-chat selected IDs
  const selectedIds = Array.isArray(currentOptions.selectedWorkspaceIds)
    ? currentOptions.selectedWorkspaceIds
    : [];
  const allWorkspaces = readWorkspaces();
  const selectedPaths = selectedIds
    .map((id) => {
      const ws = allWorkspaces.find((w) => w.id === id);
      return typeof ws?.path === "string" ? ws.path.trim() : "";
    })
    .filter(Boolean);

  // Default workspace root
  const defaultRoot = getStoredWorkspaceRoot();

  // Build the full list: default first, then selected
  const allRoots = [
    ...(defaultRoot ? [defaultRoot] : []),
    ...selectedPaths.filter((p) => p !== defaultRoot),
  ];

  // Strip internal field from options
  const { selectedWorkspaceIds: _omit, ...restOptions } = currentOptions;

  if (allRoots.length === 0) {
    return { ...payload, options: restOptions };
  }

  return {
    ...payload,
    options: {
      ...restOptions,
      // Backward-compat single root
      workspaceRoot: allRoots[0],
      workspace_root: allRoots[0],
      // New multi-root
      workspace_roots: allRoots,
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

const normalizeMisoV2Payload = (payload) => {
  const payloadWithWorkspaceRoot = injectWorkspaceRootIntoPayload(payload);
  const payloadWithSystemPromptV2 = injectSystemPromptV2IntoPayload(
    payloadWithWorkspaceRoot,
  );
  const payloadWithMemory = injectMemoryIntoPayload(payloadWithSystemPromptV2);
  return injectProviderApiKeyIntoPayload(payloadWithMemory);
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

    getMemoryProjection: async (sessionId) => {
      const method = assertBridgeMethod("misoAPI", "getMemoryProjection");
      return withTimeout(
        () => method(sessionId),
        10000,
        "memory_projection_timeout",
        "Memory projection request timed out",
      );
    },

    getLongTermMemoryProjection: async () => {
      const method = assertBridgeMethod(
        "misoAPI",
        "getLongTermMemoryProjection",
      );
      return withTimeout(
        () => method(),
        15000,
        "long_term_memory_projection_timeout",
        "Long-term memory projection request timed out",
      );
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

    replaceSessionMemory: async (payload = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "replaceSessionMemory");
        const normalizedPayload = normalizeMisoV2Payload(payload);
        const sessionIdRaw =
          normalizedPayload?.sessionId ?? normalizedPayload?.session_id;
        const sessionId =
          typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";
        if (!sessionId) {
          throw new FrontendApiError(
            "invalid_session_memory_replace",
            "session_id is required",
          );
        }

        const response = await withTimeout(
          () =>
            method({
              sessionId,
              session_id: sessionId,
              messages: Array.isArray(normalizedPayload?.messages)
                ? normalizedPayload.messages
                : [],
              options: isObject(normalizedPayload?.options)
                ? normalizedPayload.options
                : {},
            }),
          15000,
          "miso_session_memory_replace_timeout",
          "Miso session memory replace request timed out",
        );

        return isObject(response) ? response : { applied: false };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_session_memory_replace_failed",
          "Failed to replace Miso session memory",
        );
      }
    },

    startStreamV2: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("misoAPI", "startStreamV2");
        const normalizedPayload = normalizeMisoV2Payload(payload);
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
