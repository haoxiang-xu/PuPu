const {
  computeProviderCallReceiptSha256,
  computeRunBundleDigest,
  deterministicBundleId,
  deterministicMetricEventId,
  normalizeRunBundleV1,
} = require("../../shared/run_bundle_v1");
const {
  HASH,
  ID,
  PYTHON_DIGEST,
  buildRunBundleV1,
} = require("../fixtures/run_bundle_v1_fixture.cjs");

const rehash = (bundle) => {
  bundle.bundle_digest = computeRunBundleDigest(bundle);
  return bundle;
};

const childFor = (bundle, overrides = {}) => {
  const child = {
    run_id: "run-child-1",
    attempt_id: "attempt-child-1",
    parent_run_id: bundle.identity.run_id,
    relation: "subagent",
    bundle_id: null,
    status: "completed",
    ...overrides,
  };
  child.bundle_id = overrides.bundle_id === undefined
    ? deterministicBundleId({
        execution_id: bundle.identity.execution_id,
        attempt_id: child.attempt_id,
        root_run_id: bundle.identity.root_run_id,
        run_id: child.run_id,
        parent_run_id: child.parent_run_id,
        relation: child.relation,
      })
    : overrides.bundle_id;
  return child;
};

describe("RunBundle v1 shared Electron contract", () => {
  test("uses the frozen canonical digest for the producer-compatible fixture", () => {
    const bundle = buildRunBundleV1();
    expect(bundle.bundle_id).toBe(ID.bundle);
    expect(bundle.provider_calls[0].provider_call_id).toBe(ID.openaiCall);
    expect(bundle.metrics.events[0].metric_event_id).toBe(ID.openaiMetric);
    expect(bundle.evidence.receipt_sha256s).toEqual([HASH.receipt]);
    expect(computeRunBundleDigest(bundle)).toBe(PYTHON_DIGEST.single);
    expect(normalizeRunBundleV1(bundle)).toEqual(bundle);
  });

  test("admits the frozen Python multi-provider reducer projection", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    expect(bundle.bundle_digest).toBe(PYTHON_DIGEST.multi);
    expect(bundle.provider_calls.map((receipt) => receipt.provider_call_id)).toEqual([
      ID.anthropicCall,
      ID.openaiCall,
    ]);
    expect(bundle.evidence.receipt_sha256s).toEqual([
      HASH.anthropicReceipt,
      HASH.receipt,
    ]);
    expect(normalizeRunBundleV1(bundle)).toEqual(bundle);
  });

  test("rejects a valid-shape bundle whose digest does not match", () => {
    const bundle = buildRunBundleV1();
    bundle.bundle_digest = "f".repeat(64);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(/canonical bundle content/);
  });

  test("rejects a forged provider_call_id even when every reference and digest agree", () => {
    const bundle = buildRunBundleV1();
    const forgedId = `pc_${"0".repeat(64)}`;
    bundle.provider_calls[0].provider_call_id = forgedId;
    bundle.aggregation.direct_call_ids = [forgedId];
    bundle.aggregation.all_call_ids = [forgedId];
    bundle.usage_slices[0].call_ids = [forgedId];
    bundle.evidence.receipt_sha256s = [
      computeProviderCallReceiptSha256(bundle.provider_calls[0]),
    ];
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /provider_call_id.*deterministic identity/,
    );
  });

  test("rejects raw provider ids and admits only their fixed hashes", () => {
    const bundle = buildRunBundleV1();
    bundle.provider_calls[0].provider_ids.request_id = "raw-provider-secret";
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /provider_ids.*unexpected key set/,
    );
  });

  test("enforces atomic provider-call timing invariants", () => {
    const missingBoth = buildRunBundleV1();
    missingBoth.provider_calls[0].timing.started_at = null;
    missingBoth.provider_calls[0].timing.completed_at = null;
    missingBoth.evidence.receipt_sha256s = [
      computeProviderCallReceiptSha256(missingBoth.provider_calls[0]),
    ];
    rehash(missingBoth);
    expect(() => normalizeRunBundleV1(missingBoth)).toThrow(
      /completed\/failed provider timing requires started_at and completed_at/,
    );

    const missingStart = buildRunBundleV1();
    missingStart.provider_calls[0].timing.started_at = null;
    missingStart.evidence.receipt_sha256s = [
      computeProviderCallReceiptSha256(missingStart.provider_calls[0]),
    ];
    rehash(missingStart);
    expect(() => normalizeRunBundleV1(missingStart)).toThrow(
      /completed_at.*requires started_at/,
    );

    const uncertainWithoutTiming = buildRunBundleV1({ unavailable: true });
    uncertainWithoutTiming.provider_calls[0].timing.started_at = null;
    uncertainWithoutTiming.provider_calls[0].timing.completed_at = null;
    uncertainWithoutTiming.evidence.receipt_sha256s = [
      computeProviderCallReceiptSha256(uncertainWithoutTiming.provider_calls[0]),
    ];
    rehash(uncertainWithoutTiming);
    expect(normalizeRunBundleV1(uncertainWithoutTiming)).toEqual(
      uncertainWithoutTiming,
    );

    const reversed = buildRunBundleV1();
    reversed.provider_calls[0].timing.completed_at =
      "2026-08-13T20:00:00.099999999Z";
    reversed.evidence.receipt_sha256s = [
      computeProviderCallReceiptSha256(reversed.provider_calls[0]),
    ];
    rehash(reversed);
    expect(() => normalizeRunBundleV1(reversed)).toThrow(
      /completed_at.*must not precede started_at/,
    );
  });

  test("enforces exact run lifecycle completion invariants", () => {
    const missingStart = buildRunBundleV1();
    missingStart.lifecycle.started_at = null;
    rehash(missingStart);
    expect(() => normalizeRunBundleV1(missingStart)).toThrow(
      /lifecycle\.started_at.*required/,
    );

    const runningWithCompletion = buildRunBundleV1();
    runningWithCompletion.lifecycle.status = "running";
    rehash(runningWithCompletion);
    expect(() => normalizeRunBundleV1(runningWithCompletion)).toThrow(
      /running lifecycle requires null completed_at/,
    );

    const terminalWithoutCompletion = buildRunBundleV1();
    terminalWithoutCompletion.lifecycle.completed_at = null;
    rehash(terminalWithoutCompletion);
    expect(() => normalizeRunBundleV1(terminalWithoutCompletion)).toThrow(
      /terminal lifecycle requires completed_at/,
    );

    const uncertain = buildRunBundleV1({ unavailable: true });
    uncertain.lifecycle.completed_at = null;
    rehash(uncertain);
    expect(normalizeRunBundleV1(uncertain)).toEqual(uncertain);
  });

  test("uses set-union evidence when receipts share one raw usage hash", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    bundle.provider_calls[0].raw_usage_sha256 = HASH.raw;
    bundle.evidence.receipt_sha256s = bundle.provider_calls
      .map((receipt) => computeProviderCallReceiptSha256(receipt))
      .sort();
    bundle.evidence.raw_usage_sha256s = [HASH.raw];
    rehash(bundle);
    expect(normalizeRunBundleV1(bundle)).toEqual(bundle);
  });

  test("rejects a forged bundle_id even when the outer digest is recomputed", () => {
    const bundle = buildRunBundleV1();
    bundle.bundle_id = `rb_${"0".repeat(64)}`;
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /bundle_id.*deterministic run identity/,
    );
  });

  test("rejects root-as-child and orphan run topologies", () => {
    const rootAsChild = buildRunBundleV1();
    rootAsChild.children = [
      childFor(rootAsChild, {
        run_id: rootAsChild.identity.run_id,
        parent_run_id: "run-child-parent",
      }),
    ];
    rehash(rootAsChild);
    expect(() => normalizeRunBundleV1(rootAsChild)).toThrow(
      /root as its own child/,
    );

    const orphan = buildRunBundleV1();
    orphan.children = [
      childFor(orphan, { parent_run_id: "missing-parent" }),
    ];
    rehash(orphan);
    expect(() => normalizeRunBundleV1(orphan)).toThrow(/orphan child/);
  });

  test("requires deterministic materialized child bundle ids", () => {
    const missing = buildRunBundleV1();
    missing.children = [childFor(missing, { bundle_id: null })];
    rehash(missing);
    expect(() => normalizeRunBundleV1(missing)).toThrow(
      /materialized run child requires a bundle_id/,
    );

    const forged = buildRunBundleV1();
    forged.children = [childFor(forged, { bundle_id: `rb_${"0".repeat(64)}` })];
    rehash(forged);
    expect(() => normalizeRunBundleV1(forged)).toThrow(
      /child bundle_id disagrees with its deterministic identity/,
    );
  });

  test("rejects child cycles even when every child id is deterministic", () => {
    const bundle = buildRunBundleV1();
    const first = childFor(bundle, {
      run_id: "run-child-1",
      attempt_id: "attempt-child-1",
      parent_run_id: "run-child-2",
    });
    const second = childFor(bundle, {
      run_id: "run-child-2",
      attempt_id: "attempt-child-2",
      parent_run_id: "run-child-1",
    });
    bundle.children = [first, second];
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(/child cycle/);
  });

  test("rejects aggregation usage that is not the exact receipt sum", () => {
    const bundle = buildRunBundleV1();
    bundle.aggregation.all_usage.output.visible_tokens = 151;
    bundle.aggregation.all_usage.output.reasoning_tokens = 49;
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /aggregation.*exact provider-receipt projection/,
    );
  });

  test("rejects a forged metric_event_id even when the outer digest agrees", () => {
    const bundle = buildRunBundleV1();
    bundle.metrics.events[0].metric_event_id = `me_${"0".repeat(64)}`;
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /metric_event_id.*deterministic identity/,
    );
  });

  test("counts artifact events and requires opaque kind-bound evidence refs", () => {
    const bundle = buildRunBundleV1();
    const artifactRef = `artifact_${"3".repeat(64)}`;
    const artifactEvent = {
      metric_event_id: "",
      execution_id: bundle.identity.execution_id,
      attempt_id: bundle.identity.attempt_id,
      root_run_id: bundle.identity.root_run_id,
      owner_run_id: bundle.identity.run_id,
      parent_run_id: bundle.identity.parent_run_id,
      kind: "artifact",
      subject_id: artifactRef,
      outcome: "completed",
      error: null,
      evidence_refs: [{ kind: "artifact", ref_id: artifactRef }],
    };
    artifactEvent.metric_event_id = deterministicMetricEventId(artifactEvent);
    bundle.metrics.events.push(artifactEvent);
    bundle.metrics.events.sort((left, right) =>
      left.metric_event_id.localeCompare(right.metric_event_id),
    );
    bundle.metrics.direct.artifacts = 1;
    bundle.metrics.all.artifacts = 1;
    rehash(bundle);
    expect(normalizeRunBundleV1(bundle)).toEqual(bundle);

    const rawRef = buildRunBundleV1();
    rawRef.metrics.events[0].evidence_refs = [
      { kind: "artifact", ref_id: "raw-artifact-id" },
    ];
    rehash(rawRef);
    expect(() => normalizeRunBundleV1(rawRef)).toThrow(
      /kind-bound opaque sha256 id/,
    );
  });

  test("rejects false metric counter projections", () => {
    const bundle = buildRunBundleV1();
    bundle.metrics.direct.model_attempts = 0;
    bundle.metrics.direct.iterations = 1;
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /metrics\.direct.*direct metric-event projection/,
    );
  });

  test("rejects metric events whose owner topology was coherently forged", () => {
    const bundle = buildRunBundleV1();
    const event = bundle.metrics.events[0];
    event.parent_run_id = "forged-parent";
    event.metric_event_id = deterministicMetricEventId(event);
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /metric event parent disagrees with owner topology/,
    );
  });

  test("requires model_attempt metric events to match receipts exactly", () => {
    const missing = buildRunBundleV1();
    missing.metrics.events = [];
    missing.metrics.direct = {
      ...missing.metrics.direct,
      model_attempts: 0,
    };
    missing.metrics.all = { ...missing.metrics.direct };
    rehash(missing);
    expect(() => normalizeRunBundleV1(missing)).toThrow(
      /model_attempt events must match provider receipts exactly/,
    );

    const wrongOutcome = buildRunBundleV1();
    wrongOutcome.metrics.events[0].outcome = "failed";
    rehash(wrongOutcome);
    expect(() => normalizeRunBundleV1(wrongOutcome)).toThrow(
      /model_attempt outcome disagrees with provider receipt/,
    );
  });

  test("rejects a coherent but false direct/descendant call partition", () => {
    const bundle = buildRunBundleV1();
    bundle.aggregation.direct_call_ids = [];
    bundle.aggregation.descendant_call_ids = [ID.openaiCall];
    bundle.aggregation.direct_usage = bundle.aggregation.descendant_usage;
    bundle.aggregation.descendant_usage = bundle.aggregation.all_usage;
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /aggregation.*exact provider-receipt projection/,
    );
  });

  test("rejects missing and mismatched usage-slice projections", () => {
    const missing = buildRunBundleV1();
    missing.usage_slices = [];
    rehash(missing);
    expect(() => normalizeRunBundleV1(missing)).toThrow(
      /partition every provider receipt/,
    );

    const mismatched = buildRunBundleV1();
    mismatched.usage_slices[0].usage.output.visible_tokens = 151;
    mismatched.usage_slices[0].usage.output.reasoning_tokens = 49;
    rehash(mismatched);
    expect(() => normalizeRunBundleV1(mismatched)).toThrow(
      /slice usage must equal its provider receipts/,
    );
  });

  test("rejects coherent but false bundle coverage and cost projections", () => {
    const coverage = buildRunBundleV1();
    coverage.coverage = {
      status: "unavailable",
      receipt_count: 1,
      observed_usage_count: 0,
      missing_usage_count: 1,
      uncertain_call_count: 0,
      missing_usage_call_ids: [ID.openaiCall],
    };
    rehash(coverage);
    expect(() => normalizeRunBundleV1(coverage)).toThrow(
      /coverage.*provider-receipt coverage projection/,
    );

    const cost = buildRunBundleV1();
    cost.cost = {
      status: "partial",
      basis: "list_price_estimate",
      amount_nano_usd: 1,
      currency: "USD",
      pricing_snapshot_ids: [],
    };
    rehash(cost);
    expect(() => normalizeRunBundleV1(cost)).toThrow(
      /cost.*provider-receipt cost projection/,
    );
  });

  test("rejects evidence that is not derived from immutable receipts", () => {
    const bundle = buildRunBundleV1();
    bundle.evidence.receipt_sha256s = ["0".repeat(64)];
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /evidence.*derived from provider receipts/,
    );
  });

  test("rejects bundles beyond the producer's 2 MiB canonical limit", () => {
    const bundle = buildRunBundleV1();
    for (let index = 0; index < 130; index += 1) {
      bundle.extensions[`pupu.test/padding_${index}`] = "x".repeat(16384);
    }
    rehash(bundle);
    expect(() => normalizeRunBundleV1(bundle)).toThrow(
      /serialized bundle exceeds the byte limit/,
    );
  });
});
