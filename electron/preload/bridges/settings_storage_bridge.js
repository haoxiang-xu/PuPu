const { CHANNELS } = require("../../shared/channels");

// window.settingsStorageAPI — Phase 1A surface + the Phase 2 structured
// stores: token_usage (append/query/clear), the toolkit preference stores
// (default_toolkits / toolkit_auto_approve) and the computer use preference
// KV store (read/set/clear) — plus the Phase 3 custom MCP icon asset store
// (get/set/delete/list-owners) — each with a per-store legacy migration.
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

  // ---- Phase 3: custom MCP icon asset store (plan §3.6) --------------------

  const getMcpIconAsset = (toolkitId) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET, { toolkitId });

  const setMcpIconAsset = (toolkitId, icon) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET, {
      toolkitId,
      icon,
    });

  const deleteMcpIconAsset = (toolkitId) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE, {
      toolkitId,
    });

  const listMcpIconOwners = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS);

  const migrateMcpIconsLegacy = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      payload,
    );

  // ---- Phase 4 (S7): provider secret migration trigger --------------------
  // Write-direction only: forwards the renderer's legacy provider secrets to
  // main for encryption into provider_credentials. The resolved value is a
  // status object (never a secret); no read-direction secret channel exists.
  const migrateProviderCredentials = (payload) =>
    ipcRenderer.invoke(
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
      payload,
    );

  // Steady-state write/delete surface. SET is the only additional method that
  // carries plaintext and only in the renderer→main direction. Both resolve
  // to identity/status metadata; there is deliberately no credential reader.
  const setProviderCredential = (kind, ownerId, plaintext) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.SET_PROVIDER_CREDENTIAL, {
      kind,
      ownerId,
      plaintext,
    });

  const deleteProviderCredential = (kind, ownerId) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.DELETE_PROVIDER_CREDENTIAL, {
      kind,
      ownerId,
    });

  // ---- Phase 5: reset settings + read-only db stats (plan §6-Phase5) -------
  // resetSettings clears the non-sensitive settings/preference tables in one
  // SQL transaction (secrets, token history and MCP icons are kept); getDbStats
  // returns settings.db metadata only. Both resolve to plain status objects and
  // never carry a stored value or a secret.
  const resetSettings = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.RESET_SETTINGS);

  const getDbStats = () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_STORAGE.DB_STATS);

  // ---- Quit durability control plane --------------------------------------
  // Lifecycle messages deliberately never carry a settings value. The preload
  // also rebuilds the renderer's acknowledgement from an allowlist so extra
  // fields (including an accidentally supplied secret/value) cannot cross the
  // renderer → main trust boundary.
  const subscribeToQuitEvent = (channel, listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  };

  const onQuitDrainRequest = (listener) =>
    subscribeToQuitEvent(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_REQUEST,
      listener,
    );

  const onQuitDrainAbort = (listener) =>
    subscribeToQuitEvent(CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT, listener);

  const sendQuitDrainResult = (result = {}) => {
    const requestId =
      typeof result.requestId === "string" ? result.requestId : "";
    const ok = result.ok === true;
    const payload = { requestId, ok };
    if (!ok) {
      payload.errorCode =
        typeof result.errorCode === "string" &&
        /^[a-z0-9_]{1,80}$/.test(result.errorCode)
          ? result.errorCode
          : "settings_quit_drain_failed";
    }
    ipcRenderer.send(CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT, payload);
  };

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
    getMcpIconAsset,
    setMcpIconAsset,
    deleteMcpIconAsset,
    listMcpIconOwners,
    migrateMcpIconsLegacy,
    migrateProviderCredentials,
    setProviderCredential,
    deleteProviderCredential,
    resetSettings,
    getDbStats,
    onQuitDrainRequest,
    onQuitDrainAbort,
    sendQuitDrainResult,
  };
};

module.exports = { createSettingsStorageBridge };
