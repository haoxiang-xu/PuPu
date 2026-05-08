import { renderHook, act } from "@testing-library/react";
import useOptimisticUpdate from "./use_optimistic_update";
import { subscribe as subToast, _resetForTest as resetToast } from "../../SERVICEs/toast_bus";

describe("useOptimisticUpdate", () => {
  beforeEach(() => resetToast());

  test("optimistic 立即跑、commit 成功不 rollback", async () => {
    const optimistic = jest.fn();
    const commit = jest.fn(() => Promise.resolve());
    const rollback = jest.fn();
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await result.current.apply({ optimistic, commit, rollback, label: "test" });
    });
    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
  });

  test("commit 失败触发 rollback + toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const optimistic = jest.fn();
    const commit = jest.fn(() => Promise.reject(new Error("net")));
    const rollback = jest.fn();
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await result.current.apply({ optimistic, commit, rollback, label: "重命名" });
    });
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "error" && e.message.includes("重命名"))).toBe(true);
  });

  test("guard 返回 false 跳过 rollback", async () => {
    const optimistic = jest.fn();
    const commit = jest.fn(() => Promise.reject(new Error("x")));
    const rollback = jest.fn();
    const guard = jest.fn(() => false);
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await result.current.apply({ optimistic, commit, rollback, guard, label: "test" });
    });
    expect(rollback).not.toHaveBeenCalled();
  });

  test("optimistic 是同步的（先于 commit）", async () => {
    const order = [];
    const optimistic = () => order.push("optimistic");
    const commit = () => { order.push("commit"); return Promise.resolve(); };
    const { result } = renderHook(() => useOptimisticUpdate());
    act(() => { result.current.apply({ optimistic, commit, rollback: () => {}, label: "x" }); });
    expect(order).toEqual(["optimistic"]);
    await act(async () => { await Promise.resolve(); });
    expect(order).toEqual(["optimistic", "commit"]);
  });

  test("rollback 抛错被 swallow", async () => {
    const optimistic = jest.fn();
    const commit = () => Promise.reject(new Error("a"));
    const rollback = () => { throw new Error("rollback boom"); };
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await expect(result.current.apply({ optimistic, commit, rollback, label: "x" })).resolves.not.toThrow();
    });
  });
});
