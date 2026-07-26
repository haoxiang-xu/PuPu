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

// Phase 2 token_usage surface. Probed separately from REQUIRED_METHODS so a
// preload built before Phase 2 still yields a fully available Phase 1B bridge
// — only the token_usage store then falls back to localStorage.
const TOKEN_USAGE_METHODS = Object.freeze([
  "appendTokenUsage",
  "queryTokenUsage",
  "clearTokenUsage",
  "migrateLegacyTokenUsage",
]);

// Phase 2 toolkit preference surface (default_toolkits + toolkit_auto_approve
// ship in the same preload build, so one probe covers both stores). Probed
// separately from REQUIRED_METHODS for the same old-preload reason.
const TOOLKIT_PREFS_METHODS = Object.freeze([
  "readDefaultToolkits",
  "replaceDefaultToolkitsScope",
  "migrateLegacyDefaultToolkits",
  "readToolkitAutoApprove",
  "replaceToolkitAutoApprove",
  "migrateLegacyToolkitAutoApprove",
]);

// Phase 2 computer use preference surface (plan §3.4). Probed separately from
// REQUIRED_METHODS for the same old-preload reason: a pre-S3 preload keeps
// every other store fully available while the computer use stores fall back
// to localStorage (whose fail-closed reads hold).
const COMPUTER_USE_PREFS_METHODS = Object.freeze([
  "readComputerUsePreferences",
  "setComputerUsePreference",
  "clearComputerUsePreference",
  "migrateLegacyComputerUse",
]);

// Phase 3 custom MCP icon asset surface (plan §3.6). Probed separately from
// REQUIRED_METHODS for the same old-preload reason: a pre-Phase-3 preload keeps
// every other store fully available while the icon store falls back to
// localStorage (the exact legacy base64 behavior).
const MCP_ICON_METHODS = Object.freeze([
  "getMcpIconAsset",
  "setMcpIconAsset",
  "deleteMcpIconAsset",
  "listMcpIconOwners",
  "migrateMcpIconsLegacy",
]);

// Phase 4 (S7) provider secret migration trigger. Probed separately from
// REQUIRED_METHODS for the same old-preload reason: a pre-Phase-4 preload keeps
// every other store fully available while the provider secret migration simply
// never fires (the renderer stays on the legacy localStorage secret path).
const PROVIDER_CREDENTIALS_MIGRATION_METHODS = Object.freeze([
  "migrateProviderCredentials",
]);

// Matches the FIRST "[<code>] " token ANYWHERE in the message — deliberately
// not anchored to the start: by the time an ipcRenderer.invoke rejection
// reaches the renderer, Electron has wrapped it as
//   "Error invoking remote method '<channel>': [<code>] <message>"
// so a ^-anchored pattern never matches in production. The capture charset is
// locked to the service code table's alphabet ([a-z0-9_]) so bracketed user
// content (spaces, uppercase, hyphens, …) cannot false-match, and the code
// always precedes any message content because the main process builds every
// error message as `[${code}] ${message}` (service.js errorWithCode).
const ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/;

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
  const match = ERROR_CODE_TOKEN_PATTERN.exec(message);
  return match ? match[1] : null;
};

// ---- session-shared bootstrap snapshot ------------------------------------
// The Phase 2 structured stores (default_toolkits, toolkit_auto_approve,
// computer use, token_usage migration meta) each need the bootstrap snapshot
// during their lazy init. bootstrap() is a blocking sendSync, so the stores
// share ONE result per session instead of each paying a synchronous IPC
// round-trip on their hot-path first use. The cache deliberately lives here
// (settings_repository keeps its own snapshot and is not touched) and is
// forgotten by every store's test-reset helper.

let sessionBootstrapSnapshot;

export const getSessionBootstrapSnapshot = () => {
  if (sessionBootstrapSnapshot === undefined) {
    sessionBootstrapSnapshot = settingsStorageBridge.bootstrap();
  }
  return sessionBootstrapSnapshot;
};

/** Test-only: forget the session-cached bootstrap snapshot. */
export const resetSessionBootstrapSnapshotForTests = () => {
  sessionBootstrapSnapshot = undefined;
};

