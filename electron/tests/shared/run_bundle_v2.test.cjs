const {
  RUN_BUNDLE_V2_SCHEMA,
  RUN_BUNDLE_DETAILS_REF_SCHEMA,
  canonicalizeRunBundleV2,
  normalizeRunBundleV2,
} = require("../../shared/run_bundle_v2");
const crypto = require("crypto");

const digest = (value) =>
  crypto.createHash("sha256").update(canonicalizeRunBundleV2(value), "utf8").digest("hex");

const fixture = () => {
  const body = {
    schema: RUN_BUNDLE_V2_SCHEMA,
    bundle_id: "bundle-v2",
    revision: 1,
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
      schema: RUN_BUNDLE_DETAILS_REF_SCHEMA,
      details_id: "rbd_" + "1".repeat(64),
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
  };
  return { ...body, bundle_digest: digest(body) };
};

describe("RunBundle v2 strict envelope", () => {
  test("accepts a canonical summary with immutable details ref", () => {
    const bundle = fixture();
    expect(normalizeRunBundleV2(bundle)).toEqual(bundle);
  });

  test("rejects a present-invalid v2 value without v1 fallback", () => {
    expect(() => normalizeRunBundleV2({ schema: RUN_BUNDLE_V2_SCHEMA })).toThrow(
      /unknown or missing fields/,
    );
  });

  test("rejects a digest change", () => {
    const bundle = fixture();
    bundle.extensions = { "unchain.test/v2": { changed: true } };
    expect(() => normalizeRunBundleV2(bundle)).toThrow(/bundle_digest/);
  });
});
