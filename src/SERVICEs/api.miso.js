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
import { readMemorySettings } from "../COMPONENTs/settings/memory/storage";
import { sanitizeSystemPromptSections } from "./system_prompt_sections";

const SUPPORTED_REMOTE_PROVIDERS = new Set(["openai", "anthropic"]);
const MEMORY_EMBEDDING_PROVIDERS = new Set(["auto", "openai", "ollama"]);
const DEFAULT_LONG_TERM_MEMORY_NAMESPACE = "pupu:default";
const DEFAULT_SYSTEM_PROMPT_V2_SECTIONS = {
  rules:
    "Tool use is optional. Use tools only when they materially improve the answer. Output may be truncated, so keep answers concise and front-load the most important information.",
};

const sanitizeSystemPromptV2Sections = (
  rawSections,
  { allowNull = false, keepEmptyStrings = false } = {},
) =>
  sanitizeSystemPromptSections(rawSections, {
    allowNull,
    keepEmptyStrings,
  });

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

const clampIntegerOption = (
  value,
  fallback,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numeric)));
};
const clampThresholdOption = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const clamped = Math.min(1, Math.max(0, numeric));
  return Number(clamped.toFixed(2));
};
const toRuntimeThresholdOption = (value, fallback = 0) => {
  const normalized = clampThresholdOption(value, fallback);
  return normalized > 0 ? normalized : null;
};
const resolveMemoryEmbeddingProvider = (value, fallback) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (MEMORY_EMBEDDING_PROVIDERS.has(normalized)) {
    return normalized;
  }
  return MEMORY_EMBEDDING_PROVIDERS.has(fallback) ? fallback : "auto";
};
const resolveMemoryEmbeddingModel = (provider, explicitValue, memory) => {
  if (typeof explicitValue === "string" && explicitValue.trim()) {
    return explicitValue.trim();
  }
  return provider === "ollama"
    ? memory.ollama_embedding_model || "nomic-embed-text"
    : memory.openai_embedding_model || "text-embedding-3-small";
};
const resolveLongTermTopK = (currentOptions, memory) => {
  const fallback = memory.long_term_top_k ?? 4;
  const legacyOverride =
    currentOptions.memory_long_term_vector_top_k ??
    currentOptions.memory_long_term_episode_top_k ??
    currentOptions.memory_long_term_playbook_top_k;
  return clampIntegerOption(
    currentOptions.memory_long_term_top_k,
    clampIntegerOption(legacyOverride, fallback, {
      min: 0,
      max: 10,
    }),
    { min: 0, max: 10 },
  );
};
const resolveLongTermMinScore = (currentOptions, memory) => {
  const fallback = memory.long_term_min_score ?? 0;
  const legacyOverride =
    currentOptions.memory_long_term_vector_min_score ??
    currentOptions.memory_long_term_episode_min_score ??
    currentOptions.memory_long_term_playbook_min_score;
  return toRuntimeThresholdOption(
    currentOptions.memory_long_term_min_score,
    clampThresholdOption(legacyOverride, fallback),
  );
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
  const memory = readMemorySettings();
  const memoryRequested =
    currentOptions.memory_enabled === true ||
    (typeof currentOptions.memory_enabled !== "boolean" && memory.enabled);

  if (!memoryRequested) {
    return payload;
  }

  const embeddingProvider = resolveMemoryEmbeddingProvider(
    currentOptions.memory_embedding_provider,
    memory.embedding_provider || "auto",
  );
  const longTermTopK = resolveLongTermTopK(currentOptions, memory);
  const longTermMinScore = resolveLongTermMinScore(currentOptions, memory);
  const optionsWithMemory = {
    ...currentOptions,
    memory_enabled: true,
    memory_namespace:
      typeof currentOptions.memory_namespace === "string" &&
      currentOptions.memory_namespace.trim()
        ? currentOptions.memory_namespace.trim()
        : DEFAULT_LONG_TERM_MEMORY_NAMESPACE,
    memory_long_term_enabled: memory.long_term_enabled !== false,
    ...(typeof currentOptions.memory_long_term_enabled === "boolean" && {
      memory_long_term_enabled: currentOptions.memory_long_term_enabled,
    }),
    memory_long_term_extract_every_n_turns: clampIntegerOption(
      currentOptions.memory_long_term_extract_every_n_turns,
      memory.long_term_extract_every_n_turns ?? 6,
      { min: 1, max: 20 },
    ),
    memory_embedding_provider: embeddingProvider,
    memory_embedding_model: resolveMemoryEmbeddingModel(
      embeddingProvider,
      currentOptions.memory_embedding_model,
      memory,
    ),
    memory_last_n_turns: clampIntegerOption(
      currentOptions.memory_last_n_turns,
      memory.last_n_turns ?? 8,
      { min: 1, max: 20 },
    ),
    memory_vector_top_k: clampIntegerOption(
      currentOptions.memory_vector_top_k,
      memory.vector_top_k ?? 4,
      { min: 0, max: 10 },
    ),
    memory_vector_min_score: toRuntimeThresholdOption(
      currentOptions.memory_vector_min_score,
      memory.vector_min_score ?? 0,
    ),
    memory_long_term_vector_top_k: longTermTopK,
    memory_long_term_vector_min_score: longTermMinScore,
    memory_long_term_episode_top_k: longTermTopK,
    memory_long_term_episode_min_score: longTermMinScore,
    memory_long_term_playbook_top_k: longTermTopK,
    memory_long_term_playbook_min_score: longTermMinScore,
  };

  return {
    ...payload,
    options: injectOpenAIEmbeddingKeyIfNeeded(optionsWithMemory),
  };
};

