const { CHANNELS } = require("../../../shared/channels");

const CHAT_STORAGE_SYNC_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
  CHANNELS.CHAT_STORAGE.READ_MESSAGES,
  CHANNELS.CHAT_STORAGE.WRITE,
  CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
]);

const CHAT_STORAGE_INVOKE_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.APPLY_OPS,
]);

const CHAT_STORAGE_ON_CHANNELS = Object.freeze([]);

const serializeError = (error) => ({
  code:
    typeof error?.code === "string" && error.code
      ? error.code
      : "chat_storage_failed",
  message:
    typeof error?.message === "string" && error.message
      ? error.message
      : "Chat storage operation failed",
});

const ok = (value) => ({ ok: true, value });
const failed = (error) => ({ ok: false, error: serializeError(error) });

const registerChatStorageHandlers = ({ ipcMain, chatStorageService }) => {
  if (!ipcMain || !chatStorageService) {
    throw new Error("registerChatStorageHandlers: missing dependencies");
  }

  ipcMain.on(CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ, (event) => {
    try {
      event.returnValue = ok(chatStorageService.getBootstrapSnapshot());
    } catch (error) {
      console.error("[chat-storage] bootstrap-read failed:", error);
      // Never collapse a corrupt/unreadable DB into the same value as an empty
      // DB.  The renderer must stop bootstrap instead of seeding over data.
      event.returnValue = failed(error);
    }
  });

  ipcMain.on(CHANNELS.CHAT_STORAGE.READ_MESSAGES, (event, chatId) => {
    try {
      event.returnValue = ok(chatStorageService.readMessages(chatId));
    } catch (error) {
      console.warn("[chat-storage] read-messages failed:", error);
      event.returnValue = failed(error);
    }
  });

  const applyOpsWithAck = (ops) => {
    try {
      chatStorageService.applyOps(ops);
      return ok(null);
    } catch (error) {
      console.warn("[chat-storage] apply-ops failed:", error);
      return failed(error);
    }
  };

  ipcMain.handle(CHANNELS.CHAT_STORAGE.APPLY_OPS, (_event, ops) =>
    applyOpsWithAck(ops),
  );

  ipcMain.on(CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC, (event, ops) => {
    event.returnValue = applyOpsWithAck(ops);
  });

  ipcMain.on(CHANNELS.CHAT_STORAGE.WRITE, (event, payload) => {
    try {
      chatStorageService.write(payload);
      // Legacy migration markers may only be written after this commit ack.
      event.returnValue = ok(null);
    } catch (error) {
      console.error("[chat-storage] write failed:", error);
      event.returnValue = failed(error);
    }
  });
};

module.exports = {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_INVOKE_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
};
