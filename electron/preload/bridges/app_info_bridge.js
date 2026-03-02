const { CHANNELS } = require("../../shared/channels");

const createAppInfoBridge = (ipcRenderer) => ({
  getVersion: () => ipcRenderer.invoke(CHANNELS.APP.GET_VERSION),
});

module.exports = {
  createAppInfoBridge,
};
