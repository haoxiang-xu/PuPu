import {
  CONTEXT_COMPOSITION_EXTENSION_KEY,
  hasContextCompositionEvidence,
  selectContextCompositionView,
} from "./context_composition_v1";

const {
  buildRunBundleV1,
} = require("../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

const extension = ({
  categories = [
    {
      id: "instructions",
      tokens: 300,
      source_count: 1,
      subtypes: [
        { id: "core_system", tokens: 300, source_count: 1 },
      ],
    },
    {
      id: "skills",
      tokens: 200,
      source_count: 1,
      subtypes: [
        { id: "expanded_invocation", tokens: 200, source_count: 1 },
      ],
    },
  ],
  quality = "reconciled_estimate",
  attributedTokens = 500,
  residualTokens = 500,
  contextWindowTokens = 128000,
  coverage = {
    status: "complete",
    manifest_items: 2,
    matched_items: 2,
    wire_surfaces: 1,
    matched_surfaces: 1,
  },
  routeName = "primary",
} = {}) => ({
  schema: "unchain.context/context_composition_v1",
  method: "utf8_heuristic_v1",
  quality,
  context_window_tokens: contextWindowTokens,
  wire: {
    envelope_sha256: `sha256:${"a".repeat(64)}`,
    route_name: routeName,
    route_sha256: `sha256:${"b".repeat(64)}`,
    context_mode: "semantic",
  },
  categories,
  attributed_tokens: attributedTokens,
  residual_tokens: residualTokens,
  coverage,
});

const attach = (bundle, index, value) => {
  bundle.provider_calls[index].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] =
    value;
  return bundle;
};

