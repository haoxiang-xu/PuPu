const {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_INVOKE_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
} = require(
  "../../main/services/chat_storage/register_handlers",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcMain = () => ({
  on: jest.fn(),
  handle: jest.fn(),
});

describe("chat storage IPC handlers", () => {
  test("bootstrap-read returns current snapshot via event.returnValue", () => {
    const snapshot = { active: "a" };
    const service = {
      getBootstrapSnapshot: () => snapshot,
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const bootstrapCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(bootstrapCall).toBeDefined();
    const handler = bootstrapCall[1];
    const event = {};
    handler(event);
    expect(event.returnValue).toEqual({ ok: true, value: snapshot });
  });

  test("bootstrap-read reports an explicit error instead of empty DB", () => {
    const service = {
      getBootstrapSnapshot: () => {
        throw new SyntaxError("corrupt chat meta JSON");
      },
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const handler = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    )[1];
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const event = {};
      handler(event);
      expect(event.returnValue).toEqual({
        ok: false,
        error: {
          code: "chat_storage_failed",
          message: "corrupt chat meta JSON",
        },
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("write dispatches payload and acknowledges the committed transaction", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const writeCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.WRITE,
    );
    expect(writeCall).toBeDefined();
    const handler = writeCall[1];
    const payload = { foo: "bar" };
    const event = {};
    handler(event, payload);
    expect(service.write).toHaveBeenCalledWith(payload);
    expect(event.returnValue).toEqual({ ok: true, value: null });
  });

  test("read-messages returns service payload via event.returnValue", () => {
    const messages = [{ role: "user", content: "hi" }];
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(() => messages),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const readCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(readCall).toBeDefined();
    const handler = readCall[1];
    const event = {};
    handler(event, "chat-42");
    expect(service.readMessages).toHaveBeenCalledWith("chat-42");
    expect(event.returnValue).toEqual({ ok: true, value: messages });
  });

  test("read-messages returns an explicit error when the service throws", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(() => {
        throw new Error("db gone");
      }),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const handler = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    )[1];
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const event = {};
      expect(() => handler(event, "chat-42")).not.toThrow();
      expect(event.returnValue).toEqual({
        ok: false,
        error: {
          code: "chat_storage_failed",
          message: "db gone",
        },
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("apply-ops dispatches ops and acknowledges the committed transaction", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const applyCall = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
    expect(applyCall).toBeDefined();
    const handler = applyCall[1];
    const ops = [{ type: "put_tree_meta", tree: {}, activeChatId: null }];
    const result = handler({}, ops);
    expect(service.applyOps).toHaveBeenCalledWith(ops);
    expect(result).toEqual({ ok: true, value: null });
  });

  test("apply-ops returns an explicit failed acknowledgement", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(),
      applyOps: jest.fn(() => {
        throw new Error("tx failed");
      }),
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const handler = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.APPLY_OPS,
    )[1];
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = handler({}, [{ type: "nope" }]);
      expect(result).toEqual({
        ok: false,
        error: {
          code: "chat_storage_failed",
          message: "tx failed",
        },
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("apply-ops-sync uses the same commit acknowledgement for unload", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      readMessages: jest.fn(),
      applyOps: jest.fn(),
      write: jest.fn(),
    };
    const ipcMain = makeFakeIpcMain();
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const handler = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
    )[1];
    const ops = [{ type: "delete_chats", chatIds: ["chat-1"] }];
    const event = {};
    handler(event, ops);

    expect(service.applyOps).toHaveBeenCalledWith(ops);
    expect(event.returnValue).toEqual({ ok: true, value: null });
  });

  test("exports channel lists for parity checks", () => {
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(CHANNELS.CHAT_STORAGE.WRITE);
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
    );
    expect(CHAT_STORAGE_INVOKE_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
    expect(CHAT_STORAGE_ON_CHANNELS).toEqual([]);
  });
});
