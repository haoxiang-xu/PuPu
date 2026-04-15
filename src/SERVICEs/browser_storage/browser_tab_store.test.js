import {
  __resetBrowserTabStoreForTests,
  getBrowserTabState,
  newTab,
  closeTab,
  switchTab,
  reorderTab,
  updateTabFieldSilent,
  subscribeBrowserTabStore,
} from "./browser_tab_store";

describe("browser_tab_store", () => {
  beforeEach(() => {
    __resetBrowserTabStoreForTests();
  });

  test("starts empty", () => {
    const s = getBrowserTabState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  test("newTab creates a tab, activates it, and notifies subscribers", () => {
    const listener = jest.fn();
    const unsub = subscribeBrowserTabStore(listener);

    const tab = newTab("https://example.com");
    const s = getBrowserTabState();

    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].id).toBe(tab.id);
    expect(s.tabs[0].url).toBe("https://example.com");
    expect(s.activeTabId).toBe(tab.id);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
  });

  test("newTab with no argument creates an empty-url tab", () => {
    const tab = newTab();
    expect(tab.url).toBe("");
  });

  test("closeTab removes a tab and picks a new active", () => {
    const a = newTab("https://a.com");
    const b = newTab("https://b.com");
    const c = newTab("https://c.com");

    // active is c
    closeTab(c.id);
    let s = getBrowserTabState();
    expect(s.tabs.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(s.activeTabId).toBe(b.id);

    // close middle
    closeTab(a.id);
    s = getBrowserTabState();
    expect(s.tabs.map((t) => t.id)).toEqual([b.id]);
    expect(s.activeTabId).toBe(b.id);

    // close last
    closeTab(b.id);
    s = getBrowserTabState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  test("switchTab sets activeTabId and updates lastActiveAt", () => {
    const a = newTab("https://a.com");
    newTab("https://b.com");

    const beforeSwitch = getBrowserTabState().tabs.find((t) => t.id === a.id).lastActiveAt;
    // ensure time advances
    const delay = () => new Promise((r) => setTimeout(r, 2));
    return delay().then(() => {
      switchTab(a.id);
      const afterSwitch = getBrowserTabState().tabs.find((t) => t.id === a.id).lastActiveAt;
      expect(getBrowserTabState().activeTabId).toBe(a.id);
      expect(afterSwitch).toBeGreaterThanOrEqual(beforeSwitch);
    });
  });

  test("switchTab to unknown id is a no-op", () => {
    const a = newTab("https://a.com");
    switchTab("nonexistent");
    expect(getBrowserTabState().activeTabId).toBe(a.id);
  });

  test("reorderTab moves a tab from one index to another", () => {
    const a = newTab("https://a.com");
    const b = newTab("https://b.com");
    const c = newTab("https://c.com");

    reorderTab(0, 2);
    const s = getBrowserTabState();
    expect(s.tabs.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  test("reorderTab with invalid indices is a no-op", () => {
    newTab("https://a.com");
    newTab("https://b.com");
    const before = getBrowserTabState().tabs.map((t) => t.id);

    reorderTab(-1, 5);
    reorderTab(0, 99);
    reorderTab(99, 0);

    expect(getBrowserTabState().tabs.map((t) => t.id)).toEqual(before);
  });

  test("updateTabFieldSilent updates in-place without notifying subscribers", () => {
    const a = newTab("https://a.com");
    const listener = jest.fn();
    subscribeBrowserTabStore(listener);

    updateTabFieldSilent(a.id, "scrollY", 420);

    const tab = getBrowserTabState().tabs.find((t) => t.id === a.id);
    expect(tab.scrollY).toBe(420);
    expect(listener).not.toHaveBeenCalled();
  });

  test("updateTabFieldSilent on unknown tab is a no-op", () => {
    updateTabFieldSilent("nonexistent", "scrollY", 420);
    // no throw; no state change
    expect(getBrowserTabState().tabs).toEqual([]);
  });

  test("subscribe returns a working unsubscribe", () => {
    const listener = jest.fn();
    const unsub = subscribeBrowserTabStore(listener);

    newTab("https://a.com");
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    newTab("https://b.com");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
