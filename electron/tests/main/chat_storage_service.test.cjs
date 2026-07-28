const path = require("path");
const os = require("os");
const fs = require("fs");

// node:sqlite is unavailable under some runtimes, and jest 27's resolver
// mangles `require("node:sqlite")` (it strips the prefix and looks for an npm
// package named `sqlite`). process.getBuiltinModule bypasses jest's resolver.
// Skip the whole suite cleanly when the engine is genuinely missing.
let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch (_error) {
  sqlite = null;
}
if (!sqlite && typeof process.getBuiltinModule === "function") {
  try {
    sqlite = process.getBuiltinModule("node:sqlite");
  } catch (_error) {
    sqlite = null;
  }
}

const describeIfSqlite = sqlite ? describe : describe.skip;

const { createChatStorageService } = require(
  "../../main/services/chat_storage/service",
);

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-chat-storage-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

const legacyStore = () => ({
  schemaVersion: 2,
  updatedAt: 1720000000000,
  activeChatId: "chat-a",
  lruChatIds: ["chat-a", "chat-b"],
  tree: {
    root: ["node-a", "node-b"],
    nodesById: {
      "node-a": { id: "node-a", entity: "chat", chatId: "chat-a" },
      "node-b": { id: "node-b", entity: "chat", chatId: "chat-b" },
    },
    selectedNodeId: "node-a",
    expandedFolderIds: [],
  },
  ui: { sideMenuWidth: 240 },
  chatsById: {
    "chat-a": {
      id: "chat-a",
      title: "Alpha",
      updatedAt: 1720000000000,
      stats: { messageCount: 2 },
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello", traceFrames: [{ t: 1 }] },
      ],
    },
    "chat-b": {
      id: "chat-b",
      title: "Beta",
      updatedAt: 1710000000000,
      stats: { messageCount: 1 },
      messages: [{ role: "user", content: "yo" }],
    },
  },
});

const legacyV1Store = () => {
  const {
    tree: _tree,
    lruChatIds: _lruChatIds,
    ...common
  } = legacyStore();
  return {
    ...common,
    schemaVersion: 1,
    chatOrder: ["chat-a", "chat-b"],
  };
};

