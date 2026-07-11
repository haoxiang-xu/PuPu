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

  test("read-messages returns service payload via event.returnValue", () => {
    const messages = [{ role: "user", content: "hi" }];
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(() => messages),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const readCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(readCall).toBeDefined();
    const handler = readCall[1];
    const event = {};
    handler(event, "chat-42");
    expect(service.readMessages).toHaveBeenCalledWith("chat-42");
    expect(event.returnValue).toEqual(messages);
  });

  test("read-messages returns [] and warns when the service throws", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(() => {
        throw new Error("db gone");
      }),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const handler = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    )[1];
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const event = {};
      expect(() => handler(event, "chat-42")).not.toThrow();
      expect(event.returnValue).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("apply-ops dispatches ops to service.applyOps (fire-and-forget)", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const applyCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
    expect(applyCall).toBeDefined();
    const handler = applyCall[1];
    const ops = [{ type: "put_tree_meta", tree: {}, activeChatId: null }];
    handler({}, ops);
    expect(service.applyOps).toHaveBeenCalledWith(ops);
  });

  test("apply-ops warns and does not throw when the service throws", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(),
      applyOps: jest.fn(() => {
        throw new Error("tx failed");
      }),
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const handler = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.APPLY_OPS,
    )[1];
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => handler({}, [{ type: "nope" }])).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("exports channel lists for parity checks", () => {
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(CHAT_STORAGE_ON_CHANNELS).toContain(CHANNELS.CHAT_STORAGE.WRITE);
    expect(CHAT_STORAGE_ON_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
  });
});
