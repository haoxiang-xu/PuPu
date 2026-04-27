const crypto = require("crypto");

const createBridge = ({ ipcMain, channels }) => {
  const pending = new Map();
  let webContents = null;
  let ready = false;
  const readyCallbacks = [];

  ipcMain.on(channels.RESULT, (_event, payload) => {
    if (!payload) return;
    const entry = pending.get(payload.requestId);
    if (!entry) return;
    pending.delete(payload.requestId);
    clearTimeout(entry.timer);
    if (payload.ok) {
      entry.resolve(payload.data);
    } else {
      const err = Object.assign(
        new Error(payload.error?.message || "handler error"),
        payload.error || {},
      );
      entry.reject(err);
    }
  });

  ipcMain.on(channels.READY, () => {
    ready = true;
    while (readyCallbacks.length) readyCallbacks.shift()();
  });

  const attach = (wc) => {
    webContents = wc;
  };

  const invoke = (command, payload, { timeout = 30000 } = {}) =>
    new Promise((resolve, reject) => {
      if (!webContents) {
        reject(
          Object.assign(new Error("no webContents attached"), {
            code: "no_renderer",
          }),
        );
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          Object.assign(new Error(`ipc timeout for ${command}`), {
            code: "ipc_timeout",
          }),
        );
      }, timeout);
      pending.set(requestId, { resolve, reject, timer });
      webContents.send(channels.INVOKE, { requestId, command, payload });
    });

  const isReady = () => ready;
  const onReady = (cb) => {
    if (ready) cb();
    else readyCallbacks.push(cb);
  };

  return { attach, invoke, isReady, onReady };
};

module.exports = { createBridge };
