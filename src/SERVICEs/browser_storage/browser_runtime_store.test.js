import {
  __resetBrowserRuntimeStoreForTests,
  getRuntimeForTab,
  updateRuntimeForTab,
  clearRuntimeForTab,
  subscribeBrowserRuntimeStore,
} from "./browser_runtime_store";

describe("browser_runtime_store", () => {
  beforeEach(() => {
    __resetBrowserRuntimeStoreForTests();
  });

  test("returns a default runtime object for unknown tab", () => {
    const rt = getRuntimeForTab("nonexistent");
    expect(rt).toEqual({
      loading: false,
      canGoBack: false,
      canGoForward: false,
      title: "",
      favicon: null,
      lastError: null,
    });
  });

  test("updateRuntimeForTab merges fields and notifies subscribers", () => {
    const listener = jest.fn();
    subscribeBrowserRuntimeStore(listener);

    updateRuntimeForTab("tab-1", { loading: true });
    expect(getRuntimeForTab("tab-1").loading).toBe(true);
    expect(getRuntimeForTab("tab-1").canGoBack).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    updateRuntimeForTab("tab-1", { canGoBack: true, title: "Hello" });
    expect(getRuntimeForTab("tab-1")).toMatchObject({
      loading: true,
      canGoBack: true,
      title: "Hello",
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("clearRuntimeForTab removes state and notifies", () => {
    updateRuntimeForTab("tab-1", { loading: true });
    const listener = jest.fn();
    subscribeBrowserRuntimeStore(listener);

    clearRuntimeForTab("tab-1");

    expect(getRuntimeForTab("tab-1").loading).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("subscribe returns a working unsubscribe", () => {
    const listener = jest.fn();
    const unsub = subscribeBrowserRuntimeStore(listener);

    updateRuntimeForTab("tab-1", { loading: true });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    updateRuntimeForTab("tab-1", { loading: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
