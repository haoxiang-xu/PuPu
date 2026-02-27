import { useState, useEffect, useRef, useCallback } from "react";

/* { STORAGE HOOKs } --------------------------------------------------------------------------------------------- */
const createMemoryStorageAdapter = () => {
  const store = new Map();
  return {
    name: "memory",
    async getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
};

const createIndexedDBStorageAdapter = ({
  dbName = "mini_ui_storage",
  storeName = "mini_use_kv",
  version = 1,
} = {}) => {
  let dbPromise = null;
  const isAvailable = () =>
    typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

  const openDb = () => {
    if (!isAvailable()) {
      return Promise.reject(
        new Error("IndexedDB is unavailable in this runtime.")
      );
    }
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(dbName, version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("Failed to open IndexedDB."));
      request.onblocked = () =>
        reject(new Error("IndexedDB open request was blocked."));
    });

    return dbPromise;
  };

  const runRequest = async (mode, operation) => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      let request = null;
      try {
        const transaction = db.transaction(storeName, mode);
        const objectStore = transaction.objectStore(storeName);
        request = operation(objectStore);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error || new Error("IndexedDB request failed."));
        transaction.onabort = () =>
          reject(
            transaction.error || new Error("IndexedDB transaction aborted.")
          );
      } catch (error) {
        reject(error);
      }
    });
  };

  return {
    name: "indexeddb",
    async getItem(key) {
      const value = await runRequest("readonly", (store) => store.get(key));
      if (value === undefined || value === null) {
        return null;
      }
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async setItem(key, value) {
      await runRequest("readwrite", (store) => store.put(value, key));
    },
    async removeItem(key) {
      await runRequest("readwrite", (store) => store.delete(key));
    },
  };
};

