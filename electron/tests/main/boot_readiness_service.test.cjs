const {
  createBootReadinessService,
  BOOT_FAILURE_BUDGET_MS,
  MCP_PROBE_MAX_ATTEMPTS,
  FAILURE_CODES,
} = require("../../main/services/boot_readiness/service");
const { CHANNELS } = require("../../shared/channels");

/* A hand-driven clock + timer queue. The service polls, so tests need to step
   it deterministically rather than wait on real time. */
const createHarness = ({ statuses = [], mcp = async () => ({ toolkits: [] }) } = {}) => {
  let clock = 0;
  const queue = [];
  const sent = [];
  let statusIndex = 0;

  const target = {
    isDestroyed: () => false,
    send: (channel, payload) => sent.push({ channel, payload }),
  };

  const unchainService = {
    getMisoStatusPayload: jest.fn(() => {
      const status = statuses[Math.min(statusIndex, statuses.length - 1)];
      statusIndex += 1;
      return status;
    }),
    listMisoMcpToolkits: jest.fn(mcp),
    startMiso: jest.fn(async () => {}),
    stopMiso: jest.fn(() => {}),
    restartMiso: jest.fn(async () => {}),
  };

  const service = createBootReadinessService({
    unchainService,
    webContents: { getAllWebContents: () => [target] },
    now: () => clock,
    setTimeoutFn: (fn, ms) => {
      const entry = { fn, at: clock + ms, cancelled: false };
      queue.push(entry);
      return entry;
    },
    clearTimeoutFn: (entry) => {
      if (entry) entry.cancelled = true;
    },
  });

  /* Run every timer due at or before `clock + ms`, then settle promises. */
  const advance = async (ms) => {
    const until = clock + ms;
    for (let guard = 0; guard < 500; guard += 1) {
      const next = queue
        .filter((e) => !e.cancelled && e.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.cancelled = true;
      clock = next.at;
      next.fn();
      // Let the fire-and-forget MCP probe resolve.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    clock = until;
  };

  return { service, unchainService, sent, advance, setClock: (v) => { clock = v; } };
};

const READY = { status: "ready", ready: true, reason: "" };
const STARTING = { status: "starting", ready: false, reason: "" };
const NOT_FOUND = {
  status: "not_found",
  ready: false,
  reason: "/Users/someone/secret/path/server.py was not found",
};
const ERRORED = {
  status: "error",
  ready: false,
  reason: "Miso process exited (code=1, signal=null)",
};

describe("boot readiness service", () => {
  afterEach(() => jest.clearAllMocks());

  test("gate stays closed while the sidecar is still starting", async () => {
    const { service, advance } = createHarness({ statuses: [STARTING] });
    service.start();
    await advance(2000);

    const readiness = service.getReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.phase).toBe("starting_runtime");
    expect(readiness.runtime).toEqual({ ready: false, status: "starting" });
    expect(readiness.mcp).toEqual({ ready: false });
    expect(readiness.failure).toBeNull();
  });

  test("runtime ready alone does not open the gate — MCP must answer too", async () => {
    let resolveMcp;
    const { service, advance } = createHarness({
      statuses: [READY],
      mcp: () => new Promise((resolve) => { resolveMcp = resolve; }),
    });
    service.start();
    await advance(1000);

    expect(service.getReadiness()).toMatchObject({
      ready: false,
      phase: "starting_mcp",
      runtime: { ready: true, status: "ready" },
      mcp: { ready: false },
    });

    resolveMcp({ toolkits: [] });
    await advance(500);

    expect(service.getReadiness()).toMatchObject({
      ready: true,
      phase: "ready",
      mcp: { ready: true },
    });
  });

  test("an EMPTY MCP inventory is ready — count is not a health measure", async () => {
    const { service, advance } = createHarness({
      statuses: [READY],
      mcp: async () => ({ toolkits: [], count: 0 }),
    });
    service.start();
    await advance(1000);

    expect(service.getReadiness().ready).toBe(true);
  });

  test("the MCP probe is the local inventory read, never a per-toolkit connect", async () => {
    const { service, unchainService, advance } = createHarness({
      statuses: [READY],
    });
    service.start();
    await advance(1000);

    // This is the structural guarantee that one broken third-party MCP server
    // cannot hold the app hostage: the only probe is the pure store read.
    expect(unchainService.listMisoMcpToolkits).toHaveBeenCalled();
    expect(unchainService.checkMisoMcpToolkitHealth).toBeUndefined();
    expect(unchainService.reloadMisoMcpToolkits).toBeUndefined();
  });

  test("a malformed MCP response is retried, then reported as a failure", async () => {
    const { service, advance } = createHarness({
      statuses: [READY],
      mcp: async () => ({ nope: true }),
    });
    service.start();
    await advance(400 * (MCP_PROBE_MAX_ATTEMPTS + 2));

    const readiness = service.getReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.failure).toEqual({
      code: "mcp_environment_unavailable",
    });
  });

  test("not_found escalates immediately — the sidecar does not auto-restart for it", async () => {
    const { service, advance } = createHarness({ statuses: [NOT_FOUND] });
    service.start();
    await advance(500);

    expect(service.getReadiness().failure).toEqual({
      code: "unchain_runtime_not_found",
    });
  });

  test("a transient error waits out the budget before escalating", async () => {
    const { service, advance } = createHarness({ statuses: [ERRORED] });
    service.start();

    await advance(BOOT_FAILURE_BUDGET_MS - 1000);
    expect(service.getReadiness().failure).toBeNull();

    await advance(2000);
    expect(service.getReadiness().failure).toEqual({
      code: "unchain_runtime_failed",
    });
  });

  test("escalating to a failure never opens the gate", async () => {
    const { service, advance } = createHarness({ statuses: [ERRORED] });
    service.start();
    await advance(BOOT_FAILURE_BUDGET_MS * 3);

    expect(service.getReadiness().ready).toBe(false);
  });

  test("a failure clears by itself if the backend recovers", async () => {
    const statuses = [ERRORED];
    const { service, advance } = createHarness({ statuses });
    service.start();
    await advance(BOOT_FAILURE_BUDGET_MS + 1000);
    expect(service.getReadiness().failure).not.toBeNull();

    statuses.push(READY);
    await advance(2000);

    expect(service.getReadiness()).toMatchObject({
      ready: true,
      failure: null,
    });
  });

  test("the gate re-closes if the sidecar dies after having been ready", async () => {
    const statuses = [READY];
    const { service, advance } = createHarness({ statuses });
    service.start();
    await advance(1000);
    expect(service.getReadiness().ready).toBe(true);

    statuses.push(ERRORED);
    await advance(3000);

    expect(service.getReadiness()).toMatchObject({
      ready: false,
      runtime: { ready: false },
      mcp: { ready: false },
    });
  });

  test("NEVER forwards the runtime reason string — it can carry local paths", async () => {
    const { service, sent, advance } = createHarness({ statuses: [NOT_FOUND] });
    service.start();
    await advance(1000);

    const serialized = JSON.stringify([service.getReadiness(), ...sent]);
    expect(serialized).not.toContain("/Users/someone/secret/path");
    expect(serialized).not.toContain("server.py");
    expect(service.getReadiness().reason).toBeUndefined();
  });

  test("NEVER sends user-facing prose — failures carry a code only", async () => {
    // Main cannot know the user's language, so any message minted here would be
    // hardcoded English bypassing all 11 locales. The renderer owns the wording.
    const { service, sent, advance } = createHarness({ statuses: [NOT_FOUND] });
    service.start();
    await advance(1000);

    const readiness = service.getReadiness();
    expect(readiness.failure).toEqual({ code: "unchain_runtime_not_found" });
    expect(Object.keys(readiness.failure)).toEqual(["code"]);
    sent.forEach((entry) => {
      if (!entry.payload.failure) return;
      expect(Object.keys(entry.payload.failure)).toEqual(["code"]);
    });
  });

  test("every emittable failure code is declared in FAILURE_CODES", async () => {
    // The renderer maps each code to a boot.failure.<code> i18n key; a code
    // that is not declared here is a code nobody wrote a translation for.
    const seen = new Set();
    for (const statuses of [[NOT_FOUND], [ERRORED]]) {
      const { service, advance } = createHarness({ statuses });
      service.start();
      // eslint-disable-next-line no-await-in-loop
      await advance(BOOT_FAILURE_BUDGET_MS + 2000);
      const failure = service.getReadiness().failure;
      if (failure) seen.add(failure.code);
      service.stop();
    }
    const mcpHarness = createHarness({
      statuses: [READY],
      mcp: async () => ({ nope: true }),
    });
    mcpHarness.service.start();
    await mcpHarness.advance(400 * (MCP_PROBE_MAX_ATTEMPTS + 2));
    seen.add(mcpHarness.service.getReadiness().failure.code);

    expect([...seen].sort()).toEqual([...FAILURE_CODES].sort());
  });

  test("collapses an unexpected status token instead of passing it through", async () => {
    const { service, advance } = createHarness({
      statuses: [{ status: "something-new", ready: false }],
    });
    service.start();
    await advance(500);

    expect(service.getReadiness().runtime.status).toBe("unknown");
  });

  test("broadcasts on the readiness channel, and only when something changed", async () => {
    const { service, sent, advance } = createHarness({ statuses: [STARTING] });
    service.start();
    await advance(4000);

    expect(sent.length).toBeGreaterThan(0);
    sent.forEach((entry) => {
      expect(entry.channel).toBe(CHANNELS.BOOT.READINESS_CHANGED);
    });
    // Many polls, one distinct state → one broadcast. waitedMs advancing must
    // not wake the renderer.
    expect(sent).toHaveLength(1);
  });

  test("retry restarts the sidecar and clears the failure", async () => {
    const statuses = [NOT_FOUND];
    const { service, unchainService, advance } = createHarness({ statuses });
    service.start();
    await advance(1000);
    expect(service.getReadiness().failure).not.toBeNull();

    statuses.push(READY);
    await service.retry();
    await advance(1000);

    expect(unchainService.restartMiso).toHaveBeenCalledTimes(1);
    expect(service.getReadiness().failure).toBeNull();
  });

  test("retry goes through restartMiso, never a hand-rolled stop-then-start", async () => {
    // Sequencing stop/start from out here is deterministically broken: stopMiso
    // returns with SIGTERM in flight, so startMiso's `if (unchainProcess)`
    // guard makes it a no-op and the exit handler skips the restart net —
    // killing a live backend for good. Only the service can observe its own
    // stop completing, so the primitive must stay in there.
    const { service, unchainService, advance } = createHarness({
      statuses: [ERRORED],
    });
    service.start();
    await advance(BOOT_FAILURE_BUDGET_MS + 1000);

    await service.retry();

    expect(unchainService.restartMiso).toHaveBeenCalledTimes(1);
    expect(unchainService.stopMiso).not.toHaveBeenCalled();
    expect(unchainService.startMiso).not.toHaveBeenCalled();
  });

  test("REGRESSION: retry does NOT bounce a healthy backend", async () => {
    // The most likely moment to click Retry is an mcp_environment_unavailable
    // card — raised while the sidecar is perfectly alive. Restarting there is
    // pure harm. Guard the ready case outright.
    const { service, unchainService, advance } = createHarness({
      statuses: [READY],
    });
    service.start();
    await advance(1000);
    expect(service.getReadiness().ready).toBe(true);

    const result = await service.retry();

    expect(unchainService.restartMiso).not.toHaveBeenCalled();
    expect(result.ready).toBe(true);
  });

  test("an MCP-only failure still retries — the sidecar half is what gets bounced", async () => {
    const { service, unchainService, advance } = createHarness({
      statuses: [READY],
      mcp: async () => ({ nope: true }),
    });
    service.start();
    await advance(400 * (MCP_PROBE_MAX_ATTEMPTS + 2));
    expect(service.getReadiness().failure.code).toBe(
      "mcp_environment_unavailable",
    );

    await service.retry();

    // Not ready overall, so the guard does not fire and the restart proceeds.
    expect(unchainService.restartMiso).toHaveBeenCalledTimes(1);
  });

  test("retry after stop() cannot resurrect the sidecar as an orphan", async () => {
    // will-quit runs stopBackgroundServices(); a RETRY invoke already in flight
    // must not start a sidecar the app has decided to kill.
    const { service, unchainService, advance } = createHarness({
      statuses: [ERRORED],
    });
    service.start();
    await advance(1000);
    service.stop();

    await service.retry();

    expect(unchainService.restartMiso).not.toHaveBeenCalled();
  });

  test("retry takes no arguments, so a renderer cannot redirect the sidecar", () => {
    const { service } = createHarness({ statuses: [READY] });
    expect(service.retry).toHaveLength(0);
  });

  test("stop() halts polling", async () => {
    const { service, unchainService, advance } = createHarness({
      statuses: [STARTING],
    });
    service.start();
    await advance(1000);
    const callsBefore = unchainService.getMisoStatusPayload.mock.calls.length;

    service.stop();
    await advance(10000);

    expect(unchainService.getMisoStatusPayload.mock.calls.length).toBe(
      callsBefore,
    );
  });
});
