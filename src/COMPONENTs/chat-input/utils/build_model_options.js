import {
  CUSTOM_MODEL_GROUP_ICON,
  CUSTOM_MODEL_PREFIX,
  MODEL_GROUPS,
} from "../constants";

/**
 * Builds grouped model options for the chat model selector.
 *
 * @param {object} params
 * @param {Array<string>} params.live_ollama_models
 * @param {object} params.providers
 * @param {object} params.collapsed_groups
 * @param {Array<object>} [params.custom_provider_groups] — already gated
 *        (enabled + usable) custom providers. Each: {slug, display_name,
 *        models: [{id, display_name}], default_model}.
 * @returns {Array<object>}
 */
export const build_model_options = ({
  live_ollama_models,
  providers,
  collapsed_groups,
  custom_provider_groups,
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

  // ── Custom (user-defined) provider groups ──
  // One group per gated custom provider. default_model is ordered first.
  // The group value prefix is "custom.<slug>:" and each group carries a
  // "Custom" badge marker so the UI can distinguish user providers (§4.1).
  const customGroups = Array.isArray(custom_provider_groups)
    ? custom_provider_groups
    : [];
  for (const provider of customGroups) {
    if (!provider || typeof provider.slug !== "string" || !provider.slug) {
      continue;
    }
    const models = Array.isArray(provider.models) ? provider.models : [];
    if (models.length === 0) {
      continue;
    }
    const providerKey = `${CUSTOM_MODEL_PREFIX}${provider.slug}`;
    const defaultModelId =
      typeof provider.default_model === "string" ? provider.default_model : "";

    // Order: default_model first, then the rest in declared order (de-duped).
    const orderedModels = [];
    const seen = new Set();
    if (defaultModelId) {
      const found = models.find((m) => m && m.id === defaultModelId);
      if (found) {
        orderedModels.push(found);
        seen.add(defaultModelId);
      }
    }
    for (const model of models) {
      if (!model || typeof model.id !== "string" || !model.id) {
        continue;
      }
      if (seen.has(model.id)) {
        continue;
      }
      seen.add(model.id);
      orderedModels.push(model);
    }
    if (orderedModels.length === 0) {
      continue;
    }

    const groupName =
      typeof provider.display_name === "string" && provider.display_name
        ? provider.display_name
        : provider.slug;

    groups.push({
      group: groupName,
      group_key: providerKey,
      icon: CUSTOM_MODEL_GROUP_ICON,
      is_custom: true,
      badge: "Custom",
      collapsed: Boolean(
        collapsed_groups?.[providerKey] ?? collapsed_groups?.[groupName],
      ),
      options: orderedModels.map((model) => {
        const label =
          typeof model.display_name === "string" && model.display_name
            ? model.display_name
            : model.id;
        return {
          value: `${providerKey}:${model.id}`,
          label,
          trigger_label: label,
        };
      }),
    });
  }

  return groups;
};

export default build_model_options;
