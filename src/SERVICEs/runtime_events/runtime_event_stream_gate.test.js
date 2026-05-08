import { isRuntimeEventStreamV3Enabled } from "./runtime_event_stream_gate";

describe("runtime event stream v3 gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  test("defaults on", () => {
    expect(isRuntimeEventStreamV3Enabled()).toBe(true);
  });
});
