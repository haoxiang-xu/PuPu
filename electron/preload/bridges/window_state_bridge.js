const { CHANNELS } = require("../../shared/channels");

const createWindowStateBridge = (ipcRenderer) => ({
  windowStateEventHandler: (action) => {
    ipcRenderer.send(CHANNELS.WINDOW_STATE.HANDLE_ACTION, action);
  },
  windowStateEventListener: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload || { isMaximized: false });
    };
    ipcRenderer.on(CHANNELS.WINDOW_STATE.LISTENER_EVENT, listener);

    return () => {
      ipcRenderer.removeListener(CHANNELS.WINDOW_STATE.LISTENER_EVENT, listener);
    };
  },
});

module.exports = {
  createWindowStateBridge,
};