describe("Context Composition v1 renderer selector", () => {
  test("selects one exact physical model call and reconciles its percentages", () => {
    const bundle = attach(buildRunBundleV1(), 0, extension());
    const view = selectContextCompositionView(bundle, {
      scope: "model_call",
    });

    expect(view).toMatchObject({
      available: true,
      scope: "model_call",
      providerTotalQuality: "reported",
      providerInputTokens: 1000,
      compositionQuality: "reconciled_estimate",
      attributedTokens: 500,
      residualTokens: 500,
      contextWindowTokens: 128000,
      percentageAvailable: true,
    });
    expect(view.windowPressure).toBeCloseTo(1000 / 128000);
    expect(view.groups.map((group) => group.id)).toEqual([
      "instructions",
      "skills",
    ]);
    expect(view.groups[0].share).toBeCloseTo(0.3);
    expect(view.groups[1].share).toBeCloseTo(0.2);
  });

  test("withholds every percentage when the exact model call has no context window", () => {
    const bundle = attach(
      buildRunBundleV1(),
      0,
      extension({ contextWindowTokens: null }),
    );

    const view = selectContextCompositionView(bundle, { scope: "model_call" });

    expect(view).toMatchObject({
      available: true,
      providerTotalQuality: "reported",
      compositionQuality: "reconciled_estimate",
      contextWindowTokens: null,
      percentageAvailable: false,
      windowPressure: null,
      peakWindowPressure: null,
    });
    expect(view.groups.every((group) => group.share === null)).toBe(true);
  });

  test("defaults to the latest physical call instead of receipt-set storage order", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    attach(
      bundle,
      0,
      extension({
        categories: [
          {
            id: "conversation",
            tokens: 120,
            source_count: 1,
            subtypes: [
              { id: "current_input", tokens: 120, source_count: 1 },
            ],
          },
        ],
        attributedTokens: 120,
        residualTokens: 230,
        coverage: {
          status: "complete",
          manifest_items: 1,
          matched_items: 1,
          wire_surfaces: 1,
          matched_surfaces: 1,
        },
      }),
    );
    attach(bundle, 1, extension());

    const view = selectContextCompositionView(bundle, { scope: "model_call" });
    expect(view.selectedCallKey).toBe("call-2");
    expect(view.call.iteration).toBe(2);
    expect(view.calls.map((call) => call.iteration)).toEqual([1, 2]);
  });

  test("fails a stale presentation call key closed instead of guessing the latest call", () => {
    const bundle = attach(buildRunBundleV1(), 0, extension());
    expect(
      selectContextCompositionView(bundle, {
        scope: "model_call",
        callKey: "call-999",
      }),
    ).toMatchObject({
      available: false,
      reason: "extension_invalid",
    });
  });

  test("merges backend tool and memory categories only at the UI group layer", () => {
    const categories = [
      {
        id: "tool_definitions",
        tokens: 20,
        source_count: 1,
        subtypes: [
          { id: "provider_schema", tokens: 20, source_count: 1 },
        ],
      },
      {
        id: "tool_activity",
        tokens: 180,
        source_count: 1,
        subtypes: [{ id: "results", tokens: 180, source_count: 1 }],
      },
      {
        id: "memory",
        tokens: 10,
        source_count: 1,
        subtypes: [
          { id: "long_term_recall", tokens: 10, source_count: 1 },
        ],
      },
      {
        id: "task_state",
        tokens: 90,
        source_count: 1,
        subtypes: [
          { id: "pinned_state", tokens: 90, source_count: 1 },
        ],
      },
    ];
    const bundle = attach(
      buildRunBundleV1(),
      0,
      extension({
        categories,
        attributedTokens: 300,
        residualTokens: 700,
        coverage: {
          status: "complete",
          manifest_items: 4,
          matched_items: 4,
          wire_surfaces: 2,
          matched_surfaces: 2,
        },
      }),
    );

    const view = selectContextCompositionView(bundle, { scope: "model_call" });
    expect(view.groups.map((group) => [group.id, group.tokens])).toEqual([
      ["tools", 200],
      ["memory_task_state", 100],
    ]);
    expect(view.groups[0].subtypes.map((item) => item.id)).toEqual([
      "provider_schema",
      "results",
    ]);
    expect(view.groups[1].subtypes.map((item) => item.id)).toEqual([
      "long_term_recall",
      "pinned_state",
    ]);
  });

  test("keeps the fixed UI group order when token sizes change", () => {
    const bundle = attach(
      buildRunBundleV1(),
      0,
      extension({
        categories: [
          {
            id: "instructions",
            tokens: 1,
            source_count: 1,
            subtypes: [
              { id: "core_system", tokens: 1, source_count: 1 },
            ],
          },
          {
            id: "skills",
            tokens: 899,
            source_count: 1,
            subtypes: [
              { id: "loaded_body", tokens: 899, source_count: 1 },
            ],
          },
        ],
        attributedTokens: 900,
        residualTokens: 100,
      }),
    );

    const view = selectContextCompositionView(bundle, { scope: "model_call" });
    expect(view.groups.map((group) => group.id)).toEqual([
      "instructions",
      "skills",
    ]);
  });

  test("fails only the optional composition on unknown keys or inconsistent sums", () => {
    const extra = extension();
    extra.raw_prompt = "must never be admitted";
    const extraBundle = attach(buildRunBundleV1(), 0, extra);
    expect(selectContextCompositionView(extraBundle, { scope: "model_call" })).toMatchObject({
      available: false,
      reason: "extension_invalid",
    });

    const inconsistent = extension();
    inconsistent.attributed_tokens = 499;
    const inconsistentBundle = attach(buildRunBundleV1(), 0, inconsistent);
    expect(
      selectContextCompositionView(inconsistentBundle, { scope: "model_call" }),
    ).toMatchObject({ available: false, reason: "extension_invalid" });

    const counterfeitCoverage = extension({
      coverage: {
        status: "complete",
        manifest_items: 999,
        matched_items: 999,
        wire_surfaces: 1,
        matched_surfaces: 1,
      },
    });
    const counterfeitBundle = attach(
      buildRunBundleV1(),
      0,
      counterfeitCoverage,
    );
    expect(
      selectContextCompositionView(counterfeitBundle, { scope: "model_call" }),
    ).toMatchObject({ available: false, reason: "extension_invalid" });

    const excessiveSurfaces = extension();
    excessiveSurfaces.coverage.wire_surfaces = 5;
    excessiveSurfaces.coverage.matched_surfaces = 5;
    const excessiveSurfacesBundle = attach(
      buildRunBundleV1(),
      0,
      excessiveSurfaces,
    );
    expect(
      selectContextCompositionView(excessiveSurfacesBundle, {
        scope: "model_call",
      }),
    ).toMatchObject({ available: false, reason: "extension_invalid" });
  });

  test("preserves an overestimate without clamping or inventing percentages", () => {
    const bundle = attach(
      buildRunBundleV1(),
      0,
      extension({
        categories: [
          {
            id: "conversation",
            tokens: 1200,
            source_count: 1,
            subtypes: [
              { id: "user_history", tokens: 1200, source_count: 1 },
            ],
          },
        ],
        quality: "estimated",
        attributedTokens: 1200,
        residualTokens: null,
        coverage: {
          status: "complete",
          manifest_items: 1,
          matched_items: 1,
          wire_surfaces: 1,
          matched_surfaces: 1,
        },
      }),
    );
    const view = selectContextCompositionView(bundle, { scope: "model_call" });
    expect(view.attributedTokens).toBe(1200);
    expect(view.percentageAvailable).toBe(false);
    expect(view.windowPressure).toBeNull();
    expect(view.peakWindowPressure).toBeNull();
    expect(view.groups[0].share).toBeNull();
  });

  test("keeps internal wire evidence and durable identities out of the presentation model", () => {
    const bundle = attach(buildRunBundleV1(), 0, extension());
    const receipt = bundle.provider_calls[0];
    const view = selectContextCompositionView(bundle, { scope: "model_call" });
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain("sha256:");
    expect(serialized).not.toContain(receipt.provider_call_id);
    expect(serialized).not.toContain(receipt.identity.owner_run_id);
    expect(serialized).not.toContain(receipt.identity.purpose);
    expect(serialized).not.toContain("utf8_heuristic_v1");
    expect(serialized).not.toContain("unchain.context/context_composition_v1");
    expect(view.calls[0].key).toBe("call-1");
  });

  test("aggregates Run Tree by the canonical provider-call set exactly once", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    attach(
      bundle,
      0,
      extension({
        categories: [
          {
            id: "conversation",
            tokens: 120,
            source_count: 1,
            subtypes: [
              { id: "current_input", tokens: 120, source_count: 1 },
            ],
          },
        ],
        quality: "estimated",
        attributedTokens: 120,
        residualTokens: null,
        coverage: {
          status: "complete",
          manifest_items: 1,
          matched_items: 1,
          wire_surfaces: 1,
          matched_surfaces: 1,
        },
      }),
    );
    attach(
      bundle,
      1,
      extension({
        categories: [
          {
            id: "skills",
            tokens: 80,
            source_count: 1,
            subtypes: [
              { id: "expanded_invocation", tokens: 80, source_count: 1 },
            ],
          },
        ],
        quality: "estimated",
        attributedTokens: 80,
        residualTokens: null,
        coverage: {
          status: "complete",
          manifest_items: 1,
          matched_items: 1,
          wire_surfaces: 1,
          matched_surfaces: 1,
        },
      }),
    );

    const view = selectContextCompositionView(bundle, { scope: "run_tree" });
    expect(view).toMatchObject({
      available: true,
      scope: "run_tree",
      callCount: 2,
      attributedTokens: 200,
      percentageAvailable: false,
      contextWindowTokens: null,
      windowPressure: null,
      peakWindowPressure: null,
    });
    expect(view.groups.map((group) => [group.id, group.tokens])).toEqual([
      ["skills", 80],
      ["conversation", 120],
    ]);
  });

  test("keeps provider totals complete when one Run Tree call lacks composition", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    attach(
      bundle,
      0,
      extension({
        categories: [
          {
            id: "conversation",
            tokens: 120,
            source_count: 1,
            subtypes: [
              { id: "current_input", tokens: 120, source_count: 1 },
            ],
          },
        ],
        quality: "estimated",
        attributedTokens: 120,
        residualTokens: null,
        coverage: {
          status: "complete",
          manifest_items: 1,
          matched_items: 1,
          wire_surfaces: 1,
          matched_surfaces: 1,
        },
      }),
    );

    const view = selectContextCompositionView(bundle, { scope: "run_tree" });
    expect(view).toMatchObject({
      available: true,
      callCount: 2,
      providerTotalQuality: "reported",
      providerInputTokens: 1350,
      deliveredInputTokens: 1350,
      compositionQuality: "partial",
      attributedTokens: 120,
      percentageAvailable: false,
      peakWindowPressure: null,
    });
  });

  test("does not expose a known subtotal as delivered input when any provider total is unavailable", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    const estimated = extension({
      quality: "estimated",
      residualTokens: null,
    });
    attach(bundle, 0, estimated);
    attach(bundle, 1, estimated);
    bundle.provider_calls[1].usage.input.total_tokens = null;

    const view = selectContextCompositionView(bundle, { scope: "run_tree" });
    expect(view).toMatchObject({
      available: true,
      providerTotalQuality: "unavailable",
      providerInputTokens: null,
      deliveredInputTokens: null,
      percentageAvailable: false,
      peakWindowPressure: null,
    });
  });

  test("excludes a receipt whose reconciled composition disagrees with its provider total", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    attach(
      bundle,
      0,
      extension({
        categories: [
          {
            id: "conversation",
            tokens: 120,
            source_count: 1,
            subtypes: [
              { id: "current_input", tokens: 120, source_count: 1 },
            ],
          },
        ],
        attributedTokens: 120,
        residualTokens: 229,
        coverage: {
          status: "complete",
          manifest_items: 1,
          matched_items: 1,
          wire_surfaces: 1,
          matched_surfaces: 1,
        },
      }),
    );
    attach(bundle, 1, extension());

    const view = selectContextCompositionView(bundle, { scope: "run_tree" });
    expect(view).toMatchObject({
      available: true,
      reason: "extension_invalid",
      providerTotalQuality: "reported",
      providerInputTokens: 1350,
      deliveredInputTokens: 1350,
      compositionQuality: "partial",
      attributedTokens: 500,
      residualTokens: null,
      percentageAvailable: false,
    });
    expect(view.groups.map((group) => group.id)).toEqual([
      "instructions",
      "skills",
    ]);
  });

  test("fails the optional Run Tree projection closed when checked sums overflow", () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    const oversized = extension({
      categories: [
        {
          id: "instructions",
          tokens: Number.MAX_SAFE_INTEGER,
          source_count: 1,
          subtypes: [
            {
              id: "core_system",
              tokens: Number.MAX_SAFE_INTEGER,
              source_count: 1,
            },
          ],
        },
      ],
      quality: "estimated",
      attributedTokens: Number.MAX_SAFE_INTEGER,
      residualTokens: null,
      coverage: {
        status: "complete",
        manifest_items: 1,
        matched_items: 1,
        wire_surfaces: 1,
        matched_surfaces: 1,
      },
    });
    attach(bundle, 0, oversized);
    attach(bundle, 1, oversized);

    expect(selectContextCompositionView(bundle, { scope: "run_tree" })).toMatchObject({
      available: false,
      reason: "extension_invalid",
    });
  });

  test("keeps the legacy token summary non-interactive when no receipt carries evidence", () => {
    const bundle = buildRunBundleV1();
    expect(hasContextCompositionEvidence(bundle)).toBe(false);
    expect(selectContextCompositionView(bundle, { scope: "model_call" })).toBeNull();
  });
});
