const resolveApi = () => {
  if (typeof window === "undefined") return null;
  const api = window.runBundleStorageAPI;
  if (!api || typeof api !== "object") return null;
  for (const method of ["upsert", "query", "clear"]) {
    if (typeof api[method] !== "function") return null;
  }
  return api;
};

export const isRunBundleStorageBridgeAvailable = () => resolveApi() !== null;

export const parseRunBundleStorageErrorCode = (error) => {
  if (error && typeof error.code === "string" && error.code) return error.code;
  const message = error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/^\[([a-z0-9_]+)\]/);
  return match ? match[1] : null;
};

const unavailable = () => {
  const error = new Error(
    "[run_bundle_storage_unavailable] Electron RunBundle storage bridge is unavailable",
  );
  error.code = "run_bundle_storage_unavailable";
  return error;
};

export const runBundleStorageBridge = Object.freeze({
  upsert(bundle) {
    const api = resolveApi();
    if (!api) return Promise.reject(unavailable());
    return api.upsert(bundle);
  },
  query(query = {}) {
    const api = resolveApi();
    if (!api) return Promise.reject(unavailable());
    return api.query(query);
  },
  clear(options = {}) {
    const api = resolveApi();
    if (!api) return Promise.reject(unavailable());
    return api.clear(options);
  },
});