/**
 * Per-store SQL migration meta from the shared snapshot. storeKey is one of
 * "tokenUsage" | "defaultToolkits" | "toolkitAutoApprove" | "computerUse".
 * Returns null when the snapshot is unavailable or predates storeMigrations
 * (older main process) — callers then fall back to marker-only behavior.
 * When a meta IS returned, its state is the authority over the renderer's
 * localStorage migration marker (a marker can outlive a reset settings.db).
 */
export const getSqlStoreMigrationMeta = (storeKey) => {
  const snapshot = getSessionBootstrapSnapshot();
  if (!snapshot || snapshot.available !== true) return null;
  const metas = snapshot.storeMigrations;
  if (!metas || typeof metas !== "object" || Array.isArray(metas)) return null;
  const meta = metas[storeKey];
  return meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    typeof meta.state === "string"
    ? meta
    : null;
};

// ---- Phase 4 (S3): non-sensitive provider secret existence signals --------
// Both ride the SAME session bootstrap snapshot as the Phase 2 migration meta
// (one sendSync per session). They are the renderer's ONLY secret-adjacent
// bootstrap reads and they never carry a secret value or ciphertext — only the
// identity list and the safeStorage availability string (gate 7 red line #2).
//
// Reading from the session-cached snapshot (not a live re-bootstrap) gives the
// intended steady-state semantics from the descriptor contract §3.5: newly
// migrated credentials only become "configured" on the NEXT boot, so the
// descriptor-only injection path activates after a restart, never mid-session.

// The configured-credential identity list ("openai" | "anthropic" |
// "custom.<slug>"). Returns [] when the snapshot is unavailable or predates
// the field (older main process) — the renderer then relies purely on the
// legacy dual-keep signal, never wrongly treating a provider as unconfigured.
export const getBootstrapConfiguredCredentials = () => {
  const snapshot = getSessionBootstrapSnapshot();
  if (!snapshot || snapshot.available !== true) return [];
  const list = snapshot.configuredCredentials;
  if (!Array.isArray(list)) return [];
  return list.filter((id) => typeof id === "string" && id.length > 0);
};

// safeStorage availability from S1's gate-3 probe. Anything other than the
// exact "available" string (missing field, "unavailable", malformed) is read
// as unavailable — fail-closed, so a malformed snapshot can never authorize
// the descriptor-only injection path.
export const getBootstrapSecretStorageStatus = () => {
  const snapshot = getSessionBootstrapSnapshot();
  if (!snapshot || snapshot.available !== true) return "unavailable";
  return snapshot.secretStorageStatus === "available"
    ? "available"
    : "unavailable";
};

export const isSettingsStorageBridgeAvailable = () => resolveApi() !== null;

export const isTokenUsageBridgeAvailable = () => {
  const api = resolveApi();
  if (!api) return false;
  for (const method of TOKEN_USAGE_METHODS) {
    if (typeof api[method] !== "function") return false;
  }
  return true;
};

export const isToolkitPrefsBridgeAvailable = () => {
  const api = resolveApi();
  if (!api) return false;
  for (const method of TOOLKIT_PREFS_METHODS) {
    if (typeof api[method] !== "function") return false;
  }
  return true;
};

export const isComputerUsePrefsBridgeAvailable = () => {
  const api = resolveApi();
  if (!api) return false;
  for (const method of COMPUTER_USE_PREFS_METHODS) {
    if (typeof api[method] !== "function") return false;
  }
  return true;
};

export const isMcpIconBridgeAvailable = () => {
  const api = resolveApi();
  if (!api) return false;
  for (const method of MCP_ICON_METHODS) {
    if (typeof api[method] !== "function") return false;
  }
  return true;
};

export const isProviderCredentialsMigrationBridgeAvailable = () => {
  const api = resolveApi();
  if (!api) return false;
  for (const method of PROVIDER_CREDENTIALS_MIGRATION_METHODS) {
    if (typeof api[method] !== "function") return false;
  }
  return true;
};

const invokeBridge = (operation, args) => {
  const api = resolveApi();
  if (!api) return Promise.reject(unavailableError(operation));
  try {
    return Promise.resolve(api[operation](...args));
  } catch (error) {
    return Promise.reject(error);
  }
};

