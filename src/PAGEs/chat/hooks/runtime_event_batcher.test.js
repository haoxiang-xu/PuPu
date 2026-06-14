import { createRuntimeEventBatcher } from "./runtime_event_batcher";

describe("createRuntimeEventBatcher", () => {
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  let rafCallbacks;
  let rafId;

  beforeEach(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    rafCallbacks = new Map();
    rafId = 0;
    window.requestAnimationFrame = jest.fn((callback) => {
      rafId += 1;
      rafCallbacks.set(rafId, callback);
      return rafId;
    });
    window.cancelAnimationFrame = jest.fn((id) => {
      rafCallbacks.delete(id);
    });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    jest.useRealTimers();
  });

  test("coalesces events in one frame and preserves order", () => {
    const batches = [];
    const batcher = createRuntimeEventBatcher({
      onFlush: (events) => batches.push(events),
    });

    batcher.enqueue({ event_id: "evt-1" });
    batcher.enqueue({ event_id: "evt-2" });
    batcher.enqueue({ event_id: "evt-3" });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(batches).toEqual([]);

    rafCallbacks.get(1)();

    expect(batches).toEqual([
      [{ event_id: "evt-1" }, { event_id: "evt-2" }, { event_id: "evt-3" }],
    ]);
  });

  test("flushNow cancels the scheduled frame and flushes synchronously", () => {
    const batches = [];
    const batcher = createRuntimeEventBatcher({
      onFlush: (events) => batches.push(events),
    });

    batcher.enqueue({ event_id: "evt-1" });
    batcher.enqueue({ event_id: "evt-2" });

    batcher.flushNow();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(batches).toEqual([[{ event_id: "evt-1" }, { event_id: "evt-2" }]]);

    const scheduled = rafCallbacks.get(1);
    if (scheduled) scheduled();
    expect(batches).toHaveLength(1);
  });

  test("cancel drops pending events and scheduled work", () => {
    const batches = [];
    const batcher = createRuntimeEventBatcher({
      onFlush: (events) => batches.push(events),
    });

    batcher.enqueue({ event_id: "evt-1" });
    batcher.cancel();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    const scheduled = rafCallbacks.get(1);
    if (scheduled) scheduled();
    expect(batches).toEqual([]);
  });

  test("falls back to setTimeout when requestAnimationFrame is unavailable", () => {
    jest.useFakeTimers();
    window.requestAnimationFrame = undefined;
    window.cancelAnimationFrame = undefined;
    const batches = [];
    const batcher = createRuntimeEventBatcher({
      onFlush: (events) => batches.push(events),
    });

    batcher.enqueue({ event_id: "evt-1" });

    expect(batches).toEqual([]);
    jest.advanceTimersByTime(16);
    expect(batches).toEqual([[{ event_id: "evt-1" }]]);
  });

  test("uses an explicit delay to collect larger batches", () => {
    jest.useFakeTimers();
    const requestAnimationFrameSpy = jest.fn();
    window.requestAnimationFrame = requestAnimationFrameSpy;
    const batches = [];
    const batcher = createRuntimeEventBatcher({
      delayMs: 64,
      onFlush: (events) => batches.push(events),
    });

    batcher.enqueue({ event_id: "evt-1" });
    batcher.enqueue({ event_id: "evt-2" });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(63);
    expect(batches).toEqual([]);

    batcher.enqueue({ event_id: "evt-3" });
    jest.advanceTimersByTime(1);

    expect(batches).toEqual([
      [{ event_id: "evt-1" }, { event_id: "evt-2" }, { event_id: "evt-3" }],
    ]);
  });
});
