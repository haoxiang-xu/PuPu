const { CHANNELS } = require("../../shared/channels");

const createChatStorageBridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createChatStorageBridge: ipcRenderer is required");
  }

  const bootstrap = () => {
    try {
      const value = ipcRenderer.sendSync(
        CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
      );
      return value == null ? null : value;
    } catch (error) {
      console.error("[chat-storage] bootstrap IPC failed:", error);
      return null;
    }
  };

  const write = (payload) => {
    try {
      ipcRenderer.send(CHANNELS.CHAT_STORAGE.WRITE, payload);
    } catch (error) {
      console.error("[chat-storage] write IPC failed:", error);
    }
  };

  return { bootstrap, write };
};

module.exports = { createChatStorageBridge };
