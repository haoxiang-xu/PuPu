const { CHANNELS } = require("../../../shared/channels");

/*
 * Boot readiness gate (main-process authority).
 *
 * WHY THIS EXISTS
 * ---------------
 * The renderer's full-screen boot overlay used to flip "ready" purely on
 * "the chat page reached its first screen", with an unconditional 8s failsafe
 * that let the user in regardless. That meant PuPu could hand the user a chat
 * box while the local sidecar was still booting (or had failed outright) —
 * every send would then die at `ensureMisoReady`. This service is the missing
 * half: main watches the things the renderer cannot see and publishes a single
 * readiness projection the boot gate can trust.
 *
 * WHAT "READY" MEANS HERE
 * -----------------------
 *   runtime.ready — the unchain/Flask sidecar reached `status === "ready"`,
 *                   i.e. /health answered AND the runtime contract validated.
 *   mcp.ready     — the MCP environment is initialized (see MCP PROBE below).
 *
 * Both must hold. The renderer adds its own third gate (chat first screen) on
 * top; this service deliberately knows nothing about the renderer's own
 * milestones — it only reports the backend half.
 *
 * MCP PROBE — WHY `GET /mcp/toolkits` AND NOTHING HEAVIER
 * -------------------------------------------------------
 * The sidecar exposes no MCP readiness endpoint, so readiness has to be
 * inferred from a probe. `listMisoMcpToolkits()` (GET /mcp/toolkits) is the
 * correct one, for a structural reason rather than a convenient one:
 *
 *   * It proves the MCP layer initialized. The curated MCP registry is parsed
 *     at Python *import* time, so if it were broken the sidecar would never
 *     bind its port at all; a successful MCP route response additionally
 *     proves the installed-toolkit store on disk is present and parseable and
 *     that the MCP blueprint is live.
 *   * It CANNOT block on a third-party MCP server. The route is a pure local
 *     store read — no subprocess spawn, no socket, no network. A user's slow
 *     or broken MCP server is reported as persisted per-record status, never
 *     as latency here. That is a property of the probe, not a timeout we hope
 *     holds.
 *
 * Explicitly NOT used as the readiness probe:
 *   * `POST /mcp/toolkits/<id>/health` and `POST /mcp/toolkits/reload` — these
 *     DO connect: they spawn stdio subprocesses and wait up to ~120s PER
 *     toolkit, serially. Gating boot on them would let one broken third-party
 *     server hold the whole app hostage, which is the exact failure this
 *     design forbids.
 *   * Per-toolkit connectivity in any form. Third-party MCP servers are user
 *     -installed and degradable by definition: their health belongs in the
 *     toolkit UI, not in the boot gate.
 *
 * FAILURE / TIMEOUT SEMANTICS
 * ---------------------------
 * There is no "give up and let them in" path. Instead:
 *   * While the backend is still coming up the gate simply stays closed and
 *     reports a phase the overlay renders as status text.
 *   * `not_found` (no local runtime on disk) is terminal — the sidecar's own
 *     auto-restart is not even armed for it — so it escalates to a failure
 *     immediately.
 *   * Any other non-ready state escalates to a failure only after
 *     BOOT_FAILURE_BUDGET_MS of never having been ready. That failure is an
 *     *escalated waiting state*, not a terminal one: polling continues, so a
 *     backend that recovers on its own clears the failure and opens the gate.
 *     The user gets an explanation and a retry button instead of a silent
 *     spinner — and never a working-looking app on a dead backend.
 *
 * PAYLOAD SAFETY
 * --------------
 * `unchainStatus`'s companion `reason` string can carry local filesystem paths
 * and raw process errors ("Miso server entrypoint was not found",
 * "Miso process exited (code=...)"). It is NEVER forwarded. The renderer sees
 * only a whitelisted status token and a stable failure CODE.
 *
 * NO USER-FACING PROSE CROSSES THIS BOUNDARY. Main used to compose the failure
 * message; it does not any more. Main cannot know the user's language, so a
 * message minted here would be hardcoded English bypassing all 11 locales. The
 * channel therefore carries `failure.code` only and the renderer resolves it
 * through i18n. Adding a `message` back would silently re-break translation.
 */

// Poll cadence while the gate is closed. The unchain service exposes readiness
// as synchronous state (getMisoStatusPayload) with no change event, so polling
// is the only way to observe it; 400ms is imperceptible against a multi-second
// sidecar boot and costs nothing (it is an in-process object read).
const POLL_INTERVAL_MS = 400;

