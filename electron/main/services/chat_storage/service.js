// Chat storage V3 — main-process authority on SQLite (userData/chats.db, WAL).
// Spec: docs/superpowers/specs/2026-07-10-chat-storage-sqlite-main-authority.md
// (§2 schema and §3 ops protocol are frozen one-way doors).

const { createChatDb } = require("./db");

const DB_FILE_NAME = "chats.db";
const LEGACY_FILE_NAME = "chats.json";
const MIGRATED_SUFFIX = ".migrated-bak";
const SCHEMA_VERSION = 3;

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
`;

const toJson = (value) => JSON.stringify(value === undefined ? null : value);

const createChatStorageService = ({ app, fs, path, sqlite } = {}) => {
  if (!app || !fs || !path || !sqlite) {
    throw new Error("createChatStorageService: missing dependencies");
  }

  let db = null;
  let legacyFilePath = null;

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
    const store = op.store;
    if (!store || typeof store !== "object") {
      throw new Error("import_store: invalid store payload");
    }
    // Whole-store semantics (legacy WRITE equivalent): replace everything.
    requireDb().prepare("DELETE FROM messages").run();
    requireDb().prepare("DELETE FROM chats").run();
    upsertMeta("schemaVersion", SCHEMA_VERSION);
    upsertMeta("updatedAt", store.updatedAt);
    upsertMeta("activeChatId", store.activeChatId);
    upsertMeta("tree", store.tree);
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

  const applyOps = (ops) => {
    requireDb();
    if (!Array.isArray(ops)) {
      throw new Error("applyOps: ops must be an array");
    }
    db.tx(() => {
      for (const op of ops) {
        const apply = op && OP_APPLIERS[op.type];
        if (!apply) {
          throw new Error(
            `applyOps: unknown op type: ${op && op.type}`,
          );
        }
        apply(op);
      }
    });
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
      console.warn(
        "[chat-storage] failed to parse legacy chats.json, leaving it in place:",
        error.message,
      );
      return;
    }
    applyOps([{ type: "import_store", store }]);
    fs.renameSync(legacyFilePath, legacyFilePath + MIGRATED_SUFFIX);
  };

  const init = () => {
    if (db) return;
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
