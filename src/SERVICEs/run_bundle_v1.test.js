import {
  RUN_BUNDLE_V1_SCHEMA,
  normalizeRendererRunBundleV1,
  selectRunBundleUsage,
} from "./run_bundle_v1";

const {
  buildRunBundleV1,
  usage,
} = require("../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

describe("renderer-safe RunBundle v1 contract", () => {
  test("admits the exact locked schema and preserves multi-model slices", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    const normalized = normalizeRendererRunBundleV1(bundle);
    expect(normalized.schema).toBe(RUN_BUNDLE_V1_SCHEMA);
    expect(normalized.usage_slices).toHaveLength(2);
    expect(
      normalized.usage_slices.map((slice) => slice.provider),
    ).toEqual(["anthropic", "openai"]);
    expect(
      normalized.usage_slices[0].usage.input.cache_write_5m_tokens,
    ).toBe(60);
    expect(
      normalized.usage_slices[0].usage.input.cache_write_1h_tokens,
    ).toBe(40);
  });

  test("fails closed on unknown core keys and forbidden extension payloads", () => {
    const bundle = buildRunBundleV1();
    expect(() =>
      normalizeRendererRunBundleV1({ ...bundle, raw_prompt: "secret" }),
    ).toThrow(/unexpected key set/);

    const extensionBundle = buildRunBundleV1();
    extensionBundle.extensions["pupu.dev/debug"] = {
      request: { raw: "must not cross" },
    };
    expect(() => normalizeRendererRunBundleV1(extensionBundle)).toThrow(
      /payload field is forbidden/,
    );
  });

  test("requires Anthropic cache-write aggregate to match known TTL parts", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    bundle.usage_slices[0].usage.input.cache_write_tokens = 101;
    bundle.usage_slices[0].usage.input.total_tokens = 351;
    bundle.usage_slices[0].usage.total_tokens = 451;
    expect(() => normalizeRendererRunBundleV1(bundle)).toThrow(
      /5m and 1h cache-write breakdown/,
    );
  });

  test("rejects bundles beyond the producer's 2 MiB canonical limit", () => {
    const bundle = buildRunBundleV1();
    for (let index = 0; index < 130; index += 1) {
      bundle.extensions[`pupu.test/padding_${index}`] = "x".repeat(16384);
    }
    expect(() => normalizeRendererRunBundleV1(bundle)).toThrow(
      /serialized bundle exceeds the byte limit/,
    );
  });

  test("rejects false terminal lifecycle and raw metric evidence claims", () => {
    const receiptTiming = buildRunBundleV1();
    receiptTiming.provider_calls[0].timing.started_at = null;
    receiptTiming.provider_calls[0].timing.completed_at = null;
    expect(() => normalizeRendererRunBundleV1(receiptTiming)).toThrow(
      /completed\/failed provider timing requires started_at and completed_at/,
    );

    const lifecycle = buildRunBundleV1();
    lifecycle.lifecycle.completed_at = null;
    expect(() => normalizeRendererRunBundleV1(lifecycle)).toThrow(
      /terminal lifecycle requires completed_at/,
    );

    const evidence = buildRunBundleV1();
    evidence.metrics.events[0].evidence_refs = [
      { kind: "artifact", ref_id: "raw-artifact-id" },
    ];
    expect(() => normalizeRendererRunBundleV1(evidence)).toThrow(
      /kind-bound opaque sha256 id/,
    );
  });
});

describe("canonical RunBundle usage selector", () => {
  test("OpenAI 1000 input with 600 cached displays 1000 in, not 1600", () => {
    const selected = selectRunBundleUsage(buildRunBundleV1());
    expect(selected.input).toBe(1000);
    expect(selected.cacheRead).toBe(600);
    expect(selected.output).toBe(200);
    expect(selected.reasoning).toBe(50);
    expect(selected.total).toBe(1200);
  });

  test("reasoning stays an output subset and partial coverage remains explicit", () => {
    const bundle = buildRunBundleV1();
    bundle.coverage = {
      status: "partial",
      receipt_count: 1,
      observed_usage_count: 0,
      missing_usage_count: 1,
      uncertain_call_count: 0,
      missing_usage_call_ids: ["call-openai-1"],
    };
    const selected = selectRunBundleUsage(bundle);
    expect(selected.output).toBe(200);
    expect(selected.reasoning).toBe(50);
    expect(selected.total).toBe(1200);
    expect(selected.partial).toBe(true);
    expect(selected.coverage).toBe("partial");
  });

  test("unknown canonical counts remain null rather than becoming zero", () => {
    const bundle = buildRunBundleV1();
    const unknown = usage({
      uncached: null,
      cacheRead: null,
      cacheWrite: null,
      cacheWrite5m: null,
      cacheWrite1h: null,
      input: null,
      visible: null,
      reasoning: null,
      output: null,
      total: null,
      source: "unavailable",
    });
    bundle.provider_calls[0].usage = unknown;
    bundle.aggregation.direct_usage = unknown;
    bundle.aggregation.all_usage = unknown;
    bundle.usage_slices = [];
    bundle.coverage = {
      status: "unavailable",
      receipt_count: 1,
      observed_usage_count: 0,
      missing_usage_count: 1,
      uncertain_call_count: 0,
      missing_usage_call_ids: ["call-openai-1"],
    };
    const selected = selectRunBundleUsage(bundle);
    expect(selected).toMatchObject({
      input: null,
      output: null,
      total: null,
      cacheRead: null,
      cacheWrite: null,
      reasoning: null,
      coverage: "unavailable",
      partial: true,
    });
  });

  test("legacy cached input is annotated but never added again", () => {
    expect(
      selectRunBundleUsage({
        input_tokens: 1000,
        output_tokens: 200,
        consumed_tokens: 1200,
        cache_read_input_tokens: 600,
      }),
    ).toMatchObject({
      input: 1000,
      cacheRead: 600,
      output: 200,
      total: 1200,
      source: "legacy_partial",
    });
  });
});
