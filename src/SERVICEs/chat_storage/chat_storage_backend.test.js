import {
  createChatStorageBackend,
  LEGACY_LOCALSTORAGE_KEY,
  MIGRATION_MARKER_KEY,
  PENDING_OPS_JOURNAL_KEY,
} from "./chat_storage_backend";

const makeLegacyStore = (schemaVersion = 2) => {
  const chatId = "legacy-chat";
  const common = {
    schemaVersion,
    updatedAt: 1720000000000,
    activeChatId: chatId,
    chatsById: {
      [chatId]: {
        id: chatId,
        title: "Legacy chat",
        messages: [],
      },
    },
    ui: {},
  };
  if (schemaVersion === 1) {
    return {
      ...common,
      chatOrder: [chatId],
    };
  }
  return {
    ...common,
    lruChatIds: [chatId],
    tree: {
      root: ["legacy-node"],
      nodesById: {
        "legacy-node": {
          id: "legacy-node",
          entity: "chat",
          chatId,
        },
      },
      selectedNodeId: "legacy-node",
      expandedFolderIds: [],
    },
  };
};

describe("chat storage backend adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.chatStorageAPI;
  });

  test("prefers window.chatStorageAPI when present", () => {
    const bootstrapValue = { activeChatId: "a" };
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => bootstrapValue),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(bootstrapValue);
    expect(window.chatStorageAPI.bootstrap).toHaveBeenCalled();

    backend.persist({ foo: "bar" });
    expect(window.chatStorageAPI.write).toHaveBeenCalledWith({ foo: "bar" });
  });

  test("falls back to localStorage when window.chatStorageAPI is absent", () => {
    const stored = makeLegacyStore();
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(stored),
    );

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(stored);

    backend.persist({ v2: true });
    expect(
      JSON.parse(window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)),
    ).toEqual({ v2: true });
  });

  test("returns null when neither IPC nor localStorage has data", () => {
    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toBeNull();
  });

  test("corrupt legacy localStorage fails closed without writing SQL or marker", () => {
    const rawLegacy = "{ definitely not valid JSON";
    window.localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, rawLegacy);
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    let bootstrapError;
    try {
      backend.readBootstrap();
    } catch (error) {
      bootstrapError = error;
    }

    expect(bootstrapError).toMatchObject({
      code: "chat_legacy_source_unreadable",
    });
    expect(bootstrapError.message).toMatch(/not valid JSON/i);
    expect(window.chatStorageAPI.bootstrap).toHaveBeenCalledTimes(1);
    expect(window.chatStorageAPI.write).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)).toBe(
      rawLegacy,
    );
  });

  test.each([
    ["array", []],
    ["empty object", {}],
    [
      "v2 without a tree",
      {
        ...makeLegacyStore(),
        tree: undefined,
      },
    ],
  ])(
    "parseable but invalid legacy localStorage (%s) performs no writes",
    (_label, invalidLegacy) => {
      const rawLegacy = JSON.stringify(invalidLegacy);
      window.localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, rawLegacy);
      window.chatStorageAPI = {
        bootstrap: jest.fn(() => null),
        write: jest.fn(),
      };

      const backend = createChatStorageBackend();
      let bootstrapError;
      try {
        backend.readBootstrap();
      } catch (error) {
        bootstrapError = error;
      }

      expect(bootstrapError).toMatchObject({
        code: "chat_legacy_source_invalid",
      });
      expect(window.chatStorageAPI.write).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).toBeNull();
      expect(window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)).toBe(
        rawLegacy,
      );
    },
  );

  test("when IPC bootstrap is null but legacy localStorage exists, migrate once and tag", () => {
    const legacy = makeLegacyStore();
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(legacy),
    );
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: writeSpy,
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(legacy);
    expect(writeSpy).toHaveBeenCalledWith(legacy);
    expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).not.toBeNull();
  });

  test("legacy migration failure leaves marker unset and fails bootstrap closed", () => {
    const legacy = makeLegacyStore();
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(legacy),
    );
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: jest.fn(() => {
        throw new Error("database is locked");
      }),
    };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const backend = createChatStorageBackend();
      expect(() => backend.readBootstrap()).toThrow("database is locked");
      expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).toBeNull();
      expect(
        JSON.parse(window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)),
      ).toEqual(legacy);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("real v1 localStorage shape remains migration-compatible", () => {
    const legacy = makeLegacyStore(1);
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(legacy),
    );
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(legacy);
    expect(window.chatStorageAPI.write).toHaveBeenCalledWith(legacy);
    expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).not.toBeNull();
  });

  test("healthy bootstrap replays recovery journal, then reads final snapshot", () => {
    const recoveryBatch = [
      { type: "put_tree_meta", tree: {}, activeChatId: "chat-recovered" },
    ];
    window.localStorage.setItem(
      PENDING_OPS_JOURNAL_KEY,
      JSON.stringify([recoveryBatch]),
    );
    const finalSnapshot = {
      activeChatId: "chat-recovered",
      chatMetasById: {},
    };
    window.chatStorageAPI = {
      bootstrap: jest.fn().mockReturnValueOnce(null).mockReturnValue(finalSnapshot),
      applyOpsSync: jest.fn(),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(finalSnapshot);
    expect(window.chatStorageAPI.applyOpsSync).toHaveBeenCalledWith(
      recoveryBatch,
    );
    expect(window.chatStorageAPI.bootstrap).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
  });

  test("legacy journal entries replay before guarded entries during upgrade", () => {
    const legacyBatch = [
      { type: "put_chat_meta", chatId: "legacy", meta: { id: "legacy" } },
    ];
    const guardedEntry = {
      guard: { epoch: "renderer-upgrade", sequence: 1 },
      ops: [
        {
          type: "put_chat_meta",
          chatId: "guarded",
          meta: { id: "guarded" },
        },
      ],
    };
    window.localStorage.setItem(
      PENDING_OPS_JOURNAL_KEY,
      JSON.stringify([guardedEntry, legacyBatch]),
    );
    const replayOrder = [];
    window.chatStorageAPI = {
      bootstrap: jest
        .fn()
        .mockReturnValueOnce({ chatMetasById: {} })
        .mockReturnValue({ chatMetasById: { guarded: {} } }),
      applyOpsSync: jest.fn((entry) => replayOrder.push(entry)),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    backend.readBootstrap();

    expect(replayOrder).toEqual([legacyBatch, guardedEntry]);
    expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
  });

  test("guarded replay remains open when physical journal cleanup fails", () => {
    const guardedEntry = {
      guard: { epoch: "renderer-stale", sequence: 7 },
      ops: [
        {
          type: "put_chat_meta",
          chatId: "chat-guarded",
          meta: { id: "chat-guarded", title: "new" },
        },
      ],
    };
    const rawJournal = JSON.stringify([guardedEntry]);
    window.localStorage.setItem(PENDING_OPS_JOURNAL_KEY, rawJournal);
    const finalSnapshot = {
      activeChatId: "chat-guarded",
      chatMetasById: { "chat-guarded": { title: "new" } },
    };
    window.chatStorageAPI = {
      bootstrap: jest
        .fn()
        .mockReturnValueOnce({ chatMetasById: {} })
        .mockReturnValue(finalSnapshot),
      applyOpsSync: jest.fn(),
      write: jest.fn(),
    };
    const removeSpy = jest
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementationOnce(() => {
        throw new Error("localStorage unavailable");
      });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const backend = createChatStorageBackend();
      expect(backend.readBootstrap()).toEqual(finalSnapshot);
      expect(window.chatStorageAPI.applyOpsSync).toHaveBeenCalledWith(
        guardedEntry,
      );
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBe(
        rawJournal,
      );
    } finally {
      removeSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("journal clear failure keeps bootstrap closed after replay", () => {
    const recoveryBatch = [
      { type: "put_tree_meta", tree: {}, activeChatId: "chat-recovered" },
    ];
    const rawJournal = JSON.stringify([recoveryBatch]);
    window.localStorage.setItem(PENDING_OPS_JOURNAL_KEY, rawJournal);
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValue({ activeChatId: "chat-recovered" }),
      applyOpsSync: jest.fn(),
      write: writeSpy,
    };
    const removeSpy = jest
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementationOnce(() => {
        throw new Error("localStorage unavailable");
      });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const backend = createChatStorageBackend();
      expect(() => backend.readBootstrap()).toThrow(
        "Chat storage recovery journal could not be cleared",
      );
      expect(window.chatStorageAPI.applyOpsSync).toHaveBeenCalledWith(
        recoveryBatch,
      );
      expect(window.chatStorageAPI.bootstrap).toHaveBeenCalledTimes(2);
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBe(
        rawJournal,
      );
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      removeSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("corrupt DB is checked before journal replay and leaves journal intact", () => {
    const rawJournal = JSON.stringify([
      [{ type: "delete_chats", chatIds: ["chat-1"] }],
    ]);
    window.localStorage.setItem(PENDING_OPS_JOURNAL_KEY, rawJournal);
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => {
        throw new Error("corrupt chat meta JSON");
      }),
      applyOpsSync: jest.fn(),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    expect(() => backend.readBootstrap()).toThrow("corrupt chat meta JSON");
    expect(window.chatStorageAPI.applyOpsSync).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBe(
      rawJournal,
    );
  });

  test("oversized recovery journal is rejected and not claimed durable", () => {
    const backend = createChatStorageBackend();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const oversized = [
        {
          guard: { epoch: "renderer-oversized", sequence: 1 },
          ops: [
          {
            type: "put_messages",
            chatId: "chat-1",
            messages: [{ content: "x".repeat(2.1 * 1024 * 1024) }],
          },
          ],
        },
      ];
      expect(backend.writePendingOpsJournal(oversized)).toBe(false);
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("message read failure propagates instead of collapsing to []", () => {
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => ({ chatMetasById: {} })),
      readMessages: jest.fn(() => {
        throw new Error("message payload is corrupt");
      }),
    };
    const backend = createChatStorageBackend();
    expect(() => backend.readMessages("chat-1")).toThrow(
      "message payload is corrupt",
    );
  });

  test("skips legacy migration when marker already present", () => {
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify({ stale: true }),
    );
    window.localStorage.setItem(MIGRATION_MARKER_KEY, "2026-04-19T00:00:00Z");
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: writeSpy,
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
