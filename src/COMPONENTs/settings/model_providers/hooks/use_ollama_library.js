import { useCallback, useEffect, useState } from "react";
import api from "../../../../SERVICEs/api";
import pull_store from "../pull_store";

export const useOllamaLibrary = () => {
  const [category, setCategory] = useState("");
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [installedNames, setInstalledNames] = useState(new Set());
  const [pullingMap, setPullingMap] = useState(() => ({ ...pull_store.map }));

  useEffect(() => pull_store.subscribe(setPullingMap), []);

  useEffect(() => {
    api.ollama
      .listModels()
      .then((list) => {
        setInstalledNames(new Set(list.map((m) => m.name)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(rawQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const runSearch = useCallback((query, nextCategory) => {
    return api.ollama.searchLibrary({ query, category: nextCategory });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    runSearch(debouncedQuery, category)
      .then((result) => {
        if (!cancelled) {
          setModels(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Failed to load models");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [category, debouncedQuery, runSearch]);

  const handlePull = useCallback((modelName, size) => {
    const fullName = size ? `${modelName}:${size}` : modelName;
    const key = fullName;
    if (pull_store.refs[key]) return;

    const controller = new AbortController();
    pull_store.refs[key] = controller;
    pull_store.set(key, { status: "starting", percent: null, error: null });

    api.ollama
      .pullModel({
        name: fullName,
        signal: controller.signal,
        onProgress: ({ status, percent }) => {
          pull_store.set(key, {
            status: status || "pulling",
            percent: percent ?? pull_store.map[key]?.percent ?? null,
            error: null,
          });
        },
      })
      .then(() => {
        delete pull_store.refs[key];
        pull_store.delete(key);
        api.ollama
          .listModels()
          .then((list) => {
            setInstalledNames(new Set(list.map((m) => m.name)));
          })
          .catch(() => {});
      })
      .catch((err) => {
        delete pull_store.refs[key];
        if (err?.name === "AbortError" || err?.code === "abort") {
          pull_store.delete(key);
        } else {
          pull_store.set(key, {
            status: "error",
            percent: null,
            error: err?.message || "Pull failed",
          });
          setTimeout(() => pull_store.delete(key), 4000);
        }
      });
  }, []);

  const handleCancel = useCallback((key) => {
    pull_store.refs[key]?.abort();
    delete pull_store.refs[key];
    pull_store.delete(key);
  }, []);

  const retrySearch = useCallback(() => {
    setError(null);
    setLoading(true);
    runSearch(debouncedQuery, category)
      .then((result) => {
        setModels(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load models");
        setLoading(false);
      });
  }, [category, debouncedQuery, runSearch]);

  return {
    category,
    setCategory,
    rawQuery,
    setRawQuery,
    debouncedQuery,
    models,
    loading,
    error,
    installedNames,
    pullingMap,
    handlePull,
    handleCancel,
    retrySearch,
  };
};

export default useOllamaLibrary;
