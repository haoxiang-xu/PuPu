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
  themeStatusHandler: (theme) => {
    ipcRenderer.send("theme-status-handler", theme);
  },
});
contextBridge.exposeInMainWorld("terminalAPI", {
  terminalEventHandler: (input) => {
    try {
      ipcRenderer.send("terminal-event-handler", input);
    } catch (error) {
      console.error("Error sending terminal input:", error);
    }
  },
  terminalEventListener: (callback) => {
    try {
      // Remove all listeners before adding a new one
      ipcRenderer.removeAllListeners("terminal-event-listener");
      ipcRenderer.on("terminal-event-listener", (_, data) => callback(data));
      // Return a cleanup function to remove the listener when the component unmounts
      return () => {
        ipcRenderer.removeAllListeners("terminal-event-listener");
      };
    } catch (error) {
      console.error("Error in terminal event listener:", error);
    }
  },
  resizeTerminal: (cols, rows) => {
    try {
      ipcRenderer.send("terminal-resize", { cols, rows });
    } catch (error) {
      console.error("Error resizing terminal:", error);
    }
  },
});
contextBridge.exposeInMainWorld("dataAPI", {
  selectFile: () => ipcRenderer.invoke("select-file"),
  readFileAsBase64: (filePath) => ipcRenderer.invoke("read-file", filePath),
});
contextBridge.exposeInMainWorld("storageAPI", {
  readAddressBook: () => ipcRenderer.invoke("storage:read-address-book"),
  writeAddressBook: (data) => ipcRenderer.invoke("storage:write-address-book", data),
  readFavouredModels: () => ipcRenderer.invoke("storage:read-favoured-models"),
  writeFavouredModels: (data) => ipcRenderer.invoke("storage:write-favoured-models", data),
  readSection: (address) => ipcRenderer.invoke("storage:read-section", address),
  writeSection: (address, data) => ipcRenderer.invoke("storage:write-section", address, data),
  deleteSection: (address) => ipcRenderer.invoke("storage:delete-section", address),
  listSections: () => ipcRenderer.invoke("storage:list-sections"),
  getSize: () => ipcRenderer.invoke("storage:get-size"),
  getSectionSizes: () => ipcRenderer.invoke("storage:get-section-sizes"),
  saveFile: (fileKey, fileData) => ipcRenderer.invoke("storage:save-file", fileKey, fileData),
  loadFile: (fileKey) => ipcRenderer.invoke("storage:load-file", fileKey),
  deleteSectionFiles: (address) => ipcRenderer.invoke("storage:delete-section-files", address),
});