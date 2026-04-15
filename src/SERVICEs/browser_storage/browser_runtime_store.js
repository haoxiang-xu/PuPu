// L2 runtime state for live webviews. In-memory only; never persisted.
// Key = tab id from browser_tab_store. Value = mutable per-tab runtime.
// Updates are medium-frequency (every navigation) and must NOT feed
// back into L1's subscribers.

const DEFAULT_RUNTIME = Object.freeze({
  loading: false,
  canGoBack: false,
  canGoForward: false,
  title: "",
  favicon: null,
  lastError: null,
});

let byTabId = {};
const subscribers = new Set();

const notify = () => {
  for (const fn of subscribers) {
    try {
      fn(byTabId);
    } catch (e) {
      console.error("[browser_runtime_store] subscriber threw:", e);
    }
  }
};

export const getRuntimeForTab = (tabId) => {
  return byTabId[tabId] || DEFAULT_RUNTIME;
};

export const updateRuntimeForTab = (tabId, patch) => {
  const prev = byTabId[tabId] || DEFAULT_RUNTIME;
  byTabId = { ...byTabId, [tabId]: { ...prev, ...patch } };
  notify();
};

export const clearRuntimeForTab = (tabId) => {
  if (!(tabId in byTabId)) return;
  const next = { ...byTabId };
  delete next[tabId];
  byTabId = next;
  notify();
};

export const subscribeBrowserRuntimeStore = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const __resetBrowserRuntimeStoreForTests = () => {
  byTabId = {};
  subscribers.clear();
};
