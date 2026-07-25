const { CHANNELS } = require("../../shared/channels");

// window.settingsStorageAPI — Phase 1A surface + the Phase 2 structured
// stores: token_usage (append/query/clear), the toolkit preference stores
// (default_toolkits / toolkit_auto_approve) and the computer use preference
// KV store (read/set/clear), each with a per-store legacy migration.
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

  // ---- Phase 2: token_usage structured store -------------------------------

  const appendTokenUsage = (record) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND, {
      record,
    });

  const queryTokenUsage = (query) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY, { query });

  const clearTokenUsage = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR);

  const migrateLegacyTokenUsage = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      payload,
    );

  // ---- Phase 2: toolkit preference structured stores (plan §3.3) -----------

  const readDefaultToolkits = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL);

  const replaceDefaultToolkitsScope = (scopeKey, toolkitIds) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      { scopeKey, toolkitIds },
    );

  const migrateLegacyDefaultToolkits = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      payload,
    );

  const readToolkitAutoApprove = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL);

  const replaceToolkitAutoApprove = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      payload,
    );

  const migrateLegacyToolkitAutoApprove = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      payload,
    );

  // ---- Phase 2: computer use preference KV store (plan §3.4) ---------------

  const readComputerUsePreferences = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL);

  const setComputerUsePreference = (key, value) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY, {
      key,
      value,
    });

  const clearComputerUsePreference = (key) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY, {
      key,
    });

  const migrateLegacyComputerUse = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      payload,
    );

  return {
    bootstrap,
    migrateLegacy,
    setNamespace,
    deleteNamespace,
    appendTokenUsage,
    queryTokenUsage,
    clearTokenUsage,
    migrateLegacyTokenUsage,
    readDefaultToolkits,
    replaceDefaultToolkitsScope,
    migrateLegacyDefaultToolkits,
    readToolkitAutoApprove,
    replaceToolkitAutoApprove,
    migrateLegacyToolkitAutoApprove,
    readComputerUsePreferences,
    setComputerUsePreference,
    clearComputerUsePreference,
    migrateLegacyComputerUse,
  };
};

module.exports = { createSettingsStorageBridge };
