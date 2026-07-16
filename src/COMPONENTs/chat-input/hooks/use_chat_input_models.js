import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import { build_model_options } from "../utils/build_model_options";
import { MODEL_GROUPS, resolveModelGroupKey } from "../constants";
import { readModelProviders } from "../../settings/model_providers/storage";
import {
  customProviderKey,
  getCustomProviderSecret,
  readCustomProviders,
} from "../../../SERVICEs/custom_provider_store";
import { subscribeModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";

/**
 * Gated custom provider list for the selector: enabled AND
 * (auth.mode === "none" OR a stored secret exists) — design §6.3.
 * Returns a compact shape build_model_options understands.
 */
const read_custom_provider_groups = () => {
  let defs;
  try {
    defs = readCustomProviders();
  } catch (_error) {
    return [];
  }
  if (!Array.isArray(defs)) {
    return [];
  }
  return defs
    .filter((def) => {
      if (def.enabled !== true) {
        return false;
      }
      const authMode = def.auth?.mode || "none";
      if (authMode === "none") {
        return true;
      }
      return getCustomProviderSecret(def.id).length > 0;
    })
    .map((def) => ({
      slug: def.id,
      display_name: def.display_name,
      default_model: def.default_model,
      models: def.models.map((m) => ({
        id: m.id,
        display_name: m.display_name,
      })),
    }));
};

const make_initial_collapsed = (selectedModelId, customGroups) => {
  const activeGroupKey = resolveModelGroupKey(selectedModelId);
  const collapsed = {};
  // Built-in groups collapse when they are not the active group.
  for (const groupName of Object.values(MODEL_GROUPS)) {
    collapsed[groupName] = groupName !== activeGroupKey;
  }
  // Custom groups keyed by full providerKey ("custom.<slug>").
  for (const provider of customGroups || []) {
    const providerKey = customProviderKey(provider.slug);
    if (providerKey) {
      collapsed[providerKey] = providerKey !== activeGroupKey;
    }
  }
  return collapsed;
};

const read_configured_providers = () => {
  const stored = readModelProviders() || {};
  return {
    hasOpenAI: !!stored.openai_api_key,
    hasAnthropic: !!stored.anthropic_api_key,
    customGroups: read_custom_provider_groups(),
  };
};

export const useChatInputModels = ({ model_catalog, selected_model_id }) => {
  const [liveOllamaModels, setLiveOllamaModels] = useState([]);
  const [configuredProviders, setConfiguredProviders] = useState(
    read_configured_providers,
  );
  const [collapsedGroups, setCollapsedGroups] = useState(() =>
    make_initial_collapsed(
      selected_model_id,
      read_custom_provider_groups(),
    ),
  );

  const ollamaProviderModels = model_catalog?.providers?.ollama;
  const openaiProviderModels = model_catalog?.providers?.openai;
  const anthropicProviderModels = model_catalog?.providers?.anthropic;

  useEffect(() => {
    let cancelled = false;
    api.ollama
      .listChatModels()
      .then((models) => {
        if (!cancelled) {
          setLiveOllamaModels(models.map((m) => m.name));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeModelCatalogRefresh(() => {
      setConfiguredProviders(read_configured_providers());
      api.ollama
        .listChatModels()
        .then((models) => {
          setLiveOllamaModels(models.map((m) => m.name));
        })
        .catch(() => {});
    });
  }, []);

  const handleGroupToggle = useCallback((groupName) => {
    setCollapsedGroups((previous) => ({
      ...previous,
      [groupName]: !previous[groupName],
    }));
  }, []);

  const modelOptions = useMemo(
    () =>
      build_model_options({
        live_ollama_models: liveOllamaModels,
        providers: {
          ollama: ollamaProviderModels,
          openai: configuredProviders.hasOpenAI ? openaiProviderModels : [],
          anthropic: configuredProviders.hasAnthropic
            ? anthropicProviderModels
            : [],
        },
        custom_provider_groups: configuredProviders.customGroups,
        collapsed_groups: collapsedGroups,
      }),
    [
      liveOllamaModels,
      ollamaProviderModels,
      openaiProviderModels,
      anthropicProviderModels,
      collapsedGroups,
      configuredProviders,
    ],
  );

  return {
    modelOptions,
    handleGroupToggle,
  };
};

export default useChatInputModels;
