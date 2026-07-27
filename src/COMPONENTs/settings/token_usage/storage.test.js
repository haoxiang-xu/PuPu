import {
  appendTokenUsageRecord,
  clearTokenUsageRecords,
  readTokenUsageRecords,
  getTokenUsageByDateRange,
  queryTokenUsage,
  isTokenUsageSqlBacked,
  flushTokenUsageWrites,
  beginTokenUsageQuitDrain,
  endTokenUsageQuitDrain,
  resetTokenUsageStorageForTests,
  TOKEN_USAGE_MIGRATION_MARKER_KEY,
} from "./storage";

describe("token usage storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("reads legacy consumed-only records with zeroed input/output breakdown", () => {
    window.localStorage.setItem(
      "token_usage",
      JSON.stringify({
        records: [
          {
            timestamp: 1,
            provider: "openai",
            model: "gpt-5",
            model_id: "openai:gpt-5",
            consumed_tokens: 123,
          },
        ],
      }),
    );

    expect(readTokenUsageRecords()).toEqual([
      {
        timestamp: 1,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 123,
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
  });

  test("stores records with explicit consumed/input/output token usage", () => {
    appendTokenUsageRecord({
      timestamp: 2,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      model_id: "anthropic:claude-sonnet-4-6",
      consumed_tokens: 42,
      input_tokens: 30,
      output_tokens: 12,
      chatId: "chat-1",
    });

    expect(readTokenUsageRecords()).toEqual([
      {
        timestamp: 2,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        model_id: "anthropic:claude-sonnet-4-6",
        consumed_tokens: 42,
        input_tokens: 30,
        output_tokens: 12,
        chatId: "chat-1",
      },
    ]);
  });

  test("derives consumed tokens from input and output when consumed is absent", () => {
    appendTokenUsageRecord({
      timestamp: 3,
      provider: "openai",
      model: "gpt-5",
      model_id: "openai:gpt-5",
      input_tokens: 80,
      output_tokens: 43,
    });

    expect(readTokenUsageRecords()).toEqual([
      {
        timestamp: 3,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 123,
        input_tokens: 80,
        output_tokens: 43,
      },
    ]);
  });

  test("ignores invalid records with no usable token values", () => {
    appendTokenUsageRecord({
      timestamp: 4,
      provider: "openai",
      model: "gpt-5",
      model_id: "openai:gpt-5",
      consumed_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    });

    expect(readTokenUsageRecords()).toEqual([]);

    clearTokenUsageRecords();
    expect(readTokenUsageRecords()).toEqual([]);
  });
});

/* ────────────────────────── Phase 2: dual-mode tests ────────────────────── */

const seedLegacyRecords = (records) => {
  window.localStorage.setItem("token_usage", JSON.stringify({ records }));
};

const sampleRecord = (overrides = {}) => ({
  timestamp: 1000,
  provider: "openai",
  model: "gpt-5",
  model_id: "openai:gpt-5",
  consumed_tokens: 42,
  input_tokens: 30,
  output_tokens: 12,
  ...overrides,
});

const installTokenUsageApi = (overrides = {}, { storeMigrations } = {}) => {
  const api = {
    bootstrap: jest.fn(() => ({
      available: true,
      degraded: false,
      schemaVersion: 2,
      migration: { state: "complete" },
      namespaces: {},
      revisions: {},
      ...(storeMigrations ? { storeMigrations } : {}),
    })),
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
    setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    appendTokenUsage: jest.fn(() => Promise.resolve({ ok: true, id: 1 })),
    queryTokenUsage: jest.fn(() => Promise.resolve({ ok: true, records: [] })),
    clearTokenUsage: jest.fn(() => Promise.resolve({ ok: true, cleared: 0 })),
    migrateLegacyTokenUsage: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "sql-digest", migratedAt: 7 }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

const writeMarker = () => {
  window.localStorage.setItem(
    TOKEN_USAGE_MIGRATION_MARKER_KEY,
    JSON.stringify({ digest: "sql-digest", completedAt: 1 }),
  );
};

describe("token usage storage — mode selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTokenUsageStorageForTests();
  });

  afterEach(() => {
    resetTokenUsageStorageForTests();
    delete window.settingsStorageAPI;
  });

  test("falls back to localStorage without a bridge (Jest/browser)", () => {
    expect(isTokenUsageSqlBacked()).toBe(false);
  });

  test("a pre-Phase-2 preload (base surface only) also falls back", () => {
    installTokenUsageApi();
    delete window.settingsStorageAPI.queryTokenUsage;
    expect(isTokenUsageSqlBacked()).toBe(false);
    appendTokenUsageRecord(sampleRecord());
    expect(readTokenUsageRecords()).toHaveLength(1);
    expect(window.settingsStorageAPI.appendTokenUsage).not.toHaveBeenCalled();
  });

  test("uses SQL mode with the full Phase 2 bridge", () => {
    installTokenUsageApi();
    writeMarker();
    expect(isTokenUsageSqlBacked()).toBe(true);
  });
});

