const { CHANNELS } = require("../../shared/channels");

const createAppUpdateBridge = (ipcRenderer) => ({
  checkAndDownload: () => ipcRenderer.invoke(CHANNELS.UPDATE.CHECK_AND_DOWNLOAD),
  installNow: () => ipcRenderer.invoke(CHANNELS.UPDATE.INSTALL_NOW),
  getState: () => ipcRenderer.invoke(CHANNELS.UPDATE.GET_STATE),
  getAutoUpdate: () => ipcRenderer.invoke(CHANNELS.UPDATE.GET_AUTO_UPDATE),
  setAutoUpdate: (enabled) =>
    ipcRenderer.invoke(CHANNELS.UPDATE.SET_AUTO_UPDATE, { enabled }),
  onStateChange: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload || {});
    };
    ipcRenderer.on(CHANNELS.UPDATE.STATE_CHANGED, listener);

    return () => {
      ipcRenderer.removeListener(CHANNELS.UPDATE.STATE_CHANGED, listener);
    };
  },
});

module.exports = {
  createAppUpdateBridge,
};
