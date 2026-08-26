// Renderer-side thin wrapper around window.memoryVaultAPI (the Memory V2 P0
// vault control plane preload bridge). React code must call the vault ONLY
// through this module — never window.memoryVaultAPI directly — so the surface
// stays auditable in one place.
//
// The vault surface is deliberately write/control-only: deposit /
// listDescriptors / deleteSecret / grant / revoke / getStatus. There is NO
// read/resolve/decrypt method anywhere in the chain (security sign-off
// condition) — a deposited secret can never come back to the renderer.
//
// Call-shape contract (enforced in main, mirrored here for callers):
//   listDescriptors({ scopeKind, scopeId })  — BOTH required; there is no
//     unscoped listing, so the renderer can never enumerate the whole vault.
//   grant({ operationId, scopeKind, scopeId, handle, sinkKind }) — the handle
//     must belong to that exact scope and sinkKind must be one of
//     MEMORY_VAULT_SINK_KINDS below.
//   getStatus() — availability only; it reports NO row counts by design.
//
// Detection mirrors settings_storage_bridge.js: probe the window global at
// call time, never cache module-level state, so tests can install/remove
// mocks freely.
//
// Error-code transport contract matches settings storage: main-process
// rejections carry their stable code as a "[<code>] " token in the message
// (Electron strips error.code across ipcMain.handle);
// parseMemoryVaultErrorCode() recovers it on this side.

// The controlled sink kinds a grant may target. MUST stay in sync with
// SINK_KINDS in electron/main/services/memory_vault/service.js (main is the
// authority and re-validates every value — this copy exists so renderer code
// never hand-writes a sink string). Adding a member is a security-review
// event, not a routine edit.
export const MEMORY_VAULT_SINK_KINDS = Object.freeze([
  "computer_input",
  "shell_secret_env",
  "shell_secret_stdin",
  "mcp_schema_secret",
]);

// The only two scopes renderer UI may offer, and the ONE place the UI-facing
// choice is mapped to the wire ({scopeKind, scopeId}) pair. Every caller must
// go through resolveMemoryVaultScope() rather than hand-building the pair, so
// "which scope did this secret land in" has a single auditable answer.
//
//   "chat" -> scoped to one conversation (scopeId = that chat's id)
//   "user" -> scoped to this installation's user (a FIXED scopeId, never a
//             per-chat or user-supplied value)
//
// USER_SCOPE_ID must satisfy main's SCOPE_ID_PATTERN ([A-Za-z0-9_.:-], 1-128).
export const MEMORY_VAULT_SCOPE_CHOICES = Object.freeze(["chat", "user"]);
export const MEMORY_VAULT_USER_SCOPE_ID = "pupu.user";

export const resolveMemoryVaultScope = (scopeChoice, chatId) => {
  if (scopeChoice === "user") {
    return { scopeKind: "user", scopeId: MEMORY_VAULT_USER_SCOPE_ID };
  }
  if (scopeChoice !== "chat") return null;
  const normalizedChatId = typeof chatId === "string" ? chatId.trim() : "";
  if (!normalizedChatId) return null;
  return { scopeKind: "chat", scopeId: normalizedChatId };
};

const REQUIRED_METHODS = Object.freeze([
  "deposit",
  "listDescriptors",
  "delete",
  "grant",
  "revoke",
  "getStatus",
]);

// Same charset lock as the settings-side parser: codes are [a-z0-9_] only, so
// bracketed user content can never false-match, and the code always precedes
// message content because main builds every error as `[${code}] ${message}`.
const ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/;

const resolveApi = () => {
  if (typeof window === "undefined") return null;
  const api = window.memoryVaultAPI;
  if (!api || typeof api !== "object") return null;
  for (const method of REQUIRED_METHODS) {
    if (typeof api[method] !== "function") return null;
  }
  return api;
};

const unavailableError = (operation) => {
  const error = new Error(
    `[memory_vault_unavailable] memory vault bridge is unavailable (${operation})`,
  );
  error.code = "memory_vault_unavailable";
  return error;
};

export const parseMemoryVaultErrorCode = (error) => {
  const message =
    error && typeof error.message === "string" ? error.message : "";
  const match = ERROR_CODE_TOKEN_PATTERN.exec(message);
  return match ? match[1] : null;
};

export const isMemoryVaultBridgeAvailable = () => resolveApi() !== null;

const invokeBridge = (operation, args) => {
  const api = resolveApi();
  if (!api) return Promise.reject(unavailableError(operation));
  try {
    return Promise.resolve(api[operation](...args));
  } catch (error) {
    return Promise.reject(error);
  }
};

export const memoryVaultBridge = {
  isAvailable: isMemoryVaultBridgeAvailable,

  // All calls are promises and intentionally do NOT swallow errors — callers
  // need the coded rejection (fail closed on secret_storage_unavailable, roll
  // back optimistic UI on any write failure).
  deposit: (payload) => invokeBridge("deposit", [payload]),
  listDescriptors: (filter) => invokeBridge("listDescriptors", [filter]),
  deleteSecret: (payload) => invokeBridge("delete", [payload]),
  grant: (payload) => invokeBridge("grant", [payload]),
  revoke: (payload) => invokeBridge("revoke", [payload]),
  getStatus: () => invokeBridge("getStatus", []),
};

export default memoryVaultBridge;
