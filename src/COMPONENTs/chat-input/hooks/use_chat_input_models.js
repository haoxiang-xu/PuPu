import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import { build_model_options } from "../utils/build_model_options";
import { MODEL_GROUPS, MODEL_PROVIDER_PREFIXES } from "../constants";
import { readModelProviders } from "../../settings/model_providers/storage";
import { subscribeModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";

const get_group_of_model = (modelId) => {
  if (!modelId) return null;
  return (
    Object.keys(MODEL_PROVIDER_PREFIXES).find((group) =>
      modelId.startsWith(MODEL_PROVIDER_PREFIXES[group]),
    ) || null
  );
};

const make_initial_collapsed = (selectedModelId) => {
  const activeGroup = get_group_of_model(selectedModelId);
  return Object.fromEntries(
    Object.values(MODEL_GROUPS).map((g) => [g, g !== activeGroup]),
  );
};

const read_configured_providers = () => {
  const stored = readModelProviders() || {};
  return {
    hasOpenAI: !!stored.openai_api_key,
    hasAnthropic: !!stored.anthropic_api_key,
  };
};

export const useChatInputModels = ({ model_catalog, selected_model_id }) => {
  const [liveOllamaModels, setLiveOllamaModels] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => make_initial_collapsed(selected_model_id),
  );
  const [configuredProviders, setConfiguredProviders] = useState(
    read_configured_providers,
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
