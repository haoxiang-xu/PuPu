/* eslint-env jest */

const READY_PAYLOAD = {
  ready: true,
  phase: "ready",
  runtime: { ready: true, status: "ready" },
  mcp: { ready: true },
  failure: null,
  waitedMs: 1200,
};

const WAITING_PAYLOAD = {
  ready: false,
  phase: "starting_runtime",
  runtime: { ready: false, status: "starting" },
  mcp: { ready: false },
  failure: null,
  waitedMs: 300,
};

const FAILED_PAYLOAD = {
  ready: false,
  phase: "starting_runtime",
  runtime: { ready: false, status: "not_found" },
  mcp: { ready: false },
  failure: { code: "unchain_runtime_not_found" },
  waitedMs: 90000,
};

/* Installs a fake window.bootReadinessAPI and returns handles to drive it. */
const installBridge = () => {
  const listeners = new Set();
  const api = {
    getReadiness: jest.fn(async () => WAITING_PAYLOAD),
    retry: jest.fn(async () => WAITING_PAYLOAD),
    onReadinessChange: jest.fn((cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
  };
  window.bootReadinessAPI = api;
  return { api, push: (payload) => listeners.forEach((cb) => cb(payload)) };
};

const load = () => {
  let bootReadiness;
  let bootProgress;
  jest.isolateModules(() => {
    bootProgress = require("./boot_progress");
    bootReadiness = require("./boot_readiness");
  });
  return { bootReadiness, bootProgress };
};

describe("boot_readiness", () => {
  afterEach(() => {
    delete window.bootReadinessAPI;
    jest.useRealTimers();
  });

  test("satisfies the backend gate only when main reports ready", async () => {
    const { push } = installBridge();
    const { bootReadiness, bootProgress } = load();

    bootReadiness.start();
    await Promise.resolve();
    await Promise.resolve();

    bootProgress.signalReady();
    expect(bootProgress.getState().ready).toBe(false);

    push(READY_PAYLOAD);
    expect(bootProgress.getGates().backend).toBe(true);
    expect(bootProgress.getState().ready).toBe(true);
  });

  test("re-closes the backend gate when the backend goes away again", async () => {
    const { push } = installBridge();
    const { bootReadiness, bootProgress } = load();
    bootReadiness.start();
    bootProgress.signalReady();
    push(READY_PAYLOAD);
    expect(bootProgress.getState().ready).toBe(true);

    push(WAITING_PAYLOAD);

    expect(bootProgress.getGates().backend).toBe(false);
    expect(bootProgress.getState().ready).toBe(false);
  });

  test("advances the bar per backend milestone, and never backwards", async () => {
    const { push } = installBridge();
    const { bootReadiness, bootProgress } = load();
    bootReadiness.start();

    push({ ...WAITING_PAYLOAD, runtime: { ready: true, status: "ready" } });
    expect(bootProgress.getState().pct).toBe(88);

    push({
      ...WAITING_PAYLOAD,
      runtime: { ready: true, status: "ready" },
      mcp: { ready: true },
    });
    expect(bootProgress.getState().pct).toBe(96);

    // A regression to "runtime only" must not walk the bar back.
    push({ ...WAITING_PAYLOAD, runtime: { ready: true, status: "ready" } });
    expect(bootProgress.getState().pct).toBe(96);
  });

  test("WEB MODE: with no bridge the backend gate is satisfied immediately", () => {
    // No window.bootReadinessAPI installed — `npm run start:web`.
    const { bootReadiness, bootProgress } = load();
    bootReadiness.start();

    expect(bootReadiness.getState()).toMatchObject({
      available: false,
      ready: true,
      phase: "no_backend",
    });
    expect(bootProgress.getGates().backend).toBe(true);

    bootProgress.signalReady();
    expect(bootProgress.getState().ready).toBe(true);
  });

  test("exposes the failure main reported, without opening the gate", () => {
    const { push } = installBridge();
    const { bootReadiness, bootProgress } = load();
    bootReadiness.start();
    bootProgress.signalReady();

    push(FAILED_PAYLOAD);

    expect(bootReadiness.getState().failure).toEqual({
      code: "unchain_runtime_not_found",
    });
    expect(bootProgress.getState().ready).toBe(false);
  });

  test("three-stage wait: quiet, then a status line, then an admission of slowness", () => {
    jest.useFakeTimers();
    installBridge();
    const { bootReadiness } = load();
    bootReadiness.start();

    // A warm start finishes inside the quiet window; a line that only flashes
    // is worse than none.
    expect(bootReadiness.getState()).toMatchObject({
      showStatus: false,
      slow: false,
    });

    jest.advanceTimersByTime(4000);
    expect(bootReadiness.getState()).toMatchObject({
      showStatus: true,
      slow: false,
    });

    jest.advanceTimersByTime(18000);
    expect(bootReadiness.getState()).toMatchObject({
      showStatus: true,
      slow: true,
    });
  });

  test("carries a failure CODE only — no prose crosses from main", () => {
    const { push } = installBridge();
    const { bootReadiness } = load();
    bootReadiness.start();

    // Even if a compromised/stale main sent prose, the renderer drops it: the
    // wording must come from the locale files, not the wire.
    push({
      ...FAILED_PAYLOAD,
      failure: { code: "unchain_runtime_failed", message: "hardcoded English" },
    });

    expect(bootReadiness.getState().failure).toEqual({
      code: "unchain_runtime_failed",
    });
  });

  test("/mini is exempt: a demo route with no sidecar dependency is not gated", () => {
    // Reachable on a plain reload — the Electron build uses HashRouter, so a
    // previous #/mini survives. Holding it behind a 90s backend wait is pure cost.
    installBridge();
    window.location.hash = "#/mini";
    const { bootReadiness, bootProgress } = load();

    bootReadiness.start();

    expect(bootProgress.getGates().backend).toBe(true);
    expect(bootReadiness.getState()).toMatchObject({
      available: true,
      ready: true,
      phase: "no_backend",
    });
    window.location.hash = "";
  });

  test("the chat route is NOT exempt", () => {
    installBridge();
    window.location.hash = "#/";
    const { bootReadiness, bootProgress } = load();

    bootReadiness.start();

    expect(bootProgress.getGates().backend).toBe(false);
    window.location.hash = "";
  });

  test("subscribes before the initial read so no update can be dropped", async () => {
    const { api } = installBridge();
    const { bootReadiness } = load();
    bootReadiness.start();

    const subscribeOrder = api.onReadinessChange.mock.invocationCallOrder[0];
    const readOrder = api.getReadiness.mock.invocationCallOrder[0];
    expect(subscribeOrder).toBeLessThan(readOrder);
  });

  test("start() is idempotent under StrictMode double effects", async () => {
    const { api } = installBridge();
    const { bootReadiness } = load();

    bootReadiness.start();
    bootReadiness.start();

    expect(api.onReadinessChange).toHaveBeenCalledTimes(1);
  });

  test("retry asks main to restart and applies the result", async () => {
    const { api } = installBridge();
    api.retry.mockResolvedValue(READY_PAYLOAD);
    const { bootReadiness, bootProgress } = load();
    bootReadiness.start();
    bootProgress.signalReady();

    await bootReadiness.retry();

    expect(api.retry).toHaveBeenCalledTimes(1);
    expect(bootProgress.getState().ready).toBe(true);
    expect(bootReadiness.getState().retrying).toBe(false);
  });

  test("retry is a no-op with no bridge", async () => {
    const { bootReadiness } = load();
    bootReadiness.start();
    await expect(bootReadiness.retry()).resolves.toBeUndefined();
  });
});
