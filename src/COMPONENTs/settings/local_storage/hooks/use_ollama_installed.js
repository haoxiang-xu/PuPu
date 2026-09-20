import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import { fetchOllamaModels } from "../utils/ollama_models";

/**
 * useOllamaInstalled — the Ollama service state plus the locally installed
 * model list. Lifted out of the Local Storage settings page (#204) so the
 * Model Providers page and Local Storage read the same thing the same way.
 *
 * status: "loading" | "starting" | "ready" | "offline" | "not_found"
 *   not_found — the Electron bridge says no binary is installed.
 *   offline   — the HTTP probe failed (service not running / no bridge).
 *   ready     — /api/tags answered; `models` is the sorted installed list
 *               ({ name, size }, largest first — see api.ollama.listModels).
 */
export const useOllamaInstalled = ({ enabled = true } = {}) => {
  const [status, setStatus] = useState("loading");
  const [models, setModels] = useState([]);
  const hasOllamaBridge = api.ollama.isBridgeAvailable();

  const load = useCallback(async () => {
    setStatus("loading");

    if (hasOllamaBridge) {
      const electronStatus = await api.ollama.getStatus();
      if (electronStatus === "not_found") {
        setStatus("not_found");
        return;
      }
      if (electronStatus === "checking" || electronStatus === "starting") {
        setStatus("starting");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    try {
      const data = await fetchOllamaModels();
      setModels(data);
      setStatus("ready");
    } catch {
      setModels([]);
      setStatus("offline");
    }
  }, [hasOllamaBridge]);

  const restart = useCallback(async () => {
    if (!hasOllamaBridge) return;
    setStatus("starting");
    const result = await api.ollama.restart();
    if (result === "not_found") {
      setStatus("not_found");
      return;
    }
    await load();
  }, [hasOllamaBridge, load]);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  /* Local removal after a confirmed delete — the row already asked the
     service; re-fetching would only race the catalog refresh it emitted. */
  const removeLocally = useCallback((name) => {
    setModels((prev) => prev.filter((m) => m.name !== name));
  }, []);

  return {
    status,
    models,
    hasOllamaBridge,
    load,
    restart,
    removeLocally,
  };
};

export default useOllamaInstalled;
