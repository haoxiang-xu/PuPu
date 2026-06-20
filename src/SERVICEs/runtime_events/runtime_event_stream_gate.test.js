import { isRuntimeEventStreamEnabled } from "./runtime_event_stream_gate";

describe("runtime event stream gate", () => {
  test("defaults on after renderer-side runtime event batching", () => {
    expect(isRuntimeEventStreamEnabled()).toBe(true);
  });
});
