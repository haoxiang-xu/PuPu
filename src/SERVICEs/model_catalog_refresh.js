const listeners = new Set();

export const emitModelCatalogRefresh = (payload = {}) => {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (_) {
      // no-op: listeners should not block emitter
    }
  }
};

export const subscribeModelCatalogRefresh = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

