const { CHANNELS } = require("../../shared/channels");

const createMisoBridge = (ipcRenderer, streamClient) => ({
  getStatus: () => ipcRenderer.invoke(CHANNELS.MISO.GET_STATUS),
  getModelCatalog: () => ipcRenderer.invoke(CHANNELS.MISO.GET_MODEL_CATALOG),
  getToolkitCatalog: () =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_TOOLKIT_CATALOG),
  listToolModalCatalog: () =>
    ipcRenderer.invoke(CHANNELS.MISO.LIST_TOOL_MODAL_CATALOG),
  getToolkitDetail: (toolkitId, toolName) =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_TOOLKIT_DETAIL, {
      toolkitId,
      toolName,
    }),
  respondToolConfirmation: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.TOOL_CONFIRMATION, payload),
  setChromeTerminalOpen: (open = false) =>
    ipcRenderer.invoke(CHANNELS.MISO.SET_CHROME_TERMINAL_OPEN, {
      open: Boolean(open),
    }),
  pickWorkspaceRoot: (defaultPath = "") =>
    ipcRenderer.invoke(CHANNELS.MISO.PICK_WORKSPACE_ROOT, { defaultPath }),
  validateWorkspaceRoot: (path = "") =>
    ipcRenderer.invoke(CHANNELS.MISO.VALIDATE_WORKSPACE_ROOT, { path }),
  openRuntimeFolder: (path = "") =>
    ipcRenderer.invoke(CHANNELS.MISO.OPEN_RUNTIME_FOLDER, { path }),
  getRuntimeDirSize: (dirPath = "") =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_RUNTIME_DIR_SIZE, { dirPath }),
  deleteRuntimeEntry: (dirPath, entryName) =>
    ipcRenderer.invoke(CHANNELS.MISO.DELETE_RUNTIME_ENTRY, {
      dirPath,
      entryName,
    }),
  clearRuntimeDir: (dirPath) =>
    ipcRenderer.invoke(CHANNELS.MISO.CLEAR_RUNTIME_DIR, { dirPath }),
  getMemorySize: () => ipcRenderer.invoke(CHANNELS.MISO.GET_MEMORY_SIZE),
  getMemoryProjection: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_MEMORY_PROJECTION, { sessionId }),
  getLongTermMemoryProjection: () =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_LONG_TERM_MEMORY_PROJECTION),
  replaceSessionMemory: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.REPLACE_SESSION_MEMORY, payload),
  getSessionMemoryExport: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_SESSION_MEMORY_EXPORT, { sessionId }),
  listCharacters: () => ipcRenderer.invoke(CHANNELS.MISO.LIST_CHARACTERS),
  getCharacter: (characterId) =>
    ipcRenderer.invoke(CHANNELS.MISO.GET_CHARACTER, { characterId }),
  saveCharacter: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.SAVE_CHARACTER, payload),
  deleteCharacter: (characterId) =>
    ipcRenderer.invoke(CHANNELS.MISO.DELETE_CHARACTER, { characterId }),
  previewCharacterDecision: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.PREVIEW_CHARACTER_DECISION, payload),
  buildCharacterAgentConfig: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.BUILD_CHARACTER_AGENT_CONFIG, payload),
  exportCharacter: (characterId, filePath) =>
    ipcRenderer.invoke(CHANNELS.MISO.EXPORT_CHARACTER, {
      characterId,
      filePath,
    }),
  importCharacter: (filePath) =>
    ipcRenderer.invoke(CHANNELS.MISO.IMPORT_CHARACTER, { filePath }),
  showSaveDialog: (options = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.SHOW_SAVE_DIALOG, options),
  showOpenDialog: (options = {}) =>
    ipcRenderer.invoke(CHANNELS.MISO.SHOW_OPEN_DIALOG, options),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke(CHANNELS.MISO.WRITE_FILE, { filePath, content }),
  readFile: (filePath) =>
    ipcRenderer.invoke(CHANNELS.MISO.READ_FILE, { filePath }),
  startStream: streamClient.startStream,
  cancelStream: streamClient.cancelStream,
  startStreamV2: streamClient.startStreamV2,
});

module.exports = {
  createMisoBridge,
};
