// jsdom does not provide Node's setImmediate, which the shared Electron suite
// uses to deliver the supervisor control frame after the spawn event.
if (typeof global.setImmediate !== "function") {
  global.setImmediate = (callback, ...args) => setTimeout(callback, 0, ...args);
}

require("../../../../electron/tests/main/memory_vault_sink_executor.test.cjs");
