/*
 * Boot loading gate — drives the static #boot-overlay DOM node that is
 * baked into public/index.html (see the boot-loading-gate design doc).
 *
 * This is intentionally a plain DOM-manipulation service, not a React
 * component: the overlay node already exists in the document before the
 * React bundle ever executes (S1 static shell), and the whole point of the
 * handoff is that React takes over the *same* node rather than tearing it
 * down and rebuilding it (which would cause a visible flash).
 *
 * Public API:
 *   set(pct)  — advance the progress bar to `pct` (0-100), clamped.
 *   release() — jump to 100%, fade the overlay out over 240ms, then
 *               remove it from the DOM. Idempotent: safe to call more than
 *               once, and safe to call when the overlay is already gone
 *               (e.g. a hot-reloaded module, or web-only mode without the
 *               overlay markup).
 *
 * An 8s failsafe is armed as soon as this module is first imported: if
 * `release()` is never called (an uncaught boot error, a stuck store
 * hydration, etc.) the overlay auto-releases so the app never appears
 * stuck behind an opaque screen.
 */

const OVERLAY_ID = "boot-overlay";
const BAR_ID = "boot-progress-bar";
const FADE_MS = 240;
const FAILSAFE_MS = 8000;
const TRANSITION_MS = 300;

let released = false;
let failsafeTimer = null;

const getDocument = () => (typeof document !== "undefined" ? document : null);

const getOverlay = () => {
  const doc = getDocument();
  return doc ? doc.getElementById(OVERLAY_ID) : null;
};

const getBar = (overlay) => {
  if (!overlay) return null;
  if (typeof overlay.querySelector !== "function") return null;
  return overlay.querySelector(`#${BAR_ID}`) || overlay.querySelector("[data-boot-bar]");
}

const clampPct = (pct) => {
  const num = Number(pct);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
};

const clearFailsafe = () => {
  if (failsafeTimer != null) {
    clearTimeout(failsafeTimer);
    failsafeTimer = null;
  }
};

/** Advance the overlay's progress bar. No-op once released or if the
 *  overlay/bar are not present in the DOM (already removed, hot reload,
 *  or web-only builds that never mounted it). */
export const set = (pct) => {
  if (released) return;
  const overlay = getOverlay();
  if (!overlay) return;
  const bar = getBar(overlay);
  if (!bar || !bar.style) return;
  bar.style.transition = `width ${TRANSITION_MS}ms ease`;
  bar.style.width = `${clampPct(pct)}%`;
};

/** Release the boot gate: jump to 100%, fade out, remove the node.
 *  Idempotent — subsequent calls are no-ops. */
export const release = () => {
  if (released) return;
  released = true;
  clearFailsafe();

  const overlay = getOverlay();
  if (!overlay) return;

  const bar = getBar(overlay);
  if (bar && bar.style) {
    bar.style.transition = `width ${TRANSITION_MS}ms ease`;
    bar.style.width = "100%";
  }

  if (overlay.style) {
    overlay.style.transition = `opacity ${FADE_MS}ms ease`;
    overlay.style.opacity = "0";
  }

  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }, FADE_MS);
};

const armFailsafe = () => {
  if (typeof setTimeout !== "function") return;
  failsafeTimer = setTimeout(() => {
    release();
  }, FAILSAFE_MS);
};

/* Arm as soon as this module is first evaluated — covers the whole boot
   window from React-mount to chat-page-ready, not just from some later
   call site. */
armFailsafe();

/** Test-only: rewind module state so each test starts fresh. Not part of
 *  the service's runtime contract. */
export const _resetForTest = () => {
  released = false;
  clearFailsafe();
};

const bootProgress = { set, release };
export default bootProgress;
