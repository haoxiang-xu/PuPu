const pathModule = require("path");
const { createSettingsDb } = require("../settings_storage/db");
const {
  canonicalize,
  normalizeRunBundleV1,
} = require("../../../shared/run_bundle_v1");

const DB_FILE_NAME = "settings.db";
const QUERY_DEFAULT_LIMIT = 500;
const QUERY_MAX_LIMIT = 5000;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS run_bundle_records (
  bundle_id        TEXT PRIMARY KEY,
  schema_version   INTEGER NOT NULL CHECK (schema_version = 1),
  revision         INTEGER NOT NULL CHECK (revision >= 0),
  bundle_digest    TEXT NOT NULL,
  execution_id     TEXT NOT NULL,
  attempt_id       TEXT NOT NULL,
  root_run_id      TEXT NOT NULL,
  run_id           TEXT NOT NULL,
  relation         TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  started_at       TEXT,
  completed_at     TEXT,
  completed_at_ms  INTEGER,
  coverage_status  TEXT NOT NULL,
  legacy_status    TEXT NOT NULL,
  bundle_json      TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_bundle_execution
  ON run_bundle_records(execution_id, completed_at_ms);

CREATE INDEX IF NOT EXISTS idx_run_bundle_updated
  ON run_bundle_records(updated_at);

CREATE TABLE IF NOT EXISTS run_bundle_usage_slices (
  bundle_id                         TEXT NOT NULL,
  revision                          INTEGER NOT NULL,
  slice_key                         TEXT NOT NULL,
  ord                               INTEGER NOT NULL,
  provider                          TEXT NOT NULL,
  model                             TEXT NOT NULL,
  service_tier                      TEXT,
  call_ids_json                     TEXT NOT NULL,
  input_uncached_tokens             INTEGER,
  input_cache_read_tokens           INTEGER,
  input_cache_write_tokens          INTEGER,
  input_cache_write_5m_tokens       INTEGER,
  input_cache_write_1h_tokens       INTEGER,
  input_total_tokens                INTEGER,
  output_visible_tokens             INTEGER,
  output_reasoning_tokens           INTEGER,
  output_total_tokens               INTEGER,
  total_tokens                      INTEGER,
  coverage_status                   TEXT NOT NULL,
  cost_status                       TEXT NOT NULL,
  cost_amount_nano_usd              INTEGER,
  slice_json                        TEXT NOT NULL,
  PRIMARY KEY (bundle_id, slice_key),
  FOREIGN KEY (bundle_id) REFERENCES run_bundle_records(bundle_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_bundle_slice_model
  ON run_bundle_usage_slices(provider, model, service_tier);
`;

const errorWithCode = (message, code) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, allowed, label) => {
  if (!isPlainObject(value)) {
    throw errorWithCode(`${label} must be an object`, "run_bundle_storage_invalid");
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw errorWithCode(
      `${label} has unknown fields`,
      "run_bundle_storage_invalid",
    );
  }
};

const normalizeQuery = (raw) => {
  const value = raw === undefined || raw === null ? {} : raw;
  exactKeys(
    value,
    ["executionId", "status", "startMs", "endMs", "limit", "offset"],
    "query",
  );
  const query = {};
  if (value.executionId !== undefined) {
    if (
      typeof value.executionId !== "string" ||
      value.executionId.length === 0 ||
      value.executionId.length > 256
    ) {
      throw errorWithCode(
        "query.executionId is invalid",
        "run_bundle_storage_invalid",
      );
    }
    query.executionId = value.executionId;
  }
  if (value.status !== undefined) {
    const statuses = [
      "running",
      "completed",
      "failed",
      "suspended",
      "cancelled",
      "uncertain",
    ];
    if (!statuses.includes(value.status)) {
      throw errorWithCode(
        "query.status is invalid",
        "run_bundle_storage_invalid",
      );
    }
    query.status = value.status;
  }
  for (const field of ["startMs", "endMs", "offset"]) {
    if (value[field] === undefined) continue;
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      throw errorWithCode(
        `query.${field} is invalid`,
        "run_bundle_storage_invalid",
      );
    }
    query[field] = value[field];
  }
  if (value.limit !== undefined) {
    if (
      !Number.isSafeInteger(value.limit) ||
      value.limit < 1 ||
      value.limit > QUERY_MAX_LIMIT
    ) {
      throw errorWithCode(
        "query.limit is invalid",
        "run_bundle_storage_invalid",
      );
    }
    query.limit = value.limit;
  }
  return query;
};

const normalizeClear = (raw) => {
  const value = raw === undefined || raw === null ? {} : raw;
  exactKeys(value, ["executionId"], "clear options");
  if (value.executionId === undefined) return {};
  if (
    typeof value.executionId !== "string" ||
    value.executionId.length === 0 ||
    value.executionId.length > 256
  ) {
    throw errorWithCode(
      "clear.executionId is invalid",
      "run_bundle_storage_invalid",
    );
  }
  return { executionId: value.executionId };
};

const parseCompletedAtMs = (value) => {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const sliceKeyFor = (slice) =>
  `${slice.provider}\u0000${slice.model}\u0000${slice.service_tier || ""}`;

const createRunBundleStorageService = ({
  app,
  path = pathModule,
  sqlite,
  now = () => Date.now(),
  failureInjector,
} = {}) => {
  if (!app || !path || !sqlite) {
    throw new Error("createRunBundleStorageService: missing dependencies");
  }

  let db = null;
  let degradedReason = null;

  const requireDb = () => {
    if (!db) {
      throw errorWithCode(
        degradedReason
          ? `run bundle storage unavailable (${degradedReason})`
          : "run bundle storage used before init",
        "run_bundle_storage_unavailable",
      );
    }
    return db;
  };

  const init = () => {
    if (db) return { ok: true, status: "already_initialized" };
    try {
      const dbPath = path.join(app.getPath("userData"), DB_FILE_NAME);
      db = createSettingsDb({ dbPath, sqlite });
      db.exec(SCHEMA_SQL);
      degradedReason = null;
      return { ok: true, status: "initialized" };
    } catch (error) {
      if (db) {
        try {
          db.close();
        } catch (_closeError) {
          // surface the original initialization failure as degraded state
        }
      }
      db = null;
      degradedReason = "init_failed";
      console.error(
        "[run-bundle-storage] init failed; database left in place:",
        error.code || error.message,
      );
      return { ok: false, status: "degraded", reason: degradedReason };
    }
  };

  const invokeFailurePoint = (phase, bundle) => {
    if (typeof failureInjector === "function") {
      failureInjector(phase, bundle);
    }
  };

  const insertSlices = (database, bundle) => {
    const statement = database.prepare(
      "INSERT INTO run_bundle_usage_slices (" +
        "bundle_id, revision, slice_key, ord, provider, model, service_tier, " +
        "call_ids_json, input_uncached_tokens, input_cache_read_tokens, " +
        "input_cache_write_tokens, input_cache_write_5m_tokens, " +
        "input_cache_write_1h_tokens, input_total_tokens, " +
        "output_visible_tokens, output_reasoning_tokens, output_total_tokens, " +
        "total_tokens, coverage_status, cost_status, cost_amount_nano_usd, slice_json" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    bundle.usage_slices.forEach((slice, index) => {
      statement.run(
        bundle.bundle_id,
        bundle.revision,
        sliceKeyFor(slice),
        index,
        slice.provider,
        slice.model,
        slice.service_tier,
        canonicalize(slice.call_ids),
        slice.usage.input.uncached_tokens,
        slice.usage.input.cache_read_tokens,
        slice.usage.input.cache_write_tokens,
        slice.usage.input.cache_write_5m_tokens,
        slice.usage.input.cache_write_1h_tokens,
        slice.usage.input.total_tokens,
        slice.usage.output.visible_tokens,
        slice.usage.output.reasoning_tokens,
        slice.usage.output.total_tokens,
        slice.usage.total_tokens,
        slice.coverage.status,
        slice.cost.status,
        slice.cost.amount_nano_usd,
        canonicalize(slice),
      );
      invokeFailurePoint("after_slice_insert", bundle);
    });
  };

  const upsertRunBundle = (rawBundle) => {
    let bundle;
    try {
      bundle = normalizeRunBundleV1(rawBundle, { verifyDigest: true });
    } catch (error) {
      if (error && typeof error.code === "string") throw error;
      throw errorWithCode(
        "run bundle failed strict admission",
        "run_bundle_storage_invalid",
      );
    }
    const database = requireDb();
    const existing = database
      .prepare(
        "SELECT revision, bundle_digest FROM run_bundle_records WHERE bundle_id = ?",
      )
      .get(bundle.bundle_id);

    if (existing) {
      const storedRevision = Number(existing.revision);
      if (bundle.revision < storedRevision) {
        throw errorWithCode(
          "run bundle revision is stale",
          "stale_revision",
        );
      }
      if (
        bundle.revision === storedRevision &&
        bundle.bundle_digest !== existing.bundle_digest
      ) {
        throw errorWithCode(
          "same run bundle revision has a different digest",
          "bundle_revision_conflict",
        );
      }
      if (
        bundle.revision === storedRevision &&
        bundle.bundle_digest === existing.bundle_digest
      ) {
        return {
          ok: true,
          status: "already_current",
          bundleId: bundle.bundle_id,
          revision: bundle.revision,
          bundleDigest: bundle.bundle_digest,
        };
      }
    }

    const persistedAt = now();
    const completedAtMs = parseCompletedAtMs(bundle.lifecycle.completed_at);
    database.tx(() => {
      database
        .prepare(
          "INSERT INTO run_bundle_records (" +
            "bundle_id, schema_version, revision, bundle_digest, execution_id, " +
            "attempt_id, root_run_id, run_id, relation, lifecycle_status, " +
            "started_at, completed_at, completed_at_ms, coverage_status, " +
            "legacy_status, bundle_json, created_at, updated_at" +
            ") VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(bundle_id) DO UPDATE SET " +
            "revision = excluded.revision, bundle_digest = excluded.bundle_digest, " +
            "execution_id = excluded.execution_id, attempt_id = excluded.attempt_id, " +
            "root_run_id = excluded.root_run_id, run_id = excluded.run_id, " +
            "relation = excluded.relation, lifecycle_status = excluded.lifecycle_status, " +
            "started_at = excluded.started_at, completed_at = excluded.completed_at, " +
            "completed_at_ms = excluded.completed_at_ms, " +
            "coverage_status = excluded.coverage_status, legacy_status = excluded.legacy_status, " +
            "bundle_json = excluded.bundle_json, updated_at = excluded.updated_at",
        )
        .run(
          bundle.bundle_id,
          bundle.revision,
          bundle.bundle_digest,
          bundle.identity.execution_id,
          bundle.identity.attempt_id,
          bundle.identity.root_run_id,
          bundle.identity.run_id,
          bundle.identity.relation,
          bundle.lifecycle.status,
          bundle.lifecycle.started_at,
          bundle.lifecycle.completed_at,
          completedAtMs,
          bundle.coverage.status,
          bundle.legacy.status,
          canonicalize(bundle),
          persistedAt,
          persistedAt,
        );
      invokeFailurePoint("after_record_upsert", bundle);
      database
        .prepare("DELETE FROM run_bundle_usage_slices WHERE bundle_id = ?")
        .run(bundle.bundle_id);
      invokeFailurePoint("after_slice_delete", bundle);
      insertSlices(database, bundle);
    });

    return {
      ok: true,
      status: existing ? "updated" : "inserted",
      bundleId: bundle.bundle_id,
      revision: bundle.revision,
      bundleDigest: bundle.bundle_digest,
      usageSliceCount: bundle.usage_slices.length,
    };
  };

  const readSlices = (database, bundleId) => {
    const rows = database
      .prepare(
        "SELECT slice_json FROM run_bundle_usage_slices " +
          "WHERE bundle_id = ? ORDER BY ord ASC",
      )
      .all(bundleId);
    return rows.map((row) => JSON.parse(row.slice_json));
  };

  const queryRunBundles = (rawQuery) => {
    const query = normalizeQuery(rawQuery);
    const database = requireDb();
    const where = [];
    const params = [];
    if (query.executionId !== undefined) {
      where.push("execution_id = ?");
      params.push(query.executionId);
    }
    if (query.status !== undefined) {
      where.push("lifecycle_status = ?");
      params.push(query.status);
    }
    if (query.startMs !== undefined) {
      where.push("completed_at_ms >= ?");
      params.push(query.startMs);
    }
    if (query.endMs !== undefined) {
      where.push("completed_at_ms <= ?");
      params.push(query.endMs);
    }
    const limit = query.limit || QUERY_DEFAULT_LIMIT;
    const offset = query.offset || 0;
    params.push(limit, offset);
    const sql =
      "SELECT bundle_id, revision, bundle_digest, bundle_json, created_at, updated_at " +
      "FROM run_bundle_records " +
      (where.length > 0 ? `WHERE ${where.join(" AND ")} ` : "") +
      "ORDER BY COALESCE(completed_at_ms, updated_at) DESC, bundle_id ASC " +
      "LIMIT ? OFFSET ?";
    const rows = database.prepare(sql).all(...params);
    const records = rows.map((row) => {
      let parsed;
      try {
        parsed = JSON.parse(row.bundle_json);
        parsed = normalizeRunBundleV1(parsed, { verifyDigest: true });
      } catch (_error) {
        throw errorWithCode(
          `stored run bundle ${row.bundle_id} is corrupt`,
          "run_bundle_storage_corrupt",
        );
      }
      const usageSlices = readSlices(database, row.bundle_id);
      if (canonicalize(usageSlices) !== canonicalize(parsed.usage_slices)) {
        throw errorWithCode(
          `stored run bundle ${row.bundle_id} has mismatched usage slices`,
          "run_bundle_storage_corrupt",
        );
      }
      return {
        bundle: parsed,
        usageSlices,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      };
    });
    return { ok: true, records };
  };

  const clearRunBundles = (rawOptions) => {
    const options = normalizeClear(rawOptions);
    const database = requireDb();
    let result;
    database.tx(() => {
      result = options.executionId
        ? database
            .prepare("DELETE FROM run_bundle_records WHERE execution_id = ?")
            .run(options.executionId)
        : database.prepare("DELETE FROM run_bundle_records").run();
    });
    return {
      ok: true,
      cleared: Number(result.changes),
      scope: options.executionId ? "execution" : "all",
    };
  };

  const close = () => {
    if (!db) return;
    db.close();
    db = null;
  };

  return {
    init,
    upsertRunBundle,
    queryRunBundles,
    clearRunBundles,
    close,
  };
};

module.exports = {
  createRunBundleStorageService,
  QUERY_DEFAULT_LIMIT,
  QUERY_MAX_LIMIT,
};
