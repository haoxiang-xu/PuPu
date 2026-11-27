import {
  buildContextUsageView,
  selectActiveContextWindowTokens,
  selectContextUsage,
  selectContextWindowTokens,
  selectLatestContextUsage,
} from "./context_usage_v1";
import {
  CONTEXT_COMPOSITION_EXTENSION_KEY,
  normalizeContextCompositionExtension,
} from "./context_composition_v1";

const {
  buildRunBundleV1,
} = require("../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

const usageReceipt = ({ id, iteration, retry = 0, startedAt, inputTokens }) => {
  const receipt = buildRunBundleV1().provider_calls[0];
  receipt.provider_call_id = id;
  receipt.identity.iteration = iteration;
  receipt.identity.retry_ordinal = retry;
  receipt.provider = { name: "hyperspace", model: "anthropic--claude-4.8-opus" };
  receipt.timing = { started_at: startedAt, completed_at: startedAt };
  receipt.usage.input.total_tokens = inputTokens;
  return receipt;
};

const compositionWindow = (contextWindowTokens, inputTokens) => ({
  schema: "unchain.context/context_composition_v1",
  method: "utf8_heuristic_v1",
  quality: "reconciled_estimate",
  context_window_tokens: contextWindowTokens,
  wire: {
    envelope_sha256: `sha256:${"a".repeat(64)}`,
    route_name: "primary",
    route_sha256: `sha256:${"b".repeat(64)}`,
    context_mode: "semantic",
  },
  categories: [{
    id: "instructions", tokens: 300, source_count: 1,
    subtypes: [{ id: "core_system", tokens: 300, source_count: 1 }],
  }],
  attributed_tokens: 300,
  residual_tokens: inputTokens - 300,
  coverage: {
    status: "complete", manifest_items: 1, matched_items: 1,
    wire_surfaces: 1, matched_surfaces: 1,
  },
});

describe("Context usage receipt identity and chronology", () => {
  test("uses call timestamps rather than opaque receipt IDs or array order", () => {
    const older = usageReceipt({
      id: `pc_${"f".repeat(64)}`, iteration: 7,
      startedAt: "2026-10-23T12:00:00.000Z", inputTokens: 129650,
    });
    const newer = usageReceipt({
      id: `pc_${"5".repeat(64)}`, iteration: 37,
      startedAt: "2026-10-23T13:00:00.000Z", inputTokens: 158474,
    });
    for (const calls of [[newer, older], [older, newer]]) {
      expect(selectContextUsage({ provider_calls: calls }).inputTokens).toBe(158474);
    }
  });

  test("equal timestamps use iteration then retry ordinal", () => {
    const base = { startedAt: "2026-10-23T13:00:00.000Z" };
    const previousIteration = usageReceipt({ ...base, id: "old", iteration: 2, retry: 5, inputTokens: 500 });
    const latestIteration = usageReceipt({ ...base, id: "latest", iteration: 3, retry: 0, inputTokens: 600 });
    const latestRetry = usageReceipt({ ...base, id: "retry", iteration: 3, retry: 1, inputTokens: 700 });
    expect(selectContextUsage({ provider_calls: [latestRetry, previousIteration, latestIteration] }).inputTokens).toBe(700);
  });

  test.each([
    ["microseconds", "2026-10-23T13:00:00.000100Z", "2026-10-23T13:00:00.000900Z"],
    ["different fractional widths", "2026-10-23T13:00:00.0001Z", "2026-10-23T13:00:00.000900Z"],
    ["different UTC offsets", "2026-10-23T14:00:00.000100+01:00", "2026-10-23T13:00:00.000900Z"],
  ])("preserves submillisecond chronology with %s across graph owners", (_label, earlierTime, laterTime) => {
    const earlier = usageReceipt({ id: "earlier", iteration: 37, startedAt: earlierTime, inputTokens: 1000 });
    const later = usageReceipt({ id: "later", iteration: 0, startedAt: laterTime, inputTokens: 2000 });
    earlier.identity.owner_run_id = "graph-step-a";
    later.identity.owner_run_id = "graph-step-b";
    for (const calls of [[earlier, later], [later, earlier]]) {
      expect(selectContextUsage({ provider_calls: calls }).inputTokens).toBe(2000);
    }
  });

  test("equivalent UTC offsets and fractional widths still use iteration and retry ties", () => {
    const earlierIteration = usageReceipt({
      id: "earlier-iteration", iteration: 2, retry: 5,
      startedAt: "2026-10-23T14:00:00.0009+01:00", inputTokens: 1000,
    });
    const laterIteration = usageReceipt({
      id: "later-iteration", iteration: 3,
      startedAt: "2026-10-23T13:00:00.000900Z", inputTokens: 2000,
    });
    const latestRetry = usageReceipt({
      id: "latest-retry", iteration: 3, retry: 1,
      startedAt: "2026-10-23T12:00:00.000900000-01:00", inputTokens: 3000,
    });
    expect(selectContextUsage({ provider_calls: [latestRetry, laterIteration, earlierIteration] }).inputTokens).toBe(3000);
  });

  test("a newer receipt without input usage cannot replace the last usable count", () => {
    const older = usageReceipt({
      id: "older", iteration: 1, startedAt: "2026-10-23T12:00:00.000Z", inputTokens: 1000,
    });
    const unavailable = usageReceipt({
      id: "unavailable", iteration: 2, startedAt: "2026-10-23T13:00:00.000Z", inputTokens: null,
    });
    expect(selectContextUsage({ provider_calls: [older, unavailable] }).inputTokens).toBe(1000);
  });

  test("receipts without timing retain the existing last-entry fallback", () => {
    const first = usageReceipt({ id: "first", iteration: 0, inputTokens: 1000 });
    const last = usageReceipt({ id: "last", iteration: 0, inputTokens: 2000 });
    delete first.timing;
    delete last.timing;
    expect(selectContextUsage({ provider_calls: [first, last] }).inputTokens).toBe(2000);
  });

  test("the live graph-call regression uses its own 200k window after switching to Ollama", () => {
    const older = usageReceipt({
      id: `pc_${"f".repeat(64)}`, iteration: 7,
      startedAt: "2026-10-23T12:00:00.000Z", inputTokens: 129650,
    });
    const newer = usageReceipt({
      id: `pc_${"5".repeat(64)}`, iteration: 37,
      startedAt: "2026-10-23T13:00:00.000Z", inputTokens: 158474,
    });
    // Graph roots have no direct provider calls; the model call belongs to a step.
    newer.identity.owner_run_id = "graph-step-1";
    newer.identity.parent_run_id = newer.identity.root_run_id;
    const extension = compositionWindow(200000, 158474);
    expect(normalizeContextCompositionExtension(extension).context_window_tokens).toBe(200000);
    newer.extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = extension;
    const usage = selectContextUsage({ provider_calls: [newer, older] });
    expect(usage.reportedContextWindowTokens).toBe(200000);
    const view = buildContextUsageView(usage, 32768, { modelId: "ollama:qwen3:32b" });
    expect(view.inputTokens).toBe(158474);
    expect(view.contextWindowTokens).toBe(200000);
    expect(view.windowPressure).toBeCloseTo(0.79237, 5);
    expect(Math.round(view.windowPressure * 100)).toBe(79);
  });

  test.each([
    ["unknown extension field", (value) => ({ ...value, unexpected: true })],
    ["wrong schema", (value) => ({ ...value, schema: "unchain.context/context_composition_v9" })],
  ])("ignores a receipt window with %s", (_label, corrupt) => {
    const call = usageReceipt({ id: "call", iteration: 1, inputTokens: 1000 });
    const invalid = corrupt(compositionWindow(200000, 1000));
    expect(() => normalizeContextCompositionExtension(invalid)).toThrow();
    call.extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = invalid;
    const usage = selectContextUsage({ provider_calls: [call] });
    expect(usage.reportedContextWindowTokens).toBeNull();
    expect(buildContextUsageView(usage, 32768, { modelId: "ollama:qwen3:32b" }).percentageAvailable).toBe(false);
  });

  test("does not borrow another receipt's reported window", () => {
    const older = usageReceipt({ id: "older", iteration: 1, startedAt: "2026-10-23T12:00:00.000Z", inputTokens: 1000 });
    older.extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = compositionWindow(200000, 1000);
    const newer = usageReceipt({ id: "newer", iteration: 2, startedAt: "2026-10-23T13:00:00.000Z", inputTokens: 2000 });
    const usage = selectContextUsage({ provider_calls: [older, newer] });
    expect(usage.reportedContextWindowTokens).toBeNull();
  });

  test("a valid extension with an unavailable window still has no reported denominator", () => {
    const call = usageReceipt({ id: "call", iteration: 1, inputTokens: 1000 });
    const extension = compositionWindow(null, 1000);
    expect(normalizeContextCompositionExtension(extension).context_window_tokens).toBeNull();
    call.extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = extension;
    expect(selectContextUsage({ provider_calls: [call] }).reportedContextWindowTokens).toBeNull();
  });
});

describe("Context usage from provider accounting", () => {
  test("reads occupancy from the last physical call, not a sum of calls", () => {
    // Every call carries the whole conversation, so the newest input total IS
    // the current occupancy. Summing would double-count the history.
    const bundle = buildRunBundleV1({ multiModel: true });
    expect(bundle.provider_calls.length).toBeGreaterThan(1);
    // The fixture stores receipts by ID: iteration 2 is physically newer even
    // though its receipt precedes iteration 1 in the serialized array.
    const last = bundle.provider_calls.find((call) => call.identity.iteration === 2);
    last.usage.input.total_tokens = 4321;

    const usage = selectContextUsage(bundle);
    expect(usage.inputTokens).toBe(4321);
    expect(usage.callCount).toBe(bundle.provider_calls.length);
  });

  test("surfaces the cache split alongside the total", () => {
    const bundle = buildRunBundleV1();
    const call = bundle.provider_calls[0];
    call.usage.input.total_tokens = 1000;
    call.usage.input.cache_read_tokens = 600;
    call.usage.input.uncached_tokens = 400;

    const usage = selectContextUsage(bundle);
    expect(usage.cacheReadTokens).toBe(600);
    expect(usage.uncachedTokens).toBe(400);
  });

  test("is null when no call reports an input total", () => {
    const bundle = buildRunBundleV1();
    bundle.provider_calls.forEach((call) => {
      call.usage.input.total_tokens = null;
    });
    expect(selectContextUsage(bundle)).toBeNull();
  });

  test("takes the newest bundle and never falls back to an older one", () => {
    // A stale bundle would render last turn's pressure as the current state.
    const older = buildRunBundleV1();
    older.provider_calls[0].usage.input.total_tokens = 111;
    const newer = buildRunBundleV1();
    newer.provider_calls.forEach((call) => {
      call.usage.input.total_tokens = null;
    });

    expect(
      selectLatestContextUsage([
        { meta: { bundle: older } },
        { meta: { bundle: newer } },
      ]),
    ).toBeNull();
    expect(
      selectLatestContextUsage([{ meta: { bundle: older } }]).inputTokens,
    ).toBe(111);
  });
});

describe("Context window denominator", () => {
  test("accepts a positive safe integer from model capabilities", () => {
    expect(
      selectContextWindowTokens({ max_context_window_tokens: 272000 }),
    ).toBe(272000);
  });

  test.each([
    ["absent", {}],
    ["zero", { max_context_window_tokens: 0 }],
    ["negative", { max_context_window_tokens: -1 }],
    ["a string", { max_context_window_tokens: "272000" }],
    ["fractional", { max_context_window_tokens: 1.5 }],
    ["not an object", null],
  ])("rejects %s", (_label, capabilities) => {
    expect(selectContextWindowTokens(capabilities)).toBeNull();
  });

  describe("active composer window", () => {
    const ollamaCapabilities = {
      default_context_window_tokens: 32768,
      max_context_window_tokens: 131072,
    };

    test("uses the selected built-in Ollama window before the declared default", () => {
      expect(
        selectActiveContextWindowTokens(ollamaCapabilities, {
          modelId: "ollama:llama3.2",
          selectedContextWindow: 65536,
        }),
      ).toBe(65536);
    });

    test("uses the declared built-in Ollama default when no selection exists", () => {
      expect(
        selectActiveContextWindowTokens(ollamaCapabilities, {
          modelId: "ollama:llama3.2",
          selectedContextWindow: null,
        }),
      ).toBe(32768);
    });

    test.each([
      ["selection", 262144, 32768],
      ["default", null, 262144],
    ])("caps a built-in Ollama %s at the catalog maximum", (
      _label,
      selectedContextWindow,
      defaultContextWindow,
    ) => {
      expect(
        selectActiveContextWindowTokens(
          {
            default_context_window_tokens: defaultContextWindow,
            max_context_window_tokens: 131072,
          },
          {
            modelId: "ollama:llama3.2",
            selectedContextWindow,
          },
        ),
      ).toBe(131072);
    });

    test.each([
      ["selection", 65536, null, 65536],
      ["default", null, 32768, 32768],
    ])("keeps a valid built-in Ollama %s when the maximum is missing", (
      _label,
      selectedContextWindow,
      defaultContextWindow,
      expected,
    ) => {
      expect(
        selectActiveContextWindowTokens(
          { default_context_window_tokens: defaultContextWindow },
          {
            modelId: "ollama:llama3.2",
            selectedContextWindow,
          },
        ),
      ).toBe(expected);
    });

    test.each([
      ["zero", 0],
      ["negative", -1],
      ["string", "65536"],
      ["fractional", 65536.5],
      ["unsafe", Number.MAX_SAFE_INTEGER + 1],
    ])("ignores an invalid built-in Ollama %s selection", (
      _label,
      selectedContextWindow,
    ) => {
      expect(
        selectActiveContextWindowTokens(ollamaCapabilities, {
          modelId: "ollama:llama3.2",
          selectedContextWindow,
        }),
      ).toBe(32768);
    });

    test("returns null when built-in Ollama has no valid selection or default", () => {
      expect(
        selectActiveContextWindowTokens(
          { max_context_window_tokens: 131072 },
          {
            modelId: "ollama:llama3.2",
            selectedContextWindow: null,
          },
        ),
      ).toBeNull();
      expect(
        selectActiveContextWindowTokens(
          {
            default_context_window_tokens: "32768",
            max_context_window_tokens: 131072,
          },
          {
            modelId: "ollama:llama3.2",
            selectedContextWindow: 0,
          },
        ),
      ).toBeNull();
    });

    test.each(["openai:gpt-5", "custom.local:llama3.2", null])(
      "keeps maximum-only behavior for %s",
      (modelId) => {
        expect(
          selectActiveContextWindowTokens(ollamaCapabilities, {
            modelId,
            selectedContextWindow: 65536,
          }),
        ).toBe(131072);
      },
    );
  });
});

describe("Context usage view", () => {
  const usage = {
    inputTokens: 143300,
    cacheReadTokens: 100000,
    cacheWriteTokens: 0,
    uncachedTokens: 43300,
    callCount: 1,
    provider: "openai",
    model: "gpt-4.1",
  };

  test("computes pressure against a reported window", () => {
    const view = buildContextUsageView(usage, 272000);
    expect(view.percentageAvailable).toBe(true);
    expect(view.windowPressure).toBeCloseTo(0.5268, 4);
    expect(view.contextWindowTokens).toBe(272000);
  });

  test("withholds pressure entirely when no window is reported", () => {
    // The absolute count is still true and still shown; only the ratio is
    // withheld. Inventing a denominator here would put a fabricated percentage
    // in front of the user.
    const view = buildContextUsageView(usage, null);
    expect(view.percentageAvailable).toBe(false);
    expect(view.windowPressure).toBeNull();
    expect(view.contextWindowTokens).toBeNull();
    expect(view.inputTokens).toBe(143300);
  });

  test("treats an invalid window the same as a missing one", () => {
    expect(buildContextUsageView(usage, 0).windowPressure).toBeNull();
    expect(buildContextUsageView(usage, -5).windowPressure).toBeNull();
  });

  test("switching models without a receipt window keeps only the absolute usage", () => {
    const view = buildContextUsageView(usage, 32768, { modelId: "ollama:qwen3:32b" });
    expect(view.inputTokens).toBe(143300);
    expect(view.contextWindowTokens).toBeNull();
    expect(view.windowPressure).toBeNull();
    expect(view.percentageAvailable).toBe(false);
  });

  test.each([
    ["same built-in model", { provider: "ollama", model: "qwen3:32b" }, "ollama:qwen3:32b"],
    ["custom-provider alias", { provider: "hyperspace", model: "anthropic--claude-4.8-opus" }, "custom.hyperspace:anthropic--claude-4.8-opus"],
  ])("uses the fallback window for the %s", (_label, model, modelId) => {
    const view = buildContextUsageView({ ...usage, ...model }, 32768, { modelId });
    expect(view.contextWindowTokens).toBe(32768);
    expect(view.percentageAvailable).toBe(true);
  });

  test("a different model on the same provider cannot supply the fallback window", () => {
    const view = buildContextUsageView(usage, 32768, { modelId: "openai:gpt-5" });
    expect(view.contextWindowTokens).toBeNull();
    expect(view.windowPressure).toBeNull();
  });

  test("is null without a usable input total", () => {
    expect(buildContextUsageView({ ...usage, inputTokens: null }, 272000)).toBeNull();
    expect(buildContextUsageView(null, 272000)).toBeNull();
  });
});
