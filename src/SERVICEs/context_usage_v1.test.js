import {
  buildContextUsageView,
  selectContextUsage,
  selectContextWindowTokens,
  selectLatestContextUsage,
} from "./context_usage_v1";

const {
  buildRunBundleV1,
} = require("../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

describe("Context usage from provider accounting", () => {
  test("reads occupancy from the last physical call, not a sum of calls", () => {
    // Every call carries the whole conversation, so the newest input total IS
    // the current occupancy. Summing would double-count the history.
    const bundle = buildRunBundleV1({ multiModel: true });
    expect(bundle.provider_calls.length).toBeGreaterThan(1);
    const last = bundle.provider_calls[bundle.provider_calls.length - 1];
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

  test("is null without a usable input total", () => {
    expect(buildContextUsageView({ ...usage, inputTokens: null }, 272000)).toBeNull();
    expect(buildContextUsageView(null, 272000)).toBeNull();
  });
});
