/*
 * Boot readiness (renderer half).
 *
 * Owns the one subscription to window.bootReadinessAPI and translates what
 * main reports into two things:
 *
 *   1. the `backend` gate on bootProgress — the hard "may the user in?" answer,
 *   2. a small presentational state (status text key, failure, retry) the
 *      BootOverlay renders while the gate is closed.
 *
 * It is split from boot_progress.js on purpose: boot_progress stays a dumb
 * progress/gate primitive with a `{ pct, ready }` contract that many callers
 * depend on, while everything that knows about sidecars, MCP and retry lives
 * here.
 *
 * WEB MODE. With no preload bridge (`npm run start:web`, or any browser run)
 * there is no local backend to wait for, so the backend gate is satisfied
 * immediately and the status is "no_backend". Without this the boot overlay
 * would hang forever in web dev — the exact permanent-black-screen failure the
 * new gate is supposed to make impossible.
 */

import * as bootProgress from "./boot_progress";
import {
  EMPTY_BOOT_READINESS,
  getBootReadiness,
  isBootReadinessAvailable,
  onBootReadinessChange,
  retryBootReadiness,
} from "./bridges/boot_readiness_bridge";

/* Progress milestones for the backend half of boot. The renderer's own
   milestones already occupy 0-80 (55 = theme resolved, 80 = chat store
   hydrated); the sidecar normally finishes last, so the backend owns the tail.
   Monotonicity is enforced centrally by bootProgress.set(), so these can land
   in any order without walking the bar backwards. */
const PCT_RUNTIME_READY = 88;
const PCT_MCP_READY = 96;

/* Three-stage wait. Nothing here opens a gate or dismisses anything — these are
   purely about not leaving the user staring at a mute screen:
     0-4s    a bare progress bar (a warm start finishes inside this window, and
             a status line that only flashes is worse than none)
     4s      say what we are waiting for
     ~22s    admit it is slower than normal
     90s     main escalates to a failure card with a retry (BOOT_FAILURE_BUDGET_MS,
             owned by the main-process service — deliberately unchanged) */
export const STATUS_TEXT_DELAY_MS = 4000;
export const SLOW_NOTICE_DELAY_MS = 22000;

const INITIAL = Object.freeze({
  ...EMPTY_BOOT_READINESS,
  available: true,
  /* True once we have waited long enough that silence needs an explanation. */
  showStatus: false,
  /* True once the wait has exceeded what a normal start looks like. */
  slow: false,
  retrying: false,
});

let state = { ...INITIAL };
let listeners = new Set();
let unsubscribeBridge = null;
let statusTimer = null;
let slowTimer = null;
let started = false;

const notify = () => {
  const snapshot = { ...state };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (e) {
      console.error("[boot_readiness] subscriber threw:", e);
    }
  });
};

const setState = (patch) => {
  state = { ...state, ...patch };
  notify();
};

const applyReadiness = (readiness) => {
  const next = readiness || { ...EMPTY_BOOT_READINESS };

  if (next.runtime?.ready) bootProgress.set(PCT_RUNTIME_READY);
  if (next.mcp?.ready) bootProgress.set(PCT_MCP_READY);

  if (next.ready) {
    bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);
  } else {
    // Re-close on a backend that died after coming up. `ready` drops, the
    // overlay is authoritative again.
    bootProgress.resetGate(bootProgress.BOOT_GATES.BACKEND);
  }

  setState({ ...next, retrying: false });
};

/* Satisfies the backend gate outright, for the two cases where the gate has
   nothing to protect. `available` distinguishes them for the overlay: false
   means "no bridge exists at all". */
const satisfyWithoutBackend = ({ available }) => {
  setState({
    ...EMPTY_BOOT_READINESS,
    available,
    ready: true,
    phase: "no_backend",
    showStatus: false,
    slow: false,
    retrying: false,
  });
  bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);
};

/* Routes that provably need no sidecar. The /mini demo page renders BUILTIN
   component demos and touches no bridge, so holding it behind a 90s backend
   wait is pure cost — and it is reachable on a plain reload, because the
   Electron build uses HashRouter and the previous `#/mini` survives.
   Read once at start(): while the gate is shut the overlay blocks navigation,
   so the boot-time route is the only one that matters. */
const BACKENDLESS_ROUTES = Object.freeze(["/mini"]);

export const isBackendlessRoute = () => {
  if (typeof window === "undefined" || !window.location) return false;
  const hash = typeof window.location.hash === "string" ? window.location.hash : "";
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.split("?")[0].replace(/\/+$/, "") || "/";
  return BACKENDLESS_ROUTES.includes(path);
};

/**
 * Begin observing backend readiness. Idempotent — safe to call from a React
 * effect that may run twice under StrictMode.
 */
export const start = () => {
  if (started) return;
  started = true;

  if (!isBootReadinessAvailable()) {
    satisfyWithoutBackend({ available: false });
    return;
  }

  if (isBackendlessRoute()) {
    satisfyWithoutBackend({ available: true });
    return;
  }

  if (typeof setTimeout === "function") {
    // Only meaningful while still waiting; harmless once ready because the
    // overlay is gone by then.
    statusTimer = setTimeout(() => {
      setState({ showStatus: true });
    }, STATUS_TEXT_DELAY_MS);
    slowTimer = setTimeout(() => {
      setState({ showStatus: true, slow: true });
    }, SLOW_NOTICE_DELAY_MS);
  }

  // Subscribe BEFORE the initial read so an update landing between the two
  // cannot be dropped.
  unsubscribeBridge = onBootReadinessChange(applyReadiness);

  getBootReadiness().then((readiness) => {
    if (readiness) applyReadiness(readiness);
  });
};

/** Ask main to restart the local backend. Never opens the gate by itself. */
export const retry = async () => {
  if (!isBootReadinessAvailable()) return;
  setState({ retrying: true, showStatus: true });
  const readiness = await retryBootReadiness();
  if (readiness) applyReadiness(readiness);
  else setState({ retrying: false });
};

export const subscribe = (cb) => {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const getState = () => ({ ...state });

/** Test-only: rewind module state so each test starts fresh. */
export const _resetForTest = () => {
  if (typeof unsubscribeBridge === "function") unsubscribeBridge();
  unsubscribeBridge = null;
  if (statusTimer != null) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (slowTimer != null) {
    clearTimeout(slowTimer);
    slowTimer = null;
  }
  started = false;
  state = { ...INITIAL };
  listeners = new Set();
};

const bootReadiness = { start, retry, subscribe, getState };
export default bootReadiness;
