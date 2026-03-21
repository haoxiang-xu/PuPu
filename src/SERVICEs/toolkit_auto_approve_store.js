const STORAGE_KEY = "toolkit_auto_approve";
const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 1;

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return { version: SCHEMA_VERSION, toolkits: [], tools: [] };
  }
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (
      raw &&
      typeof raw === "object" &&
      raw.version === SCHEMA_VERSION &&
      Array.isArray(raw.toolkits) &&
      Array.isArray(raw.tools)
    ) {
      return raw;
    }
  } catch (_) {
    // corrupted — reset
  }
  return { version: SCHEMA_VERSION, toolkits: [], tools: [] };
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

/**
 * Check if a toolkit has auto-approve enabled.
 */
export const isToolkitAutoApprove = (toolkitId) => {
  if (typeof toolkitId !== "string" || !toolkitId.trim()) return false;
  const store = readStore();
  return sanitizeIds(store.toolkits).includes(toolkitId.trim());
};

/**
 * Check if a specific tool name is auto-approved
 * (belongs to an auto-approved toolkit).
 */
export const isToolAutoApproved = (toolName) => {
  if (typeof toolName !== "string" || !toolName.trim()) return false;
  const store = readStore();
  return sanitizeIds(store.tools).includes(toolName.trim());
};

/**
 * Toggle auto-approve for a toolkit.
 * @param {string} toolkitId
 * @param {boolean} enabled
 * @param {string[]} toolNames - names of tools in this toolkit
 * @returns {{ toolkits: string[], tools: string[] }}
 */
export const setToolkitAutoApprove = (toolkitId, enabled, toolNames = []) => {
  if (typeof toolkitId !== "string" || !toolkitId.trim()) {
    const store = readStore();
    return {
      toolkits: sanitizeIds(store.toolkits),
      tools: sanitizeIds(store.tools),
    };
  }

  const trimmedId = toolkitId.trim();
  const store = readStore();
  let currentToolkits = sanitizeIds(store.toolkits);
  let currentTools = sanitizeIds(store.tools);

  const safeToolNames = (Array.isArray(toolNames) ? toolNames : [])
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter(Boolean);

  if (enabled) {
    if (!currentToolkits.includes(trimmedId)) {
      currentToolkits = [...currentToolkits, trimmedId];
    }
    const toolSet = new Set(currentTools);
    for (const name of safeToolNames) {
      toolSet.add(name);
    }
    currentTools = [...toolSet];
  } else {
    currentToolkits = currentToolkits.filter((id) => id !== trimmedId);
    const removeSet = new Set(safeToolNames);
    currentTools = currentTools.filter((name) => !removeSet.has(name));
  }

  currentToolkits = sanitizeIds(currentToolkits);
  currentTools = sanitizeIds(currentTools);
  store.toolkits = currentToolkits;
  store.tools = currentTools;
  writeStore(store);

  return { toolkits: currentToolkits, tools: currentTools };
};

/**
 * Get all auto-approved toolkit IDs.
 */
export const getAutoApproveToolkits = () => {
  const store = readStore();
  return sanitizeIds(store.toolkits);
};
