const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("osInfo", {
  platform: process.platform,
});
contextBridge.exposeInMainWorld("windowStateAPI", {
  windowStateEventHandler: (action) => {
    ipcRenderer.send("window-state-event-handler", action);
  },
  windowStateEventListener: (callback) => {
    ipcRenderer.on("window-state-event-listener", (_, data) => callback(data));
  },
});
