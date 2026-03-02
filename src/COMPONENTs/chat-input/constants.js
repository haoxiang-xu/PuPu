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
