const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

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
const {
  createRunBundleStorageService,
} = require("../../main/services/run_bundle_storage/service");
const {
  computeRunBundleDigest,
} = require("../../shared/run_bundle_v1");
const {
  buildRunBundleV1,
} = require("../fixtures/run_bundle_v1_fixture.cjs");
const {
  RUN_BUNDLE_V2_SCHEMA,
  RUN_BUNDLE_DETAILS_REF_SCHEMA,
  canonicalizeRunBundleV2,
} = require("../../shared/run_bundle_v2");

const buildRunBundleV2 = ({
  bundleId = "bundle-v2",
  revision = 1,
  identity,
} = {}) => {
  const body = {
    schema: RUN_BUNDLE_V2_SCHEMA,
    bundle_id: bundleId,
    revision,
    identity: identity || {
      execution_id: "chat-1",
      attempt_id: "attempt-v2",
      root_run_id: "root-v2",
      run_id: "root-v2",
      parent_run_id: null,
      relation: "root",
    },
    lifecycle: {
      status: "completed",
      started_at: "2026-08-20T00:00:00Z",
      completed_at: "2026-08-20T00:01:00Z",
      continued_from_run_id: null,
    },
    descriptor: {
      model: "unknown-model",
      display_model: "model-unavailable",
      active_agent: "unknown",
      agent_orchestration: "default",
      iteration: 0,
    },
    provider_call_count: 2000,
    direct_provider_call_count: 2000,
    descendant_provider_call_count: 0,
    aggregation_usage: { total_tokens: 2000 },
    direct_usage: { total_tokens: 2000 },
    descendant_usage: { total_tokens: 0 },
    metrics: { event_count: 2000 },
    coverage: { status: "complete" },
    cost: { status: "unavailable" },
    legacy: { status: "canonical" },
    evidence: {},
    children: { count: 0, set_sha256: "0".repeat(64) },
    details_ref: {
      schema: RUN_BUNDLE_DETAILS_REF_SCHEMA,
      details_id: "rbd_" + "1".repeat(64),
      facts_digest: "2".repeat(64),
      total_bytes: 1000,
      parts: [{ name: "provider_calls", item_count: 2000, canonical_bytes: 1000, root_sha256: "3".repeat(64) }],
    },
    extensions: {},
  };
  return {
    ...body,
    bundle_digest: crypto.createHash("sha256").update(canonicalizeRunBundleV2(body), "utf8").digest("hex"),
  };
};

const fakeApp = (dir) => ({
  getPath: (key) => {
    if (key === "userData") return dir;
    throw new Error(`unexpected app path: ${key}`);
  },
});

const expectCode = (fn, code) => {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).not.toBeNull();
  expect(caught.code).toBe(code);
};

