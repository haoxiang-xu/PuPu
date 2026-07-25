// Thin adapter around node:sqlite (experimental API). ALL SQLite calls in the
// settings storage service go through this module — if the engine ever changes
// (e.g. to better-sqlite3), only this file moves.
//
// The `sqlite` module itself is injected (DI): the service receives it from
// its caller and never require()s node:sqlite directly.
//
// Mirrors electron/main/services/chat_storage/db.js, plus the settings-specific
// PRAGMAs from docs/architecture/settings-sqlite-migration-plan.md §2.3.

const createSettingsDb = ({ dbPath, sqlite } = {}) => {
  if (!dbPath || !sqlite) {
    throw new Error("createSettingsDb: missing dependencies");
  }

  const { DatabaseSync } = sqlite;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
  } catch (error) {
    // Corrupt/unreadable file (e.g. SQLITE_NOTADB): release the handle so the
    // caller's degraded mode leaves the file untouched and unlocked.
    try {
      db.close();
    } catch (_closeError) {
      // surface the original error
    }
    throw error;
  }

  const statementCache = new Map();

  const exec = (sql) => db.exec(sql);

  const prepare = (sql) => {
    let statement = statementCache.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statementCache.set(sql, statement);
    }
    return statement;
  };

  const tx = (fn) => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (_rollbackError) {
        // connection unusable; surface the original error
      }
      throw error;
    }
  };

  const close = () => {
    statementCache.clear();
    db.close();
  };

  return { exec, prepare, tx, close };
};

module.exports = { createSettingsDb };
