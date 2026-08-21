import {
  admitDoneRunAccountingV1,
  persistDoneRunBundleV1,
  projectRunBundleTokenUsage,
  queryRunBundleTokenUsage,
} from "./run_bundle_storage";
import { computeCompletionDiagnosticsDigestV1 } from "./completion_diagnostics_v1";

const {
  buildRunBundleV1,
} = require("../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

const storedRecord = (bundle) => ({
  bundle,
  usageSlices: bundle.usage_slices,
  createdAt: Date.parse("2026-08-13T20:00:01Z"),
  updatedAt: Date.parse("2026-08-13T20:00:01Z"),
});

const buildRendererRunBundleV2 = () => ({
  schema: "unchain.run_bundle.v2",
  bundle_id: "bundle-v2",
  revision: 1,
  bundle_digest: "4".repeat(64),
  identity: {
    execution_id: "execution-1",
    attempt_id: "attempt-1",
    root_run_id: "root-1",
    run_id: "root-1",
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
  provider_call_count: 0,
  direct_provider_call_count: 0,
  descendant_provider_call_count: 0,
  aggregation_usage: {},
  direct_usage: {},
  descendant_usage: {},
  metrics: {},
  coverage: { status: "unavailable" },
  cost: { status: "unavailable" },
  legacy: { status: "canonical" },
  evidence: {},
  children: { count: 0, set_sha256: "0".repeat(64) },
  details_ref: {
    schema: "unchain.run_bundle_details_ref.v1",
    details_id: `rbd_${"1".repeat(64)}`,
    facts_digest: "2".repeat(64),
    total_bytes: 0,
    parts: [
      {
        name: "provider_calls",
        item_count: 0,
        canonical_bytes: 0,
        root_sha256: "3".repeat(64),
      },
    ],
  },
  extensions: {},
});

describe("RunBundle Settings usage projection", () => {
  afterEach(() => {
    delete window.runBundleStorageAPI;
  });

  test("counts each provider call once without re-adding cache or reasoning", () => {
    const bundle = buildRunBundleV1();
    const rows = projectRunBundleTokenUsage([
      storedRecord(bundle),
      storedRecord(bundle),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "openai",
      model_id: "openai:gpt-5.6",
      consumed_tokens: 1200,
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 600,
      reasoning_output_tokens: 50,
      provider_call_id: bundle.provider_calls[0].provider_call_id,
    });
  });

  test("preserves unavailable provider counts as null", () => {
    const rows = projectRunBundleTokenUsage([
      storedRecord(buildRunBundleV1({ unavailable: true })),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      consumed_tokens: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_input_tokens: null,
      reasoning_output_tokens: null,
      usage_source: "unavailable",
    });
  });

  test("fails closed when one provider_call_id has conflicting receipts", () => {
    const first = buildRunBundleV1();
    const conflicting = buildRunBundleV1();
    conflicting.provider_calls[0].usage.total_tokens = 1201;
    expect(() =>
      projectRunBundleTokenUsage([
        storedRecord(first),
        storedRecord(conflicting),
      ]),
    ).toThrow(/conflicting receipts/);
  });

  test("queries the canonical keyed store and projects per-call timing", async () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    const query = jest.fn(() =>
      Promise.resolve({ ok: true, records: [storedRecord(bundle)] }),
    );
    window.runBundleStorageAPI = {
      upsert: jest.fn(),
      query,
      clear: jest.fn(),
    };

    const rows = await queryRunBundleTokenUsage({
      startMs: Date.parse("2026-08-13T00:00:00Z"),
      endMs: Date.parse("2026-08-14T00:00:00Z"),
    });

    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.consumed_tokens, 0)).toBe(1650);
    expect(query).toHaveBeenCalledWith({
      startMs: Date.parse("2026-08-13T00:00:00Z"),
      endMs: Date.parse("2026-08-14T00:00:00Z"),
      limit: 5000,
      offset: 0,
    });
  });
});

describe("done RunBundle admission", () => {
  afterEach(() => {
    delete window.runBundleStorageAPI;
  });

  test("keeps an absent or schema-less legacy bundle read-only", async () => {
    await expect(persistDoneRunBundleV1({})).resolves.toMatchObject({
      status: "legacy_read_only",
    });
    await expect(
      persistDoneRunBundleV1({ bundle: { consumed_tokens: 1 } }),
    ).resolves.toMatchObject({ status: "legacy_read_only" });
  });

  test("rejects present malformed bundle claims", () => {
    expect(() => persistDoneRunBundleV1({ bundle: "invalid" })).toThrow(
      /done\.bundle must be an object/,
    );
    expect(() =>
      persistDoneRunBundleV1({ bundle: { schema: "unchain.run_bundle.v2" } }),
    ).toThrow(/unknown or missing fields/);
  });

  test("admits diagnostics and awaits an exact canonical UPSERT acknowledgement", async () => {
    const bundle = buildRunBundleV1();
    const upsert = jest.fn(async () => ({
      ok: true,
      status: "inserted",
      bundleId: bundle.bundle_id,
      revision: bundle.revision,
      bundleDigest: bundle.bundle_digest,
    }));
    window.runBundleStorageAPI = {
      upsert,
      query: jest.fn(),
      clear: jest.fn(),
    };
    const completionDiagnostics = {
      schema: "pupu.completion_diagnostics.v1",
      diagnostics_digest: computeCompletionDiagnosticsDigestV1({
        mode: "shadow",
        trace_status: "complete",
        shadow_only: true,
      }),
      memory_v2: {
        mode: "shadow",
        trace_status: "complete",
        shadow_only: true,
      },
    };

    await expect(
      admitDoneRunAccountingV1({
        bundle,
        completion_diagnostics: completionDiagnostics,
      }),
    ).resolves.toMatchObject({
      bundle,
      completionDiagnostics,
      ledger: { ok: true, bundleId: bundle.bundle_id },
    });
    expect(upsert).toHaveBeenCalledWith(bundle);
  });

  test("keeps v2 completion behind the durable UPSERT barrier", async () => {
    const bundle = buildRendererRunBundleV2();
    const upsert = jest.fn(async () => ({
      ok: true,
      status: "inserted",
      bundleId: bundle.bundle_id,
      revision: bundle.revision,
      bundleDigest: bundle.bundle_digest,
    }));
    window.runBundleStorageAPI = {
      upsert,
      query: jest.fn(),
      clear: jest.fn(),
    };

    const admission = admitDoneRunAccountingV1({ bundle });
    expect(admission).toBeInstanceOf(Promise);
    await expect(admission).resolves.toMatchObject({
      bundle,
      ledger: { ok: true, bundleId: bundle.bundle_id },
    });
    expect(upsert).toHaveBeenCalledWith(bundle);
  });

  test("fails before durable completion on invalid diagnostics or acknowledgement", async () => {
    const bundle = buildRunBundleV1();
    const upsert = jest.fn(async () => ({ ok: false }));
    window.runBundleStorageAPI = {
      upsert,
      query: jest.fn(),
      clear: jest.fn(),
    };

    expect(() =>
      admitDoneRunAccountingV1({
        bundle,
        completion_diagnostics: {
          schema: "pupu.completion_diagnostics.v1",
          diagnostics_digest: computeCompletionDiagnosticsDigestV1({
            mode: "active",
            unknown: true,
          }),
          memory_v2: { mode: "active", unknown: true },
        },
      }),
    ).toThrow(/completion_diagnostics_invalid/);
    expect(upsert).not.toHaveBeenCalled();

    await expect(admitDoneRunAccountingV1({ bundle })).rejects.toThrow(
      /UPSERT acknowledgement is invalid/,
    );
  });
});
