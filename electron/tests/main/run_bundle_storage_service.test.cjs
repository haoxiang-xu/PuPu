const fs = require("fs");
const os = require("os");
const path = require("path");

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
});