describeIfSqlite("RunBundle v1 SQLite storage", () => {
  let dir;
  let service;
  let failPhase;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-run-bundle-"));
    failPhase = null;
    service = createRunBundleStorageService({
      app: fakeApp(dir),
      path,
      sqlite,
      now: () => 1770000000000,
      failureInjector: (phase) => {
        if (phase === failPhase) throw new Error("injected transaction failure");
      },
    });
    service.init();
  });

  afterEach(() => {
    service.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("duplicate replay is idempotent and OpenAI cached input remains a subset", () => {
    const bundle = buildRunBundleV1();
    expect(service.upsertRunBundle(bundle)).toMatchObject({
      status: "inserted",
      usageSliceCount: 1,
    });
    expect(service.upsertRunBundle(bundle)).toMatchObject({
      status: "already_current",
      revision: 1,
    });

    const result = service.queryRunBundles({ executionId: "chat-1" });
    expect(result.records).toHaveLength(1);
    const stored = result.records[0].bundle;
    expect(stored.aggregation.all_usage.input.total_tokens).toBe(1000);
    expect(stored.aggregation.all_usage.input.cache_read_tokens).toBe(600);
    expect(stored.usage_slices).toHaveLength(1);
  });

  test("newer revision atomically replaces multi-model usage slices", () => {
    service.upsertRunBundle(buildRunBundleV1());
    const newer = buildRunBundleV1({ revision: 2, multiModel: true });
    expect(service.upsertRunBundle(newer)).toMatchObject({
      status: "updated",
      usageSliceCount: 2,
    });

    const [record] = service.queryRunBundles({}).records;
    expect(record.bundle.revision).toBe(2);
    expect(
      record.usageSlices.map((slice) => `${slice.provider}:${slice.model}`),
    ).toEqual([
      "anthropic:claude-sonnet-4-6",
      "openai:gpt-5.6",
    ]);
    expect(
      record.usageSlices[0].usage.input.cache_write_5m_tokens,
    ).toBe(60);
    expect(
      record.usageSlices[0].usage.input.cache_write_1h_tokens,
    ).toBe(40);
  });

  test("persists unavailable coverage with unknown usage as null, never zero", () => {
    const partial = buildRunBundleV1({ unavailable: true });
    service.upsertRunBundle(partial);
    const stored = service.queryRunBundles({}).records[0].bundle;
    expect(stored.coverage.status).toBe("unavailable");
    expect(stored.aggregation.all_usage.input.total_tokens).toBeNull();
    expect(stored.aggregation.all_usage.output.reasoning_tokens).toBeNull();
    expect(stored.aggregation.all_usage.total_tokens).toBeNull();
  });

  test("rejects stale revisions and same-revision digest conflicts", () => {
    service.upsertRunBundle(buildRunBundleV1({ revision: 2 }));
    expectCode(
      () => service.upsertRunBundle(buildRunBundleV1({ revision: 1 })),
      "stale_revision",
    );

    const conflict = buildRunBundleV1({ revision: 2 });
    conflict.extensions["pupu.dev/conflict"] = true;
    conflict.bundle_digest = computeRunBundleDigest(conflict);
    expectCode(
      () => service.upsertRunBundle(conflict),
      "bundle_revision_conflict",
    );
  });

  test("rolls the record and slices back together on an injected failure", () => {
    service.upsertRunBundle(buildRunBundleV1());
    failPhase = "after_slice_insert";
    expect(() =>
      service.upsertRunBundle(
        buildRunBundleV1({ revision: 2, multiModel: true }),
      ),
    ).toThrow(/injected transaction failure/);
    failPhase = null;

    const [record] = service.queryRunBundles({}).records;
    expect(record.bundle.revision).toBe(1);
    expect(record.usageSlices).toHaveLength(1);
  });

  test("clear removes bundles but leaves legacy token_usage_records untouched", () => {
    service.upsertRunBundle(buildRunBundleV1());
    service.close();
    const raw = new sqlite.DatabaseSync(path.join(dir, "settings.db"));
    raw.exec(
      "CREATE TABLE IF NOT EXISTS token_usage_records (id INTEGER PRIMARY KEY, consumed_tokens INTEGER);",
    );
    raw.prepare(
      "INSERT INTO token_usage_records (id, consumed_tokens) VALUES (?, ?)",
    ).run(1, 99);
    raw.close();

    service = createRunBundleStorageService({
      app: fakeApp(dir),
      path,
      sqlite,
    });
    service.init();
    expect(service.clearRunBundles()).toEqual({
      ok: true,
      cleared: 1,
      scope: "all",
    });
    service.close();

    const verify = new sqlite.DatabaseSync(path.join(dir, "settings.db"));
    expect(
      verify.prepare("SELECT COUNT(*) AS n FROM token_usage_records").get().n,
    ).toBe(1);
    expect(
      verify.prepare("SELECT COUNT(*) AS n FROM run_bundle_records").get().n,
    ).toBe(0);
    verify.close();
    service = createRunBundleStorageService({
      app: fakeApp(dir),
      path,
      sqlite,
    });
    service.init();
  });

  test("stores and reloads compact v2 without constructing v1 slices", () => {
    const bundle = buildRunBundleV2();
    expect(service.upsertRunBundle(bundle)).toMatchObject({
      status: "inserted",
      usageSliceCount: 0,
    });
    const [record] = service.queryRunBundles({ executionId: "chat-1" }).records;
    expect(record.bundle.schema).toBe(RUN_BUNDLE_V2_SCHEMA);
    expect(record.bundle.provider_call_count).toBe(2000);
    expect(record.usageSlices).toEqual([]);
  });

  test("requires a one-way v1 to v2 revision advance and queries only the head", () => {
    const v1 = buildRunBundleV1({ revision: 1 });
    service.upsertRunBundle(v1);

    expectCode(
      () => service.upsertRunBundle(buildRunBundleV2({
        bundleId: v1.bundle_id,
        revision: 1,
        identity: v1.identity,
      })),
      "bundle_revision_conflict",
    );

    const compact = buildRunBundleV2({
      bundleId: v1.bundle_id,
      revision: 2,
      identity: v1.identity,
    });
    expect(service.upsertRunBundle(compact)).toMatchObject({
      status: "inserted",
      revision: 2,
    });

    const records = service.queryRunBundles({ executionId: "chat-1" }).records;
    expect(records).toHaveLength(1);
    expect(records[0].bundle).toEqual(compact);

    expectCode(
      () => service.upsertRunBundle(buildRunBundleV1({ revision: 3 })),
      "bundle_revision_conflict",
    );
  });

  test("fails closed on a durable same-revision dual-schema collision", () => {
    const v1 = buildRunBundleV1({ revision: 1 });
    service.upsertRunBundle(v1);
    service.upsertRunBundle(buildRunBundleV2());
    service.close();

    const raw = new sqlite.DatabaseSync(path.join(dir, "settings.db"));
    raw.prepare(
      "UPDATE run_bundle_compact_records SET bundle_id = ?, revision = ? WHERE bundle_id = ?",
    ).run(v1.bundle_id, 1, "bundle-v2");
    raw.close();

    service = createRunBundleStorageService({ app: fakeApp(dir), path, sqlite });
    service.init();
    expectCode(
      () => service.queryRunBundles({ executionId: "chat-1" }),
      "run_bundle_storage_corrupt",
    );
  });
});
