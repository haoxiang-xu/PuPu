import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import { build_model_options } from "../utils/build_model_options";

export const useChatInputModels = ({ model_catalog }) => {
  const [liveOllamaModels, setLiveOllamaModels] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const ollamaProviderModels = model_catalog?.providers?.ollama;
  const openaiProviderModels = model_catalog?.providers?.openai;
  const anthropicProviderModels = model_catalog?.providers?.anthropic;

  useEffect(() => {
    let cancelled = false;
    api.ollama
      .listModels()
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
