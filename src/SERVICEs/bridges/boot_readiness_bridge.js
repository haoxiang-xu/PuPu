// Renderer-side thin wrapper around window.bootReadinessAPI (the boot gate's
// backend-readiness preload bridge). React/service code must go through this
// module — never window.bootReadinessAPI directly — so the surface stays
// auditable in one place.
//
// Detection mirrors settings_storage_bridge.js / memory_vault_bridge.js: probe
// the window global at CALL time, never cache module-level state, so tests can
// install and remove mocks freely.
//
// WEB MODE IS A FIRST-CLASS CASE. `npm run start:web` runs the React app in a
// plain browser with no preload and therefore no bridge. isBootReadinessAvailable()
// returning false is not an error — it is the signal that there is no local
// backend to wait for, and the boot gate must treat the backend gates as
// satisfied rather than hanging forever behind an opaque screen.

const getApi = () => {
  if (typeof window === "undefined") return null;
  const api = window.bootReadinessAPI;
  return api && typeof api === "object" ? api : null;
};

export const isBootReadinessAvailable = () => {
  const api = getApi();
  return Boolean(api && typeof api.getReadiness === "function");
};

/* Fixed-shape default used whenever main cannot be reached. `ready: false` is
   the safe direction — an unreachable main is not evidence of a ready backend. */
export const EMPTY_BOOT_READINESS = Object.freeze({
  ready: false,
  phase: "starting_runtime",
  runtime: Object.freeze({ ready: false, status: "unknown" }),
  mcp: Object.freeze({ ready: false }),
  failure: null,
  waitedMs: 0,
});

const normalizeReadiness = (payload) => {
  const source = payload && typeof payload === "object" ? payload : {};
  const runtime =
    source.runtime && typeof source.runtime === "object" ? source.runtime : {};
  const mcp = source.mcp && typeof source.mcp === "object" ? source.mcp : {};
  const failure =
    source.failure && typeof source.failure === "object" ? source.failure : null;

  return {
    ready: source.ready === true,
    phase: typeof source.phase === "string" ? source.phase : "starting_runtime",
    runtime: {
      ready: runtime.ready === true,
      status: typeof runtime.status === "string" ? runtime.status : "unknown",
    },
    mcp: { ready: mcp.ready === true },
    /* CODE ONLY — main never sends user-facing prose (it cannot know the
       user's language). The renderer resolves the code through i18n. */
    failure: failure
      ? { code: typeof failure.code === "string" ? failure.code : "unknown" }
      : null,
    waitedMs: Number.isFinite(source.waitedMs) ? source.waitedMs : 0,
  };
};

export const getBootReadiness = async () => {
  const api = getApi();
  if (!api || typeof api.getReadiness !== "function") return null;
  try {
    return normalizeReadiness(await api.getReadiness());
  } catch (_error) {
    return { ...EMPTY_BOOT_READINESS };
  }
};

export const onBootReadinessChange = (callback) => {
  const api = getApi();
  if (!api || typeof api.onReadinessChange !== "function") return () => {};
  if (typeof callback !== "function") return () => {};
  return api.onReadinessChange((payload) => callback(normalizeReadiness(payload)));
};

export const retryBootReadiness = async () => {
  const api = getApi();
  if (!api || typeof api.retry !== "function") return null;
  try {
    return normalizeReadiness(await api.retry());
  } catch (_error) {
    return null;
  }
};

const bootReadinessBridge = {
  isBootReadinessAvailable,
  getBootReadiness,
  onBootReadinessChange,
  retryBootReadiness,
  EMPTY_BOOT_READINESS,
};

export default bootReadinessBridge;
