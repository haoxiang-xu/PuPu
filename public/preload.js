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
contextBridge.exposeInMainWorld("terminalAPI", {
  terminalEventHandler: (input) => {
    ipcRenderer.send("terminal-event-handler", input);
  },
  terminalEventListener: (callback) => {
    ipcRenderer.on("terminal-event-listener", (_, data) => callback(data));
  },
});
