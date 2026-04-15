// Phase 1: global in-memory tab list. Phase 2 will introduce per-chat grouping
// and SQLite persistence. Keep the external API stable — Phase 2 should be able
// to add a `chatId` parameter without breaking call sites.

let state = {
  tabs: [],
  activeTabId: null,
};

const subscribers = new Set();

const genId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const notify = () => {
  for (const fn of subscribers) {
    try {
      fn(state);
    } catch (e) {
      console.error("[browser_tab_store] subscriber threw:", e);
    }
  }
};

const makeTab = (url) => {
  const now = Date.now();
  return {
    id: genId(),
    url: typeof url === "string" ? url : "",
    title: "",
    favicon: null,
    scrollY: 0,
    createdAt: now,
    lastActiveAt: now,
  };
};

export const getBrowserTabState = () => state;

export const subscribeBrowserTabStore = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const newTab = (url) => {
  const tab = makeTab(url);
  state = {
    ...state,
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  };
  notify();
  return tab;
};

export const closeTab = (id) => {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const nextTabs = state.tabs.filter((t) => t.id !== id);
  let nextActive = state.activeTabId;

  if (state.activeTabId === id) {
    if (nextTabs.length === 0) {
      nextActive = null;
    } else {
      // Prefer the tab at the same index; fall back to the previous one.
      const pick = nextTabs[idx] || nextTabs[idx - 1] || nextTabs[0];
      nextActive = pick.id;
    }
  }

  state = { ...state, tabs: nextTabs, activeTabId: nextActive };
  notify();
};

export const switchTab = (id) => {
  const target = state.tabs.find((t) => t.id === id);
  if (!target) return;

  const now = Date.now();
  state = {
    ...state,
    activeTabId: id,
    tabs: state.tabs.map((t) =>
      t.id === id ? { ...t, lastActiveAt: now } : t
    ),
  };
  notify();
};

export const reorderTab = (fromIndex, toIndex) => {
  const n = state.tabs.length;
  if (
    fromIndex < 0 ||
    fromIndex >= n ||
    toIndex < 0 ||
    toIndex >= n ||
    fromIndex === toIndex
  ) {
    return;
  }

  const nextTabs = state.tabs.slice();
  const [moved] = nextTabs.splice(fromIndex, 1);
  nextTabs.splice(toIndex, 0, moved);

  state = { ...state, tabs: nextTabs };
  notify();
};

// Silent path: writes to memory without notifying subscribers.
// Used for high-frequency fields like scrollY where nobody cares about
// continuous re-renders. Subscribers that remount later will read the
// latest value on mount.
export const updateTabFieldSilent = (id, field, value) => {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const nextTab = { ...state.tabs[idx], [field]: value };
  const nextTabs = state.tabs.slice();
  nextTabs[idx] = nextTab;
  state = { ...state, tabs: nextTabs };
  // intentionally no notify()
};

export const __resetBrowserTabStoreForTests = () => {
  state = { tabs: [], activeTabId: null };
  subscribers.clear();
};
