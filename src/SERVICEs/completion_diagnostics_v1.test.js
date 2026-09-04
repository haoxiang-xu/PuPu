import {
  COMPLETION_DIAGNOSTICS_V1_MAX_BYTES,
  COMPLETION_DIAGNOSTICS_V1_SCHEMA,
  computeCompletionDiagnosticsDigestV1,
  normalizeCompletionDiagnosticsV1,
} from "./completion_diagnostics_v1";

const envelope = (memoryV2) => ({
  schema: COMPLETION_DIAGNOSTICS_V1_SCHEMA,
  diagnostics_digest: computeCompletionDiagnosticsDigestV1(memoryV2),
  memory_v2: memoryV2,
});

describe("completion diagnostics v1 renderer admission", () => {
  test.each([
    ["active", { mode: "active", trace_status: "complete", active_applied: true }],
    ["shadow", { mode: "shadow", trace_status: "complete", shadow_only: true }],
    ["partial", { mode: "active", trace_status: "partial", persistence_degraded: true }],
  ])("admits bounded %s Memory V2 diagnostics", (_label, memoryV2) => {
    expect(normalizeCompletionDiagnosticsV1(envelope(memoryV2))).toEqual(
      envelope(memoryV2),
    );
  });

  test("allows an absent diagnostics envelope", () => {
    expect(normalizeCompletionDiagnosticsV1(null)).toBeNull();
    expect(normalizeCompletionDiagnosticsV1(undefined)).toBeNull();
  });

  test("matches the frozen Python producer digest", () => {
    const memoryV2 = {
      available_input_tokens: 91000,
      checkpoint_refs: [
        { uri: "pupu://context/checkpoint/checkpoint-1" },
      ],
      mode: "active",
      schema_version: "memory_v2.context.v1",
      trace_status: "partial",
    };
    expect(computeCompletionDiagnosticsDigestV1(memoryV2)).toBe(
      "14153fb472fefffe6a0e6642535cb0d1a86ea25f07f9af3631f98c8fbbc8d0fa",
    );
    expect(normalizeCompletionDiagnosticsV1(envelope(memoryV2))).toEqual(
      envelope(memoryV2),
    );
  });

  test("admits the producer's JSON-round-trippable numeric domain", () => {
    const memoryV2 = {
      canary_percent: "25",
      available_input_tokens: "9007199254741001",
      context_build: {
        ratio: "0.10000000000000001",
        ascii_key: "kept",
      },
    };
    expect(computeCompletionDiagnosticsDigestV1(memoryV2)).toBe(
      "ad823bfbd9af41240b5eb9accfaa2e96f05bb1588db158b26d6999ba8f96ad8d",
    );
    const value = envelope(memoryV2);
    expect(normalizeCompletionDiagnosticsV1(value)).toEqual(value);
  });

  test("rejects unknown envelope, schema, and Memory V2 keys", () => {
    expect(() =>
      normalizeCompletionDiagnosticsV1({
        ...envelope({ mode: "active" }),
        extra: true,
      }),
    ).toThrow(/unexpected key set/);
    expect(() =>
      normalizeCompletionDiagnosticsV1({
        ...envelope({ mode: "active" }),
        schema: "pupu.completion_diagnostics.v2",
      }),
    ).toThrow(/schema is unsupported/);
    expect(() =>
      normalizeCompletionDiagnosticsV1(
        envelope({ mode: "active", raw_model_payload: "forbidden" }),
      ),
    ).toThrow(/outside the renderer allowlist/);
  });

  test("rejects values that are not already in the producer's bounded domain", () => {
    expect(() =>
      normalizeCompletionDiagnosticsV1(
        envelope({
          mode: "active",
          context_build: { safe: "x".repeat(8193) },
        }),
      ),
    ).toThrow(/oversized string/);
    expect(() =>
      normalizeCompletionDiagnosticsV1(
        envelope({
          mode: "active",
          context_build: {
            api_key: "must-not-survive",
          },
        }),
      ),
    ).toThrow(/not an admitted diagnostics key/);
    expect(() =>
      normalizeCompletionDiagnosticsV1(
        envelope({
          mode: "active",
          canary_percent: 0.1,
        }),
      ),
    ).toThrow(/non-canonical number/);
  });

  test("rejects a forged diagnostics digest", () => {
    expect(() =>
      normalizeCompletionDiagnosticsV1({
        ...envelope({ mode: "active" }),
        diagnostics_digest: "0".repeat(64),
      }),
    ).toThrow(/does not match the canonical body/);
  });

  test("rejects recursive non-ASCII keys", () => {
    expect(() =>
      normalizeCompletionDiagnosticsV1(
        envelope({
        mode: "active",
        context_build: {
            非ascii: "dropped-by-producer",
        },
        }),
      ),
    ).toThrow(/not an admitted diagnostics key/);
  });

  test("rejects a projected envelope beyond 128 KiB", () => {
    const contextBuild = {};
    for (let index = 0; index < 96; index += 1) {
      contextBuild[`safe_${index}`] = "x".repeat(8192);
    }
    const value = envelope({ mode: "active", context_build: contextBuild });
    expect(JSON.stringify(value).length).toBeGreaterThan(
      COMPLETION_DIAGNOSTICS_V1_MAX_BYTES,
    );
    expect(() => normalizeCompletionDiagnosticsV1(value)).toThrow(
      /canonical byte limit/,
    );
  });
});
