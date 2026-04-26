import { writeFeatureFlags } from "../feature_flags";
import { isRuntimeEventStreamV3Enabled } from "./runtime_event_stream_gate";

describe("runtime event stream v3 gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  test("defaults off", () => {
    expect(isRuntimeEventStreamV3Enabled()).toBe(false);
  });

  test("can be enabled by direct localStorage override", () => {
    window.localStorage.setItem("pupu.runtime_events_v3", "true");
    expect(isRuntimeEventStreamV3Enabled()).toBe(true);
  });

  test("can be enabled by the formal feature flag", () => {
    writeFeatureFlags({ enable_runtime_events_v3: true });
    expect(isRuntimeEventStreamV3Enabled()).toBe(true);
  });

  test("does not read retired settings.runtime gates", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { enable_runtime_events_v3: true } }),
    );
    expect(isRuntimeEventStreamV3Enabled()).toBe(false);
  });
});