// How long the backend may stay un-ready before the overlay escalates from
// "still starting" to a failure card with a retry button. Generous on purpose:
// a cold sidecar start has its own 60s health budget, and a crash-restart cycle
// re-enters "starting". This is the point at which we stop assuming patience
// will fix it — not the point at which we stop waiting.
const BOOT_FAILURE_BUDGET_MS = 90000;

// The MCP probe is one cheap local read; if it fails we retry on the poll tick.
// After this many consecutive failures the MCP gate is reported as failed
// (still retried in the background).
const MCP_PROBE_MAX_ATTEMPTS = 8;

// Status tokens the unchain service can report. Anything outside this set is
// collapsed to "unknown" so an unexpected value can never become a message.
const KNOWN_RUNTIME_STATUSES = Object.freeze([
  "stopped",
  "starting",
  "ready",
  "error",
  "not_found",
]);

/* The complete set of failure codes this service can emit. The renderer maps
   each to a `boot.failure.<code>` i18n key, so adding one here without adding
   the key in every locale leaves users staring at a raw identifier. */
const FAILURE_CODES = Object.freeze([
  "unchain_runtime_not_found",
  "unchain_runtime_failed",
  "mcp_environment_unavailable",
]);

const normalizeRuntimeStatus = (value) =>
  KNOWN_RUNTIME_STATUSES.includes(value) ? value : "unknown";

