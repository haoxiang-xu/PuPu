// jsdom lacks setImmediate; the suite drains the whenReady() microtask chain
// with it. Polyfill before the shared CJS body loads.
if (typeof global.setImmediate !== "function") {
  global.setImmediate = (callback, ...args) => setTimeout(callback, 0, ...args);
}

require("../../../../electron/tests/main/memory_vault_startup_assembly.test.cjs");
