const { TextDecoder, TextEncoder } = require("util");

if (typeof global.setImmediate !== "function") {
  global.setImmediate = (callback, ...args) => setTimeout(callback, 0, ...args);
}

if (typeof global.TextEncoder !== "function") {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder !== "function") {
  global.TextDecoder = TextDecoder;
}

require("../../../../electron/tests/main/unchain_service.test.cjs");