describe("token usage storage — SQL mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTokenUsageStorageForTests();
  });

  afterEach(() => {
    resetTokenUsageStorageForTests();
    delete window.settingsStorageAPI;
  });

  test("append keeps its synchronous no-throw signature and lands on the bridge", async () => {
    const api = installTokenUsageApi();
    writeMarker();

    expect(appendTokenUsageRecord(sampleRecord({ chatId: "chat-1" }))).toBe(
      undefined,
    );
    await flushTokenUsageWrites();

    expect(api.appendTokenUsage).toHaveBeenCalledTimes(1);
    expect(api.appendTokenUsage.mock.calls[0][0]).toEqual({
      timestamp: 1000,
      provider: "openai",
      model: "gpt-5",
      model_id: "openai:gpt-5",
      consumed_tokens: 42,
      input_tokens: 30,
      output_tokens: 12,
      chatId: "chat-1",
    });
    // no dual write: the legacy key stays untouched in SQL mode
    expect(window.localStorage.getItem("token_usage")).toBe(null);
  });

  test("invalid records are silently ignored without touching the bridge", async () => {
    const api = installTokenUsageApi();
    writeMarker();
    appendTokenUsageRecord({ consumed_tokens: 0 });
    appendTokenUsageRecord(null);
    await flushTokenUsageWrites();
    expect(api.appendTokenUsage).not.toHaveBeenCalled();
  });

  test("queued appends are strictly serialized (FIFO)", async () => {
    const api = installTokenUsageApi();
    writeMarker();
    const delivered = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    api.appendTokenUsage.mockImplementation((record) => {
      delivered.push(record.model_id);
      return delivered.length === 1
        ? firstGate
        : Promise.resolve({ ok: true, id: delivered.length });
    });

    appendTokenUsageRecord(sampleRecord({ model_id: "first" }));
    appendTokenUsageRecord(sampleRecord({ model_id: "second" }));
    await Promise.resolve();
    await Promise.resolve();
    // the second write must wait for the first to settle
    expect(delivered).toEqual(["first"]);

    releaseFirst({ ok: true, id: 1 });
    await flushTokenUsageWrites();
    expect(delivered).toEqual(["first", "second"]);
  });

  test("a failed append is logged, never thrown, and the queue keeps going", async () => {
    const api = installTokenUsageApi();
    writeMarker();
    api.appendTokenUsage
      .mockImplementationOnce(() =>
        Promise.reject(new Error("[invalid_token_usage_record] rejected")),
      )
      .mockImplementation(() => Promise.resolve({ ok: true, id: 2 }));

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => {
        appendTokenUsageRecord(sampleRecord({ model_id: "doomed" }));
        appendTokenUsageRecord(sampleRecord({ model_id: "survivor" }));
      }).not.toThrow();
      await flushTokenUsageWrites();
      expect(api.appendTokenUsage).toHaveBeenCalledTimes(2);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).toContain("invalid_token_usage_record");
      // codes only — never record contents
      expect(logged).not.toContain("doomed");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("sync reads answer from the legacy snapshot + session appends", async () => {
    seedLegacyRecords([sampleRecord({ timestamp: 1, model_id: "legacy" })]);
    installTokenUsageApi();
    writeMarker();

    appendTokenUsageRecord(sampleRecord({ timestamp: 2, model_id: "fresh" }));
    expect(readTokenUsageRecords().map((r) => r.model_id)).toEqual([
      "legacy",
      "fresh",
    ]);
    expect(
      getTokenUsageByDateRange(2, 3).map((r) => r.model_id),
    ).toEqual(["fresh"]);
    await flushTokenUsageWrites();
  });

  test("queryTokenUsage resolves from SQL and is ordered after pending appends", async () => {
    const api = installTokenUsageApi();
    writeMarker();
    const sqlRecords = [sampleRecord({ model_id: "from-sql" })];
    api.queryTokenUsage.mockImplementation(() =>
      Promise.resolve({ ok: true, records: sqlRecords }),
    );

    appendTokenUsageRecord(sampleRecord({ model_id: "pending" }));
    const rows = await queryTokenUsage({ startMs: 0, endMs: 5000, limit: 10 });

    expect(rows).toEqual(sqlRecords);
    expect(api.queryTokenUsage.mock.calls[0][0]).toEqual({
      startMs: 0,
      endMs: 5000,
      limit: 10,
      offset: undefined,
    });
    // read-your-writes: the append IPC went out before the query IPC
    expect(
      api.appendTokenUsage.mock.invocationCallOrder[0],
    ).toBeLessThan(api.queryTokenUsage.mock.invocationCallOrder[0]);
  });

  test("clear empties the sync surface, the SQL store and the legacy key", async () => {
    seedLegacyRecords([sampleRecord({ model_id: "legacy" })]);
    const api = installTokenUsageApi();
    writeMarker();

    appendTokenUsageRecord(sampleRecord({ model_id: "fresh" }));
    clearTokenUsageRecords();

    expect(readTokenUsageRecords()).toEqual([]);
    await flushTokenUsageWrites();
    expect(api.clearTokenUsage).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(window.localStorage.getItem("token_usage")),
    ).toEqual({ records: [] });
  });
});