const createBootReadinessService = ({
  unchainService,
  webContents,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) => {
  let pollTimer = null;
  let startedAt = now();
  let stopped = false;

  let runtimeReady = false;
  let runtimeStatus = "starting";
  let mcpReady = false;
  let mcpProbeInFlight = false;
  let mcpProbeFailures = 0;
  let failureCode = "";

  let lastSerialized = "";

  const buildPayload = () => ({
    ready: runtimeReady && mcpReady,
    // The single field the overlay renders status text from.
    phase: runtimeReady && mcpReady
      ? "ready"
      : runtimeReady
        ? "starting_mcp"
        : "starting_runtime",
    runtime: { ready: runtimeReady, status: runtimeStatus },
    mcp: { ready: mcpReady },
    // Code only — see PAYLOAD SAFETY. The renderer owns the wording.
    failure: failureCode ? { code: failureCode } : null,
    waitedMs: Math.max(0, now() - startedAt),
  });

  const getReadiness = () => buildPayload();

  const emit = () => {
    const payload = buildPayload();
    // waitedMs advances every tick; compare on the meaningful fields only so
    // the renderer is not woken 2.5 times a second for a counter it re-derives.
    const signature = JSON.stringify({
      ready: payload.ready,
      phase: payload.phase,
      runtime: payload.runtime,
      mcp: payload.mcp,
      failure: payload.failure,
    });
    if (signature === lastSerialized) return;
    lastSerialized = signature;

    const targets =
      typeof webContents?.getAllWebContents === "function"
        ? webContents.getAllWebContents()
        : [];
    targets.forEach((target) => {
      if (!target || target.isDestroyed()) return;
      try {
        target.send(CHANNELS.BOOT.READINESS_CHANGED, payload);
      } catch {
        // Best-effort event dispatch — the renderer can always re-read via
        // GET_READINESS, which is why that channel exists.
      }
    });
  };

  const probeMcp = async () => {
    if (mcpProbeInFlight || mcpReady) return;
    mcpProbeInFlight = true;
    try {
      const result = await unchainService?.listMisoMcpToolkits();
      // A well-formed inventory is the readiness signal. An empty list is a
      // perfectly ready environment with nothing installed — count is not a
      // health measure and must not be treated as one.
      if (result && Array.isArray(result.toolkits)) {
        mcpReady = true;
        mcpProbeFailures = 0;
        if (failureCode === "mcp_environment_unavailable") failureCode = "";
      } else {
        mcpProbeFailures += 1;
      }
    } catch {
      // Never surface the thrown message: it can name the local port/URL.
      mcpProbeFailures += 1;
    } finally {
      mcpProbeInFlight = false;
    }

    if (!mcpReady && mcpProbeFailures >= MCP_PROBE_MAX_ATTEMPTS && !failureCode) {
      failureCode = "mcp_environment_unavailable";
    }
    emit();
  };

  const tick = () => {
    if (stopped) return;

    /* Defensive read. A partially-wired dependency is a programming error, but
       it must never throw out of app.whenReady() and take the whole startup
       with it. Treating it as "not ready" is the fail-closed direction: the
       gate stays shut and escalates to a failure like any other stuck boot. */
    const status =
      (typeof unchainService?.getMisoStatusPayload === "function"
        ? unchainService.getMisoStatusPayload()
        : null) || {};
    runtimeStatus = normalizeRuntimeStatus(status.status);
    const nextRuntimeReady = status.ready === true;

    if (!nextRuntimeReady && runtimeReady) {
      // The sidecar died after having been ready (crash / restart). Re-close
      // the whole gate: an app whose backend just vanished is not "ready", and
      // the MCP probe result is no longer meaningful.
      mcpReady = false;
      mcpProbeFailures = 0;
    }
    runtimeReady = nextRuntimeReady;

    if (runtimeReady) {
      if (failureCode === "unchain_runtime_not_found" || failureCode === "unchain_runtime_failed") {
        failureCode = "";
      }
      if (!mcpReady) {
        // Fire and forget: the probe emits on its own completion.
        probeMcp();
      }
    } else if (runtimeStatus === "not_found") {
      // Terminal: the sidecar does not even arm its auto-restart for this.
      failureCode = "unchain_runtime_not_found";
    } else if (
      !failureCode &&
      now() - startedAt >= BOOT_FAILURE_BUDGET_MS
    ) {
      failureCode = "unchain_runtime_failed";
    }

    emit();

    if (runtimeReady && mcpReady) {
      // Gate is open. Keep watching so a later sidecar crash re-closes it —
      // the overlay is gone by then, but the projection stays truthful for any
      // future reader (and for a window reload, which re-invokes GET_READINESS).
      pollTimer = setTimeoutFn(tick, POLL_INTERVAL_MS * 5);
      if (typeof pollTimer?.unref === "function") pollTimer.unref();
      return;
    }

    pollTimer = setTimeoutFn(tick, POLL_INTERVAL_MS);
    if (typeof pollTimer?.unref === "function") pollTimer.unref();
  };

  const start = () => {
    if (pollTimer || stopped) return;
    startedAt = now();
    tick();
  };

  const stop = () => {
    stopped = true;
    if (pollTimer) {
      clearTimeoutFn(pollTimer);
      pollTimer = null;
    }
  };

  /* Renderer-triggered retry. Takes no arguments on purpose: it can only
     re-run the start sequence main already owns, so a compromised renderer
     cannot use it to point the sidecar anywhere.
   *
   * Two guards, both closing real races rather than being defensive noise:
   *
   *   stopped — will-quit already ran stopBackgroundServices(). An invoke that
   *     was in flight at that moment would otherwise resurrect the sidecar as
   *     an orphan after the app has decided to die.
   *
   *   ready — bouncing a healthy backend is pure harm. This matters because the
   *     most likely moment to click Retry is an `mcp_environment_unavailable`
   *     card, which is raised while the sidecar is PERFECTLY ALIVE; the MCP
   *     probe keeps retrying on its own, so there is nothing here to fix by
   *     killing it. (The gate being shut on the renderer's own milestone is
   *     likewise not something a sidecar restart can help.)
   *
   * The restart itself goes through unchainService.restartMiso(). Sequencing
   * stop-then-start from out here is deterministically broken — see the comment
   * on restartMiso in the unchain service. */
  const retry = async () => {
    if (stopped) return getReadiness();
    if (runtimeReady && mcpReady) return getReadiness();

    failureCode = "";
    mcpReady = false;
    mcpProbeFailures = 0;
    startedAt = now();
    emit();

    try {
      await unchainService.restartMiso();
    } catch {
      // restartMiso records its own status; the poll loop will observe it.
    }

    if (pollTimer) {
      clearTimeoutFn(pollTimer);
      pollTimer = null;
    }
    if (!stopped) tick();
    return getReadiness();
  };

  return { start, stop, getReadiness, retry };
};

module.exports = {
  createBootReadinessService,
  // Exported for tests and for the parity/contract suites.
  BOOT_FAILURE_BUDGET_MS,
  MCP_PROBE_MAX_ATTEMPTS,
  POLL_INTERVAL_MS,
  FAILURE_CODES,
};
