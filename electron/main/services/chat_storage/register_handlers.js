const { CHANNELS } = require("../../../shared/channels");

const CHAT_STORAGE_SYNC_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
]);

const CHAT_STORAGE_ON_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.WRITE,
]);

const registerChatStorageHandlers = ({ ipcMain, chatStorageService }) => {
  if (!ipcMain || !chatStorageService) {
    throw new Error("registerChatStorageHandlers: missing dependencies");
  }

  ipcMain.on(CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ, (event) => {
    try {
      event.returnValue = chatStorageService.getBootstrapSnapshot();
    } catch (error) {
      console.error("[chat-storage] bootstrap-read failed:", error);
      event.returnValue = null;
    }
  });

  ipcMain.on(CHANNELS.CHAT_STORAGE.WRITE, (_event, payload) => {
    try {
      chatStorageService.write(payload);
    } catch (error) {
      console.error("[chat-storage] write failed:", error);
    }
  });
};

module.exports = {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
};
