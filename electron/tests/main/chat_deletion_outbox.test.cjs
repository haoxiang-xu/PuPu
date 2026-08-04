const path = require("path");
const os = require("os");
const fs = require("fs");

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
const { createMemoryVaultService } = require(
  "../../main/services/memory_vault/service",
);

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-chat-deletion-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

const waitFor = async (predicate, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for deletion outbox");
};

describeIfSqlite("chat deletion outbox", () => {
  let dir;
  let services;
  let warnSpy;

  const makeService = () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      path,
      sqlite,
    });
    service.init();
    services.push(service);
    return service;
  };

  const makeVault = () => {
    const service = createMemoryVaultService({
      app: fakeApp(dir),
      path,
      sqlite,
      platform: "darwin",
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (plaintext) => {
          const input = Buffer.from(plaintext, "utf8");
          const output = Buffer.alloc(input.length + 4);
          Buffer.from("ENC:").copy(output);
          for (let index = 0; index < input.length; index += 1) {
            output[index + 4] = input[index] ^ 0x5a;
          }
          return output;
        },
      },
    });
    service.init();
    services.push(service);
    return service;
  };

  const openRawDb = () => new sqlite.DatabaseSync(path.join(dir, "chats.db"));

  const readOutbox = (chatId) => {
    const raw = openRawDb();
    try {
      return raw
        .prepare(
          "SELECT * FROM chat_deletion_outbox WHERE owner_chat_id = ? " +
            "ORDER BY created_at DESC LIMIT 1",
        )
        .get(chatId);
    } finally {
      raw.close();
    }
  };

  const makeTargets = ({
    contextDelete,
    deleteUseState,
    listDescriptors,
    deleteSecret,
  } = {}) => ({
    unchainService: {
      deleteContextV2Chat:
        contextDelete ||
        jest.fn(async ({ ownerChatId }) => ({
          owner_chat_id: ownerChatId,
          deleted: true,
        })),
    },
    memoryVaultService: {
      deleteUseStateForOwnerChat:
        deleteUseState ||
        jest.fn((ownerChatId) => ({
          ok: true,
          ownerChatId,
          deletedIntents: 0,
          deletedReceipts: 0,
        })),
      listDescriptors:
        listDescriptors || jest.fn(() => ({ ok: true, descriptors: [] })),
      deleteSecret:
        deleteSecret ||
        jest.fn(({ handle }) => ({ ok: true, handle, deleted: true })),
    },
  });

  beforeEach(() => {
    dir = makeTempDir();
    services = [];
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const service of services) {
      try {
        service.close();
      } catch (_error) {
        // already closed
      }
    }
    warnSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("chat rows and the cleanup request commit in one transaction", () => {
    const service = makeService();
    service.applyOps([
      { type: "put_chat_meta", chatId: "chat-atomic", meta: { id: "chat-atomic" } },
      {
        type: "put_messages",
        chatId: "chat-atomic",
        messages: [{ role: "user", content: "delete me" }],
      },
    ]);

    service.applyOps([{ type: "delete_chats", chatIds: ["chat-atomic"] }]);

    expect(service.readMessages("chat-atomic")).toEqual([]);
    expect(service.getBootstrapSnapshot()).toBeNull();
    expect(readOutbox("chat-atomic")).toMatchObject({
      owner_chat_id: "chat-atomic",
      context_done: 0,
      vault_done: 0,
      status: "pending",
      retry_count: 0,
    });
  });

  test("a later failure rolls back both the local delete and its outbox row", () => {
    const service = makeService();
    service.applyOps([
      { type: "put_chat_meta", chatId: "chat-rollback", meta: { id: "chat-rollback" } },
      {
        type: "put_messages",
        chatId: "chat-rollback",
        messages: [{ content: "survives" }],
      },
    ]);

    expect(() =>
      service.applyOps([
        { type: "delete_chats", chatIds: ["chat-rollback"] },
        { type: "not_a_real_op" },
      ]),
    ).toThrow(/not_a_real_op/);

    expect(service.readMessages("chat-rollback")).toEqual([
      { content: "survives" },
    ]);
    expect(readOutbox("chat-rollback")).toBeUndefined();
  });

  // A whole-store import silently deletes every chat the incoming store does
  // not carry. Those deletions must reach the SAME durable cleanup path as an
  // explicit delete_chats op — otherwise an import strands Context V2 sessions
  // and Vault secrets with no record that they should have been removed.
  describe("import_store deletions drain like any other deletion", () => {
    const importStore = (chatIds) => ({
      schemaVersion: 2,
      updatedAt: 1720000000000,
      activeChatId: chatIds[0],
      lruChatIds: [...chatIds],
      tree: {
        root: chatIds.map((chatId) => `node-${chatId}`),
        nodesById: Object.fromEntries(
          chatIds.map((chatId) => [
            `node-${chatId}`,
            { id: `node-${chatId}`, entity: "chat", chatId },
          ]),
        ),
        selectedNodeId: `node-${chatIds[0]}`,
        expandedFolderIds: [],
      },
      chatsById: Object.fromEntries(
        chatIds.map((chatId) => [
          chatId,
          {
            id: chatId,
            title: chatId,
            updatedAt: 1720000000000,
            messages: [{ role: "user", content: "hi" }],
          },
        ]),
      ),
    });

    test("a chat dropped by an import is cleaned up in Context V2 and the Vault", async () => {
      const service = makeService();
      const contextDelete = jest.fn(async ({ ownerChatId }) => ({
        owner_chat_id: ownerChatId,
        deleted: true,
      }));
      const deleteUseState = jest.fn((ownerChatId) => ({
        ok: true,
        ownerChatId,
        deletedIntents: 0,
        deletedReceipts: 0,
      }));
      service.configureDeletionTargets(
        makeTargets({ contextDelete, deleteUseState }),
      );

      service.applyOps([
        { type: "import_store", store: importStore(["chat-keep", "chat-drop"]) },
      ]);
      // The import drops chat-drop. No delete_chats op is involved at all.
      service.applyOps([
        { type: "import_store", store: importStore(["chat-keep"]) },
      ]);

      expect(readOutbox("chat-drop")).toMatchObject({
        owner_chat_id: "chat-drop",
        status: "pending",
        context_done: 0,
        vault_done: 0,
      });
      // The retained chat is never queued.
      expect(readOutbox("chat-keep")).toBeUndefined();

      await expect(service.processDeletionOutboxOnce()).resolves.toMatchObject({
        processed: true,
      });

      expect(contextDelete).toHaveBeenCalledTimes(1);
      expect(contextDelete.mock.calls[0][0]).toMatchObject({
        ownerChatId: "chat-drop",
      });
      expect(deleteUseState).toHaveBeenCalledWith("chat-drop");
      expect(readOutbox("chat-drop")).toMatchObject({ status: "complete" });
    });

    test("an import-queued deletion retries with one stable operation id when the sidecar is down", async () => {
      const service = makeService();
      const contextDelete = jest.fn(async () => {
        throw new Error("sidecar offline");
      });
      service.configureDeletionTargets(makeTargets({ contextDelete }));

      service.applyOps([
        { type: "import_store", store: importStore(["chat-keep", "chat-drop"]) },
      ]);
      service.applyOps([
        { type: "import_store", store: importStore(["chat-keep"]) },
      ]);

      await service.processDeletionOutboxOnce();
      const afterFirst = readOutbox("chat-drop");
      expect(afterFirst).toMatchObject({ status: "retry" });

      await waitFor(() => Date.now() >= Number(afterFirst.next_attempt_at));
      await service.processDeletionOutboxOnce();
      const afterSecond = readOutbox("chat-drop");

      // Same durable operation id across attempts: the retry is idempotent
      // upstream, not a second delete request.
      expect(afterSecond.operation_id).toBe(afterFirst.operation_id);
      expect(Number(afterSecond.retry_count)).toBeGreaterThan(
        Number(afterFirst.retry_count),
      );
      // The local rows are gone regardless — the sidecar never blocks the
      // user-visible delete.
      expect(service.readMessages("chat-drop")).toEqual([]);
    });
  });

  test("the worker completes Context V2 then deletes only chat-scoped Vault handles", async () => {
    const service = makeService();
    const handleA = `pvh1_${"a".repeat(64)}`;
    const handleB = `pvh1_${"b".repeat(64)}`;
    const order = [];
    const contextDelete = jest.fn(async ({ ownerChatId }) => {
      order.push("context");
      return {
        owner_chat_id: ownerChatId,
        deleted: true,
      };
    });
    const deleteUseState = jest.fn((ownerChatId) => {
      order.push("vault-use-state");
      return {
        ok: true,
        ownerChatId,
        deletedIntents: 2,
        deletedReceipts: 1,
      };
    });
    const listDescriptors = jest.fn(() => {
      order.push("vault-list");
      return {
        ok: true,
        descriptors: [{ handle: handleA }, { handle: handleB }],
      };
    });
    const deleteSecret = jest.fn(({ handle }) => {
      order.push(`vault-delete:${handle}`);
      return {
        ok: true,
        handle,
        deleted: true,
      };
    });
    service.configureDeletionTargets(
      makeTargets({
        contextDelete,
        deleteUseState,
        listDescriptors,
        deleteSecret,
      }),
    );
    service.applyOps([{ type: "delete_chats", chatIds: ["chat-cleanup"] }]);

    await expect(service.processDeletionOutboxOnce()).resolves.toMatchObject({
      processed: true,
      completed: true,
    });

    const row = readOutbox("chat-cleanup");
    expect(row).toMatchObject({
      context_done: 1,
      vault_done: 1,
      status: "complete",
      retry_count: 0,
      last_error_code: null,
    });
    expect(contextDelete).toHaveBeenCalledWith({
      ownerChatId: "chat-cleanup",
      operationId: row.operation_id,
    });
    expect(deleteUseState).toHaveBeenCalledWith("chat-cleanup");
    expect(listDescriptors).toHaveBeenCalledWith({
      scopeKind: "chat",
      scopeId: "chat-cleanup",
    });
    expect(deleteSecret).toHaveBeenCalledTimes(2);
    for (const [payload] of deleteSecret.mock.calls) {
      expect(payload.operationId).toMatch(/^vaultdel_[0-9a-f]{64}$/);
      expect([handleA, handleB]).toContain(payload.handle);
    }
    expect(order).toEqual([
      "context",
      "vault-use-state",
      "vault-list",
      `vault-delete:${handleA}`,
      `vault-delete:${handleB}`,
    ]);
  });

  test("real Vault integration removes the exact chat scope and preserves user scope", async () => {
    const service = makeService();
    const vault = makeVault();
    const deleteUseState = jest.spyOn(vault, "deleteUseStateForOwnerChat");
    vault.deposit({
      operationId: "deposit-chat-delete-0001",
      scopeKind: "chat",
      scopeId: "chat-real-vault",
      label: "chat secret",
      plaintext: "chat-only-secret",
    });
    vault.deposit({
      operationId: "deposit-user-keep-0001",
      scopeKind: "user",
      scopeId: "local-user",
      label: "user secret",
      plaintext: "user-global-secret",
    });
    service.configureDeletionTargets({
      unchainService: makeTargets().unchainService,
      memoryVaultService: vault,
    });
    service.applyOps([
      { type: "delete_chats", chatIds: ["chat-real-vault"] },
    ]);

    await service.processDeletionOutboxOnce();

    expect(deleteUseState).toHaveBeenCalledWith("chat-real-vault");
    expect(
      vault.listDescriptors({
        scopeKind: "chat",
        scopeId: "chat-real-vault",
      }).descriptors,
    ).toEqual([]);
    expect(
      vault.listDescriptors({
        scopeKind: "user",
        scopeId: "local-user",
      }).descriptors,
    ).toHaveLength(1);
    expect(readOutbox("chat-real-vault").status).toBe("complete");
  });

  test("sidecar offline never blocks local delete acknowledgement and retries with one operation id", async () => {
    const service = makeService();
    const contextDelete = jest
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockImplementationOnce(async ({ ownerChatId }) => ({
        owner_chat_id: ownerChatId,
        deleted: true,
      }));
    const targets = makeTargets({ contextDelete });
    service.configureDeletionTargets(targets);

    expect(() =>
      service.applyOps([{ type: "delete_chats", chatIds: ["chat-offline"] }]),
    ).not.toThrow();
    expect(service.readMessages("chat-offline")).toEqual([]);

    const first = await service.processDeletionOutboxOnce();
    const retryRow = readOutbox("chat-offline");
    expect(first).toMatchObject({
      completed: false,
      errorCode: "context_delete_failed",
    });
    expect(retryRow).toMatchObject({
      status: "retry",
      retry_count: 1,
      last_error_code: "context_delete_failed",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[chat-deletion-outbox] context_delete_failed",
    );
    expect(JSON.stringify(retryRow)).not.toContain("connection refused");
    expect(targets.memoryVaultService.listDescriptors).not.toHaveBeenCalled();

    const raw = openRawDb();
    try {
      raw
        .prepare(
          "UPDATE chat_deletion_outbox SET next_attempt_at = 0 " +
            "WHERE owner_chat_id = ?",
        )
        .run("chat-offline");
    } finally {
      raw.close();
    }

    await expect(service.processDeletionOutboxOnce()).resolves.toMatchObject({
      completed: true,
    });
    expect(contextDelete).toHaveBeenCalledTimes(2);
    expect(contextDelete.mock.calls[0][0].operationId).toBe(
      contextDelete.mock.calls[1][0].operationId,
    );
  });

  test("Vault use-state cleanup failure retries before secret enumeration", async () => {
    const service = makeService();
    const contextDelete = jest.fn(async ({ ownerChatId }) => ({
      owner_chat_id: ownerChatId,
      deleted: true,
    }));
    const deleteUseState = jest
      .fn()
      .mockImplementationOnce(() => {
        const error = new Error("active Vault use must finish first");
        error.code = "vault_use_cleanup_in_progress";
        throw error;
      })
      .mockImplementationOnce((ownerChatId) => ({
        ok: true,
        ownerChatId,
        deletedIntents: 1,
        deletedReceipts: 0,
      }));
    const listDescriptors = jest.fn(() => ({ ok: true, descriptors: [] }));
    service.configureDeletionTargets(
      makeTargets({ contextDelete, deleteUseState, listDescriptors }),
    );
    service.applyOps([
      { type: "delete_chats", chatIds: ["chat-use-state-retry"] },
    ]);

    const first = await service.processDeletionOutboxOnce();
    const retryRow = readOutbox("chat-use-state-retry");
    expect(first).toMatchObject({
      processed: true,
      completed: false,
      errorCode: "vault_use_state_delete_failed",
    });
    expect(retryRow).toMatchObject({
      context_done: 1,
      vault_done: 0,
      status: "retry",
      retry_count: 1,
      last_error_code: "vault_use_state_delete_failed",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[chat-deletion-outbox] vault_use_state_delete_failed",
    );
    expect(JSON.stringify(retryRow)).not.toContain(
      "active Vault use must finish first",
    );
    expect(listDescriptors).not.toHaveBeenCalled();

    const raw = openRawDb();
    try {
      raw
        .prepare(
          "UPDATE chat_deletion_outbox SET next_attempt_at = 0 " +
            "WHERE owner_chat_id = ?",
        )
        .run("chat-use-state-retry");
    } finally {
      raw.close();
    }

    await expect(service.processDeletionOutboxOnce()).resolves.toMatchObject({
      processed: true,
      completed: true,
    });
    expect(contextDelete).toHaveBeenCalledTimes(1);
    expect(deleteUseState).toHaveBeenCalledTimes(2);
    expect(deleteUseState).toHaveBeenLastCalledWith("chat-use-state-retry");
    expect(listDescriptors).toHaveBeenCalledTimes(1);
  });

  test("invalid Vault use-state receipts fail closed with the stable retry code", async () => {
    const service = makeService();
    const deleteUseState = jest.fn(() => ({
      ok: true,
      ownerChatId: "chat-wrong-owner",
      deletedIntents: "1",
      deletedReceipts: -1,
    }));
    const listDescriptors = jest.fn(() => ({ ok: true, descriptors: [] }));
    service.configureDeletionTargets(
      makeTargets({ deleteUseState, listDescriptors }),
    );
    service.applyOps([
      { type: "delete_chats", chatIds: ["chat-invalid-use-state"] },
    ]);

    await expect(service.processDeletionOutboxOnce()).resolves.toMatchObject({
      processed: true,
      completed: false,
      errorCode: "vault_use_state_delete_failed",
    });
    expect(readOutbox("chat-invalid-use-state")).toMatchObject({
      context_done: 1,
      vault_done: 0,
      status: "retry",
      last_error_code: "vault_use_state_delete_failed",
    });
    expect(listDescriptors).not.toHaveBeenCalled();
  });

  test("retry delay grows exponentially and is capped", async () => {
    const service = makeService();
    const contextDelete = jest.fn(async () => {
      throw new Error("offline");
    });
    service.configureDeletionTargets(makeTargets({ contextDelete }));
    service.applyOps([{ type: "delete_chats", chatIds: ["chat-backoff"] }]);

    const delays = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await service.processDeletionOutboxOnce();
      const row = readOutbox("chat-backoff");
      delays.push(Number(row.next_attempt_at) - Number(row.updated_at));
      const raw = openRawDb();
      try {
        raw
          .prepare(
            "UPDATE chat_deletion_outbox SET next_attempt_at = 0 " +
              "WHERE owner_chat_id = ?",
          )
          .run("chat-backoff");
      } finally {
        raw.close();
      }
    }

    expect(delays.slice(0, 5)).toEqual([250, 500, 1000, 2000, 4000]);
    expect(delays[delays.length - 1]).toBe(60000);
    expect(Math.max(...delays)).toBe(60000);
  });

  test("restart resumes persisted progress instead of repeating a completed Context delete", async () => {
    const first = makeService();
    const firstContextDelete = jest.fn(async ({ ownerChatId }) => ({
      owner_chat_id: ownerChatId,
      deleted: true,
    }));
    const firstDeleteUseState = jest.fn((ownerChatId) => ({
      ok: true,
      ownerChatId,
      deletedIntents: 1,
      deletedReceipts: 1,
    }));
    first.configureDeletionTargets(
      makeTargets({
        contextDelete: firstContextDelete,
        deleteUseState: firstDeleteUseState,
        listDescriptors: jest.fn(() => {
          throw new Error("vault temporarily unavailable");
        }),
      }),
    );
    first.applyOps([{ type: "delete_chats", chatIds: ["chat-restart"] }]);
    await first.processDeletionOutboxOnce();
    expect(readOutbox("chat-restart")).toMatchObject({
      context_done: 1,
      vault_done: 0,
      status: "retry",
    });
    expect(firstDeleteUseState).toHaveBeenCalledWith("chat-restart");
    first.close();

    const raw = openRawDb();
    try {
      raw
        .prepare(
          "UPDATE chat_deletion_outbox SET next_attempt_at = 0 " +
            "WHERE owner_chat_id = ?",
        )
        .run("chat-restart");
    } finally {
      raw.close();
    }

    const restarted = makeService();
    const restartedContextDelete = jest.fn(async ({ ownerChatId }) => ({
      owner_chat_id: ownerChatId,
      deleted: true,
    }));
    const restartedDeleteUseState = jest.fn((ownerChatId) => ({
      ok: true,
      ownerChatId,
      deletedIntents: 0,
      deletedReceipts: 0,
    }));
    restarted.configureDeletionTargets(
      makeTargets({
        contextDelete: restartedContextDelete,
        deleteUseState: restartedDeleteUseState,
      }),
    );
    await restarted.processDeletionOutboxOnce();

    expect(firstContextDelete).toHaveBeenCalledTimes(1);
    expect(restartedContextDelete).not.toHaveBeenCalled();
    expect(firstDeleteUseState).toHaveBeenCalledTimes(1);
    expect(restartedDeleteUseState).toHaveBeenCalledWith("chat-restart");
    expect(readOutbox("chat-restart")).toMatchObject({
      context_done: 1,
      vault_done: 1,
      status: "complete",
    });
  });

  test("Vault retries use a stable operation id for each handle", async () => {
    const service = makeService();
    const handleA = `pvh1_${"c".repeat(64)}`;
    const handleB = `pvh1_${"d".repeat(64)}`;
    const listDescriptors = jest.fn(() => ({
      ok: true,
      descriptors: [{ handle: handleA }, { handle: handleB }],
    }));
    let failSecond = true;
    const deleteSecret = jest.fn(({ handle }) => {
      if (handle === handleB && failSecond) {
        failSecond = false;
        throw new Error("temporary delete failure");
      }
      return { ok: true, handle, deleted: true };
    });
    const targets = makeTargets({ listDescriptors, deleteSecret });
    service.configureDeletionTargets(targets);
    service.applyOps([{ type: "delete_chats", chatIds: ["chat-vault-retry"] }]);

    await service.processDeletionOutboxOnce();
    const raw = openRawDb();
    try {
      raw
        .prepare(
          "UPDATE chat_deletion_outbox SET next_attempt_at = 0 " +
            "WHERE owner_chat_id = ?",
        )
        .run("chat-vault-retry");
    } finally {
      raw.close();
    }
    await service.processDeletionOutboxOnce();

    const callsForA = deleteSecret.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.handle === handleA);
    const callsForB = deleteSecret.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.handle === handleB);
    expect(callsForA).toHaveLength(2);
    expect(callsForB).toHaveLength(2);
    expect(callsForA[0].operationId).toBe(callsForA[1].operationId);
    expect(callsForB[0].operationId).toBe(callsForB[1].operationId);
    expect(callsForA[0].operationId).not.toBe(callsForB[0].operationId);
    expect(
      targets.memoryVaultService.deleteUseStateForOwnerChat,
    ).toHaveBeenCalledTimes(2);
    expect(readOutbox("chat-vault-retry").status).toBe("complete");
  });

  test("pending deletion rejects chat id reuse until both stores are complete", async () => {
    const service = makeService();
    service.configureDeletionTargets(makeTargets());
    service.applyOps([{ type: "delete_chats", chatIds: ["chat-reuse"] }]);

    let pendingError;
    try {
      service.applyOps([
        {
          type: "put_chat_meta",
          chatId: "chat-reuse",
          meta: { id: "chat-reuse" },
        },
      ]);
    } catch (error) {
      pendingError = error;
    }
    expect(pendingError).toMatchObject({ code: "chat_deletion_pending" });

    await service.processDeletionOutboxOnce();
    expect(() =>
      service.applyOps([
        {
          type: "put_chat_meta",
          chatId: "chat-reuse",
          meta: { id: "chat-reuse", title: "new incarnation" },
        },
      ]),
    ).not.toThrow();
  });

  test("background runner drains a durable row after process restart", async () => {
    const first = makeService();
    first.applyOps([{ type: "delete_chats", chatIds: ["chat-background"] }]);
    first.close();

    const restarted = makeService();
    const contextDelete = jest.fn(async ({ ownerChatId }) => ({
      owner_chat_id: ownerChatId,
      deleted: true,
    }));
    restarted.configureDeletionTargets(makeTargets({ contextDelete }));
    restarted.startDeletionOutboxRunner();

    await waitFor(() => readOutbox("chat-background")?.status === "complete");
    expect(contextDelete).toHaveBeenCalledTimes(1);
    restarted.stopDeletionOutboxRunner();
  });

  test("main wires deletion targets privately and owns runner lifecycle", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../main/index.js"),
      "utf8",
    );
    const handlers = fs.readFileSync(
      path.join(
        __dirname,
        "../../main/services/chat_storage/register_handlers.js",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /chatStorageService\.configureDeletionTargets\(\{[\s\S]*?unchainService,[\s\S]*?memoryVaultService,[\s\S]*?\}\)/,
    );
    expect(source).toMatch(/chatStorageService\.startDeletionOutboxRunner\(\)/);
    expect(source).toMatch(/chatStorageService\.stopDeletionOutboxRunner\(\)/);
    expect(handlers).not.toMatch(
      /configureDeletionTargets|deleteUseStateForOwnerChat|processDeletionOutboxOnce|DeletionOutboxRunner/,
    );
  });

  test("configuration requires the private Vault use-state deletion hook", () => {
    const service = makeService();
    const targets = makeTargets();
    delete targets.memoryVaultService.deleteUseStateForOwnerChat;

    expect(() => service.configureDeletionTargets(targets)).toThrow(
      "configureDeletionTargets: missing dependencies",
    );
  });

  test("completed receipts are retained with a fixed upper bound", async () => {
    const service = makeService();
    service.configureDeletionTargets(makeTargets());

    for (let index = 0; index < 260; index += 1) {
      service.applyOps([
        { type: "delete_chats", chatIds: [`chat-receipt-${index}`] },
      ]);
      await service.processDeletionOutboxOnce();
    }

    const raw = openRawDb();
    try {
      const row = raw
        .prepare(
          "SELECT COUNT(*) AS count FROM chat_deletion_outbox " +
            "WHERE status = 'complete'",
        )
        .get();
      expect(Number(row.count)).toBe(256);
    } finally {
      raw.close();
    }
  });
});
