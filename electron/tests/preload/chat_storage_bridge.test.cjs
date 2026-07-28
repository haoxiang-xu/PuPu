const { createChatStorageBridge } = require(
  "../../preload/bridges/chat_storage_bridge",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcRenderer = ({ syncReturn } = {}) => ({
  sendSync: jest.fn(() => syncReturn),
  send: jest.fn(),
  invoke: jest.fn(),
});

describe("chatStorageAPI bridge", () => {
  test("bootstrap performs a synchronous IPC call and returns the payload", () => {
    const syncReturn = { ok: true, value: { activeChatId: "x" } };
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn });
    const api = createChatStorageBridge(ipcRenderer);

    const snapshot = api.bootstrap();

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(snapshot).toEqual(syncReturn.value);
  });

  test("bootstrap returns null for an acknowledged empty DB", () => {
    const ipcRenderer = makeFakeIpcRenderer({
      syncReturn: { ok: true, value: null },
    });
    const api = createChatStorageBridge(ipcRenderer);
    expect(api.bootstrap()).toBeNull();
  });

  test("write waits for a synchronous commit acknowledgement", () => {
    const ipcRenderer = makeFakeIpcRenderer({
      syncReturn: { ok: true, value: null },
    });
    const api = createChatStorageBridge(ipcRenderer);
    const payload = { chatsById: {} };

    api.write(payload);

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.WRITE,
      payload,
    );
  });

  test("write propagates transport and transaction failures", () => {
    const ipcRenderer = {
      sendSync: jest.fn(() => {
        throw new Error("boom");
      }),
      send: jest.fn(),
    };
    const api = createChatStorageBridge(ipcRenderer);
    expect(() => api.write({})).toThrow("boom");

    const failedApi = createChatStorageBridge(
      makeFakeIpcRenderer({
        syncReturn: {
          ok: false,
          error: { code: "SQLITE_BUSY", message: "database is locked" },
        },
      }),
    );
    expect(() => failedApi.write({})).toThrow("database is locked");
  });

  test("readMessages performs a synchronous IPC call with the chatId", () => {
    const messages = [{ role: "assistant", content: "yo" }];
    const ipcRenderer = makeFakeIpcRenderer({
      syncReturn: { ok: true, value: messages },
    });
    const api = createChatStorageBridge(ipcRenderer);

    const result = api.readMessages("chat-7");

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
      "chat-7",
    );
    expect(result).toEqual(messages);
  });

  test("readMessages rejects missing and invalid payload acknowledgements", () => {
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn: null });
    const api = createChatStorageBridge(ipcRenderer);
    expect(() => api.readMessages("chat-7")).toThrow(/acknowledgement/);

    const ipcRenderer2 = makeFakeIpcRenderer({
      syncReturn: { ok: true, value: null },
    });
    const api2 = createChatStorageBridge(ipcRenderer2);
    expect(() => api2.readMessages("chat-7")).toThrow(/invalid payload/);
  });

  test("readMessages propagates transport failures", () => {
    const ipcRenderer = {
      sendSync: jest.fn(() => {
        throw new Error("boom");
      }),
      send: jest.fn(),
    };
    const api = createChatStorageBridge(ipcRenderer);
    expect(() => api.readMessages("chat-7")).toThrow("boom");
  });

  test("applyOps awaits an asynchronous commit acknowledgement", async () => {
    const ipcRenderer = makeFakeIpcRenderer();
    ipcRenderer.invoke.mockResolvedValue({ ok: true, value: null });
    const api = createChatStorageBridge(ipcRenderer);
    const ops = [{ type: "put_messages", chatId: "c1", messages: [] }];

    await expect(api.applyOps(ops)).resolves.toBe(true);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
      ops,
    );
  });

  test("applyOps rejects a missing or failed acknowledgement", async () => {
    const ipcRenderer = makeFakeIpcRenderer();
    ipcRenderer.invoke.mockResolvedValue(undefined);
    const api = createChatStorageBridge(ipcRenderer);
    await expect(api.applyOps([])).rejects.toThrow(/acknowledgement/);

    const failedRenderer = makeFakeIpcRenderer();
    failedRenderer.invoke.mockResolvedValue({
      ok: false,
      error: { code: "SQLITE_FULL", message: "database or disk is full" },
    });
    const failedApi = createChatStorageBridge(failedRenderer);
    await expect(failedApi.applyOps([])).rejects.toThrow(
      "database or disk is full",
    );
  });

  test("applyOpsSync provides the renderer-unload commit acknowledgement", () => {
    const ipcRenderer = makeFakeIpcRenderer({
      syncReturn: { ok: true, value: null },
    });
    const api = createChatStorageBridge(ipcRenderer);
    const ops = [{ type: "put_tree_meta", tree: {} }];

    expect(api.applyOpsSync(ops)).toBe(true);
    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
      ops,
    );
  });

  test("bootstrap propagates a corrupt-database response", () => {
    const api = createChatStorageBridge(
      makeFakeIpcRenderer({
        syncReturn: {
          ok: false,
          error: {
            code: "chat_storage_failed",
            message: "corrupt chat meta JSON",
          },
        },
      }),
    );
    expect(() => api.bootstrap()).toThrow("corrupt chat meta JSON");
  });

  test("bridge exposes normal async writes plus unload sync drain", () => {
    const api = createChatStorageBridge(makeFakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual(
      [
        "applyOps",
        "applyOpsSync",
        "bootstrap",
        "readMessages",
        "write",
      ].sort(),
    );
  });
});
