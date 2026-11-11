import { MODEL_GROUPS, CUSTOM_MODEL_GROUP_ICON } from "../../../../chat-input/constants";
import { findShippedProviderBySlug } from "../../../../../SERVICEs/shipped_provider_registry";
import { own, safe_text } from "../document_values";

const PROVIDERS = {
  ollama: { group: MODEL_GROUPS.OLLAMA, icon: "ollama" },
  openai: { group: MODEL_GROUPS.OPENAI, icon: "open_ai" },
  anthropic: { group: MODEL_GROUPS.ANTHROPIC, icon: "Anthropic" },
  gemini: { group: MODEL_GROUPS.GEMINI, icon: "gemini" },
};

// Group the host's exact profile ids; never reconstruct them from model names.
export function kernel_model_options(profiles, stored, collapsed, t, definitions = []) {
  const groups = new Map();
  const bySlug = new Map(definitions.map((definition) => [definition.id, definition]));
  function add(profile, unlisted) {
    const provider = safe_text(own(profile, "provider"));
    const model = safe_text(own(profile, "model"));
    const key = provider || "__stored__";
    const slug = provider.startsWith("custom.") ? provider.slice(7) : null;
    const definition = bySlug.get(slug);
    if (!groups.has(key)) {
      const builtin = own(PROVIDERS, provider);
      const shipped = findShippedProviderBySlug(slug);
      groups.set(key, {
        group: builtin?.group || definition?.display_name || shipped?.title || provider || t("agents.execution.kernel.unreadable_model"),
        group_key: key,
        icon: builtin?.icon || shipped?.icon || CUSTOM_MODEL_GROUP_ICON,
        ...(slug && !shipped ? { is_custom: true, badge: "Custom" } : {}),
        collapsed: Boolean(own(collapsed, key)),
        options: [],
      });
    }
    const id = own(profile, "id");
    const modelLabel = definition?.models?.find(({ id }) => id === model)?.display_name || model;
    const label = unlisted ? t("agents.execution.kernel.unlisted_model_option", { stored_profile: `${provider} · ${model}` }) : modelLabel;
    groups.get(key).options.push({
      value: typeof id === "string" ? id : "__stored__",
      label,
      trigger_label: label,
    });
  }
  if (stored && typeof stored === "object" && !Array.isArray(stored) && !profiles.some((profile) => own(profile, "id") === own(stored, "id"))) add(stored, true);
  profiles.forEach((profile) => add(profile, false));
  return [...groups.values()];
}
