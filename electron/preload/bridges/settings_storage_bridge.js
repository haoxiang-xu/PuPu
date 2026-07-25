const { CHANNELS } = require("../../shared/channels");

// window.settingsStorageAPI — Phase 1A surface only.
// bootstrap() is the single synchronous call (module-init snapshot); all
// mutations are invoke-based promises so callers see explicit acks/errors.
const createSettingsStorageBridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createSettingsStorageBridge: ipcRenderer is required");
  }

  const unavailable = (reason) => ({
    available: false,
    degraded: true,
    reason,
  });

  const bootstrap = () => {
    try {
      const value = ipcRenderer.sendSync(
        CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
      );
      return value == null ? unavailable("bootstrap-empty") : value;
    } catch (error) {
      console.error("[settings-storage] bootstrap IPC failed:", error);
      return unavailable("bootstrap-ipc-failed");
    }
  };

  // Mutations intentionally do NOT swallow errors — persistence failures must
  // surface to the renderer repository (plan §7.1: no silent fake success).
  const migrateLegacy = (payload) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY, payload);

  const setNamespace = (namespace, value, options) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE, {
      namespace,
      value,
      options,
    });

  const deleteNamespace = (namespace) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE, {
      namespace,
    });

  return { bootstrap, migrateLegacy, setNamespace, deleteNamespace };
};

module.exports = { createSettingsStorageBridge };
