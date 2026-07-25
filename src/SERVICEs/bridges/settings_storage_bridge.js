// Renderer-side thin wrapper around window.settingsStorageAPI (the Phase 1A
// preload bridge for SQLite-backed app settings).
//
// Detection mirrors src/SERVICEs/chat_storage/chat_storage_backend.js: probe
// the window global at call time, never cache module-level state, so tests can
// install/remove mocks freely. All mode decisions (SQL vs localStorage) live
// in settings_repository.js — this file only answers "is the bridge here?"
// and forwards calls.
//
// Error-code transport contract (plan §11.1): main-process rejections carry
// their code as a stable "[<code>] " message prefix because Electron strips
// error.code across ipcMain.handle. parseSettingsStorageErrorCode() recovers
// it on this side.

const REQUIRED_METHODS = Object.freeze([
  "bootstrap",
  "migrateLegacy",
  "setNamespace",
  "deleteNamespace",
]);

const ERROR_CODE_PREFIX_PATTERN = /^\[([a-z0-9_]+)\]\s/;

const resolveApi = () => {
  if (typeof window === "undefined") return null;
  const api = window.settingsStorageAPI;
  if (!api || typeof api !== "object") return null;
  for (const method of REQUIRED_METHODS) {
    if (typeof api[method] !== "function") return null;
  }
  return api;
};

const unavailableSnapshot = (reason) => ({
  available: false,
  degraded: true,
  reason,
});

const unavailableError = (operation) => {
  const error = new Error(
    `[settings_storage_unavailable] settings storage bridge is unavailable (${operation})`,
  );
  error.code = "settings_storage_unavailable";
  return error;
};

export const parseSettingsStorageErrorCode = (error) => {
  const message =
    error && typeof error.message === "string" ? error.message : "";
  const match = ERROR_CODE_PREFIX_PATTERN.exec(message);
  return match ? match[1] : null;
};

export const isSettingsStorageBridgeAvailable = () => resolveApi() !== null;

const invokeBridge = (operation, args) => {
  const api = resolveApi();
  if (!api) return Promise.reject(unavailableError(operation));
  try {
    return Promise.resolve(api[operation](...args));
  } catch (error) {
    return Promise.reject(error);
  }
};

export const settingsStorageBridge = {
  isAvailable: isSettingsStorageBridgeAvailable,

  // Synchronous bootstrap snapshot (sendSync under the hood). Never throws:
  // a missing bridge or a throwing preload both come back as an unavailable
  // snapshot so the repository can fall back to localStorage.
  bootstrap: () => {
    const api = resolveApi();
    if (!api) return unavailableSnapshot("bridge-missing");
    try {
      const snapshot = api.bootstrap();
      return snapshot == null
        ? unavailableSnapshot("bootstrap-empty")
        : snapshot;
    } catch (_error) {
      return unavailableSnapshot("bootstrap-failed");
    }
  },

  // Mutations are promises and intentionally do NOT swallow errors — the
  // repository needs real failures to roll back optimistic updates
  // (plan §7.1: persistence failures must never fake success).
  migrateLegacy: (payload) => invokeBridge("migrateLegacy", [payload]),
  setNamespace: (namespace, value, options) =>
    invokeBridge("setNamespace", [namespace, value, options]),
  deleteNamespace: (namespace) => invokeBridge("deleteNamespace", [namespace]),
};

export default settingsStorageBridge;
