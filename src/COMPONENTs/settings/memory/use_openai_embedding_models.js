import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { subscribeModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";

/* module-level cache so re-mounts skip the loading flash */
let _cachedModels = null; // null = never fetched, [] = fetched but empty
let _cachedError = null;

/**
 * Hook that fetches OpenAI embedding models from backend model catalog.
 *
 * Uses a module-level cache so that when the component re-mounts
 * (e.g. switching settings pages) the previous result is shown
 * instantly — no loading flash.
 *
 * Auto-refreshes whenever a model-catalog-refresh event fires
 * (e.g. after model provider settings changed).
 *
 * @returns {{ models: string[], loading: boolean, error: string|null, refresh: () => void }}
 */
const useOpenAIEmbeddingModels = () => {
  const [models, setModels] = useState(() => _cachedModels ?? []);
  const [loading, setLoading] = useState(() => _cachedModels === null);
  const [error, setError] = useState(() => _cachedError);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (_cachedModels === null) setLoading(true);
    setError(null);

    try {
      const catalog = await api.unchain.getModelCatalog();
      const list = Array.isArray(catalog?.embeddingProviders?.openai)
        ? catalog.embeddingProviders.openai
        : [];
      _cachedModels = list;
      _cachedError = null;
      if (mountedRef.current) {
        setModels(list);
      }
    } catch (err) {
      const msg = err?.message || "Failed to load OpenAI embedding models";
      _cachedError = msg;
      if (mountedRef.current) {
        setError(msg);
        setModels(_cachedModels ?? []);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    return subscribeModelCatalogRefresh(() => {
      refresh();
    });
  }, [refresh]);

  return { models, loading, error, refresh };
};

export default useOpenAIEmbeddingModels;
