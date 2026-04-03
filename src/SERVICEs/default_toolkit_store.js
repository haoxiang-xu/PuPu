const STORAGE_KEY = "default_toolkits";
const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 2;
const GLOBAL_SCOPE = "global";
const DEFAULT_GLOBAL_TOOLKITS = Object.freeze(["code_toolkit"]);

const TOOLKIT_ID_ALIASES = Object.freeze({
  workspace: "workspace_toolkit",
  workspace_toolkit: "workspace_toolkit",
  access_workspace_toolkit: "workspace_toolkit",
  workspacetoolkit: "workspace_toolkit",
  WorkspaceToolkit: "workspace_toolkit",
  terminal: "terminal_toolkit",
  terminal_toolkit: "terminal_toolkit",
  run_terminal_toolkit: "terminal_toolkit",
  terminaltoolkit: "terminal_toolkit",
  TerminalToolkit: "terminal_toolkit",
  code: "code_toolkit",
  code_toolkit: "code_toolkit",
  codetoolkit: "code_toolkit",
  CodeToolkit: "code_toolkit",
  external_api: "external_api_toolkit",
  external_api_toolkit: "external_api_toolkit",
  externalapitoolkit: "external_api_toolkit",
  ExternalAPIToolkit: "external_api_toolkit",
  ask_user: "ask-user-toolkit",
  ask_user_toolkit: "ask-user-toolkit",
  "ask-user-toolkit": "ask-user-toolkit",
  interaction_toolkit: "ask-user-toolkit",
  "interaction-toolkit": "ask-user-toolkit",
  askusertoolkit: "ask-user-toolkit",
  AskUserToolkit: "ask-user-toolkit",
});

const normalizeToolkitId = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return "";
  return TOOLKIT_ID_ALIASES[trimmed] || TOOLKIT_ID_ALIASES[trimmed.toLowerCase()] || trimmed;
};

const sanitizeIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    const normalized = normalizeToolkitId(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_IDS) break;
  }
  return result;
};

const sanitizeScopes = (scopes) => {
  if (!scopes || typeof scopes !== "object") {
    return {};
  }
  const normalized = {};
  for (const [scopeKey, ids] of Object.entries(scopes)) {
    if (typeof scopeKey !== "string" || !scopeKey.trim()) continue;
    normalized[scopeKey] = sanitizeIds(ids);
  }
  return normalized;
};

const createDefaultStore = () => ({
  version: SCHEMA_VERSION,
  scopes: { [GLOBAL_SCOPE]: [...DEFAULT_GLOBAL_TOOLKITS] },
});

const writeStore = (store) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    // quota exceeded — silent
  }
};

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return createDefaultStore();
  }

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && typeof raw === "object" && typeof raw.scopes === "object") {
      const store = {
        version: SCHEMA_VERSION,
        scopes: sanitizeScopes(raw.scopes),
      };
      const hasGlobalScope = Object.prototype.hasOwnProperty.call(
        store.scopes,
        GLOBAL_SCOPE,
      );
      if (!hasGlobalScope) {
        store.scopes[GLOBAL_SCOPE] = [...DEFAULT_GLOBAL_TOOLKITS];
      }
      if (raw.version !== SCHEMA_VERSION || !hasGlobalScope) {
        writeStore(store);
      }
      return store;
    }
  } catch (_) {
    // corrupted — reset
  }

  const initialStore = createDefaultStore();
  writeStore(initialStore);
  return initialStore;
};

export const getDefaultToolkitSelection = (scopeKey = GLOBAL_SCOPE) => {
  const store = readStore();
  return sanitizeIds(store.scopes[scopeKey]);
};

export const setDefaultToolkitEnabled = (
  scopeKey = GLOBAL_SCOPE,
  toolkitId,
  enabled,
) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  if (!normalizedToolkitId) {
    return current;
  }

  let next;
  if (enabled) {
    next = current.includes(normalizedToolkitId)
      ? current
      : [...current, normalizedToolkitId];
  } else {
    next = current.filter((id) => id !== normalizedToolkitId);
  }

  store.scopes[scopeKey] = sanitizeIds(next);
  writeStore(store);
  return store.scopes[scopeKey];
};

export const removeInvalidToolkitIds = (scopeKey = GLOBAL_SCOPE, validIds) => {
  const validSet = new Set(sanitizeIds(validIds));
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  const pruned = current.filter((id) => validSet.has(id));
  store.scopes[scopeKey] = pruned;
  writeStore(store);
  return pruned;
};
