const KEY = "pupu.uiTesting.prefs";

const DEFAULTS = { dockPos: null, navCollapsed: false, fullscreen: false };

const validDockPos = (p) =>
  p && typeof p.x === "number" && typeof p.y === "number"
    ? { x: p.x, y: p.y }
    : null;

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      dockPos: validDockPos(parsed && parsed.dockPos),
      navCollapsed: Boolean(parsed && parsed.navCollapsed),
      fullscreen: Boolean(parsed && parsed.fullscreen),
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        dockPos: validDockPos(prefs && prefs.dockPos),
        navCollapsed: Boolean(prefs && prefs.navCollapsed),
        fullscreen: Boolean(prefs && prefs.fullscreen),
      }),
    );
  } catch (_) {
    /* dev-only surface; ignore quota/serialization errors */
  }
}
