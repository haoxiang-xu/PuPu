const { CHANNELS } = require("../../shared/channels");

const createMisoBridge = (ipcRenderer, streamClient) => ({
  getStatus: () => ipcRenderer.invoke(CHANNELS.MISO.GET_STATUS),
  getModelCatalog: () => ipcRenderer.invoke(CHANNELS.MISO.GET_MODEL_CATALOG),
  getToolkitCatalog: () => ipcRenderer.invoke(CHANNELS.MISO.GET_TOOLKIT_CATALOG),
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
    ipcRenderer.invoke(CHANNELS.MISO.DELETE_RUNTIME_ENTRY, { dirPath, entryName }),
  clearRuntimeDir: (dirPath) =>
    ipcRenderer.invoke(CHANNELS.MISO.CLEAR_RUNTIME_DIR, { dirPath }),
  getMemorySize: () => ipcRenderer.invoke(CHANNELS.MISO.GET_MEMORY_SIZE),
  startStream: streamClient.startStream,
  cancelStream: streamClient.cancelStream,
  startStreamV2: streamClient.startStreamV2,
});

module.exports = {
  createMisoBridge,
};
