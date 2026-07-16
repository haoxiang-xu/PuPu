export const BASE_TOOLKIT_IDS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]);

export const MODEL_GROUPS = {
  OLLAMA: "Ollama",
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
};

export const MODEL_PROVIDER_PREFIXES = {
  [MODEL_GROUPS.OLLAMA]: "ollama:",
  [MODEL_GROUPS.OPENAI]: "openai:",
  [MODEL_GROUPS.ANTHROPIC]: "anthropic:",
};

/** Literal address prefix for custom (user-defined) providers. */
export const CUSTOM_MODEL_PREFIX = "custom.";

/** Fallback icon key (UISVGs) for a custom provider group in the selector. */
export const CUSTOM_MODEL_GROUP_ICON = "server";

/**
 * Resolve the collapse-memory group key for a model value. Built-in providers
 * map to their MODEL_GROUPS name; a custom.* model value maps to its full
 * providerKey ("custom.<slug>") so each custom group folds independently
 * (design §6.3). Returns null for an unrecognized value.
 */
export const resolveModelGroupKey = (modelId) => {
  if (typeof modelId !== "string" || !modelId) {
    return null;
  }
  const builtin = Object.keys(MODEL_PROVIDER_PREFIXES).find((group) =>
    modelId.startsWith(MODEL_PROVIDER_PREFIXES[group]),
  );
  if (builtin) {
    return builtin;
  }
  if (modelId.startsWith(CUSTOM_MODEL_PREFIX)) {
    const colonIndex = modelId.indexOf(":");
    return colonIndex === -1 ? modelId : modelId.slice(0, colonIndex);
  }
  return null;
};
