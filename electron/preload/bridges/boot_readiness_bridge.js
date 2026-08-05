const { CHANNELS } = require("../../shared/channels");

/*
 * window.bootReadinessAPI — the renderer's only view of backend boot state.
 *
 * Surface is deliberately three methods and no more:
 *   getReadiness()          — initial sync. Required, not optional: main starts
 *                             observing before the window exists, so the first
 *                             READINESS_CHANGED can fire before anyone listens.
 *   onReadinessChange(cb)   — push updates; returns an unsubscribe function.
 *   retry()                 — argument-less. It re-runs main's own sidecar
 *                             start sequence and nothing else.
 *
 * There is no setter, no configuration, and no way to ask for a different
 * probe. Main composes every string the renderer sees.
 */
const createBootReadinessBridge = (ipcRenderer) => ({
  getReadiness: () => ipcRenderer.invoke(CHANNELS.BOOT.GET_READINESS),
  retry: () => ipcRenderer.invoke(CHANNELS.BOOT.RETRY),
  onReadinessChange: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload || {});
    };
    ipcRenderer.on(CHANNELS.BOOT.READINESS_CHANGED, listener);

    return () => {
      ipcRenderer.removeListener(CHANNELS.BOOT.READINESS_CHANGED, listener);
    };
  },
});

module.exports = {
  createBootReadinessBridge,
};
