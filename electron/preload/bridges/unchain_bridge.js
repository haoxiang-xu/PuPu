const { CHANNELS } = require("../../shared/channels");

const createMisoBridge = (ipcRenderer, streamClient) => ({
  getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS),
  getModelCatalog: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MODEL_CATALOG),
  getToolkitCatalog: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_TOOLKIT_CATALOG),
  listToolModalCatalog: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_TOOL_MODAL_CATALOG),
  getToolkitDetail: (toolkitId, toolName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_TOOLKIT_DETAIL, {
      toolkitId,
      toolName,
    }),
  respondToolConfirmation: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.TOOL_CONFIRMATION, payload),
  setChromeTerminalOpen: (open = false) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SET_CHROME_TERMINAL_OPEN, {
      open: Boolean(open),
    }),
  syncBuildFeatureFlagsSnapshot: (featureFlags = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT, {
      featureFlags,
    }),
  pickWorkspaceRoot: (defaultPath = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.PICK_WORKSPACE_ROOT, { defaultPath }),
  validateWorkspaceRoot: (path = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.VALIDATE_WORKSPACE_ROOT, { path }),
  openRuntimeFolder: (path = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.OPEN_RUNTIME_FOLDER, { path }),
  getRuntimeDirSize: (dirPath = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_RUNTIME_DIR_SIZE, { dirPath }),
  deleteRuntimeEntry: (dirPath, entryName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_RUNTIME_ENTRY, {
      dirPath,
      entryName,
    }),
  clearRuntimeDir: (dirPath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CLEAR_RUNTIME_DIR, { dirPath }),
  getMemorySize: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MEMORY_SIZE),
  getCharacterStorageSize: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_CHARACTER_STORAGE_SIZE),
  deleteCharacterStorageEntry: (entryName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_CHARACTER_STORAGE_ENTRY, {
      entryName,
    }),
  getMemoryProjection: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MEMORY_PROJECTION, { sessionId }),
  getLongTermMemoryProjection: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_LONG_TERM_MEMORY_PROJECTION),
  replaceSessionMemory: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.REPLACE_SESSION_MEMORY, payload),
  getSessionMemoryExport: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_SESSION_MEMORY_EXPORT, { sessionId }),
  listSeedCharacters: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_SEED_CHARACTERS),
  listCharacters: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_CHARACTERS),
  getCharacter: (characterId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_CHARACTER, { characterId }),
  saveCharacter: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SAVE_CHARACTER, payload),
  deleteCharacter: (characterId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_CHARACTER, { characterId }),
  previewCharacterDecision: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.PREVIEW_CHARACTER_DECISION, payload),
  buildCharacterAgentConfig: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.BUILD_CHARACTER_AGENT_CONFIG, payload),
  exportCharacter: (characterId, filePath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.EXPORT_CHARACTER, {
      characterId,
      filePath,
    }),
  importCharacter: (filePath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.IMPORT_CHARACTER, { filePath }),
  showSaveDialog: (options = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SHOW_SAVE_DIALOG, options),
  showOpenDialog: (options = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SHOW_OPEN_DIALOG, options),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.WRITE_FILE, { filePath, content }),
  readFile: (filePath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.READ_FILE, { filePath }),
  startStream: streamClient.startStream,
  cancelStream: streamClient.cancelStream,
  startStreamV2: streamClient.startStreamV2,
});

module.exports = {
  createMisoBridge,
};