describe("token usage storage — per-store migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTokenUsageStorageForTests();
  });

  afterEach(() => {
    resetTokenUsageStorageForTests();
    delete window.settingsStorageAPI;
  });

  test("first use with legacy records and no marker sends one migration, then writes the marker", async () => {
    seedLegacyRecords([
      sampleRecord({ timestamp: 1, model_id: "a" }),
      sampleRecord({ timestamp: 2, model_id: "b" }),
    ]);
    const api = installTokenUsageApi();

    expect(isTokenUsageSqlBacked()).toBe(true); // first use triggers init
    await flushTokenUsageWrites();

    expect(api.migrateLegacyTokenUsage).toHaveBeenCalledTimes(1);
    const payload = api.migrateLegacyTokenUsage.mock.calls[0][0];
    expect(payload.migrationVersion).toBe(1);
    expect(payload.records.map((r) => r.model_id)).toEqual(["a", "b"]);
    // marker written on completion; legacy records stay in place (read-only)
    expect(
      JSON.parse(
        window.localStorage.getItem(TOKEN_USAGE_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("sql-digest");
    expect(
      JSON.parse(window.localStorage.getItem("token_usage")).records,
    ).toHaveLength(2);
  });

  test("marker present → no migration IPC; no legacy records → no migration IPC", async () => {
    seedLegacyRecords([sampleRecord()]);
    writeMarker();
    const api = installTokenUsageApi();
    readTokenUsageRecords();
    await flushTokenUsageWrites();
    expect(api.migrateLegacyTokenUsage).not.toHaveBeenCalled();

    resetTokenUsageStorageForTests();
    window.localStorage.clear();
    readTokenUsageRecords();
    await flushTokenUsageWrites();
    expect(api.migrateLegacyTokenUsage).not.toHaveBeenCalled();
  });

  test("records that fail the SQL pre-clean are quarantined out of the payload", async () => {
    seedLegacyRecords([
      sampleRecord({ timestamp: 1, model_id: "good" }),
      sampleRecord({ timestamp: 1.5, model_id: "bad-timestamp" }),
    ]);
    const api = installTokenUsageApi();

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // compat sync read still sees both (legacy semantics)
      expect(readTokenUsageRecords()).toHaveLength(2);
      await flushTokenUsageWrites();
      const payload = api.migrateLegacyTokenUsage.mock.calls[0][0];
      expect(payload.records.map((r) => r.model_id)).toEqual(["good"]);
      expect(JSON.stringify(warnSpy.mock.calls)).toContain("quarantined");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a failed migration degrades the store to localStorage for the session", async () => {
    seedLegacyRecords([sampleRecord({ timestamp: 1, model_id: "legacy" })]);
    const api = installTokenUsageApi({
      migrateLegacyTokenUsage: jest.fn(() =>
        Promise.reject(new Error("[settings_storage_unavailable] gone")),
      ),
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(isTokenUsageSqlBacked()).toBe(true);
      // queued behind the (failing) migration
      appendTokenUsageRecord(sampleRecord({ timestamp: 2, model_id: "queued" }));
      await flushTokenUsageWrites();

      expect(isTokenUsageSqlBacked()).toBe(false);
      // no marker, no SQL append — the queued write landed on legacy instead
      expect(
        window.localStorage.getItem(TOKEN_USAGE_MIGRATION_MARKER_KEY),
      ).toBe(null);
      expect(api.appendTokenUsage).not.toHaveBeenCalled();
      expect(
        JSON.parse(window.localStorage.getItem("token_usage")).records.map(
          (r) => r.model_id,
        ),
      ).toEqual(["legacy", "queued"]);
      expect(JSON.stringify(warnSpy.mock.calls)).toContain(
        "settings_storage_unavailable",
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("refused-stale-digest keeps SQL authoritative without writing a marker", async () => {
    seedLegacyRecords([sampleRecord()]);
    const api = installTokenUsageApi({
      migrateLegacyTokenUsage: jest.fn(() =>
        Promise.resolve({
          status: "refused-stale-digest",
          alreadyComplete: true,
          digestMatched: false,
        }),
      ),
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      readTokenUsageRecords();
      await flushTokenUsageWrites();
      expect(api.migrateLegacyTokenUsage).toHaveBeenCalledTimes(1);
      expect(isTokenUsageSqlBacked()).toBe(true);
      expect(
        window.localStorage.getItem(TOKEN_USAGE_MIGRATION_MARKER_KEY),
      ).toBe(null);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a stale marker over an unmigrated SQL side re-runs the migration (SQL state wins)", async () => {
    // settings.db was reset/replaced while the renderer marker survived:
    // marker-only logic would never re-import, leaving the sync read showing
    // legacy records while SQL queries show none.
    seedLegacyRecords([sampleRecord({ timestamp: 1, model_id: "a" })]);
    writeMarker();
    const api = installTokenUsageApi(
      {},
      {
        storeMigrations: {
          tokenUsage: {
            state: "not_started",
            version: null,
            digest: null,
            migratedAt: null,
          },
        },
      },
    );
    readTokenUsageRecords();
    await flushTokenUsageWrites();
    expect(api.migrateLegacyTokenUsage).toHaveBeenCalledTimes(1);
    expect(
      api.migrateLegacyTokenUsage.mock.calls[0][0].records.map(
        (r) => r.model_id,
      ),
    ).toEqual(["a"]);
  });

  test("SQL-complete meta with a lost marker backfills the marker without a migration IPC", async () => {
    seedLegacyRecords([sampleRecord({ timestamp: 1, model_id: "a" })]);
    const api = installTokenUsageApi(
      {},
      {
        storeMigrations: {
          tokenUsage: {
            state: "complete",
            version: 1,
            digest: "sql-d",
            migratedAt: 9,
          },
        },
      },
    );
    expect(isTokenUsageSqlBacked()).toBe(true);
    await flushTokenUsageWrites();
    expect(api.migrateLegacyTokenUsage).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.localStorage.getItem(TOKEN_USAGE_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("sql-d");
  });

  test("an unknown migration status degrades the session (§11B.2-1)", async () => {
    seedLegacyRecords([sampleRecord()]);
    installTokenUsageApi({
      migrateLegacyTokenUsage: jest.fn(() =>
        Promise.resolve({ status: "mystery" }),
      ),
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      readTokenUsageRecords();
      await flushTokenUsageWrites();
      expect(isTokenUsageSqlBacked()).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("token usage storage — queryTokenUsage fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTokenUsageStorageForTests();
  });

  afterEach(() => {
    resetTokenUsageStorageForTests();
  });

  test("resolves with range-filtered legacy records (inclusive bounds)", async () => {
    seedLegacyRecords([
      sampleRecord({ timestamp: 1, model_id: "a" }),
      sampleRecord({ timestamp: 2, model_id: "b" }),
      sampleRecord({ timestamp: 3, model_id: "c" }),
    ]);
    await expect(
      queryTokenUsage({ startMs: 2, endMs: 3 }).then((rows) =>
        rows.map((r) => r.model_id),
      ),
    ).resolves.toEqual(["b", "c"]);
    // unbounded query returns everything
    await expect(
      queryTokenUsage().then((rows) => rows.length),
    ).resolves.toBe(3);
    // limit/offset page through
    await expect(
      queryTokenUsage({ limit: 1, offset: 1 }).then((rows) =>
        rows.map((r) => r.model_id),
      ),
    ).resolves.toEqual(["b"]);
  });

  test("truncation keeps the NEWEST records (SQL parity); output stays oldest-first", async () => {
    // Mirrors the main-process query semantics: a limit keeps the newest
    // slice and offset pages backwards from the newest record.
    seedLegacyRecords([
      sampleRecord({ timestamp: 1, model_id: "a" }),
      sampleRecord({ timestamp: 2, model_id: "b" }),
      sampleRecord({ timestamp: 3, model_id: "c" }),
    ]);
    await expect(
      queryTokenUsage({ limit: 2 }).then((rows) => rows.map((r) => r.model_id)),
    ).resolves.toEqual(["b", "c"]);
    await expect(
      queryTokenUsage({ offset: 1 }).then((rows) =>
        rows.map((r) => r.model_id),
      ),
    ).resolves.toEqual(["a", "b"]);
    await expect(
      queryTokenUsage({ limit: 2, offset: 2 }).then((rows) =>
        rows.map((r) => r.model_id),
      ),
    ).resolves.toEqual(["a"]);
  });
});

describe("token usage storage — quit drain", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTokenUsageStorageForTests();
  });

  afterEach(() => {
    endTokenUsageQuitDrain();
    resetTokenUsageStorageForTests();
    delete window.settingsStorageAPI;
  });

  test("uninitialized barrier admits no append/clear and abort restores admission", async () => {
    const api = installTokenUsageApi();

    await beginTokenUsageQuitDrain();
    expect(api.bootstrap).not.toHaveBeenCalled();
    appendTokenUsageRecord(sampleRecord());
    clearTokenUsageRecords();
    expect(api.appendTokenUsage).not.toHaveBeenCalled();
    expect(api.clearTokenUsage).not.toHaveBeenCalled();

    endTokenUsageQuitDrain();
    appendTokenUsageRecord(sampleRecord());
    await flushTokenUsageWrites();
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(api.appendTokenUsage).toHaveBeenCalledTimes(1);
  });

  test("waits for an accepted append to settle before resolving", async () => {
    let resolveAppend;
    const appendAck = new Promise((resolve) => {
      resolveAppend = resolve;
    });
    installTokenUsageApi({
      appendTokenUsage: jest.fn(() => appendAck),
    });

    appendTokenUsageRecord(sampleRecord());
    let drained = false;
    const drain = beginTokenUsageQuitDrain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    resolveAppend({ ok: true, id: 1 });
    await drain;
    expect(drained).toBe(true);
  });

  test("a rejected append still settles the established FIFO boundary", async () => {
    let rejectAppend;
    const appendAck = new Promise((_resolve, reject) => {
      rejectAppend = reject;
    });
    installTokenUsageApi({
      appendTokenUsage: jest.fn(() => appendAck),
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      appendTokenUsageRecord(sampleRecord());
      const drain = beginTokenUsageQuitDrain();
      await Promise.resolve();
      rejectAppend(new Error("[settings_storage_error] unavailable"));
      await expect(drain).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
