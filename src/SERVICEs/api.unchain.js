import {
  EMPTY_MODEL_CATALOG,
  FrontendApiError,
  assertBridgeMethod,
  hasBridgeMethod,
  isObject,
  normalizeUnchainStatus,
  normalizeModelCatalog,
  toFrontendApiError,
  withTimeout,
} from "./api.shared";
import { readWorkspaces } from "../COMPONENTs/settings/runtime";
import { readMemorySettings } from "../COMPONENTs/settings/memory/storage";
import { sanitizeSystemPromptSections } from "./system_prompt_sections";
import { DEFAULT_SYSTEM_PROMPT_V2_SECTIONS } from "./prompts/defaults";

const SUPPORTED_REMOTE_PROVIDERS = new Set(["openai", "anthropic"]);
const MEMORY_EMBEDDING_PROVIDERS = new Set(["auto", "openai", "ollama"]);
const DEFAULT_LONG_TERM_MEMORY_NAMESPACE = "pupu:default";

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

  // Build the full list: selected workspaces first, then append the global
  // default root as a fallback if it is distinct.
  const allRoots = [
    ...selectedPaths,
    ...(defaultRoot && !selectedPaths.includes(defaultRoot) ? [defaultRoot] : []),
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

const normalizeUnchainV2Payload = (payload) => {
  const payloadWithWorkspaceRoot = injectWorkspaceRootIntoPayload(payload);
  const payloadWithSystemPromptV2 = injectSystemPromptV2IntoPayload(
    payloadWithWorkspaceRoot,
  );
  const payloadWithMemory = injectMemoryIntoPayload(payloadWithSystemPromptV2);
  return injectProviderApiKeyIntoPayload(payloadWithMemory);
};

export const createUnchainApi = () => {
  const unchainApi = {
    isBridgeAvailable: () =>
      hasBridgeMethod("unchainAPI", "getStatus") &&
      hasBridgeMethod("unchainAPI", "startStream") &&
      hasBridgeMethod("unchainAPI", "startStreamV2"),

    isRuntimeEventStreamV3Available: () =>
      hasBridgeMethod("unchainAPI", "startStreamV3"),

    getStatus: async () => {
      try {
        const method = assertBridgeMethod("unchainAPI", "getStatus");
        const status = await withTimeout(
          () => method(),
          4000,
          "unchain_status_timeout",
          "Unchain status request timed out",
        );
        return normalizeUnchainStatus(status);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_status_failed",
          "Failed to query Unchain status",
        );
      }
    },

    getModelCatalog: async () => {
      if (!hasBridgeMethod("unchainAPI", "getModelCatalog")) {
        return normalizeModelCatalog(EMPTY_MODEL_CATALOG);
      }

      try {
        const method = assertBridgeMethod("unchainAPI", "getModelCatalog");
        const payload = await withTimeout(
          () => method(),
          6000,
          "unchain_model_catalog_timeout",
          "Unchain model catalog request timed out",
        );
        return normalizeModelCatalog(payload);
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_model_catalog_failed",
          "Failed to query Unchain model catalog",
        );
      }
    },

    getToolkitCatalog: async () => {
      if (!hasBridgeMethod("unchainAPI", "getToolkitCatalog")) {
        return { toolkits: [], count: 0, source: "" };
      }

      try {
        const method = assertBridgeMethod("unchainAPI", "getToolkitCatalog");
        const payload = await withTimeout(
          () => method(),
          6000,
          "unchain_toolkit_catalog_timeout",
          "Unchain toolkit catalog request timed out",
        );
        return payload || { toolkits: [], count: 0, source: "" };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_toolkit_catalog_failed",
          "Failed to query Unchain toolkit catalog",
        );
      }
    },

    listToolModalCatalog: async () => {
      if (!hasBridgeMethod("unchainAPI", "listToolModalCatalog")) {
        return { toolkits: [], count: 0, source: "" };
      }

      try {
        const method = assertBridgeMethod("unchainAPI", "listToolModalCatalog");
        const payload = await withTimeout(
          () => method(),
          8000,
          "unchain_tool_modal_catalog_timeout",
          "Unchain tool modal catalog request timed out",
        );
        return payload || { toolkits: [], count: 0, source: "" };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_tool_modal_catalog_failed",
          "Failed to query Unchain tool modal catalog",
        );
      }
    },

    getToolkitDetail: async (toolkitId, toolName) => {
      if (!hasBridgeMethod("unchainAPI", "getToolkitDetail")) {
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
        const method = assertBridgeMethod("unchainAPI", "getToolkitDetail");
        const payload = await withTimeout(
          () => method(toolkitId, toolName),
          6000,
          "unchain_toolkit_detail_timeout",
          "Unchain toolkit detail request timed out",
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
          "unchain_toolkit_detail_failed",
          "Failed to query Unchain toolkit detail",
        );
      }
    },

    respondToolConfirmation: async (payload = {}) => {
      try {
        const method = assertBridgeMethod("unchainAPI", "respondToolConfirmation");
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
          "unchain_tool_confirmation_failed",
          "Failed to submit tool confirmation",
        );
      }
    },

    startStream: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("unchainAPI", "startStream");
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
            "Unchain bridge returned an invalid stream handle",
          );
        }
        return streamHandle;
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_stream_start_failed",
          "Failed to start Unchain stream",
        );
      }
    },

    getMemoryProjection: async (sessionId) => {
      const method = assertBridgeMethod("unchainAPI", "getMemoryProjection");
      return withTimeout(
        () => method(sessionId),
        10000,
        "memory_projection_timeout",
        "Memory projection request timed out",
      );
    },

    getSessionMemoryExport: async (sessionId) => {
      const method = assertBridgeMethod("unchainAPI", "getSessionMemoryExport");
      return withTimeout(
        () => method(sessionId),
        10000,
        "session_memory_export_timeout",
        "Session memory export request timed out",
      );
    },

    listChatPlans: async (threadId) => {
      if (!hasBridgeMethod("unchainAPI", "listChatPlans")) {
        return {
          thread_id: threadId || "",
          active_plan_id: "",
          plans: [],
          count: 0,
        };
      }
      const method = assertBridgeMethod("unchainAPI", "listChatPlans");
      const response = await withTimeout(
        () => method(threadId),
        10000,
        "chat_plan_list_timeout",
        "Chat plan list request timed out",
      );
      return isObject(response)
        ? response
        : {
            thread_id: threadId || "",
            active_plan_id: "",
            plans: [],
            count: 0,
          };
    },

    getChatPlan: async (threadId, planId) => {
      const method = assertBridgeMethod("unchainAPI", "getChatPlan");
      const response = await withTimeout(
        () => method(threadId, planId),
        10000,
        "chat_plan_read_timeout",
        "Chat plan read request timed out",
      );
      return isObject(response) ? response : {};
    },

    listSeedCharacters: async () => {
      const method = assertBridgeMethod("unchainAPI", "listSeedCharacters");
      const response = await withTimeout(
        () => method(),
        15000,
        "seed_character_list_timeout",
        "Seed character list request timed out",
      );
      return {
        characters: Array.isArray(response?.characters) ? response.characters : [],
        count: Number.isFinite(Number(response?.count))
          ? Number(response.count)
          : 0,
      };
    },

    listCharacters: async () => {
      const method = assertBridgeMethod("unchainAPI", "listCharacters");
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
      const method = assertBridgeMethod("unchainAPI", "getCharacter");
      return withTimeout(
        () => method(characterId),
        15000,
        "character_get_timeout",
        "Character get request timed out",
      );
    },

    saveCharacter: async (payload = {}) => {
      const method = assertBridgeMethod("unchainAPI", "saveCharacter");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "character_save_timeout",
        "Character save request timed out",
      );
    },

    deleteCharacter: async (characterId) => {
      const method = assertBridgeMethod("unchainAPI", "deleteCharacter");
      return withTimeout(
        () => method(characterId),
        30000,
        "character_delete_timeout",
        "Character delete request timed out",
      );
    },

    listRecipes: async () => {
      const method = assertBridgeMethod("unchainAPI", "listRecipes");
      const response = await withTimeout(
        () => method(),
        15000,
        "recipe_list_timeout",
        "Recipe list request timed out",
      );
      return {
        recipes: Array.isArray(response?.recipes) ? response.recipes : [],
        count: Number.isFinite(Number(response?.count))
          ? Number(response.count)
          : 0,
      };
    },

    getRecipe: async (recipeName) => {
      const method = assertBridgeMethod("unchainAPI", "getRecipe");
      return withTimeout(
        () => method(recipeName),
        15000,
        "recipe_get_timeout",
        "Recipe get request timed out",
      );
    },

    saveRecipe: async (payload = {}) => {
      const method = assertBridgeMethod("unchainAPI", "saveRecipe");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "recipe_save_timeout",
        "Recipe save request timed out",
      );
    },

    deleteRecipe: async (recipeName) => {
      const method = assertBridgeMethod("unchainAPI", "deleteRecipe");
      return withTimeout(
        () => method(recipeName),
        30000,
        "recipe_delete_timeout",
        "Recipe delete request timed out",
      );
    },

    renameRecipe: async (oldName, newName) => {
      const getMethod = assertBridgeMethod("unchainAPI", "getRecipe");
      const saveMethod = assertBridgeMethod("unchainAPI", "saveRecipe");
      const deleteMethod = assertBridgeMethod("unchainAPI", "deleteRecipe");
      const recipe = await withTimeout(
        () => getMethod(oldName),
        15000,
        "recipe_get_timeout",
        "Recipe get request timed out",
      );
      if (!recipe) throw new Error(`recipe_not_found:${oldName}`);
      await withTimeout(
        () => saveMethod({ ...recipe, name: newName }),
        20000,
        "recipe_save_timeout",
        "Recipe save request timed out",
      );
      await withTimeout(
        () => deleteMethod(oldName),
        30000,
        "recipe_delete_timeout",
        "Recipe delete request timed out",
      );
      return { old_name: oldName, new_name: newName };
    },

    duplicateRecipe: async (srcName, nextName) => {
      const getMethod = assertBridgeMethod("unchainAPI", "getRecipe");
      const saveMethod = assertBridgeMethod("unchainAPI", "saveRecipe");
      const recipe = await withTimeout(
        () => getMethod(srcName),
        15000,
        "recipe_get_timeout",
        "Recipe get request timed out",
      );
      if (!recipe) throw new Error(`recipe_not_found:${srcName}`);
      await withTimeout(
        () => saveMethod({ ...recipe, name: nextName }),
        20000,
        "recipe_save_timeout",
        "Recipe save request timed out",
      );
      return nextName;
    },

    listSubagentRefs: async () => {
      const method = assertBridgeMethod("unchainAPI", "listSubagentRefs");
      const response = await withTimeout(
        () => method(),
        15000,
        "subagent_refs_timeout",
        "Subagent refs request timed out",
      );
      return {
        refs: Array.isArray(response?.refs) ? response.refs : [],
        count: Number.isFinite(Number(response?.count))
          ? Number(response.count)
          : 0,
      };
    },

    previewCharacterDecision: async (payload = {}) => {
      const method = assertBridgeMethod("unchainAPI", "previewCharacterDecision");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "character_preview_timeout",
        "Character preview request timed out",
      );
    },

    buildCharacterAgentConfig: async (payload = {}) => {
      const method = assertBridgeMethod("unchainAPI", "buildCharacterAgentConfig");
      return withTimeout(
        () => method(isObject(payload) ? payload : {}),
        20000,
        "character_build_timeout",
        "Character build request timed out",
      );
    },

    exportCharacter: async (characterId, filePath) => {
      const method = assertBridgeMethod("unchainAPI", "exportCharacter");
      return withTimeout(
        () => method(characterId, filePath),
        30000,
        "character_export_timeout",
        "Character export request timed out",
      );
    },

    importCharacter: async (filePath) => {
      const method = assertBridgeMethod("unchainAPI", "importCharacter");
      return withTimeout(
        () => method(filePath),
        30000,
        "character_import_timeout",
        "Character import request timed out",
      );
    },

    getLongTermMemoryProjection: async () => {
      const method = assertBridgeMethod(
        "unchainAPI",
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

      if (!hasBridgeMethod("unchainAPI", "cancelStream")) {
        return;
      }

      try {
        const method = assertBridgeMethod("unchainAPI", "cancelStream");
        method(requestId);
      } catch (_error) {
        // cancellation is best-effort
      }
    },

    replaceSessionMemory: async (payload = {}) => {
      try {
        const method = assertBridgeMethod("unchainAPI", "replaceSessionMemory");
        const normalizedPayload = normalizeUnchainV2Payload(payload);
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
          "unchain_session_memory_replace_timeout",
          "Unchain session memory replace request timed out",
        );

        return isObject(response) ? response : { applied: false };
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_session_memory_replace_failed",
          "Failed to replace Unchain session memory",
        );
      }
    },

    startStreamV2: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("unchainAPI", "startStreamV2");
        const normalizedPayload = normalizeUnchainV2Payload(payload);
        const streamHandle = method(normalizedPayload, handlers);
        if (
          !isObject(streamHandle) ||
          typeof streamHandle.cancel !== "function"
        ) {
          throw new FrontendApiError(
            "invalid_stream_handle",
            "Unchain bridge returned an invalid stream handle",
          );
        }
        return streamHandle;
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_stream_v2_start_failed",
          "Failed to start Unchain v2 stream",
        );
      }
    },

    startStreamV3: (payload, handlers = {}) => {
      try {
        const method = assertBridgeMethod("unchainAPI", "startStreamV3");
        const normalizedPayload = normalizeUnchainV2Payload(payload);
        const streamHandle = method(normalizedPayload, handlers);
        if (
          !isObject(streamHandle) ||
          typeof streamHandle.cancel !== "function"
        ) {
          throw new FrontendApiError(
            "invalid_stream_handle",
            "Unchain bridge returned an invalid stream handle",
          );
        }
        return streamHandle;
      } catch (error) {
        throw toFrontendApiError(
          error,
          "unchain_stream_v3_start_failed",
          "Failed to start Unchain v3 stream",
        );
      }
    },
  };

  const retrieveUnchainModelList = async (provider = null) => {
    const catalog = await unchainApi.getModelCatalog();
    if (typeof provider !== "string" || !provider.trim()) {
      return catalog.providers;
    }
    const providerKey = provider.trim().toLowerCase();
    return Array.isArray(catalog.providers?.[providerKey])
      ? catalog.providers[providerKey]
      : [];
  };

  unchainApi.retrieveModelList = retrieveUnchainModelList;
  unchainApi.listModels = retrieveUnchainModelList;

  return unchainApi;
};

export default createUnchainApi;
