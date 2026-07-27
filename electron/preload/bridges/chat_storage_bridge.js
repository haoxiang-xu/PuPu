const { CHANNELS } = require("../../shared/channels");

const createChatStorageBridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createChatStorageBridge: ipcRenderer is required");
  }

  const unwrapResponse = (response, operation) => {
    if (response && response.ok === true) {
      return response.value;
    }
    const message =
      response?.error?.message ||
      `Chat storage ${operation} did not receive a commit acknowledgement`;
    const error = new Error(message);
    error.code = response?.error?.code || "chat_storage_ipc_failed";
    throw error;
  };

  const bootstrap = () => {
    const response = ipcRenderer.sendSync(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    const value = unwrapResponse(response, "bootstrap");
    return value == null ? null : value;
  };

  const write = (payload) => {
    const response = ipcRenderer.sendSync(CHANNELS.CHAT_STORAGE.WRITE, payload);
    unwrapResponse(response, "write");
    return true;
  };

  const readMessages = (chatId) => {
    const response = ipcRenderer.sendSync(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
      chatId,
    );
    const value = unwrapResponse(response, "read-messages");
    if (!Array.isArray(value)) {
      throw new Error("Chat storage read-messages returned an invalid payload");
    }
    return value;
  };

  const applyOps = (ops) =>
    ipcRenderer
      .invoke(CHANNELS.CHAT_STORAGE.APPLY_OPS, ops)
      .then((response) => {
        unwrapResponse(response, "apply-ops");
        return true;
      });

  const applyOpsSync = (ops) => {
    const response = ipcRenderer.sendSync(
      CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
      ops,
    );
    unwrapResponse(response, "apply-ops-sync");
    return true;
  };

  return { bootstrap, write, readMessages, applyOps, applyOpsSync };
};

module.exports = { createChatStorageBridge };
