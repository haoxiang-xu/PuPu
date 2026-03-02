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

const getStoredWorkspaceRoot = () => {
  const runtimeSettings = readRuntimeSettings();
  const workspaceRoot = runtimeSettings?.workspace_root;
  return typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
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
            typeof reasonRaw === "string"
              ? reasonRaw
              : String(reasonRaw || ""),
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

        const response = await withTimeout(
          () => method(requestPayload),
          10000,
          "miso_tool_confirmation_timeout",
          "Tool confirmation request timed out",
        );

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
        const payloadWithWorkspaceRoot = injectWorkspaceRootIntoPayload(payload);
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
        const payloadWithWorkspaceRoot = injectWorkspaceRootIntoPayload(payload);
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
