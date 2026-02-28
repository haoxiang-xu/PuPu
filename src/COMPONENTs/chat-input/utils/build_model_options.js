import { MODEL_GROUPS } from "../constants";

/**
 * Builds grouped model options for the chat model selector.
 *
 * @param {object} params
 * @param {Array<string>} params.live_ollama_models
 * @param {object} params.providers
 * @param {object} params.collapsed_groups
 * @returns {Array<object>}
 */
export const build_model_options = ({
  live_ollama_models,
  providers,
  collapsed_groups,
}) => {
  const groups = [];

  const ollamaProviderModels = Array.isArray(providers?.ollama)
    ? providers.ollama
    : [];
  const openaiProviderModels = Array.isArray(providers?.openai)
    ? providers.openai
    : [];
  const anthropicProviderModels = Array.isArray(providers?.anthropic)
    ? providers.anthropic
    : [];

  const ollamaModels =
    Array.isArray(live_ollama_models) && live_ollama_models.length > 0
      ? live_ollama_models
      : ollamaProviderModels;

  if (ollamaModels.length > 0) {
    groups.push({
      group: MODEL_GROUPS.OLLAMA,
      icon: "ollama",
      collapsed: Boolean(collapsed_groups?.[MODEL_GROUPS.OLLAMA]),
      options: ollamaModels.map((name) => ({
        value: `ollama:${name}`,
        label: name,
        trigger_label: name,
      })),
    });
  }

  if (openaiProviderModels.length > 0) {
    groups.push({
      group: MODEL_GROUPS.OPENAI,
      icon: "open_ai",
      collapsed: Boolean(collapsed_groups?.[MODEL_GROUPS.OPENAI]),
      options: openaiProviderModels.map((name) => ({
        value: `openai:${name}`,
        label: name,
        trigger_label: name,
      })),
    });
  }

  if (anthropicProviderModels.length > 0) {
    groups.push({
      group: MODEL_GROUPS.ANTHROPIC,
      icon: "Anthropic",
      collapsed: Boolean(collapsed_groups?.[MODEL_GROUPS.ANTHROPIC]),
      options: anthropicProviderModels.map((name) => ({
        value: `anthropic:${name}`,
        label: name,
        trigger_label: name,
      })),
    });
  }

  return groups;
};

export default build_model_options;
