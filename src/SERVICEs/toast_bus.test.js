import { subscribe, emit, _resetForTest } from "./toast_bus";

describe("toast_bus", () => {
  beforeEach(() => _resetForTest());

  test("emit 触发所有 subscriber", () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    subscribe(fn1);
    subscribe(fn2);
    emit({ type: "success", message: "hi" });
    expect(fn1).toHaveBeenCalledWith({ type: "success", message: "hi" });
    expect(fn2).toHaveBeenCalledWith({ type: "success", message: "hi" });
  });

  test("unsubscribe 停止接收", () => {
    const fn = jest.fn();
    const unsubscribe = subscribe(fn);
    unsubscribe();
    emit({ type: "info", message: "x" });
    expect(fn).not.toHaveBeenCalled();
  });

  test("一个 subscriber 抛错不影响其他", () => {
    const good = jest.fn();
    subscribe(() => { throw new Error("boom"); });
    subscribe(good);
    expect(() => emit({ type: "info", message: "x" })).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
