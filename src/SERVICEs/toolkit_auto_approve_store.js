const STORAGE_KEY = "toolkit_auto_approve";
const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 2;

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
  core: "core",
  core_toolkit: "core",
  coretoolkit: "core",
  CoreToolkit: "core",
  code: "core",
  code_toolkit: "core",
  codetoolkit: "core",
  CodeToolkit: "core",
  ask_user: "core",
  ask_user_toolkit: "core",
  "ask-user-toolkit": "core",
  interaction_toolkit: "core",
  "interaction-toolkit": "core",
  askusertoolkit: "core",
  AskUserToolkit: "core",
  external_api: "external_api",
  external_api_toolkit: "external_api",
  externalapitoolkit: "external_api",
  ExternalAPIToolkit: "external_api",
});

const LEGACY_TOOL_NAME_TO_TOOLKIT_ID = Object.freeze({
  write_file: "workspace_toolkit",
  delete_file: "workspace_toolkit",
  move_file: "workspace_toolkit",
  terminal_exec: "terminal_toolkit",
});

const normalizeToolkitId = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return "";
  return TOOLKIT_ID_ALIASES[trimmed] || TOOLKIT_ID_ALIASES[trimmed.toLowerCase()] || trimmed;
};

const buildToolKey = (toolkitId, toolName) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  const normalizedToolName =
    typeof toolName === "string" ? toolName.trim() : "";
  if (!normalizedToolkitId || !normalizedToolName) {
    return "";
  }
  return `${normalizedToolkitId}:${normalizedToolName}`;
};

const sanitizeToolkitIds = (ids) => {
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

const sanitizeToolKeys = (keys) => {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const result = [];
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const trimmed = key.trim();
    if (!trimmed || trimmed.length > MAX_ID_LENGTH * 2) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) continue;
    const normalized = buildToolKey(
      trimmed.slice(0, separatorIndex),
      trimmed.slice(separatorIndex + 1),
    );
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_IDS) break;
  }
  return result;
};

const migrateLegacyToolKeys = (tools) => {
  if (!Array.isArray(tools)) return [];
  const migrated = [];
  for (const toolName of tools) {
    if (typeof toolName !== "string") continue;
    const normalizedToolName = toolName.trim();
    const toolkitId = LEGACY_TOOL_NAME_TO_TOOLKIT_ID[normalizedToolName];
    const toolKey = buildToolKey(toolkitId, normalizedToolName);
    if (toolKey) {
      migrated.push(toolKey);
    }
  }
  return sanitizeToolKeys(migrated);
};

const createDefaultStore = () => ({
  version: SCHEMA_VERSION,
  toolkits: [],
  tools: [],
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
    if (raw && typeof raw === "object") {
      const store = {
        version: SCHEMA_VERSION,
        toolkits: sanitizeToolkitIds(raw.toolkits),
        tools:
          raw.version === SCHEMA_VERSION
            ? sanitizeToolKeys(raw.tools)
            : migrateLegacyToolKeys(raw.tools),
      };
      if (raw.version !== SCHEMA_VERSION) {
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

export const isToolkitAutoApprove = (toolkitId) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  if (!normalizedToolkitId) return false;
  const store = readStore();
  return sanitizeToolkitIds(store.toolkits).includes(normalizedToolkitId);
};

export const isToolAutoApproved = (toolkitId, toolName) => {
  const toolKey = buildToolKey(toolkitId, toolName);
  if (!toolKey) return false;
  const store = readStore();
  return sanitizeToolKeys(store.tools).includes(toolKey);
};

export const setToolkitAutoApprove = (toolkitId, enabled, toolNames = []) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  const store = readStore();
  let currentToolkits = sanitizeToolkitIds(store.toolkits);
  let currentTools = sanitizeToolKeys(store.tools);

  if (!normalizedToolkitId) {
    return { toolkits: currentToolkits, tools: currentTools };
  }

  const safeToolKeys = (Array.isArray(toolNames) ? toolNames : [])
    .map((toolName) => buildToolKey(normalizedToolkitId, toolName))
    .filter(Boolean);

  if (enabled) {
    if (!currentToolkits.includes(normalizedToolkitId)) {
      currentToolkits = [...currentToolkits, normalizedToolkitId];
    }
    const toolSet = new Set(currentTools);
    for (const toolKey of safeToolKeys) {
      toolSet.add(toolKey);
    }
    currentTools = [...toolSet];
  } else {
    currentToolkits = currentToolkits.filter((id) => id !== normalizedToolkitId);
    const removePrefix = `${normalizedToolkitId}:`;
    const removeSet = new Set(safeToolKeys);
    currentTools = currentTools.filter(
      (toolKey) =>
        !toolKey.startsWith(removePrefix) && !removeSet.has(toolKey),
    );
  }

  currentToolkits = sanitizeToolkitIds(currentToolkits);
  currentTools = sanitizeToolKeys(currentTools);
  store.toolkits = currentToolkits;
  store.tools = currentTools;
  writeStore(store);

  return { toolkits: currentToolkits, tools: currentTools };
};

export const getAutoApproveToolkits = () => {
  const store = readStore();
  return sanitizeToolkitIds(store.toolkits);
};
