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
 *   signalReady()  — satisfies the "chat page reached first screen" GATE. It
 *                    does NOT touch the DOM, and — since the readiness rework
 *                    — it does NOT by itself flip `ready`. See GATES below.
 *   satisfyGate(k) /
 *   resetGate(k)   — satisfy or re-close one named readiness gate.
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
 * GATES — why `ready` is no longer one signal
 * -------------------------------------------
 * "Chat reached its first screen" says nothing about whether the local backend
 * the chat box talks to is up. Gating only on it (as this module used to) let
 * the user into a working-looking app whose every send would die at the
 * sidecar boundary. `ready` is now the AND of every gate:
 *
 *   chatFirstScreen — the renderer's own milestone (signalReady()).
 *   backend         — the unchain sidecar AND the MCP environment are up, as
 *                     reported by the main process. Driven by
 *                     SERVICEs/boot_readiness.js, which owns the bridge
 *                     subscription and the human-facing status/failure copy.
 *
 * Gates are re-closable on purpose: if the sidecar dies while the overlay is
 * still up, the gate shuts again rather than leaving a stale green light.
 *
 * THE 8s FAILSAFE — deliberately no longer a release valve
 * --------------------------------------------------------
 * It used to flip `ready` (or outright release) on a timer, which is exactly
 * the bug: a timeout is not evidence that the backend came up. It is now armed
 * for ONE case only — React never took over. In that world there is no React
 * overlay to render a status or an error and no bridge to ask, so an opaque
 * screen forever is the worse failure and the legacy fade+remove still wins.
 * Once takeOver() has happened the timer is disarmed and readiness is
 * gate-driven, with no time limit: the overlay explains itself and offers a
 * retry instead of letting the user into a broken app.
 *
 * takeOver() does arm a second, much narrower timer that can satisfy the
 * chatFirstScreen gate ALONE (see armRendererMilestoneFallback) — never the
 * backend gate. No clock can open the backend gate, in any code path.
 */

const OVERLAY_ID = "boot-overlay";
const BAR_ID = "boot-progress-bar";
const FADE_MS = 240;
const FAILSAFE_MS = 8000;
const TRANSITION_MS = 300;

/* Fallback for the RENDERER-LOCAL milestone only — see armRendererMilestoneFallback.
   Deliberately a different constant from FAILSAFE_MS so the two can be tuned
   (and read) independently; they just happen to start equal. */
const RENDERER_MILESTONE_FALLBACK_MS = 8000;

/* Every gate must be satisfied before `ready` flips. Adding a gate here is a
   deliberate act: it can hold the user out of the app indefinitely, so it must
   be something that genuinely resolves on its own or reports a failure. */
export const BOOT_GATES = Object.freeze({
  CHAT_FIRST_SCREEN: "chatFirstScreen",
  BACKEND: "backend",
});

const GATE_KEYS = Object.freeze(Object.values(BOOT_GATES));

const emptyGates = () =>
  GATE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});

let released = false;
let takenOver = false;
let failsafeTimer = null;
let rendererMilestoneTimer = null;
let gates = emptyGates();
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
  if (rendererMilestoneTimer != null) {
    clearTimeout(rendererMilestoneTimer);
    rendererMilestoneTimer = null;
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

  /* MONOTONIC. The React overlay renders `pct` as a real progress bar now, and
     the milestones do not arrive in a fixed order: a ChatInterface remount
     re-runs its set(80) after the backend has already pushed 88/96, which would
     visibly walk the bar backwards. Progress that regresses reads as a bug, so
     the model refuses to regress rather than asking every call site to guard. */
  if (clamped > state.pct) {
    state = { ...state, pct: clamped };
    notify();
  }

  /* The DOM paint is NOT conditional on the state having moved. The static bar
     node is a separate output that can be re-created after state has already
     advanced (a re-render that rebuilds the shell, hot reload, a test
     remounting into a fresh body) — skipping the write there would leave a
     brand-new bar stuck at width "" while state says otherwise. Always paint
     the authoritative pct, never the rejected argument. */
  if (takenOver) return;
  const overlay = getOverlay();
  if (!overlay) return;
  const bar = getBar(overlay);
  if (!bar || !bar.style) return;
  bar.style.transition = `width ${TRANSITION_MS}ms ease`;
  bar.style.width = `${state.pct}%`;
};

const allGatesSatisfied = () => GATE_KEYS.every((key) => gates[key]);

/* Recompute `ready` from the gates and notify if anything moved. Ready snaps
   pct to 100; re-closing a gate drops `ready` but deliberately leaves pct
   where it was — a bar that jumps backwards reads as a glitch, whereas the
   overlay reappearing with a status line reads as what it is. */
const reconcileGates = () => {
  // release() is a one-way force-open: the overlay node is already gone, so
  // re-closing the gate would strand the user behind nothing.
  if (released) return;
  const nextReady = allGatesSatisfied();
  if (nextReady === state.ready) return;
  state = nextReady
    ? { ...state, ready: true, pct: 100 }
    : { ...state, ready: false };
  notify();
};

