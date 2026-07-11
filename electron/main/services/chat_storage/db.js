// Thin adapter around node:sqlite (experimental API). ALL SQLite calls in the
// chat storage service go through this module — if the engine ever changes
// (e.g. to better-sqlite3), only this file moves.
//
// The `sqlite` module itself is injected (DI): the service receives it from
// its caller and never require()s node:sqlite directly.

const createChatDb = ({ dbPath, sqlite } = {}) => {
  if (!dbPath || !sqlite) {
    throw new Error("createChatDb: missing dependencies");
  }

  const { DatabaseSync } = sqlite;
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");

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

module.exports = { createChatDb };