const createStorageAdapterFromMethods = (
  storage,
  {
    name = "custom-storage",
    getMethod = "getItem",
    setMethod = "setItem",
    removeMethod = "removeItem",
  } = {}
) => {
  const toPromise = (value) =>
    value && typeof value.then === "function"
      ? value
      : Promise.resolve(value);

  if (!storage) {
    throw new Error("storage instance is required.");
  }
  if (
    typeof storage[getMethod] !== "function" ||
    typeof storage[setMethod] !== "function" ||
    typeof storage[removeMethod] !== "function"
  ) {
    throw new Error(
      `storage instance must expose methods: ${getMethod}, ${setMethod}, ${removeMethod}.`
    );
  }

  return {
    name,
    async getItem(key) {
      const value = await toPromise(storage[getMethod](key));
      if (value === undefined || value === null) {
        return null;
      }
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async setItem(key, value) {
      await toPromise(storage[setMethod](key, value));
    },
    async removeItem(key) {
      await toPromise(storage[removeMethod](key));
    },
  };
};

let registeredStorageAdapter = null;
let defaultStorageAdapter = null;

const registerStorageAdapter = (adapter) => {
  if (
    !adapter ||
    typeof adapter.getItem !== "function" ||
    typeof adapter.setItem !== "function" ||
    typeof adapter.removeItem !== "function"
  ) {
    throw new Error(
      "Storage adapter must provide getItem(key), setItem(key, value), removeItem(key)."
    );
  }
  registeredStorageAdapter = adapter;
};

const resetStorageAdapter = () => {
  registeredStorageAdapter = null;
};

const useIndexedStorage = (key, initialValue, options = {}) => {
  const isFunction = useCallback((value) => typeof value === "function", []);
  const resolveInitialValue = useCallback(
    (value) => (typeof value === "function" ? value() : value),
    []
  );
  const normalizeStorageKey = useCallback((storageKey) => {
    if (storageKey === null || storageKey === undefined || storageKey === "") {
      throw new Error("useIndexedStorage requires a non-empty key.");
    }
    return String(storageKey);
  }, []);
  const validateStorageAdapter = useCallback((adapter) => {
    if (
      !adapter ||
      typeof adapter.getItem !== "function" ||
      typeof adapter.setItem !== "function" ||
      typeof adapter.removeItem !== "function"
    ) {
      throw new Error(
        "Storage adapter must provide getItem(key), setItem(key, value), removeItem(key)."
      );
    }
    return adapter;
  }, []);
  const createDefaultStorageAdapter = useCallback(() => {
    const memoryAdapter = createMemoryStorageAdapter();
    const canUseIndexedDB =
      typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

    if (!canUseIndexedDB) {
      return memoryAdapter;
    }

    const indexedDBAdapter = createIndexedDBStorageAdapter();
    return {
      name: "indexeddb-with-memory-fallback",
      async getItem(storageKey) {
        try {
          return await indexedDBAdapter.getItem(storageKey);
        } catch (_error) {
          return memoryAdapter.getItem(storageKey);
        }
      },
      async setItem(storageKey, value) {
        try {
          await indexedDBAdapter.setItem(storageKey, value);
        } catch (_error) {
          await memoryAdapter.setItem(storageKey, value);
        }
      },
      async removeItem(storageKey) {
        try {
          await indexedDBAdapter.removeItem(storageKey);
        } catch (_error) {
          await memoryAdapter.removeItem(storageKey);
        }
      },
    };
  }, []);
  const getDefaultStorageAdapter = useCallback(() => {
    if (!defaultStorageAdapter) {
      defaultStorageAdapter = createDefaultStorageAdapter();
    }
    return defaultStorageAdapter;
  }, [createDefaultStorageAdapter]);
  const getStorageAdapter = useCallback(
    (adapterOverride) =>
      validateStorageAdapter(
        adapterOverride || registeredStorageAdapter || getDefaultStorageAdapter()
      ),
    [getDefaultStorageAdapter, validateStorageAdapter]
  );

  const {
    adapter: adapterOverride,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    onError = null,
    persistInitialValue = false,
  } = options;

  const reportError = useCallback(
    (error) => {
      if (isFunction(onError)) {
        onError(error);
      } else if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("useIndexedStorage error:", error);
      }
    },
    [isFunction, onError]
  );

  const resolveInitial = useCallback(() => {
    try {
      return resolveInitialValue(initialValue);
    } catch (error) {
      reportError(error);
      return undefined;
    }
  }, [initialValue, reportError, resolveInitialValue]);

  const adapterRef = useRef(null);
  if (!adapterRef.current) {
    try {
      adapterRef.current = getStorageAdapter(adapterOverride);
    } catch (_error) {
      adapterRef.current = getDefaultStorageAdapter();
    }
  }

  const [storedValue, setStoredValue] = useState(() => resolveInitial());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      adapterRef.current = getStorageAdapter(adapterOverride);
    } catch (adapterError) {
      setError(adapterError);
      reportError(adapterError);
      adapterRef.current = getDefaultStorageAdapter();
    }
  }, [
    adapterOverride,
    getDefaultStorageAdapter,
    getStorageAdapter,
    reportError,
  ]);

  useEffect(() => {
    let canceled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const storageKey = normalizeStorageKey(key);
        const rawValue = await adapterRef.current.getItem(storageKey);

        if (canceled) {
          return;
        }

        if (rawValue === null) {
          const fallback = resolveInitial();
          setStoredValue(fallback);
          if (persistInitialValue && fallback !== undefined) {
            await adapterRef.current.setItem(storageKey, serialize(fallback));
          }
        } else {
          setStoredValue(deserialize(rawValue));
        }
        setError(null);
      } catch (loadError) {
        if (canceled) {
          return;
        }
        setError(loadError);
        reportError(loadError);
        setStoredValue(resolveInitial());
      } finally {
        if (!canceled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      canceled = true;
    };
  }, [
    key,
    deserialize,
    normalizeStorageKey,
    persistInitialValue,
    reportError,
    resolveInitial,
    serialize,
  ]);

  const setValue = useCallback(
    (valueOrUpdater) => {
      setStoredValue((currentValue) => {
        const nextValue = isFunction(valueOrUpdater)
          ? valueOrUpdater(currentValue)
          : valueOrUpdater;

        Promise.resolve()
          .then(async () => {
            const storageKey = normalizeStorageKey(key);
            await adapterRef.current.setItem(storageKey, serialize(nextValue));
          })
          .then(() => setError(null))
          .catch((writeError) => {
            setError(writeError);
            reportError(writeError);
          });

        return nextValue;
      });
    },
    [isFunction, key, normalizeStorageKey, reportError, serialize]
  );

  const removeValue = useCallback(async () => {
    try {
      const storageKey = normalizeStorageKey(key);
      await adapterRef.current.removeItem(storageKey);
      setStoredValue(resolveInitial());
      setError(null);
    } catch (removeError) {
      setError(removeError);
      reportError(removeError);
    }
  }, [key, normalizeStorageKey, reportError, resolveInitial]);

  const reloadValue = useCallback(async () => {
    setIsLoading(true);
    try {
      const storageKey = normalizeStorageKey(key);
      const rawValue = await adapterRef.current.getItem(storageKey);
      if (rawValue === null) {
        const fallback = resolveInitial();
        setStoredValue(fallback);
      } else {
        setStoredValue(deserialize(rawValue));
      }
      setError(null);
    } catch (reloadError) {
      setError(reloadError);
      reportError(reloadError);
    } finally {
      setIsLoading(false);
    }
  }, [deserialize, key, normalizeStorageKey, reportError, resolveInitial]);

  return [storedValue, setValue, { removeValue, reloadValue, isLoading, error }];
};
/* { STORAGE HOOKs } --------------------------------------------------------------------------------------------- */

export {
  createMemoryStorageAdapter,
  createIndexedDBStorageAdapter,
  createStorageAdapterFromMethods,
  registerStorageAdapter,
  resetStorageAdapter,
  useIndexedStorage,
};
