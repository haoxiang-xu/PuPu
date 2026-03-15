const { CHANNELS } = require("../../shared/channels");

const createOllamaBridge = (ipcRenderer) => ({
  getStatus: () => ipcRenderer.invoke(CHANNELS.OLLAMA.GET_STATUS),
  listInstalledModels: () =>
    ipcRenderer.invoke(CHANNELS.OLLAMA.LIST_INSTALLED_MODELS),
  restart: () => ipcRenderer.invoke(CHANNELS.OLLAMA.RESTART),
  install: () => ipcRenderer.invoke(CHANNELS.OLLAMA.INSTALL),
  onInstallProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, pct) => callback(pct);
    ipcRenderer.on(CHANNELS.OLLAMA.INSTALL_PROGRESS, listener);
    return () => ipcRenderer.removeListener(CHANNELS.OLLAMA.INSTALL_PROGRESS, listener);
  },
});

module.exports = {
  createOllamaBridge,
};
