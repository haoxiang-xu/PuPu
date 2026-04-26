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

  test("can be enabled by direct localStorage flag", () => {
    window.localStorage.setItem("pupu.runtime_events_v3", "true");
    expect(isRuntimeEventStreamV3Enabled()).toBe(true);
  });

  test("can be enabled by runtime settings", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { enable_runtime_events_v3: true } }),
    );
    expect(isRuntimeEventStreamV3Enabled()).toBe(true);
  });
});
