import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import { build_model_options } from "../utils/build_model_options";
import { MODEL_GROUPS, MODEL_PROVIDER_PREFIXES } from "../constants";

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

export const useChatInputModels = ({ model_catalog, selected_model_id }) => {
  const [liveOllamaModels, setLiveOllamaModels] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => make_initial_collapsed(selected_model_id),
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
          openai: openaiProviderModels,
          anthropic: anthropicProviderModels,
        },
        collapsed_groups: collapsedGroups,
      }),
    [
      liveOllamaModels,
      ollamaProviderModels,
      openaiProviderModels,
      anthropicProviderModels,
      collapsedGroups,
    ],
  );

  return {
    modelOptions,
    handleGroupToggle,
  };
};

export default useChatInputModels;