const getStoredSystemPromptV2Config = () => {
  const runtimeSettings = readRuntimeSettings();
  const runtimePromptConfig = isObject(runtimeSettings?.system_prompt_v2)
    ? runtimeSettings.system_prompt_v2
    : {};
  const sections = sanitizeSystemPromptV2Sections(runtimePromptConfig.sections);
  return {
    enabled:
      typeof runtimePromptConfig.enabled === "boolean"
        ? runtimePromptConfig.enabled
        : true,
    sections:
      Object.keys(sections).length > 0
        ? sections
        : { ...DEFAULT_SYSTEM_PROMPT_V2_SECTIONS },
  };
};

const injectWorkspaceRootIntoPayload = (payload) => {
  if (!isObject(payload)) {
    return payload;
  }

  const currentOptions = isObject(payload.options) ? payload.options : {};
  const disableWorkspaceRoot =
    currentOptions.disable_workspace_root === true ||
    currentOptions.disableWorkspaceRoot === true;
  const explicitWorkspaceRoot =
    typeof currentOptions.workspaceRoot === "string" &&
    currentOptions.workspaceRoot.trim()
      ? currentOptions.workspaceRoot.trim()
      : typeof currentOptions.workspace_root === "string" &&
          currentOptions.workspace_root.trim()
        ? currentOptions.workspace_root.trim()
        : "";

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

  if (disableWorkspaceRoot) {
    return {
      ...payload,
      options: restOptions,
    };
  }

  if (explicitWorkspaceRoot) {
    return {
      ...payload,
      options: restOptions,
    };
  }

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

    listToolModalCatalog: async () => {
      if (!hasBridgeMethod("misoAPI", "listToolModalCatalog")) {
        return { toolkits: [], count: 0, source: "" };
      }

      try {
        const method = assertBridgeMethod("misoAPI", "listToolModalCatalog");
        const payload = await withTimeout(
          () => method(),
          8000,
          "miso_tool_modal_catalog_timeout",
          "Miso tool modal catalog request timed out",
        );
        return payload || { toolkits: [], count: 0, source: "" };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_tool_modal_catalog_failed",
          "Failed to query Miso tool modal catalog",
        );
      }
    },

    getToolkitDetail: async (toolkitId, toolName) => {
      if (!hasBridgeMethod("misoAPI", "getToolkitDetail")) {
        return {
          toolkitId: toolkitId || "",
          toolkitName: "",
          toolkitDescription: "",
          toolkitIcon: {},
          readmeMarkdown: "",
          selectedToolName: toolName || null,
        };
      }

      try {
        const method = assertBridgeMethod("misoAPI", "getToolkitDetail");
        const payload = await withTimeout(
          () => method(toolkitId, toolName),
          6000,
          "miso_toolkit_detail_timeout",
          "Miso toolkit detail request timed out",
        );
        return (
          payload || {
            toolkitId: toolkitId || "",
            toolkitName: "",
            toolkitDescription: "",
            toolkitIcon: {},
            readmeMarkdown: "",
            selectedToolName: toolName || null,
          }
        );
      } catch (error) {
        throw toFrontendApiError(
          error,
          "miso_toolkit_detail_failed",
          "Failed to query Miso toolkit detail",
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

    getSessionMemoryExport: async (sessionId) => {
      const method = assertBridgeMethod("misoAPI", "getSessionMemoryExport");
      return withTimeout(
        () => method(sessionId),
        10000,
        "session_memory_export_timeout",
        "Session memory export request timed out",
      );
    },

    listCharacters: async () => {
      const method = assertBridgeMethod("misoAPI", "listCharacters");
      const response = await withTimeout(
        () => method(),
        15000,
        "character_list_timeout",
        "Character list request timed out",
      );
      return {
        characters: Array.isArray(response?.characters) ? response.characters : [],
        count: Number.isFinite(Number(response?.count))
          ? Number(response.count)
          : 0,
      };
    },

    getCharacter: async (characterId) => {
      const method = assertBridgeMethod("misoAPI", "getCharacter");
      return withTimeout(
        () => method(characterId),
        15000,
        "character_get_timeout",
        "Character get request timed out",
      );
    },

    saveCharacter: async (payload = {}) => {
      const method = assertBridgeMethod("misoAPI", "saveCharacter");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "character_save_timeout",
        "Character save request timed out",
      );
    },

    deleteCharacter: async (characterId) => {
      const method = assertBridgeMethod("misoAPI", "deleteCharacter");
      return withTimeout(
        () => method(characterId),
        30000,
        "character_delete_timeout",
        "Character delete request timed out",
      );
    },

    previewCharacterDecision: async (payload = {}) => {
      const method = assertBridgeMethod("misoAPI", "previewCharacterDecision");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "character_preview_timeout",
        "Character preview request timed out",
      );
    },

    buildCharacterAgentConfig: async (payload = {}) => {
      const method = assertBridgeMethod("misoAPI", "buildCharacterAgentConfig");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "character_build_timeout",
        "Character build request timed out",
      );
    },

    exportCharacter: async (characterId, filePath) => {
      const method = assertBridgeMethod("misoAPI", "exportCharacter");
      return withTimeout(
        () => method(characterId, filePath),
        30000,
        "character_export_timeout",
        "Character export request timed out",
      );
    },

    importCharacter: async (filePath) => {
      const method = assertBridgeMethod("misoAPI", "importCharacter");
      return withTimeout(
        () => method(filePath),
        30000,
        "character_import_timeout",
        "Character import request timed out",
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