describeIfSqlite("chat storage service (sqlite)", () => {
  let dir;
  let services;

  const makeService = () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      path,
      sqlite,
    });
    services.push(service);
    return service;
  };

  beforeEach(() => {
    dir = makeTempDir();
    services = [];
  });

  afterEach(() => {
    for (const service of services) {
      try {
        service.close();
      } catch (_error) {
        // already closed
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("init on a fresh dir (no chats.json) → null bootstrap snapshot", () => {
    const service = makeService();
    service.init();
    expect(service.getBootstrapSnapshot()).toBeNull();
    expect(fs.existsSync(path.join(dir, "chats.db"))).toBe(true);
  });

  test("import_store → bootstrap snapshot round-trip (v3 composite)", () => {
    const service = makeService();
    service.init();
    service.applyOps([{ type: "import_store", store: legacyStore() }]);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.updatedAt).toBe(1720000000000);
    expect(snapshot.activeChatId).toBe("chat-a");
    expect(snapshot.tree).toEqual(legacyStore().tree);

    // metas carry every chat field except messages
    expect(Object.keys(snapshot.chatMetasById).sort()).toEqual([
      "chat-a",
      "chat-b",
    ]);
    expect(snapshot.chatMetasById["chat-a"]).toEqual({
      id: "chat-a",
      title: "Alpha",
      updatedAt: 1720000000000,
      stats: { messageCount: 2 },
      // derived on import (legacy metas lack the field; no streaming msg)
      isGenerating: false,
    });
    expect(snapshot.chatMetasById["chat-a"].messages).toBeUndefined();

    // active chat messages ride along in full
    expect(snapshot.activeChatMessages).toEqual(
      legacyStore().chatsById["chat-a"].messages,
    );
  });

  test("corrupt chat JSON fails bootstrap instead of presenting an empty DB", () => {
    const service = makeService();
    service.init();
    service.applyOps([{ type: "import_store", store: legacyStore() }]);

    const rawDb = new sqlite.DatabaseSync(path.join(dir, "chats.db"));
    try {
      rawDb
        .prepare("UPDATE chats SET meta = ? WHERE id = ?")
        .run("{ definitely not json", "chat-b");
    } finally {
      rawDb.close();
    }

    expect(() => service.getBootstrapSnapshot()).toThrow();
    // The healthy row and all messages remain untouched for recovery.
    expect(service.readMessages("chat-a")).toEqual(
      legacyStore().chatsById["chat-a"].messages,
    );
  });

  test("readMessages returns messages in ord order", () => {
    const service = makeService();
    service.init();
    const messages = [];
    for (let i = 0; i < 25; i += 1) {
      messages.push({ role: i % 2 ? "assistant" : "user", content: `m${i}` });
    }
    service.applyOps([{ type: "put_messages", chatId: "c1", messages }]);

    expect(service.readMessages("c1")).toEqual(messages);
    expect(service.readMessages("missing")).toEqual([]);
  });

  test("put_tree_meta upserts tree/activeChatId/updatedAt", () => {
    const service = makeService();
    service.init();
    service.applyOps([
      {
        type: "put_tree_meta",
        tree: { rootId: "r", nodesById: {} },
        activeChatId: "x",
        updatedAt: 111,
      },
    ]);
    service.applyOps([
      {
        type: "put_tree_meta",
        tree: { rootId: "r2", nodesById: {} },
        activeChatId: null,
        updatedAt: 222,
      },
    ]);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.tree).toEqual({ rootId: "r2", nodesById: {} });
    expect(snapshot.activeChatId).toBeNull();
    expect(snapshot.updatedAt).toBe(222);
    expect(snapshot.schemaVersion).toBe(3);
  });

  test("put_chat_meta inserts then updates a chat meta (never messages)", () => {
    const service = makeService();
    service.init();
    service.applyOps([
      { type: "put_chat_meta", chatId: "c1", meta: { id: "c1", title: "one" } },
    ]);
    service.applyOps([
      {
        type: "put_chat_meta",
        chatId: "c1",
        meta: { id: "c1", title: "one!", updatedAt: 5 },
      },
    ]);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.chatMetasById.c1).toEqual({
      id: "c1",
      title: "one!",
      updatedAt: 5,
    });
  });

  test("put_messages replaces the whole message set", () => {
    const service = makeService();
    service.init();
    service.applyOps([
      {
        type: "put_messages",
        chatId: "c1",
        messages: [{ content: "a" }, { content: "b" }, { content: "c" }],
      },
    ]);
    service.applyOps([
      { type: "put_messages", chatId: "c1", messages: [{ content: "only" }] },
    ]);

    expect(service.readMessages("c1")).toEqual([{ content: "only" }]);
  });

  test("delete_chats removes metas and messages", () => {
    const service = makeService();
    service.init();
    service.applyOps([{ type: "import_store", store: legacyStore() }]);
    service.applyOps([{ type: "delete_chats", chatIds: ["chat-a"] }]);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.chatMetasById["chat-a"]).toBeUndefined();
    expect(snapshot.chatMetasById["chat-b"]).toBeDefined();
    expect(service.readMessages("chat-a")).toEqual([]);
    expect(service.readMessages("chat-b")).toEqual([{ role: "user", content: "yo" }]);
  });

  test("applyOps is one transaction — a failing op mid-batch rolls back everything", () => {
    const service = makeService();
    service.init();

    expect(() =>
      service.applyOps([
        {
          type: "put_chat_meta",
          chatId: "c1",
          meta: { id: "c1", title: "doomed" },
        },
        { type: "put_messages", chatId: "c1", messages: [{ content: "gone" }] },
        { type: "definitely_not_an_op" },
      ]),
    ).toThrow(/definitely_not_an_op/);

    // nothing from the batch landed
    expect(service.getBootstrapSnapshot()).toBeNull();
    expect(service.readMessages("c1")).toEqual([]);

    // and the connection is still usable afterwards
    service.applyOps([
      { type: "put_chat_meta", chatId: "c2", meta: { id: "c2" } },
    ]);
    expect(service.getBootstrapSnapshot().chatMetasById.c2).toEqual({ id: "c2" });
  });

  test("guard survives restart and skips an older physical journal replay", () => {
    const first = makeService();
    first.init();
    const oldBatch = {
      guard: { epoch: "renderer-stale-replay", sequence: 1 },
      ops: [
        {
          type: "put_chat_meta",
          chatId: "guarded",
          meta: { id: "guarded", title: "Old title", updatedAt: 1 },
        },
      ],
    };
    const newerBatch = {
      guard: { epoch: "renderer-stale-replay", sequence: 2 },
      ops: [
        {
          type: "put_chat_meta",
          chatId: "guarded",
          meta: { id: "guarded", title: "New title", updatedAt: 2 },
        },
      ],
    };

    expect(first.applyOps(oldBatch)).toBe(true);
    expect(first.applyOps(newerBatch)).toBe(true);
    first.close();

    const restarted = makeService();
    restarted.init();
    expect(restarted.applyOps(oldBatch)).toBe(false);
    expect(restarted.getBootstrapSnapshot().chatMetasById.guarded).toMatchObject(
      {
        title: "New title",
        updatedAt: 2,
      },
    );
  });

  test("guard marker and ops roll back atomically on a failed transaction", () => {
    const service = makeService();
    service.init();
    const guard = { epoch: "renderer-atomic-rollback", sequence: 1 };

    expect(() =>
      service.applyOps({
        guard,
        ops: [
          {
            type: "put_chat_meta",
            chatId: "atomic",
            meta: { id: "atomic", title: "Must roll back" },
          },
          { type: "not_a_real_op" },
        ],
      }),
    ).toThrow(/not_a_real_op/);
    expect(service.getBootstrapSnapshot()).toBeNull();

    expect(
      service.applyOps({
        guard,
        ops: [
          {
            type: "put_chat_meta",
            chatId: "atomic",
            meta: { id: "atomic", title: "Committed retry" },
          },
        ],
      }),
    ).toBe(true);
    expect(service.getBootstrapSnapshot().chatMetasById.atomic.title).toBe(
      "Committed retry",
    );
  });

  test("writer lock failure rolls back cleanly and the batch can be retried", () => {
    const service = makeService();
    service.init();
    const blocker = new sqlite.DatabaseSync(path.join(dir, "chats.db"));
    blocker.exec("BEGIN IMMEDIATE");
    const ops = [
      { type: "put_chat_meta", chatId: "locked", meta: { id: "locked" } },
    ];

    try {
      expect(() => service.applyOps(ops)).toThrow(/locked/i);
      expect(service.getBootstrapSnapshot()).toBeNull();
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }

    expect(() => service.applyOps(ops)).not.toThrow();
    expect(service.getBootstrapSnapshot().chatMetasById.locked).toEqual({
      id: "locked",
    });
  });

  test("write(store) is the legacy-compat alias for import_store", () => {
    const service = makeService();
    service.init();
    service.write(legacyStore());

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.activeChatId).toBe("chat-a");
    expect(snapshot.activeChatMessages).toHaveLength(2);
  });

  test("import_store replaces prior contents (whole-store semantics)", () => {
    const service = makeService();
    service.init();
    service.applyOps([
      { type: "put_chat_meta", chatId: "stale", meta: { id: "stale" } },
      { type: "put_messages", chatId: "stale", messages: [{ content: "x" }] },
    ]);
    service.applyOps([{ type: "import_store", store: legacyStore() }]);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.chatMetasById.stale).toBeUndefined();
    expect(service.readMessages("stale")).toEqual([]);
  });

  test("invalid import_store is rejected before DELETE and preserves the DB", () => {
    const service = makeService();
    service.init();
    service.applyOps([{ type: "import_store", store: legacyStore() }]);
    const before = service.getBootstrapSnapshot();
    const beforeMessages = service.readMessages("chat-a");

    let importError;
    try {
      service.applyOps([{ type: "import_store", store: {} }]);
    } catch (error) {
      importError = error;
    }

    expect(importError).toMatchObject({
      code: "chat_legacy_source_invalid",
    });
    expect(service.getBootstrapSnapshot()).toEqual(before);
    expect(service.readMessages("chat-a")).toEqual(beforeMessages);
  });

  describe("import_store isGenerating derivation (legacy stranded streams)", () => {
    // Pre-V3 stores have no isGenerating meta field; if the app crashed
    // mid-stream, the last assistant message is stranded with
    // status:"streaming". Post-migration the renderer only ever sees []
    // placeholders for non-active chats, so import is the one place the
    // flag can still be derived from the full messages.
    const strandedStore = () => ({
      schemaVersion: 2,
      updatedAt: 1720000000000,
      activeChatId: "chat-done",
      lruChatIds: [],
      tree: {
        root: [],
        nodesById: {},
        selectedNodeId: null,
        expandedFolderIds: [],
      },
      ui: {},
      chatsById: {
        "chat-stranded": {
          id: "chat-stranded",
          title: "Crashed mid-stream",
          updatedAt: 1715000000000,
          stats: { messageCount: 2 },
          messages: [
            { role: "user", content: "go" },
            { role: "assistant", content: "half a rep", status: "streaming" },
          ],
        },
        "chat-done": {
          id: "chat-done",
          title: "Finished fine",
          updatedAt: 1716000000000,
          stats: { messageCount: 2 },
          messages: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "done reply", status: "done" },
          ],
        },
        "chat-explicit": {
          id: "chat-explicit",
          title: "V3 re-import",
          updatedAt: 1717000000000,
          isGenerating: false,
          stats: { messageCount: 1 },
          // pathological: explicit boolean must win over message scan
          messages: [
            { role: "assistant", content: "stale", status: "streaming" },
          ],
        },
      },
    });

    test("stranded streaming assistant → derived isGenerating true", () => {
      const service = makeService();
      service.init();
      service.applyOps([{ type: "import_store", store: strandedStore() }]);

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.chatMetasById["chat-stranded"].isGenerating).toBe(true);
    });

    test("done-status assistant → derived isGenerating false", () => {
      const service = makeService();
      service.init();
      service.applyOps([{ type: "import_store", store: strandedStore() }]);

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.chatMetasById["chat-done"].isGenerating).toBe(false);
    });

    test("explicit boolean isGenerating:false wins over a streaming message", () => {
      const service = makeService();
      service.init();
      service.applyOps([{ type: "import_store", store: strandedStore() }]);

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.chatMetasById["chat-explicit"].isGenerating).toBe(false);
    });
  });

  test("data persists across close + reopen", () => {
    const first = makeService();
    first.init();
    first.applyOps([{ type: "import_store", store: legacyStore() }]);
    first.close();

    const second = makeService();
    second.init();
    const snapshot = second.getBootstrapSnapshot();
    expect(snapshot.activeChatId).toBe("chat-a");
    expect(snapshot.activeChatMessages).toHaveLength(2);
  });

  describe("chats.json migration", () => {
    test("init migrates chats.json into the DB and renames it .migrated-bak", () => {
      fs.writeFileSync(
        path.join(dir, "chats.json"),
        JSON.stringify(legacyStore()),
        "utf8",
      );

      const service = makeService();
      service.init();

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.schemaVersion).toBe(3);
      expect(snapshot.activeChatId).toBe("chat-a");
      expect(Object.keys(snapshot.chatMetasById).sort()).toEqual([
        "chat-a",
        "chat-b",
      ]);
      expect(snapshot.activeChatMessages).toEqual(
        legacyStore().chatsById["chat-a"].messages,
      );

      expect(fs.existsSync(path.join(dir, "chats.json"))).toBe(false);
      expect(fs.existsSync(path.join(dir, "chats.json.migrated-bak"))).toBe(
        true,
      );
    });

    test("a real v1 chats.json remains migration-compatible", () => {
      const legacyPath = path.join(dir, "chats.json");
      const v1 = legacyV1Store();
      // Deliberately opposite to updatedAt order: migration must preserve the
      // user's explicit flat ordering rather than rebuilding newest-first.
      v1.chatOrder = ["chat-b", "chat-a", "chat-b", "missing-chat"];
      fs.writeFileSync(
        legacyPath,
        JSON.stringify(v1),
        "utf8",
      );

      const service = makeService();
      service.init();
      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.activeChatId).toBe("chat-a");
      expect(snapshot.chatMetasById["chat-b"].title).toBe("Beta");
      expect(snapshot.tree.root).toEqual(["chn-chat-b", "chn-chat-a"]);
      expect(snapshot.tree.selectedNodeId).toBe("chn-chat-a");
      expect(snapshot.tree.nodesById["chn-chat-b"]).toMatchObject({
        entity: "chat",
        chatId: "chat-b",
        label: "Beta",
      });
      expect(fs.existsSync(legacyPath)).toBe(false);
      expect(fs.existsSync(`${legacyPath}.migrated-bak`)).toBe(true);
    });

    test("a second init does not re-import (DB non-empty guard)", () => {
      fs.writeFileSync(
        path.join(dir, "chats.json"),
        JSON.stringify(legacyStore()),
        "utf8",
      );
      const first = makeService();
      first.init();
      first.close();

      // a new chats.json appearing later must NOT clobber the DB
      const impostor = { ...legacyStore(), activeChatId: "chat-b" };
      fs.writeFileSync(
        path.join(dir, "chats.json"),
        JSON.stringify(impostor),
        "utf8",
      );

      const second = makeService();
      second.init();
      const snapshot = second.getBootstrapSnapshot();
      expect(snapshot.activeChatId).toBe("chat-a");
      // untouched: not imported, not renamed
      expect(fs.existsSync(path.join(dir, "chats.json"))).toBe(true);
    });

    test("corrupt chats.json fails bootstrap closed and remains repairable", () => {
      const legacyPath = path.join(dir, "chats.json");
      const rawLegacy = "{ not json";
      fs.writeFileSync(legacyPath, rawLegacy, "utf8");
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      try {
        const service = makeService();
        expect(() => service.init()).not.toThrow();
        let bootstrapError;
        try {
          service.getBootstrapSnapshot();
        } catch (error) {
          bootstrapError = error;
        }
        expect(bootstrapError).toMatchObject({
          code: "chat_legacy_source_unreadable",
        });
        expect(bootstrapError.message).toMatch(/source left untouched/i);
        expect(fs.readFileSync(legacyPath, "utf8")).toBe(rawLegacy);
        expect(fs.existsSync(`${legacyPath}.migrated-bak`)).toBe(false);

        const rawDb = new sqlite.DatabaseSync(path.join(dir, "chats.db"));
        try {
          expect(
            rawDb.prepare("SELECT COUNT(*) AS n FROM chats").get().n,
          ).toBe(0);
          expect(
            rawDb.prepare("SELECT COUNT(*) AS n FROM meta").get().n,
          ).toBe(0);
        } finally {
          rawDb.close();
        }
        expect(warnSpy).toHaveBeenCalled();

        // A repaired source must still migrate on the next launch. This is the
        // regression for renderer seeding making the non-empty guard permanent.
        service.close();
        fs.writeFileSync(legacyPath, JSON.stringify(legacyStore()), "utf8");
        const recovered = makeService();
        recovered.init();
        expect(recovered.getBootstrapSnapshot().activeChatId).toBe("chat-a");
        expect(fs.existsSync(legacyPath)).toBe(false);
        expect(fs.existsSync(`${legacyPath}.migrated-bak`)).toBe(true);
      } finally {
        warnSpy.mockRestore();
      }
    });

    test.each([
      ["array", []],
      ["empty object", {}],
    ])(
      "parseable but invalid chats.json (%s) leaves source and DB untouched",
      (_label, invalidLegacy) => {
        const legacyPath = path.join(dir, "chats.json");
        const rawLegacy = JSON.stringify(invalidLegacy);
        fs.writeFileSync(legacyPath, rawLegacy, "utf8");
        const warnSpy = jest
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        try {
          const service = makeService();
          expect(() => service.init()).not.toThrow();
          let bootstrapError;
          try {
            service.getBootstrapSnapshot();
          } catch (error) {
            bootstrapError = error;
          }
          expect(bootstrapError).toMatchObject({
            code: "chat_legacy_source_invalid",
          });
          expect(fs.readFileSync(legacyPath, "utf8")).toBe(rawLegacy);
          expect(fs.existsSync(`${legacyPath}.migrated-bak`)).toBe(false);

          const rawDb = new sqlite.DatabaseSync(path.join(dir, "chats.db"));
          try {
            expect(
              rawDb.prepare("SELECT COUNT(*) AS n FROM chats").get().n,
            ).toBe(0);
            expect(
              rawDb.prepare("SELECT COUNT(*) AS n FROM meta").get().n,
            ).toBe(0);
          } finally {
            rawDb.close();
          }
          expect(warnSpy).toHaveBeenCalled();
        } finally {
          warnSpy.mockRestore();
        }
      },
    );
  });

  test("applyOps rejects non-array input and refuses to run before init", () => {
    const service = makeService();
    expect(() => service.applyOps([])).toThrow(/init/);
    service.init();
    expect(() => service.applyOps("nope")).toThrow(/array/i);
  });
});
