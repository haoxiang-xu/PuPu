const STORAGE_KEY = "default_toolkits";
const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 1;

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
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
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

  let next;
  if (enabled) {
    if (current.includes(toolkitId)) {
      next = current;
    } else {
      next = [...current, toolkitId];
    }
  } else {
    next = current.filter((id) => id !== toolkitId);
  }

  next = sanitizeIds(next);
  store.scopes[scopeKey] = next;
  writeStore(store);
  return next;
};

export const removeInvalidToolkitIds = (scopeKey = "global", validIds) => {
  const validSet = new Set(validIds);
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  const pruned = current.filter((id) => validSet.has(id));
  store.scopes[scopeKey] = pruned;
  writeStore(store);
  return pruned;
};
