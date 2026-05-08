import { renderHook, act } from "@testing-library/react";
import useAsyncAction from "./use_async_action";
import { subscribe as subToast, _resetForTest as resetToast } from "../../SERVICEs/toast_bus";
import { _resetForTest as resetProgress, getActive } from "../../SERVICEs/progress_bus";

describe("useAsyncAction", () => {
  beforeEach(() => { resetToast(); resetProgress(); });

  test("成功路径：pending → false → result", async () => {
    const { result } = renderHook(() => useAsyncAction(async () => "ok", { label: "test", pendingDelayMs: 0 }));
    await act(async () => {
      const r = await result.current.run();
      expect(r).toBe("ok");
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe(null);
  });

  test("pendingDelayMs 内完成不切 pending=true", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAsyncAction(async () => "fast", { label: "test", pendingDelayMs: 200 }));
    let runPromise;
    act(() => { runPromise = result.current.run(); });
    expect(result.current.pending).toBe(false);
    await act(async () => { await runPromise; });
    expect(result.current.pending).toBe(false);
    jest.useRealTimers();
  });

  test("超过 pendingDelayMs 切 pending=true", async () => {
    jest.useFakeTimers();
    let resolveFn;
    const action = () => new Promise((r) => { resolveFn = r; });
    const { result } = renderHook(() => useAsyncAction(action, { label: "test", pendingDelayMs: 100 }));
    act(() => { result.current.run(); });
    act(() => { jest.advanceTimersByTime(150); });
    expect(result.current.pending).toBe(true);
    await act(async () => { resolveFn("done"); });
    expect(result.current.pending).toBe(false);
    jest.useRealTimers();
  });

  test("超过 progressThresholdMs 激活顶部 bar", async () => {
    jest.useFakeTimers();
    let resolveFn;
    const action = () => new Promise((r) => { resolveFn = r; });
    const { result } = renderHook(() =>
      useAsyncAction(action, { label: "test", pendingDelayMs: 0, progressThresholdMs: 300 }));
    act(() => { result.current.run(); });
    expect(getActive().count).toBe(0);
    act(() => { jest.advanceTimersByTime(400); });
    expect(getActive().count).toBe(1);
    await act(async () => { resolveFn(); });
    expect(getActive().count).toBe(0);
    jest.useRealTimers();
  });

  test("错误默认 emit toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw new Error("boom"); }, { label: "验证", pendingDelayMs: 0 }));
    await act(async () => { await result.current.run(); });
    expect(events.some((e) => e.type === "error" && e.message.includes("boom"))).toBe(true);
    expect(result.current.error.message).toBe("boom");
  });

  test("running 期间 run() 被忽略", async () => {
    const fn = jest.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useAsyncAction(fn, { label: "x", pendingDelayMs: 0 }));
    act(() => { result.current.run(); });
    act(() => { result.current.run(); });
    act(() => { result.current.run(); });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("onError 覆盖默认 toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw new Error("b"); }, { label: "x", pendingDelayMs: 0, onError }));
    await act(async () => { await result.current.run(); });
    expect(onError).toHaveBeenCalled();
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
  });

  test("AbortError 不 toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const { result, unmount } = renderHook(() =>
      useAsyncAction(async (...args) => {
        const { signal } = args[args.length - 1];
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }, { label: "x", pendingDelayMs: 0 }));
    act(() => { result.current.run(); });
    unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
  });

  test("reset 清 error", async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw new Error("b"); }, { label: "x", pendingDelayMs: 0 }));
    await act(async () => { await result.current.run(); });
    expect(result.current.error).not.toBe(null);
    act(() => { result.current.reset(); });
    expect(result.current.error).toBe(null);
  });
});
