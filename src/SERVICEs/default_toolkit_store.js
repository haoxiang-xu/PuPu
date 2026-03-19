const STORAGE_KEY = "default_toolkits";
const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 1;
const TOOLKIT_ID_ALIASES = Object.freeze({
  interaction_toolkit: "ask_user_toolkit",
  interactiontoolkit: "ask_user_toolkit",
  askusertoolkit: "ask_user_toolkit",
});

export const normalizeToolkitSelectionId = (toolkitId) => {
  if (typeof toolkitId !== "string") {
    return "";
  }
  const trimmed = toolkitId.trim();
  if (!trimmed) {
    return "";
  }
  const lookupKey = trimmed.replace(/-/g, "_").toLowerCase();
  return TOOLKIT_ID_ALIASES[lookupKey] || trimmed;
};

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return { version: SCHEMA_VERSION, scopes: {} };
  }
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (
      raw &&
      typeof raw === "object" &&
      raw.version === SCHEMA_VERSION &&
      typeof raw.scopes === "object"
    ) {
      return raw;
    }
  } catch (_) {
    // corrupted — reset
  }
  return { version: SCHEMA_VERSION, scopes: {} };
};

const writeStore = (store) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    // quota exceeded — silent
  }
};

const sanitizeIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    const trimmed = normalizeToolkitSelectionId(id);
    if (!trimmed || trimmed.length > MAX_ID_LENGTH) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_IDS) break;
  }
  return result;
};

export const getDefaultToolkitSelection = (scopeKey = "global") => {
  const store = readStore();
  const ids = store.scopes[scopeKey];
  return sanitizeIds(ids);
};

export const setDefaultToolkitEnabled = (
  scopeKey = "global",
  toolkitId,
  enabled,
) => {
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  const normalizedToolkitId = normalizeToolkitSelectionId(toolkitId);

  if (!normalizedToolkitId) {
    return current;
  }

  let next;
  if (enabled) {
    if (current.includes(normalizedToolkitId)) {
      next = current;
    } else {
      next = [...current, normalizedToolkitId];
    }
  } else {
    next = current.filter((id) => id !== normalizedToolkitId);
  }

  next = sanitizeIds(next);
  store.scopes[scopeKey] = next;
  writeStore(store);
  return next;
};

export const removeInvalidToolkitIds = (scopeKey = "global", validIds) => {
  const validSet = new Set(sanitizeIds(validIds));
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  const pruned = current.filter((id) => validSet.has(id));
  store.scopes[scopeKey] = pruned;
  writeStore(store);
  return pruned;
};
