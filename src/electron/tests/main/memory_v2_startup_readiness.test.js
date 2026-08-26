// jsdom lacks setImmediate; the shared Electron suite uses it to drain the
// startup readiness microtask chain.
if (typeof global.setImmediate !== "function") {
  global.setImmediate = (callback, ...args) => setTimeout(callback, 0, ...args);
}

require("../../../../electron/tests/main/memory_v2_startup_readiness.test.cjs");
