import { subscribe, start, stop, getActive, _resetForTest } from "./progress_bus";

describe("progress_bus", () => {
  beforeEach(() => _resetForTest());

  test("start/stop 更新 active count", () => {
    start("a", "Sending");
    expect(getActive().count).toBe(1);
    start("b", "Installing");
    expect(getActive().count).toBe(2);
    stop("a");
    expect(getActive().count).toBe(1);
    stop("b");
    expect(getActive().count).toBe(0);
  });

  test("subscriber 收到 change", () => {
    const fn = jest.fn();
    subscribe(fn);
    start("a", "X");
    stop("a");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("stop 未知 id 不崩", () => {
    expect(() => stop("never-started")).not.toThrow();
  });

  test("labels 包含所有 active label", () => {
    start("a", "Save");
    start("b", "Upload");
    expect(getActive().labels).toEqual(expect.arrayContaining(["Save", "Upload"]));
  });
});