/** Satisfy one named readiness gate (see BOOT_GATES). Idempotent. */
export const satisfyGate = (key) => {
  if (!GATE_KEYS.includes(key) || gates[key]) return;
  gates = { ...gates, [key]: true };
  reconcileGates();
};

/** Re-close one named readiness gate — e.g. the sidecar died after coming up.
 *  Idempotent. */
export const resetGate = (key) => {
  if (!GATE_KEYS.includes(key) || !gates[key]) return;
  gates = { ...gates, [key]: false };
  reconcileGates();
};

/** Synchronous read of which gates are currently satisfied. */
export const getGates = () => ({ ...gates });

/** The "chat page reached first screen" signal — satisfies that ONE gate
 *  without touching the DOM. It no longer flips `ready` on its own: the
 *  backend gate must also be satisfied (see GATES in the module header).
 *  Idempotent. */
export const signalReady = () => {
  satisfyGate(BOOT_GATES.CHAT_FIRST_SCREEN);
};

/** Immediate-dismiss: jump to 100%, fade the static overlay out over 240ms,
 *  then remove it from the DOM. Idempotent — subsequent calls are no-ops.
 *  Always updates state + notifies subscribers first. */
export const release = () => {
  if (released) return;
  released = true;
  clearFailsafe();

  /* Escape hatch, not a gate satisfier. It force-opens via the `released` flag
     (which short-circuits reconcileGates, so a later gate update cannot
     re-close an overlay already torn out of the DOM) — but it deliberately
     does NOT mark the backend gate satisfied. Nothing in this module may ever
     claim the backend came up when it did not; getGates() stays honest for any
     reader, and the only gate release can speak for is the renderer's own. */
  gates = { ...gates, [BOOT_GATES.CHAT_FIRST_SCREEN]: true };
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
  /* React is now rendering the gate, so it can show a status line, a failure
     and a retry. The timed release valve exists only for the world where that
     never happened — disarm it. */
  clearFailsafe();
  armRendererMilestoneFallback();
  const overlay = getOverlay();
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
};

/* Satisfies the CHAT-FIRST-SCREEN gate — and ONLY that gate — on a timer.
 *
 * This is NOT the old "let them in on a timeout" bug wearing a new hat, and
 * the distinction matters:
 *
 *   * chatFirstScreen is a RENDERER-LOCAL milestone. Only ChatInterface signals
 *     it, so any boot that does not land on the chat route — the /mini demo
 *     route, a HashRouter reload with a stale #/… fragment, or a chat render
 *     that threw — would otherwise hold the overlay up forever with nothing to
 *     wait for. Eight seconds after React took over, the app has painted
 *     *something*; the milestone has effectively happened even if nobody said so.
 *   * the BACKEND gate is never touched here. An app whose sidecar or MCP
 *     environment is down stays gated no matter how long it waits — that is the
 *     invariant this whole rework exists to establish, and a clock must never
 *     be able to open it.
 */
const armRendererMilestoneFallback = () => {
  if (typeof setTimeout !== "function") return;
  rendererMilestoneTimer = setTimeout(() => {
    rendererMilestoneTimer = null;
    satisfyGate(BOOT_GATES.CHAT_FIRST_SCREEN);
  }, RENDERER_MILESTONE_FALLBACK_MS);
};

/* Has the React tree produced any DOM at all?
 *
 * This is the failsafe's real question, and `takenOver` is too narrow to answer
 * it. takeOver() only runs when BootOverlay MOUNTS, and BootOverlay lives under
 * ConfigContainer's `isThemeBooting` branch — so a slow theme resolve delays
 * takeOver while React is perfectly alive. Theme resolution is synchronous
 * today, but the settings->SQLite migration makes it async; the moment it can
 * exceed FAILSAFE_MS, a release() here would force-open a gate whose backend
 * half was never checked. That is precisely the invariant declared at the top
 * of this file, defeated by a timer.
 *
 * So the failsafe fires only when React produced NOTHING — the bundle failed to
 * execute. In that world there is no app to gate and no bridge to ask. */
const reactHasRendered = () => {
  const doc = getDocument();
  if (!doc || typeof doc.getElementById !== "function") return false;
  const root = doc.getElementById("root");
  return Boolean(root && root.childElementCount > 0);
};

const armFailsafe = () => {
  if (typeof setTimeout !== "function") return;
  failsafeTimer = setTimeout(() => {
    // takeOver() disarms this timer outright; reactHasRendered() covers the
    // window where React is alive but BootOverlay has not mounted yet. A
    // mounted app can never be released on a clock.
    if (takenOver || reactHasRendered()) return;
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
  takenOver = false;
  rendererMilestoneTimer = null;
  gates = emptyGates();
  state = { pct: 0, ready: false };
  listeners = new Set();
  clearFailsafe();
};

const bootProgress = {
  set,
  release,
  signalReady,
  satisfyGate,
  resetGate,
  getGates,
  takeOver,
  subscribe,
  getState,
  BOOT_GATES,
};
export default bootProgress;
