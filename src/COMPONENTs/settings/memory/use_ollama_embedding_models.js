import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { subscribeModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";

/* ── module-level cache so re-mounts skip the loading flash ── */
let _cachedModels = null; // null = never fetched, [] = fetched but empty
let _cachedError = null;

/**
 * Hook that fetches locally-installed Ollama embedding models.
 *
 * Uses a module-level cache so that when the component re-mounts
 * (e.g. switching settings pages) the previous result is shown
 * instantly — no loading flash.
 *
 * Auto-refreshes whenever a model-catalog-refresh event fires
 * (e.g. after a pull completes in the Model Providers page).
 *
 * @returns {{ models: {name:string, size:number}[], loading: boolean, error: string|null, refresh: () => void }}
 */
const useOllamaEmbeddingModels = () => {
  const [models, setModels] = useState(() => _cachedModels ?? []);
  const [loading, setLoading] = useState(() => _cachedModels === null);
  const [error, setError] = useState(() => _cachedError);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    /* Only show loading spinner on the very first fetch (no cache yet). */
    if (_cachedModels === null) setLoading(true);
    setError(null);
    try {
      const result = await api.ollama.listEmbeddingModels();
      _cachedModels = result;
      _cachedError = null;
      if (mountedRef.current) {
        setModels(result);
      }
    } catch (err) {
      const msg = err?.message || "Failed to load embedding models";
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

  // Fetch on mount
  useEffect(() => {
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  // Auto-refresh on model catalog changes (e.g. after a pull)
  useEffect(() => {
    return subscribeModelCatalogRefresh(() => {
      refresh();
    });
  }, [refresh]);

  return { models, loading, error, refresh };
};

export default useOllamaEmbeddingModels;
