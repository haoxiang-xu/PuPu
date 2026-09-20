import { useEffect, useState } from "react";
import api from "../../../../SERVICEs/api";

/**
 * useOllamaModelTags — the tags of one library model for the size picker
 * (#204, design O3). Fetched lazily when a card expands, cached per model
 * for the session so re-opening a card is instant.
 *
 * state: "idle" | "loading" | "ready" | "error"
 *   ready with tags=[] means the page parsed to nothing — the picker then
 *   falls back to the size tags the list already knew.
 */
const cache = new Map();

export const useOllamaModelTags = (modelName) => {
  const cached = modelName ? cache.get(modelName) : null;
  const [state, setState] = useState(cached ? "ready" : "idle");
  const [tags, setTags] = useState(cached || []);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!modelName) return undefined;
    const hit = cache.get(modelName);
    if (hit) {
      setTags(hit);
      setState("ready");
      return undefined;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    api.ollama
      .fetchLibraryTags(modelName)
      .then((result) => {
        if (cancelled) return;
        const list = Array.isArray(result) ? result : [];
        cache.set(modelName, list);
        setTags(list);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load tags");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [modelName, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return { state, tags, error, retry };
};

/** Test hook: forget everything fetched so far. */
export const __resetOllamaModelTagsCache = () => cache.clear();

export default useOllamaModelTags;
