const { contextBridge, ipcRenderer } = require("electron");
const { CHANNELS } = require("../shared/channels");

const createTestBridgePreload = (renderer = ipcRenderer) => {
  const handlers = new Map(); // command -> handler (last-mount-wins)

  renderer.on(
    CHANNELS.TEST_BRIDGE.INVOKE,
    async (_event, { requestId, command, payload }) => {
      const handler = handlers.get(command);
      if (!handler) {
        renderer.send(CHANNELS.TEST_BRIDGE.RESULT, {
          requestId,
          ok: false,
          error: {
            code: "no_handler",
            message: `no handler registered for ${command}`,
          },
        });
        return;
      }
      try {
        const data = await handler(payload);
        renderer.send(CHANNELS.TEST_BRIDGE.RESULT, {
          requestId,
          ok: true,
          data,
        });
      } catch (e) {
        renderer.send(CHANNELS.TEST_BRIDGE.RESULT, {
          requestId,
          ok: false,
          error: {
            code: e.code || "handler_error",
            message: e.message,
            stack: e.stack,
          },
        });
      }
    },
  );

  return {
    register(command, handler) {
      handlers.set(command, handler);
      return () => {
        if (handlers.get(command) === handler) handlers.delete(command);
      };
    },
    pushLog(entry) {
      try {
        renderer.send(CHANNELS.TEST_BRIDGE.LOG, entry);
      } catch (_) {
        // best-effort
      }
    },
    pushEvent(evt) {
      try {
        renderer.send(CHANNELS.TEST_BRIDGE.EVENT, evt);
      } catch (_) {
        // best-effort
      }
    },
    markReady() {
      renderer.send(CHANNELS.TEST_BRIDGE.READY, {});
    },
  };
};

const install = () => {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.PUPU_TEST_API_DISABLE === "1") return;
  const api = createTestBridgePreload();
  contextBridge.exposeInMainWorld("__pupuTestBridge", api);
};

module.exports = { createTestBridgePreload, install };
