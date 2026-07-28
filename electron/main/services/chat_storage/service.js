// Chat storage V3 — main-process authority on SQLite (userData/chats.db, WAL).
// Spec: docs/superpowers/specs/2026-07-10-chat-storage-sqlite-main-authority.md
// (§2 schema and §3 ops protocol are frozen one-way doors).

const { createChatDb } = require("./db");

const DB_FILE_NAME = "chats.db";
const LEGACY_FILE_NAME = "chats.json";
const MIGRATED_SUFFIX = ".migrated-bak";
const SCHEMA_VERSION = 3;
const INVALID_LEGACY_CHAT_STORE_CODE = "chat_legacy_source_invalid";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id         TEXT PRIMARY KEY,
  meta       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  chat_id TEXT NOT NULL,
  ord     INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (chat_id, ord)
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

CREATE TABLE IF NOT EXISTS renderer_write_guards (
  epoch        TEXT PRIMARY KEY,
  max_sequence INTEGER NOT NULL
);
`;

const toJson = (value) => JSON.stringify(value === undefined ? null : value);
const MAX_WRITE_GUARD_EPOCH_CHARS = 128;

const normalizeWriteBatch = (payload) => {
  if (Array.isArray(payload)) {
    return { guard: null, ops: payload };
  }
  const epoch = payload?.guard?.epoch;
  const sequence = payload?.guard?.sequence;
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.ops) ||
    payload.ops.length === 0 ||
    typeof epoch !== "string" ||
    !epoch ||
    epoch.length > MAX_WRITE_GUARD_EPOCH_CHARS ||
    epoch.trim() !== epoch ||
    !Number.isSafeInteger(sequence) ||
    sequence <= 0
  ) {
    throw new Error(
      "applyOps: payload must be an ops array or a valid guarded batch",
    );
  }
  return {
    guard: { epoch, sequence },
    ops: payload.ops,
  };
};

const invalidLegacyChatStore = () => {
  const error = new Error(
    "Legacy chat store has an invalid or unsupported structure; source left untouched",
  );
  error.code = INVALID_LEGACY_CHAT_STORE_CODE;
  return error;
};

const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertRecognizableLegacyChatStore = (store) => {
  if (
    !isPlainObject(store) ||
    (store.schemaVersion !== 1 && store.schemaVersion !== 2) ||
    !Number.isFinite(store.updatedAt) ||
    !isPlainObject(store.chatsById)
  ) {
    throw invalidLegacyChatStore();
  }

  const chatEntries = Object.entries(store.chatsById);
  if (chatEntries.length === 0) {
    throw invalidLegacyChatStore();
  }
  for (const [chatId, chat] of chatEntries) {
    if (
      !chatId ||
      !isPlainObject(chat) ||
      chat.id !== chatId ||
      !Array.isArray(chat.messages)
    ) {
      throw invalidLegacyChatStore();
    }
  }

  if (
    typeof store.activeChatId !== "string" ||
    !Object.prototype.hasOwnProperty.call(
      store.chatsById,
      store.activeChatId,
    )
  ) {
    throw invalidLegacyChatStore();
  }

  if (store.schemaVersion === 1) {
    if (!Array.isArray(store.chatOrder)) {
      throw invalidLegacyChatStore();
    }
    return store;
  }

  if (
    !Array.isArray(store.lruChatIds) ||
    !isPlainObject(store.tree) ||
    !Array.isArray(store.tree.root) ||
    !isPlainObject(store.tree.nodesById)
  ) {
    throw invalidLegacyChatStore();
  }
  return store;
};

// V1 persisted a flat `chatOrder` instead of the explorer tree. The main
// process upgrades legacy files before the renderer sees them, so preserve
// that order here; writing `tree: null` would make renderer normalization
// rebuild the list by updatedAt and permanently change the user's ordering.
const buildLegacyV1Tree = (store) => {
  const chatsById = store.chatsById;
  const orderedChatIds = [];
  const seen = new Set();
  const appendChatId = (chatId) => {
    if (
      typeof chatId !== "string" ||
      seen.has(chatId) ||
      !Object.prototype.hasOwnProperty.call(chatsById, chatId)
    ) {
      return;
    }
    seen.add(chatId);
    orderedChatIds.push(chatId);
  };

  for (const chatId of store.chatOrder) appendChatId(chatId);
  for (const chatId of Object.keys(chatsById).sort(
    (left, right) =>
      Number(chatsById[right]?.updatedAt || 0) -
      Number(chatsById[left]?.updatedAt || 0),
  )) {
    appendChatId(chatId);
  }

  const nodesById = {};
  const root = orderedChatIds.map((chatId) => {
    const nodeId = `chn-${chatId}`;
    const chat = chatsById[chatId];
    const stamp = Number.isFinite(Number(chat.updatedAt))
      ? Number(chat.updatedAt)
      : store.updatedAt;
    nodesById[nodeId] = {
      id: nodeId,
      entity: "chat",
      type: "file",
      chatId,
      label: typeof chat.title === "string" ? chat.title : "New Chat",
      createdAt: stamp,
      updatedAt: stamp,
    };
    return nodeId;
  });
  const selectedNodeId =
    root.find(
      (nodeId) => nodesById[nodeId].chatId === store.activeChatId,
    ) ||
    root[0] ||
    null;

  return {
    root,
    nodesById,
    selectedNodeId,
    expandedFolderIds: [],
  };
};

const createChatStorageService = ({ app, fs, path, sqlite } = {}) => {
  if (!app || !fs || !path || !sqlite) {
    throw new Error("createChatStorageService: missing dependencies");
  }

  let db = null;
  let legacyFilePath = null;
  let legacyMigrationError = null;

  const requireDb = () => {
    if (!db) {
      throw new Error("chat storage service used before init()");
    }
    return db;
  };

  // ---- primitive writers (always called inside a transaction) -------------

  const upsertMeta = (key, value) => {
    requireDb()
      .prepare(
        "INSERT INTO meta(key, value) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, toJson(value));
  };

  const upsertChatMeta = (chatId, meta) => {
    const { messages: _dropped, ...metaOnly } = meta || {};
    const updatedAt = Number(metaOnly.updatedAt) || 0;
    requireDb()
      .prepare(
        "INSERT INTO chats(id, meta, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET meta = excluded.meta, " +
          "updated_at = excluded.updated_at",
      )
      .run(chatId, toJson(metaOnly), updatedAt);
  };

  const replaceMessages = (chatId, messages) => {
    requireDb().prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
    const insert = requireDb().prepare(
      "INSERT INTO messages(chat_id, ord, payload) VALUES (?, ?, ?)",
    );
    const list = Array.isArray(messages) ? messages : [];
    for (let ord = 0; ord < list.length; ord += 1) {
      insert.run(chatId, ord, toJson(list[ord]));
    }
  };

  const deleteChat = (chatId) => {
    requireDb().prepare("DELETE FROM chats WHERE id = ?").run(chatId);
    requireDb().prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
  };

  // ---- ops protocol (spec §3, frozen) --------------------------------------

  const applyPutTreeMeta = (op) => {
    upsertMeta("schemaVersion", SCHEMA_VERSION);
    upsertMeta("updatedAt", op.updatedAt);
    upsertMeta("activeChatId", op.activeChatId);
    upsertMeta("tree", op.tree);
  };

  const applyPutChatMeta = (op) => {
    if (!op.chatId) throw new Error("put_chat_meta: missing chatId");
    upsertChatMeta(op.chatId, op.meta);
  };

  const applyPutMessages = (op) => {
    if (!op.chatId) throw new Error("put_messages: missing chatId");
    replaceMessages(op.chatId, op.messages);
  };

  const applyDeleteChats = (op) => {
    const chatIds = Array.isArray(op.chatIds) ? op.chatIds : [];
    for (const chatId of chatIds) {
      deleteChat(chatId);
    }
  };

  // Legacy pre-V3 stores can strand an assistant message with
  // status:"streaming" (app crashed mid-stream) and their metas have no
  // isGenerating field. Post-migration the renderer only sees [] message
  // placeholders for non-active chats, so it can never derive the flag —
  // import is the one place that still holds the full messages.
  const deriveIsGenerating = (messages) =>
    Array.isArray(messages) &&
    messages.some(
      (m) => m && m.role === "assistant" && m.status === "streaming",
    );

  const applyImportStore = (op) => {
    // Validate before the first DELETE. Whole-store import is destructive and
    // normalize-on-read must never turn {} / [] into a replacement seed chat.
    const store = assertRecognizableLegacyChatStore(op.store);
    // Whole-store semantics (legacy WRITE equivalent): replace everything.
    requireDb().prepare("DELETE FROM messages").run();
    requireDb().prepare("DELETE FROM chats").run();
    upsertMeta("schemaVersion", SCHEMA_VERSION);
    upsertMeta("updatedAt", store.updatedAt);
    upsertMeta("activeChatId", store.activeChatId);
    upsertMeta(
      "tree",
      store.schemaVersion === 1 ? buildLegacyV1Tree(store) : store.tree,
    );
    const chatsById = store.chatsById || {};
    for (const [chatId, chat] of Object.entries(chatsById)) {
      const { messages, ...metaOnly } = chat || {};
      // An existing boolean wins — v3 re-imports must not be clobbered.
      if (typeof metaOnly.isGenerating !== "boolean") {
        metaOnly.isGenerating = deriveIsGenerating(messages);
      }
      upsertChatMeta(chatId, metaOnly);
      replaceMessages(chatId, messages);
    }
  };

  const OP_APPLIERS = {
    put_tree_meta: applyPutTreeMeta,
    put_chat_meta: applyPutChatMeta,
    put_messages: applyPutMessages,
    delete_chats: applyDeleteChats,
    import_store: applyImportStore,
  };

  const applyOps = (payload) => {
    requireDb();
    const { guard, ops } = normalizeWriteBatch(payload);
    let applied = true;
    db.tx(() => {
      if (guard) {
        const existing = requireDb()
          .prepare(
            "SELECT max_sequence FROM renderer_write_guards WHERE epoch = ?",
          )
          .get(guard.epoch);
        if (
          existing &&
          Number(existing.max_sequence) >= guard.sequence
        ) {
          applied = false;
          return;
        }
      }
      for (const op of ops) {
        const apply = op && OP_APPLIERS[op.type];
        if (!apply) {
          throw new Error(
            `applyOps: unknown op type: ${op && op.type}`,
          );
        }
        apply(op);
      }
      if (guard) {
        requireDb()
          .prepare(
            "INSERT INTO renderer_write_guards(epoch, max_sequence) " +
              "VALUES (?, ?) ON CONFLICT(epoch) DO UPDATE SET " +
              "max_sequence = excluded.max_sequence",
          )
          .run(guard.epoch, guard.sequence);
      }
    });
    return applied;
  };

  // ---- reads ---------------------------------------------------------------

  const readMessages = (chatId) => {
    const rows = requireDb()
      .prepare(
        "SELECT payload FROM messages WHERE chat_id = ? ORDER BY ord ASC",
      )
      .all(chatId);
    return rows.map((row) => JSON.parse(row.payload));
  };

  const getBootstrapSnapshot = () => {
    if (legacyMigrationError) {
      // A present-but-unreadable legacy source is not an empty database.
      // Propagate a stable bootstrap failure so the renderer cannot seed a
      // default chat and permanently block a repaired chats.json from import.
      throw legacyMigrationError;
    }
    const metaRows = requireDb().prepare("SELECT key, value FROM meta").all();
    const chatRows = requireDb().prepare("SELECT id, meta FROM chats").all();
    if (metaRows.length === 0 && chatRows.length === 0) {
      return null;
    }
    const metaMap = {};
    for (const row of metaRows) {
      metaMap[row.key] = JSON.parse(row.value);
    }
    const chatMetasById = {};
    for (const row of chatRows) {
      chatMetasById[row.id] = JSON.parse(row.meta);
    }
    const activeChatId =
      metaMap.activeChatId === undefined ? null : metaMap.activeChatId;
    return {
      schemaVersion:
        metaMap.schemaVersion === undefined
          ? SCHEMA_VERSION
          : metaMap.schemaVersion,
      updatedAt: metaMap.updatedAt === undefined ? null : metaMap.updatedAt,
      activeChatId,
      tree: metaMap.tree === undefined ? null : metaMap.tree,
      chatMetasById,
      activeChatMessages: activeChatId ? readMessages(activeChatId) : [],
    };
  };

  // ---- init + legacy chats.json migration (spec §7) -------------------------

  const isDbEmpty = () => {
    const chatCount = db.prepare("SELECT COUNT(*) AS n FROM chats").get().n;
    const metaCount = db.prepare("SELECT COUNT(*) AS n FROM meta").get().n;
    return chatCount === 0 && metaCount === 0;
  };

  const migrateLegacyFileIfNeeded = () => {
    if (!isDbEmpty()) return;
    if (!fs.existsSync(legacyFilePath)) return;
    let store;
    try {
      store = JSON.parse(fs.readFileSync(legacyFilePath, "utf8"));
    } catch (error) {
      legacyMigrationError = new Error(
        "Legacy chats.json exists but could not be read as JSON; source left untouched",
      );
      legacyMigrationError.code = "chat_legacy_source_unreadable";
      console.warn(
        "[chat-storage] failed to parse legacy chats.json, leaving it in place:",
        error.message,
      );
      return;
    }
    try {
      assertRecognizableLegacyChatStore(store);
    } catch (error) {
      legacyMigrationError = error;
      console.warn(
        "[chat-storage] invalid legacy chats.json, leaving it in place:",
        error.message,
      );
      return;
    }
    applyOps([{ type: "import_store", store }]);
    fs.renameSync(legacyFilePath, legacyFilePath + MIGRATED_SUFFIX);
  };

  const init = () => {
    if (db) return;
    legacyMigrationError = null;
    const userDataDir = app.getPath("userData");
    legacyFilePath = path.join(userDataDir, LEGACY_FILE_NAME);
    db = createChatDb({
      dbPath: path.join(userDataDir, DB_FILE_NAME),
      sqlite,
    });
    db.exec(SCHEMA_SQL);
    migrateLegacyFileIfNeeded();
  };

  // Legacy-compat entry point for the renderer localStorage→IPC migration
  // path (WRITE channel): whole-store import.
  const write = (store) => {
    applyOps([{ type: "import_store", store }]);
  };

  // before-quit hook. WAL makes per-transaction durability sufficient — this
  // just releases the connection cleanly.
  const close = () => {
    if (!db) return;
    db.close();
    db = null;
  };

  return {
    init,
    getBootstrapSnapshot,
    readMessages,
    applyOps,
    write,
    close,
  };
};

module.exports = { createChatStorageService };
