// Renderer-side thin wrapper around window.contextV2API (the Memory / Context
// V2 P0 preload bridge). React code must reach Context V2 ONLY through this
// module — never window.contextV2API directly, and never ipcRenderer — so the
// consumed surface stays auditable in one place.
//
// This file is intentionally dumb: availability detection, promise shaping and
// error-code parsing. It performs NO validation of its own (main is the single
// validating boundary — a second, drifting copy of the rules here would be
// worse than none), holds NO state, and touches NO localStorage.
//
// What is NOT here, and must never be added:
//   * any method the preload bridge does not expose,
//   * a promotion targetNamespace (server-bound),
//   * job claim / heartbeat / complete / fail (worker lease protocol),
//   * candidate-review PROPOSE (a curator-job product — the renderer may read
//     and decide a review, never manufacture one),
//   * anything that takes a path, url, port or auth token,
//   * CHAT DELETION. The renderer has no way to delete Context V2 state. It
//     deletes a chat through the chat store, and the main-process deletion
//     outbox durably completes the Context V2 + Vault cleanup on its own. A
//     deleteChat here would be a renderer-driven partial delete.
//
// Detection mirrors memory_vault_bridge.js / settings_storage_bridge.js: probe
// the window global at call time, never cache module-level state, so tests can
// install and remove mocks freely.
//
// Error-code transport contract matches the rest of the main-process bridges:
// rejections carry their stable code as a "[<code>] " token in the message
// (Electron strips error.code across ipcMain.handle); parseContextV2ErrorCode()
// recovers it on this side.

const REQUIRED_METHODS = Object.freeze([
  "getStatus",
  "listEvents",
  "readContent",
  "getSessionHead",
  "rebaseSession",
  "listSpaces",
  "getTree",
  "listEntries",
  "search",
  "listCandidates",
  "listJobs",
  "listPromotions",
  "decideCandidate",
  "createPromotion",
  "decidePromotion",
  "listCandidateReviews",
  "getCandidateReview",
  "decideCandidateReview",
]);

// Accept only the two real carrier shapes: main's raw `[code] message`, or
// Electron's exact invoke wrapper for this channel. Anchoring the whole prefix
// prevents a later bracketed substring in arbitrary error text from being
// promoted into a control-flow code while still handling production IPC
// rejections. The code alphabet and 64-character ceiling mirror the producer.
const ERROR_CODE_TOKEN_PATTERN =
  /^(?:Error invoking remote method 'context-v2:rebase-session': (?:Error: )?)?\[([a-z0-9_]{1,64})\]\s/;

const resolveApi = () => {
  if (typeof window === "undefined") return null;
  const api = window.contextV2API;
  if (!api || typeof api !== "object") return null;
  for (const method of REQUIRED_METHODS) {
    if (typeof api[method] !== "function") return null;
  }
  return api;
};

const unavailableError = (operation) => {
  const error = new Error(
    `[context_v2_unavailable] context v2 bridge is unavailable (${operation})`,
  );
  error.code = "context_v2_unavailable";
  return error;
};

export const parseContextV2ErrorCode = (error) => {
  const message =
    error && typeof error.message === "string" ? error.message : "";
  const match = ERROR_CODE_TOKEN_PATTERN.exec(message);
  return match ? match[1] : null;
};

export const isContextV2BridgeAvailable = () => resolveApi() !== null;

const invokeBridge = (operation, args) => {
  const api = resolveApi();
  if (!api) return Promise.reject(unavailableError(operation));
  try {
    return Promise.resolve(api[operation](...args));
  } catch (error) {
    return Promise.reject(error);
  }
};

export const contextV2Bridge = {
  isAvailable: isContextV2BridgeAvailable,

  // All calls are promises and intentionally do NOT swallow errors — callers
  // need the coded rejection (e.g. context_v2_operation_conflict must roll
  // back optimistic UI rather than be silently treated as success).
  getStatus: () => invokeBridge("getStatus", []),
  listEvents: (payload) => invokeBridge("listEvents", [payload]),
  readContent: (payload) => invokeBridge("readContent", [payload]),
  getSessionHead: (payload) => invokeBridge("getSessionHead", [payload]),
  rebaseSession: (payload) => invokeBridge("rebaseSession", [payload]),
  listSpaces: (payload) => invokeBridge("listSpaces", [payload]),
  getTree: (payload) => invokeBridge("getTree", [payload]),
  listEntries: (payload) => invokeBridge("listEntries", [payload]),
  search: (payload) => invokeBridge("search", [payload]),
  listCandidates: (payload) => invokeBridge("listCandidates", [payload]),
  listJobs: (payload) => invokeBridge("listJobs", [payload]),
  listPromotions: (payload) => invokeBridge("listPromotions", [payload]),
  decideCandidate: (payload) => invokeBridge("decideCandidate", [payload]),
  createPromotion: (payload) => invokeBridge("createPromotion", [payload]),
  decidePromotion: (payload) => invokeBridge("decidePromotion", [payload]),
  listCandidateReviews: (payload) =>
    invokeBridge("listCandidateReviews", [payload]),
  getCandidateReview: (payload) => invokeBridge("getCandidateReview", [payload]),
  decideCandidateReview: (payload) =>
    invokeBridge("decideCandidateReview", [payload]),
};

export default contextV2Bridge;
