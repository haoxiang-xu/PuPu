const fs = require("fs");
const { CHANNELS } = require("../../../shared/channels");
const { createCommandRegistry } = require("./commands");
const { createBridge } = require("./bridge");
const { createServer } = require("./server");
const { createLogStore } = require("./logs");
const { registerBuiltinCommands } = require("./builtin_commands");

const createTestApiService = ({
  env = process.env,
  ipcMain,
  portFilePath,
  getMainWindow,
  electron,
}) => {
  let server = null;
  let bridge = null;
  let logs = null;
  let unpatchStdout = null;
  let unpatchStderr = null;
  let port = null;

  const isEnabled = () =>
    env.NODE_ENV !== "production" && env.PUPU_TEST_API_DISABLE !== "1";

  const start = async ({ webContents } = {}) => {
    if (!isEnabled()) return;
    logs = createLogStore({ capacity: 2000 });
    if (process && process.stdout) {
      unpatchStdout = logs.patchStream(process.stdout, "main", "log");
    }
    if (process && process.stderr) {
      unpatchStderr = logs.patchStream(process.stderr, "main", "error");
    }

    bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    if (webContents) bridge.attach(webContents);

    ipcMain.on(CHANNELS.TEST_BRIDGE.LOG, (_event, entry) => {
      if (logs && entry && entry.source) logs.push(entry);
    });

    const registry = createCommandRegistry();
    registerBuiltinCommands({
      registry,
      bridge,
      logs,
      getMainWindow,
      electron,
    });

    server = await createServer({ registry, isReady: () => bridge.isReady() });
    port = server.port;
    fs.writeFileSync(
      portFilePath,
      JSON.stringify({ port, pid: process.pid, started_at: Date.now() }),
    );
    process.stdout.write(
      `[test-api] listening on http://127.0.0.1:${port}\n`,
    );
  };

  const stop = async () => {
    if (server) await server.close();
    server = null;
    if (unpatchStdout) {
      unpatchStdout();
      unpatchStdout = null;
    }
    if (unpatchStderr) {
      unpatchStderr();
      unpatchStderr = null;
    }
    try {
      fs.unlinkSync(portFilePath);
    } catch (_) {
      // best-effort
    }
    port = null;
  };

  return {
    start,
    stop,
    getPort: () => port,
    getLogs: () => logs,
    getBridge: () => bridge,
  };
};

module.exports = { createTestApiService };