const invokeOptionalBridge = (operation, args) => {
  const api = resolveApi();
  if (!api || typeof api[operation] !== "function") {
    return Promise.reject(unavailableError(operation));
  }
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

  // Phase 2 token_usage structured store. Same no-swallowing rule; the
  // token_usage storage module decides what a failure means (fire-and-forget
  // append logs it, migration degrades the store for the session).
  isTokenUsageAvailable: isTokenUsageBridgeAvailable,
  appendTokenUsage: (record) =>
    invokeOptionalBridge("appendTokenUsage", [record]),
  queryTokenUsage: (query) =>
    invokeOptionalBridge("queryTokenUsage", [query]),
  clearTokenUsage: () => invokeOptionalBridge("clearTokenUsage", []),
  migrateLegacyTokenUsage: (payload) =>
    invokeOptionalBridge("migrateLegacyTokenUsage", [payload]),

  // Phase 2 toolkit preference stores (plan §3.3). Same no-swallowing rule;
  // the store modules decide what a failure means (writes log the code,
  // migrations degrade the store to localStorage for the session).
  isToolkitPrefsAvailable: isToolkitPrefsBridgeAvailable,
  readDefaultToolkits: () =>
    invokeOptionalBridge("readDefaultToolkits", []),
  replaceDefaultToolkitsScope: (scopeKey, toolkitIds) =>
    invokeOptionalBridge("replaceDefaultToolkitsScope", [
      scopeKey,
      toolkitIds,
    ]),
  migrateLegacyDefaultToolkits: (payload) =>
    invokeOptionalBridge("migrateLegacyDefaultToolkits", [payload]),
  readToolkitAutoApprove: () =>
    invokeOptionalBridge("readToolkitAutoApprove", []),
  replaceToolkitAutoApprove: (payload) =>
    invokeOptionalBridge("replaceToolkitAutoApprove", [payload]),
  migrateLegacyToolkitAutoApprove: (payload) =>
    invokeOptionalBridge("migrateLegacyToolkitAutoApprove", [payload]),

  // Phase 2 computer use preference store (plan §3.4). Same no-swallowing
  // rule; the store modules decide what a failure means (writes log the code,
  // a failed migration degrades to localStorage which stays fail-closed).
  isComputerUsePrefsAvailable: isComputerUsePrefsBridgeAvailable,
  readComputerUsePreferences: () =>
    invokeOptionalBridge("readComputerUsePreferences", []),
  setComputerUsePreference: (key, value) =>
    invokeOptionalBridge("setComputerUsePreference", [key, value]),
  clearComputerUsePreference: (key) =>
    invokeOptionalBridge("clearComputerUsePreference", [key]),
  migrateLegacyComputerUse: (payload) =>
    invokeOptionalBridge("migrateLegacyComputerUse", [payload]),

  // Phase 3 custom MCP icon asset store (plan §3.6). Same no-swallowing rule;
  // the icon store decides what a failure means (a failed hydrate/write logs
  // the code, a failed migration degrades the store to localStorage).
  isMcpIconAvailable: isMcpIconBridgeAvailable,
  getMcpIconAsset: (toolkitId) =>
    invokeOptionalBridge("getMcpIconAsset", [toolkitId]),
  setMcpIconAsset: (toolkitId, icon) =>
    invokeOptionalBridge("setMcpIconAsset", [toolkitId, icon]),
  deleteMcpIconAsset: (toolkitId) =>
    invokeOptionalBridge("deleteMcpIconAsset", [toolkitId]),
  listMcpIconOwners: () => invokeOptionalBridge("listMcpIconOwners", []),
  migrateMcpIconsLegacy: (payload) =>
    invokeOptionalBridge("migrateMcpIconsLegacy", [payload]),

  // Phase 4 (S7) provider secret migration trigger. Write-direction only: the
  // payload carries the renderer's legacy secrets for encryption; the resolved
  // value is a status object (never a secret). Same no-swallowing rule — the
  // migration module fires it and-forgets, logging the code on failure.
  isProviderCredentialsMigrationAvailable:
    isProviderCredentialsMigrationBridgeAvailable,
  migrateProviderCredentials: (payload) =>
    invokeOptionalBridge("migrateProviderCredentials", [payload]),
};

export default settingsStorageBridge;
