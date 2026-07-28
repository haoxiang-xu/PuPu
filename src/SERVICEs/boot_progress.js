/*
 * Boot loading gate.
 *
 * S1 (static shell): before React ever executes, public/index.html renders
 * a minimal static #boot-overlay node driven directly by this module's
 * DOM-manipulation half (`set`/`release`) — see the boot-loading-gate
 * design doc.
 *
 * S2 (React takeover): once the React BootOverlay component mounts, it
 * calls `takeOver()`, which removes the static node and disables further
 * DOM driving from `set`/`release`. From that point on BootOverlay owns
 * all rendering, reading `{ pct, ready }` via `subscribe()`/`getState()`.
 * `set(pct)` and `signalReady()` (or the 8s failsafe) keep updating that
 * shared state and notifying subscribers no matter which side (static DOM
 * or React) is currently "in charge" of painting it.
 *
 * Public API:
 *   set(pct)      — advance progress to `pct` (0-100, clamped). Always
 *                    updates internal state + notifies subscribers; also
 *                    drives the static DOM bar directly until takeOver().
 *   signalReady()  — flips `ready` true (pct snaps to 100) and notifies.
 *                    This is the one-time "chat page reached first screen"
 *                    signal — it does NOT touch the DOM. The React overlay
 *                    reacts by showing its "Enter" button; nothing is
 *                    auto-dismissed until the user clicks it.
 *   release()      — immediate-dismiss: jump to 100%, fade the static
 *                    overlay out over 240ms, then remove it from the DOM.
 *                    Idempotent. Used by the pre-takeOver failsafe and by
 *                    tests/web-only paths that want the old immediate
 *                    behavior (no Enter gate).
 *   takeOver()     — called once by the React BootOverlay on mount: removes
 *                    the static #boot-overlay node and disables set/release
 *                    DOM driving. The 8s failsafe stays armed, but after
 *                    takeOver it flips `ready` (shows Enter) instead of
 *                    trying to fade/remove an already-gone node.
 *   subscribe(cb)  — cb({ pct, ready }) on every state change. Returns an
 *                    unsubscribe function.
 *   getState()     — synchronous read of the current { pct, ready }.
 *
 * An 8s failsafe is armed as soon as this module is first imported so the
 * app never appears permanently stuck behind an opaque screen.
 */

const OVERLAY_ID = "boot-overlay";
const BAR_ID = "boot-progress-bar";
const FADE_MS = 240;
const FAILSAFE_MS = 8000;
const TRANSITION_MS = 300;

let released = false;
let takenOver = false;
let failsafeTimer = null;
let state = { pct: 0, ready: false };
let listeners = new Set();

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

const notify = () => {
  const snapshot = { ...state };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (e) {
      console.error("[boot_progress] subscriber threw:", e);
    }
  });
};

/** Subscribe to { pct, ready } state changes. Returns an unsubscribe fn. */
export const subscribe = (cb) => {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Synchronous read of the current { pct, ready } state. */
export const getState = () => ({ ...state });

/** Advance progress. Always updates state + notifies subscribers; also
 *  drives the static DOM bar directly until takeOver() (and never again
 *  once release()d). */
export const set = (pct) => {
  if (released) return;
  const clamped = clampPct(pct);
  state = { ...state, pct: clamped };
  notify();

  if (takenOver) return;
  const overlay = getOverlay();
  if (!overlay) return;
  const bar = getBar(overlay);
  if (!bar || !bar.style) return;
  bar.style.transition = `width ${TRANSITION_MS}ms ease`;
  bar.style.width = `${clamped}%`;
};

/** Mark the boot gate ready without touching the DOM: pct snaps to 100 and
 *  `ready` flips true. This is the "chat page reached first screen" signal
 *  — the React BootOverlay reacts by revealing its Enter button; nothing is
 *  dismissed until the user clicks it. Idempotent. */
export const signalReady = () => {
  if (state.ready) return;
  state = { ...state, ready: true, pct: 100 };
  notify();
};

/** Immediate-dismiss: jump to 100%, fade the static overlay out over 240ms,
 *  then remove it from the DOM. Idempotent — subsequent calls are no-ops.
 *  Always updates state + notifies subscribers first. */
export const release = () => {
  if (released) return;
  released = true;
  clearFailsafe();

  state = { ...state, ready: true, pct: 100 };
  notify();

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

/** Called once by the React BootOverlay on mount: removes the static
 *  #boot-overlay node (if present) and disables further DOM driving from
 *  set/release — from this point on, React owns rendering via
 *  subscribe()/getState(). Idempotent. */
export const takeOver = () => {
  if (takenOver) return;
  takenOver = true;
  const overlay = getOverlay();
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
};

const armFailsafe = () => {
  if (typeof setTimeout !== "function") return;
  failsafeTimer = setTimeout(() => {
    // Pre-takeover: preserve the original immediate-dismiss behavior (no
    // React overlay is around to show an Enter gate). Post-takeover: only
    // flip ready — the brand screen stays up until the user clicks Enter.
    if (takenOver) {
      signalReady();
    } else {
      release();
    }
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
  takenOver = false;
  state = { pct: 0, ready: false };
  listeners = new Set();
  clearFailsafe();
};

const bootProgress = { set, release, signalReady, takeOver, subscribe, getState };
export default bootProgress;
