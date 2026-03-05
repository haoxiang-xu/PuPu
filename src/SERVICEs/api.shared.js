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

class FrontendApiError extends Error {
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

const normalizeModelCatalog = (payload) => {
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

const UPDATE_STAGES = new Set([
  "idle",
  "checking",
  "no_update",
  "downloading",
  "downloaded",
  "error",
]);

const normalizeUpdateState = (state) => {
  const stage = UPDATE_STAGES.has(state?.stage) ? state.stage : "idle";
  const currentVersion =
    typeof state?.currentVersion === "string" ? state.currentVersion : "";
  const latestVersion =
    typeof state?.latestVersion === "string" ? state.latestVersion : undefined;
  const progressNumber = Number(state?.progress);
  const progress = Number.isFinite(progressNumber)
    ? Math.max(0, Math.min(100, Math.round(progressNumber)))
    : undefined;
  const message = typeof state?.message === "string" ? state.message : undefined;

  return {
    stage,
    currentVersion,
    ...(latestVersion ? { latestVersion } : {}),
    ...(progress !== undefined ? { progress } : {}),
    ...(message ? { message } : {}),
  };
};

export {
  OLLAMA_BASE,
  DEFAULT_TIMEOUT_MS,
  EMPTY_MODEL_CATALOG,
  FrontendApiError,
  isObject,
  toFrontendApiError,
  withTimeout,
  safeJson,
  getWindowBridge,
  hasBridgeMethod,
  assertBridgeMethod,
  normalizeModelCatalog,
  normalizeMisoStatus,
  normalizeUpdateState,
};
