const {
  IPC_HANDLE_CHANNELS,
  IPC_ON_CHANNELS,
  MAIN_EVENT_CHANNELS,
} = require("../../main/ipc/register_handlers");
const {
  PRELOAD_INVOKE_CHANNELS,
  PRELOAD_SEND_CHANNELS,
  PRELOAD_EVENT_CHANNELS,
} = require("../../preload/channels");

describe("ipc channel parity", () => {
  test("preload invoke/send channels are registered in main handlers", () => {
    const mainRegistered = new Set([...IPC_HANDLE_CHANNELS, ...IPC_ON_CHANNELS]);

    PRELOAD_INVOKE_CHANNELS.forEach((channel) => {
      expect(mainRegistered.has(channel)).toBe(true);
    });

    PRELOAD_SEND_CHANNELS.forEach((channel) => {
      expect(mainRegistered.has(channel)).toBe(true);
    });
  });

  test("preload event channels are emitted by main", () => {
    const mainEvents = new Set(MAIN_EVENT_CHANNELS);

    PRELOAD_EVENT_CHANNELS.forEach((channel) => {
      expect(mainEvents.has(channel)).toBe(true);
    });
  });
});
