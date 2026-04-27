const {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
} = require(
  "../../main/services/chat_storage/register_handlers",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcMain = () => {
  const syncHandlers = new Map();
  const onHandlers = new Map();
  return {
    on(channel, handler) {
      onHandlers.set(channel, handler);
    },
    onSync(channel, handler) {
      syncHandlers.set(channel, handler);
    },
    emitSync(channel, payload) {
      const handler = syncHandlers.get(channel);
      if (!handler) throw new Error(`no sync handler for ${channel}`);
      const event = { returnValue: undefined };
      handler(event, payload);
      return event.returnValue;
    },
    emit(channel, payload) {
      const handler = onHandlers.get(channel);
      if (!handler) throw new Error(`no on handler for ${channel}`);
      handler({}, payload);
    },
  };
};

// Our real code uses ipcMain.on for both sync + async; sync responses come via
// event.returnValue.  This shim keeps them distinct only for testing clarity —
// the production registration function just calls ipcMain.on twice.

describe("chat storage IPC handlers", () => {
  test("bootstrap-read returns current snapshot via event.returnValue", () => {
    const snapshot = { active: "a" };
    const service = {
      getBootstrapSnapshot: () => snapshot,
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const bootstrapCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(bootstrapCall).toBeDefined();
    const handler = bootstrapCall[1];
    const event = {};
    handler(event);
    expect(event.returnValue).toEqual(snapshot);
  });

  test("write dispatches payload to service.write", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const writeCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.WRITE,
    );
    expect(writeCall).toBeDefined();
    const handler = writeCall[1];
    const payload = { foo: "bar" };
    handler({}, payload);
    expect(service.write).toHaveBeenCalledWith(payload);
  });

  test("exports channel lists for parity checks", () => {
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(CHAT_STORAGE_ON_CHANNELS).toContain(CHANNELS.CHAT_STORAGE.WRITE);
  });
});
