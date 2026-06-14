import { isRuntimeEventStreamV4Enabled } from "./runtime_event_stream_gate";

describe("runtime event stream v4 gate", () => {
  test("defaults on after renderer-side runtime event batching", () => {
    expect(isRuntimeEventStreamV4Enabled()).toBe(true);
  });
});
