/* Lightweight pub/sub so install / delete of MCP toolkits can ask any open
   toolkit consumer (chat selector, etc.) to re-pull the catalog immediately. */
const listeners = new Set();

export const emitToolkitCatalogRefresh = (payload = {}) => {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (_) {
      // no-op: a listener must not block the emitter
    }
  }
};

export const subscribeToolkitCatalogRefresh = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
