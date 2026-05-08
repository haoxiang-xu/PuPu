import { registerChatHandlers } from "./handlers/chat";
import { registerCatalogHandlers } from "./handlers/catalog";
import { registerDebugHandlers } from "./handlers/debug";
import { buildChatStorageAdapter } from "./chat_storage_adapter";

const installConsolePatch = (bridge) => {
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const serialize = (args) =>
    args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch (_) {
          return String(a);
        }
      })
      .join(" ");
  ["log", "info", "warn", "error"].forEach((level) => {
    console[level] = (...args) => {
      orig[level](...args);
      try {
        bridge.pushLog({
          ts: Date.now(),
          level,
          source: "renderer",
          msg: serialize(args),
        });
      } catch (_) {
        // best-effort
      }
    };
  });
  window.addEventListener("error", (e) => {
    try {
      bridge.pushLog({
        ts: Date.now(),
        level: "error",
        source: "renderer",
        msg: `${e.message} @${e.filename}:${e.lineno}`,
      });
    } catch (_) {
      // best-effort
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      bridge.pushLog({
        ts: Date.now(),
        level: "error",
        source: "renderer",
        msg: `unhandled: ${e.reason && (e.reason.stack || e.reason.message || e.reason)}`,
      });
    } catch (_) {
      // best-effort
    }
  });
};

let installed = false;
const catalogCounts = { models: 0, toolkits: 0, characters: 0 };
let isStreamingFlag = false;
let configContextRef = { isDark: false, locale: "en" };

export const setIsStreaming = (v) => {
  isStreamingFlag = !!v;
};
export const setConfigContextRef = (ctx) => {
  configContextRef = ctx || configContextRef;
};
export const setCatalogCounts = (counts) => {
  Object.assign(catalogCounts, counts || {});
};

const refreshCatalogCounts = async (unchainAPI) => {
  if (!unchainAPI) return;
  const safe = async (fn, key) => {
    try {
      const raw = await fn();
      if (Array.isArray(raw)) return raw.length;
      if (Array.isArray(raw?.[key])) return raw[key].length;
      if (raw?.providers && typeof raw.providers === "object") {
        return Object.values(raw.providers).reduce(
          (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
          0,
        );
      }
      return 0;
    } catch (_) {
      return 0;
    }
  };
  const [m, t, c] = await Promise.all([
    safe(() => unchainAPI.getModelCatalog(), "models"),
    safe(() => unchainAPI.getToolkitCatalog(), "toolkits"),
    safe(() => unchainAPI.listCharacters(), "characters"),
  ]);
  setCatalogCounts({ models: m, toolkits: t, characters: c });
};

export const installTestBridge = () => {
  if (installed) return;
  if (typeof window === "undefined" || !window.__pupuTestBridge) return;
  installed = true;
  const bridge = window.__pupuTestBridge;
  installConsolePatch(bridge);

  const chatStorage = buildChatStorageAdapter();
  registerChatHandlers({ bridge, chatStorage });
  registerCatalogHandlers({
    bridge,
    unchainAPI: window.unchainAPI,
    chatStorage,
  });
  registerDebugHandlers({
    bridge,
    chatStorage,
    getConfigContext: () => configContextRef,
    getCatalogCounts: () => catalogCounts,
    getIsStreaming: () => isStreamingFlag,
  });
  bridge.markReady();

  // Populate catalog counts asynchronously; refresh every 30s so additions/deletions are reflected.
  void refreshCatalogCounts(window.unchainAPI);
  setInterval(() => {
    void refreshCatalogCounts(window.unchainAPI);
  }, 30000);
};

installTestBridge();
